import { lineAccess, lineProfileUrl, isPrivateLine } from './line-context.js';
import { createHash } from 'node:crypto';
import { lineConfigPath, linePendingPath } from './line-store.js';
import { lineTaskTargets, searchLineTasks, resolveLineTask, describeLineTask, appendLineHandoff } from '../../src/lineHandoffs.mjs';
const digest = value => createHash('sha256').update(value).digest('hex');
const clip = (value, limit) => { let result = ''; for (const character of String(value)) { if (result.length + character.length > limit) break; result += character; } return result; };
const buttons = (text, actions, altText = 'タスクの申し送り') => ({ type: 'template', altText, template: { type: 'buttons', text: clip(text, 160), actions } });
const action = (label, data) => ({ type: 'postback', label: clip(label, 20), data, displayText: '「' + clip(label, 20) + '」を選択' });
const PAGE_SIZE = 10;
const kindCard = session => ({ type: 'flex', altText: '追記するタスクを選択：メンバー／パートナー／キャンセル', contents: {
  type: 'bubble', body: { type: 'box', layout: 'vertical', spacing: 'md', contents: [
    { type: 'text', text: '申し送り・追記', weight: 'bold', size: 'lg', color: '#1F2937' },
    { type: 'text', text: '追加するタスクの種類を押してください。', wrap: true, size: 'sm', color: '#4B5563' },
    { type: 'button', style: 'primary', color: '#2563EB', height: 'md', action: action('メンバー', 'lh:kind:' + session.nonce + ':member') },
    { type: 'button', style: 'primary', color: '#7C3AED', height: 'md', action: action('パートナー', 'lh:kind:' + session.nonce + ':partner') },
    { type: 'button', style: 'secondary', height: 'md', action: action('キャンセル', 'lh:cancel:' + session.nonce) }
  ] }
} });
const orderedTargets = (targets, now) => {
  const today = new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const rank = target => target.completed ? 4 : !target.date ? 3 : target.date === today ? 0 : target.date < today ? 1 : 2;
  return [...targets].sort((a, b) => rank(a) - rank(b) || (rank(a) === 1 ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)) || a.time.localeCompare(b.time));
};
const selectionCard = session => {
  const page = session.page || 0, offset = page * PAGE_SIZE, targets = session.targets.slice(offset, offset + PAGE_SIZE);
  const pages = Math.ceil(session.targets.length / PAGE_SIZE);
  const heading = (session.kind === 'member' ? 'メンバータスク' : session.kind === 'partner' ? 'パートナータスク' : '検索結果') + '（' + (offset + 1) + '〜' + (offset + targets.length) + '件／全' + session.targets.length + '件・' + (page + 1) + '/' + pages + 'ページ）';
  return [{ type: 'text', text: heading + '\n\n' + targets.map((target, index) => (offset + index + 1) + '｜' + (target.date || '日付未設定') + (target.time ? ' ' + target.time : '') + (target.completed ? '（終了済み）' : '') + '\n' + clip((target.partnerName ? target.partnerName + '｜' : target.kind === 'member' ? 'メンバー｜' : 'パートナー｜') + target.subject, 250)).join('\n\n') + (session.privateChat ? '\n\n対象の番号だけを送ってください。例：' + (offset + 1) + '\n「申し送り 件名」で絞り込めます。' : '\n\n公式アカウントをメンションして番号を送ってください。例：@管理課 タスク受付 ' + (offset + 1) + '\n「@管理課 タスク受付 申し送り 件名」で絞り込めます。') },
    buttons(session.privateChat ? '一覧の番号を送ってください。例：1' : '公式アカウントをメンションして、一覧の番号を送ってください。例：@管理課 タスク受付 1', [
      ...(pages > 1 ? [action(page + 1 === pages ? '最初の10件へ' : '次の10件', 'lh:page:' + session.nonce + ':' + ((page + 1) % pages))] : []),
      action('種類選択に戻る', 'lh:back:' + session.nonce), action('キャンセル', 'lh:cancel:' + session.nonce)
    ])];
};
export function registeredTaskCard(id, kind, draft) {
  return buttons((kind === 'member' ? 'メンバータスク' : 'パートナータスク') + 'に登録しました。\n' + draft.date + (draft.time ? ' ' + draft.time : '') + '\n' + draft.subject, [
    action('申し送りを追加', 'lh:start:' + id)
  ], 'タスクを登録しました。申し送りを追加できます。');
}
const prompt = target => '「@管理課 タスク受付 追記 内容」と送ってください。\n対象：' + clip(describeLineTask(target), 80);
const confirmCard = session => {
  const card = buttons('このタスクに追加しますか？\n' + clip(describeLineTask(session.target), 50) + '\n申し送り：' + clip(session.text, 75), [
  action('このタスクに追加', 'lh:save:' + session.nonce), action('キャンセル', 'lh:cancel:' + session.nonce)
  ]);
  return session.privateChat ? [{ type: 'text', text: '対象：' + clip(describeLineTask(session.target), 1000) }, { type: 'text', text: session.text }, card] : card;
};
export function createLineHandoffProcessor({ store, reply, fetcher = fetch, env, now = Date.now }) {
  return async event => {
    const text = event.type === 'message' && event.message?.type === 'text' ? event.message.text.normalize('NFKC').trim() : '';
    const search = text === '追記' ? ['', ''] : text.match(/^申し送り(?:[\s:]|$)([\s\S]*)/);
    const addition = text.match(isPrivateLine(event) ? /^(?:追記|内容)(?:[\s:]|$)([\s\S]*)/ : /^追記(?:[\s:]|$)([\s\S]*)/);
    const number = text.match(/^[0-9]{1,6}$/);
    const data = event.type === 'postback' ? String(event.postback?.data || '') : '';
    const start = data.match(/^lh:start:(line_[a-f0-9]{40})$/);
    const command = data.match(/^lh:(choose|page|save|cancel|kind|back):([a-f0-9]{24})(?::([0-9]{1,6}|member|partner))?$/);
    if (!search && !addition && !start && !command && !number) return false;
    const groupId = event.source.groupId, userId = event.source.userId;
    const sessionPath = '_server_integrations/line_handoff_' + digest(groupId + ':' + userId);
    const eventId = event.webhookEventId || (event.message?.id ? 'message:' + event.message.id : JSON.stringify([event.timestamp, groupId, userId, data]));
    const receiptPath = '_server_integrations/line_handoff_event_' + digest(eventId);
    const nonce = digest(eventId).slice(0, 24);
    const paths = [lineConfigPath, sessionPath, receiptPath, 'app_data/shared_state', ...(start ? [linePendingPath(start[1])] : [])];
    let authorName = 'LINE投稿者';
    if (command?.[1] === 'save') {
      try {
        const response = await fetcher(lineProfileUrl(event), { headers: { Authorization: 'Bearer ' + env.LINE_CHANNEL_ACCESS_TOKEN }, signal: AbortSignal.timeout(5000) });
        if (response.ok) authorName = clip((await response.json()).displayName || authorName, 80);
      } catch { /* Saving must still work if the display name is unavailable. */ }
    }
    const message = await store.transact(paths, values => {
      if (!lineAccess(event, values[lineConfigPath])) return { result: 'グループとの連携が変更されています。' };
      if (values[receiptPath]) return { result: values[receiptPath].reply };
      const state = values['app_data/shared_state'];
      if (!state) throw new Error('Missing shared data');
      const current = values[sessionPath];
      const finish = (message, writes = []) => { const response = isPrivateLine(event) && typeof message === 'string' ? message.replaceAll('「@管理課 タスク受付 ', '「') : message; return { writes: [...writes, { path: receiptPath, value: { reply: response, createdAt: new Date(now()).toISOString() } }], result: response }; };
      const sessionWrite = value => ({ path: sessionPath, value });
      const begin = target => {
        const session = { nonce, groupId, userId, privateChat: isPrivateLine(event), status: 'awaiting', target, expires: now() + 1800000 };
        const response = session.privateChat ? [{ type: 'text', text: '対象：' + clip(describeLineTask(target), 1000) + '\n下のフォーマットをコピーし、内容を記入して送ってください。' }, { type: 'text', text: '内容：' }, buttons('記入後に確認画面を表示します。まだ保存されません。', [action('キャンセル', 'lh:cancel:' + nonce)])] : buttons(prompt(target), [action('キャンセル', 'lh:cancel:' + nonce)]);
        return finish(response, [sessionWrite(session)]);
      };
      if (start) {
        const pending = values[linePendingPath(start[1])];
        if (!pending || pending.status !== 'registered' || pending.groupId !== groupId) return finish('このタスクを開けません。「@管理課 タスク受付 申し送り 件名」で探してください。');
        const target = resolveLineTask(state, { id: pending.id, ownerUid: pending.ownerUid, kind: pending.kind });
        if (!target) return finish('タスクが削除されています。「@管理課 タスク受付 申し送り 件名」で探し直してください。');
        return begin(target);
      }
      if (search) {
        const query = search[1].trim();
        const targets = orderedTargets(query ? searchLineTasks(state, query) : lineTaskTargets(state).filter(target => !target.completed), now());
        if (!targets.length) return finish('該当するタスクがありません。件名の一部やパートナー名で探してください。');
        const session = { nonce, groupId, userId, privateChat: isPrivateLine(event), status: query ? 'selecting' : 'kind', targets, page: 0, expires: now() + 1800000 };
        return finish(query ? selectionCard(session) : kindCard(session), [sessionWrite(session)]);
      }
      if (number && (!current || current.status !== 'selecting' || current.expires < now())) return { result: null };
      if (!current || current.groupId !== groupId || current.userId !== userId || current.expires < now()) return finish('申し送りの入力が見つからないか、30分の期限が切れています。「@管理課 タスク受付 申し送り 件名」で対象を選び直してください。');
      if (number) {
        const index = Number(number[0]) - 1, offset = (current.page || 0) * PAGE_SIZE;
        if (index < offset || index >= offset + PAGE_SIZE || !current.targets[index]) return finish('今表示している一覧の番号を送ってください。');
        const target = resolveLineTask(state, current.targets[index]);
        if (!target) return finish('タスクが削除されています。「@管理課 タスク受付 追記」から選び直してください。');
        return begin(target);
      }
      if (command) {
        const [, operation, suppliedNonce, index] = command;
        if (suppliedNonce !== current.nonce) return finish('このボタンは入力した本人だけが使えます。古いボタンの場合は、最新の案内から操作してください。');
        if (current.status === 'saved') return finish('この申し送りは追加済みです。新しい内容は「@管理課 タスク受付 申し送り 件名」から追加してください。');
        if (current.status === 'cancelled') return finish('キャンセル済みです。');
        if (operation === 'cancel') return finish('申し送りをキャンセルしました。', [sessionWrite({ ...current, status: 'cancelled' })]);
        if (operation === 'back') {
          const next = { nonce, groupId, userId, privateChat: isPrivateLine(event), status: 'kind', expires: now() + 1800000 };
          return finish(kindCard(next), [sessionWrite(next)]);
        }
        if (operation === 'kind') {
          if (current.status !== 'kind' || !['member', 'partner'].includes(index)) return finish('最新の案内から種類を選んでください。');
          const targets = orderedTargets(lineTaskTargets(state).filter(target => !target.completed && target.kind === index), now());
          if (!targets.length) return finish(buttons('この種類には未終了タスクがありません。', [action('種類選択に戻る', 'lh:back:' + current.nonce), action('キャンセル', 'lh:cancel:' + current.nonce)]));
          const next = { ...current, status: 'selecting', kind: index, targets, page: 0 };
          return finish(selectionCard(next), [sessionWrite(next)]);
        }
        if (operation === 'page') {
          if (current.status !== 'selecting' || index === undefined || Number(index) >= Math.ceil((current.targets?.length || 0) / PAGE_SIZE)) return finish('最新の案内から対象を選んでください。');
          const next = { ...current, page: Number(index) };
          return finish(selectionCard(next), [sessionWrite(next)]);
        }
        if (operation === 'choose') {
          if (current.status !== 'selecting' || !current.targets?.[Number(index)] || index === undefined) return finish('最新の案内から対象を選んでください。');
          const target = resolveLineTask(state, current.targets[Number(index)]);
          if (!target) return finish('タスクが削除されています。「@管理課 タスク受付 申し送り 件名」で探し直してください。');
          return begin(target);
        }
        if (current.status !== 'confirming' || !current.text) return finish('先に「@管理課 タスク受付 追記 内容」の形で申し送りを送ってください。');
        const target = resolveLineTask(state, current.target);
        if (!target) return finish('タスクが削除されています。申し送りは保存していません。対象を選び直してください。');
        const note = { id: 'line_note_' + current.nonce, text: current.text, kind: 'handoff', source: 'line', authorUid: 'line_' + digest(userId).slice(0, 24), authorName: 'LINE：' + authorName, createdAt: new Date(now()).toISOString() };
        const changes = appendLineHandoff(state, target, note);
        return finish('申し送りを追加しました。\n' + describeLineTask(target), [
          sessionWrite({ ...current, status: 'saved' }),
          ...(Object.keys(changes).length ? [{ path: 'app_data/shared_state', value: changes, fields: Object.keys(changes) }] : [])
        ]);
      }
      if (!['awaiting', 'confirming'].includes(current.status)) return finish('先に「@管理課 タスク受付 申し送り 件名」で対象を選んでください。');
      const content = addition[1].trim();
      if (!content || content.length > 5000) return finish('「追記」の後に申し送りを書いてください。5000文字まで入力できます。');
      const target = resolveLineTask(state, current.target);
      if (!target) return finish('タスクが削除されています。「@管理課 タスク受付 申し送り 件名」で探し直してください。');
      // Each replacement text invalidates the previous confirmation button.
      const next = { ...current, target, nonce, text: content, status: 'confirming', expires: now() + 1800000 };
      return finish(confirmCard(next), [sessionWrite(next)]);
    });
    if (message === null) return false;
    await reply(event, message);
    return true;
  };
}
