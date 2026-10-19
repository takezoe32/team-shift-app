import { lineAccess, lineProfileUrl, isPrivateLine } from './line-context.js';
import { createHash } from 'node:crypto';
import { lineConfigPath, linePendingPath } from './line-store.js';
import { taskBody, extractLineTask, reviewReasons, lineTaskChanges } from '../../src/lineTasks.mjs';
import { eligibleLineMembers, matchingLineMember, partnerSuggestions } from '../../src/lineRegistration.mjs';
import { registeredTaskCard } from './line-handoff.js';

const hash = text => createHash('sha256').update(String(text)).digest('hex');
const clip = (text, length) => { let result = ''; for (const character of String(text)) { if (result.length + character.length > length) break; result += character; } return result; };
const card = (text, actions) => ({ type: 'template', altText: 'タスク登録の確認', template: { type: 'buttons', text: clip(text, 160), actions } });
const action = (label, data) => ({ type: 'postback', label: clip(label, 20), data });
const activePathFor = (group, user) => '_server_integrations/line_register_' + hash(group + ':' + user);
const memberPathFor = (group, user) => '_server_integrations/line_member_' + hash(group + ':' + user);
export const registrationForm = (kind, draft = {}) => '件名：' + (draft.subject || '') + '\n日付：' + (draft.date || '') + (kind === 'partner' ? '\n時間：' + (draft.time || '') + '\nパートナー：' + (draft.partnerName || '') : '') + '\n内容：' + (draft.description || '');
const readForm = (text, timestamp, kind, users) => {
  const lines = text.split(/\r?\n/);
  const field = name => { const matches = lines.filter(line => line.startsWith(name + ':')); return matches.length === 1 ? matches[0].slice(name.length + 1).trim() : ''; };
  const date = field('日付'), time = field('時間');
  const parsed = extractLineTask('タスク\n日付：' + date + '\n時間：' + time, timestamp, users);
  const descriptionIndex = lines.findIndex(line => line.startsWith('内容:'));
  const description = descriptionIndex < 0 ? '' : [lines[descriptionIndex].slice(3), ...lines.slice(descriptionIndex + 1)].join('\n').trim();
  return { ...parsed, subject: field('件名').slice(0, 120), date: date ? parsed.date : '', time: kind === 'partner' && time ? parsed.time : '', partnerName: kind === 'partner' ? field('パートナー').slice(0, 200) : '', description, text: description || field('件名'), assigneeIds: [] };
};

export function createLineRegistrationProcessor({ store, reply, choices, fetcher = fetch, env, now = Date.now }) {
  return async event => {
    const text = event.type === 'message' && event.message?.type === 'text' ? event.message.text.normalize('NFKC').trim() : '';
    const body = event.type === 'message' ? taskBody(text) : null;
    const type = event.type === 'postback' && String(event.postback?.data || '').match(/^lt:(line_[a-f0-9]{40}):(member|partner|cancel)$/);
    const selection = event.type === 'postback' && String(event.postback?.data || '').match(/^lr:(line_[a-f0-9]{40}):([a-f0-9]{16}):(person|bind|partner|page|cancel|new|save|edit):([0-9]{1,6})$/);
    const groupId = event.source.groupId, userId = event.source.userId;
    const activePath = activePathFor(groupId, userId), memberPath = memberPathFor(groupId, userId);
    const active = await store.read(activePath);
    const eventKey = event.webhookEventId || event.message?.id || JSON.stringify([event.timestamp, groupId, userId, event.postback?.data]);
    const receiptPath = '_server_integrations/line_registration_event_' + hash(eventKey);
    const answer = event.type === 'message' && body === null && active?.id && !/^(追記|申し送り|LINE連携)(?:[\s:]|$)/.test(text);
    if (((event.type === 'message' && /^(追記|申し送り)(?:[\s:]|$)/.test(text)) || (event.type === 'postback' && String(event.postback?.data || '').startsWith('lh:'))) && active?.id) {
      await store.transact([lineConfigPath, activePath, receiptPath], values => {
        if (!lineAccess(event, values[lineConfigPath]) || values[receiptPath] || values[activePath]?.id !== active.id) return { result: null };
        return { writes: [{ path: activePath, value: { id: '' } }, { path: receiptPath, value: { reply: null } }], result: null };
      });
      return false;
    }
    if (body === null && !type && !selection && !answer) return false;
    const privateChat = isPrivateLine(event);
    if (body !== null && ((!body && !privateChat) || body.length > 5000)) { await reply(event, 'メンションの後に「タスク 内容」を入力してください。内容は5000文字までです。'); return true; }
    const id = body !== null ? 'line_' + hash(event.message.id).slice(0, 40) : type?.[1] || selection?.[1] || active.id;
    const path = linePendingPath(id);
    const nonce = hash(eventKey).slice(0, 16);
    let displayName = '';
    if (type && type[2] !== 'cancel' && !privateChat) {
      try {
        const response = await fetcher(lineProfileUrl(event), { headers: { Authorization: 'Bearer ' + env.LINE_CHANNEL_ACCESS_TOKEN }, signal: AbortSignal.timeout(5000) });
        if (response.ok) displayName = clip((await response.json()).displayName || '', 80);
      } catch { /* The member can select their own app name when the profile is unavailable. */ }
    }
    const handoffPath = '_server_integrations/line_handoff_' + hash(groupId + ':' + userId);
    const message = await store.transact([lineConfigPath, activePath, memberPath, path, receiptPath, handoffPath, 'app_data/shared_state'], values => {
      if (!lineAccess(event, values[lineConfigPath])) return { result: null };
      if (values[receiptPath]) return { result: values[receiptPath].reply };
      const state = values['app_data/shared_state'];
      if (!state) throw new Error('Missing shared data');
      const finish = (message, writes = []) => ({ writes: [...writes, { path: receiptPath, value: { reply: message, createdAt: new Date(now()).toISOString() } }], result: message });
      const binding = values[memberPath];
      const users = state.users || {}, members = eligibleLineMembers(users);
      const knownId = members.some(member => member.id === binding?.appUid) ? binding.appUid : '';
      let pending = values[path];
      if (body !== null) {
        if (pending) return finish(pending.status === 'registered' ? registeredTaskCard(id, pending.kind, pending.draft) : choices(id, body));
        pending = { id, groupId, userId, ownerUid: values[lineConfigPath].ownerUid, text, timestamp: event.timestamp, expires: now() + 86400000, status: 'choosing', createdAt: new Date(now()).toISOString() };
        return finish(choices(id, body), [{ path, value: pending }, { path: activePath, value: { id } }, ...(values[handoffPath] ? [{ path: handoffPath, value: { ...values[handoffPath], status: 'cancelled' } }] : [])]);
      }
      if (!pending || pending.groupId !== groupId || pending.userId !== userId) return answer ? { result: null } : finish('この登録は投稿した本人だけが操作できます。');
      if (pending.status === 'registered') return answer ? { result: null } : finish(registeredTaskCard(id, pending.kind, pending.draft));
      if (pending.status === 'cancelled') return answer ? { result: null } : finish('キャンセル済みです。');
      if (pending.expires < now()) return answer ? { result: null } : finish(privateChat ? '登録の期限が切れました。「タスク」からやり直してください。' : '登録の期限が切れました。メンション＋タスク＋内容で投稿し直してください。');
      if (values[activePath]?.id !== id && (answer || pending.status === 'collecting')) return answer ? { result: null } : finish('別のタスクを入力中です。最新の案内から操作してください。');
      if (answer && pending.status !== 'collecting') return { result: null };
      const cancel = p => action('キャンセル', 'lr:' + id + ':' + p.nonce + ':cancel:0');
      const persist = (p, response, extra = []) => finish(response, [{ path, value: p }, { path: activePath, value: { id } }, ...extra]);
      const ask = (p, step, response) => {
        const next = { ...p, step, nonce, status: 'collecting' };
        return persist(next, typeof response === 'string' ? card(response, [cancel(next)]) : response(next));
      };
      const askMembers = (p, page = 0) => {
        if (!members.length) return ask(p, 'identity', 'アプリに担当者として選べるメンバーがいません。メンバーを登録してからやり直してください。');
        const next = { ...p, step: 'identity', nonce, status: 'collecting', memberOptions: members.map(member => member.id), page };
        const offset = page * 10, rows = members.slice(offset, offset + 10);
        return persist(next, [{ type: 'text', text: 'あなた自身のアプリ上の名前を選んでください（初回のみ）。\n\n' + rows.map((member, index) => (offset + index + 1) + '｜' + member.name).join('\n') + (privateChat ? '\n\n番号、またはご自身の名前を送ってください。' : '\n\nメンション＋番号、またはメンション＋ご自身の名前で回答してください。') }, card('投稿者本人の名前を選ぶと、次回から担当者を自動設定します。', [...(members.length > 10 ? [action('次の10名', 'lr:' + id + ':' + nonce + ':page:' + ((page + 1) % Math.ceil(members.length / 10)))] : []), cancel(next)])]);
      };
      const confirmMember = (p, appUid) => ask({ ...p, candidateUid: appUid }, 'identityConfirm', next => card('あなたは「' + users[appUid].name + '」さんですか？\nこの名前を今後のLINE投稿の担当者にします。', [action('本人です', 'lr:' + id + ':' + next.nonce + ':bind:0'), cancel(next)]));
      const validPartners = [...new Set((state.partnerNames || []).filter(name => typeof name === 'string' && name.trim()))];
      const askForm = (p, error = '') => ask(p, 'form', next => [{ type: 'text', text: (error ? error + '\n\n' : '') + '下のフォーマットをコピーし、まとめて記入して送ってください。日付は「明日」でも使えます。内容は任意です。担当者の記入は不要です。' }, { type: 'text', text: registrationForm(p.kind, p.draft) }, card('記入後に確認画面を表示します。まだ登録されません。', [cancel(next)])]);
      const confirmPartner = p => {
        const options = partnerSuggestions(p.draft.partnerName, validPartners).slice(0, 2);
        return ask({ ...p, partnerOptions: options }, 'partnerConfirm', next => card(options.length ? '「' + clip(p.draft.partnerName, 45) + '」は一覧にありません。この中のパートナーですか？\n違う場合は正しい名前を送ってください。' : '登録済みパートナーがありません。「' + clip(p.draft.partnerName, 45) + '」を新しく登録しますか？', [
          ...options.map((name, index) => action(name, 'lr:' + id + ':' + next.nonce + ':partner:' + index)),
          action(options.length ? '入力名で新規登録' : 'この名前で登録', 'lr:' + id + ':' + next.nonce + ':new:0'), cancel(next)
        ]));
      };
      const advance = (p, extra = [], confirmed = false) => {
        if (privateChat && !p.formFilled) return askForm(p);
        if (privateChat) {
          const required = [];
          if (!p.draft.date) required.push('日付');
          if (!p.draft.subject?.trim()) required.push('件名');
          if (p.kind === 'partner' && !p.draft.partnerName?.trim()) required.push('パートナー');
          if (p.kind === 'partner' && !p.draft.time) required.push('時間（24時間表記・15分刻み）');
          if (required.length) return askForm({ ...p, formFilled: false }, '確認してください：' + required.join('・'));
        }
        if (!p.appUid || !members.some(member => member.id === p.appUid)) return askMembers(p);
        p = { ...p, ownerUid: p.appUid, draft: { ...p.draft, assigneeIds: [p.appUid] } };
        if (!p.draft.date) return ask(p, 'date', '日付を入力してください。\n例：@管理課 タスク受付 明日\nまたは @管理課 タスク受付 2026/10/21');
        if (!p.draft.subject?.trim()) return ask(p, 'subject', '件名を入力してください。\n例：@管理課 タスク受付 217号室の防水調査');
        if (p.kind === 'partner') {
          if (!p.draft.partnerName?.trim()) return ask(p, 'partner', 'パートナー名を入力してください。\n例：@管理課 タスク受付 山下健装');
          if (!validPartners.includes(p.draft.partnerName) && !p.newPartnerConfirmed) return confirmPartner(p);
          if (!p.draft.time) return ask(p, 'time', '開始時刻を24時間表記・15分刻みで入力してください。\n例：@管理課 タスク受付 12:00');
        }
        const reasons = reviewReasons(p.draft, p.kind, users);
        if (reasons.length) throw new Error('Invalid registration');
        if (privateChat && !confirmed) return ask(p, 'registrationConfirm', next => [{ type: 'text', text: 'この内容で登録しますか？\n種類：' + (p.kind === 'member' ? 'メンバー' : 'パートナー') + '\n担当：' + users[p.appUid].name + '\n' + registrationForm(p.kind, { ...p.draft, description: p.draft.description || '' }) }, card('「登録」を押すとアプリに保存します。', [action('登録', 'lr:' + id + ':' + next.nonce + ':save:0'), action('修正', 'lr:' + id + ':' + next.nonce + ':edit:0'), cancel(next)])]);
        const changes = lineTaskChanges(state, p, p.draft, p.kind, now());
        return persist({ ...p, status: 'registered', step: '', nonce }, registeredTaskCard(id, p.kind, p.draft), [...extra, ...(Object.keys(changes).length ? [{ path: 'app_data/shared_state', value: changes, fields: Object.keys(changes) }] : [])]);
      };
      if (type) {
        if (type[2] === 'cancel') return persist({ ...pending, status: 'cancelled' }, 'タスクの登録をキャンセルしました。');
        if (pending.status === 'collecting') return finish(privateChat ? '最新のフォーマットに記入して送ってください。' : '確認中の質問に、メンションを付けて回答してください。');
        const draft = pending.draft || (taskBody(pending.text) ? extractLineTask(pending.text, pending.timestamp, users, validPartners) : { date: '', time: '', subject: '', text: '', partnerName: '', assigneeIds: [] });
        const appUid = privateChat ? event.privateAppUid : knownId || matchingLineMember(users, displayName);
        pending = { ...pending, kind: type[2], draft, appUid, senderName: displayName };
        return advance(pending);
      }
      if (selection) {
        const [, , suppliedNonce, operation, indexText] = selection, index = Number(indexText);
        if (pending.status !== 'collecting' || suppliedNonce !== pending.nonce) return finish('古いボタンです。最新の質問から操作してください。');
        if (operation === 'cancel') return persist({ ...pending, status: 'cancelled' }, 'タスクの登録をキャンセルしました。');
        if (operation === 'edit' && privateChat && pending.step === 'registrationConfirm') return askForm({ ...pending, formFilled: false });
        if (operation === 'save' && privateChat && pending.step === 'registrationConfirm') return advance(pending, [], true);
        if (operation === 'page' && pending.step === 'identity' && index < Math.ceil(members.length / 10)) return askMembers(pending, index);
        if (operation === 'bind' && pending.step === 'identityConfirm' && members.some(member => member.id === pending.candidateUid)) {
          const bound = { ...pending, appUid: pending.candidateUid };
          const result = advance(bound);
          // Store the self-selected identity even when another question follows.
          result.writes.push({ path: memberPath, value: { appUid: bound.appUid, groupId, userId, confirmedAt: new Date(now()).toISOString() } });
          return result;
        }
        if (operation === 'partner' && pending.step === 'partnerConfirm' && validPartners.includes(pending.partnerOptions?.[index])) return advance({ ...pending, draft: { ...pending.draft, partnerName: pending.partnerOptions[index] } });
        if (operation === 'new' && pending.step === 'partnerConfirm') return advance({ ...pending, newPartnerConfirmed: true });
        return finish('最新の質問から操作してください。');
      }
      if (!text || text.length > 5000) return finish('回答は1〜5000文字で入力してください。');
      if (privateChat && pending.step === 'form') {
        if (text.length > 4500) return finish('フォーマット全体を4500文字以内で送ってください。');
        return advance({ ...pending, draft: readForm(text, event.timestamp || now(), pending.kind, users), formFilled: true, newPartnerConfirmed: false });
      }
      if (privateChat && pending.step === 'registrationConfirm') return finish('「登録」または「修正」ボタンを押してください。');
      if (pending.step === 'identity') {
        const index = /^\d+$/.test(text) ? Number(text) - 1 : -1;
        const offset = (pending.page || 0) * 10;
        const appUid = index >= offset && index < offset + 10 ? pending.memberOptions?.[index] : matchingLineMember(users, text);
        if (!members.some(member => member.id === appUid)) return askMembers(pending, pending.page || 0);
        return confirmMember(pending, appUid);
      }
      if (pending.step === 'identityConfirm') return finish('表示された「本人です」ボタンで確認してください。');
      let draft = { ...pending.draft };
      if (pending.step === 'date') draft.date = extractLineTask('タスク\n日付：' + text, event.timestamp || now(), users).date;
      if (pending.step === 'time') draft.time = extractLineTask('タスク\n時間：' + text, event.timestamp || now(), users).time;
      if (pending.step === 'subject') draft.subject = text.slice(0, 120);
      if (['partner', 'partnerConfirm'].includes(pending.step)) draft.partnerName = text.replace(/^(パートナー|会社)[:：]\s*/, '').trim().slice(0, 200);
      return advance({ ...pending, draft, newPartnerConfirmed: ['partner', 'partnerConfirm'].includes(pending.step) ? false : pending.newPartnerConfirmed === true });
    });
    if (message === null) return false;
    await reply(event, message);
    return true;
  };
}
