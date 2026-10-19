import { createHash } from 'node:crypto';
import { lineConfigPath, linePendingPath } from './line-store.js';
import { searchLineTasks, resolveLineTask, describeLineTask, appendLineHandoff } from '../../src/lineHandoffs.mjs';
const digest = value => createHash('sha256').update(value).digest('hex');
const clip = (value, limit) => { let result = ''; for (const character of String(value)) { if (result.length + character.length > limit) break; result += character; } return result; };
const buttons = (text, actions, altText = 'タスクの申し送り') => ({ type: 'template', altText, template: { type: 'buttons', text: clip(text, 160), actions } });
const action = (label, data) => ({ type: 'postback', label: clip(label, 20), data });
export function registeredTaskCard(id, kind, draft) {
  return buttons((kind === 'member' ? 'メンバータスク' : 'パートナータスク') + 'に登録しました。\n' + draft.date + (draft.time ? ' ' + draft.time : '') + '\n' + draft.subject, [
    action('申し送りを追加', 'lh:start:' + id)
  ], 'タスクを登録しました。申し送りを追加できます。');
}
const prompt = target => '「追記 内容」と送ってください。例：追記 部品を発注しました\n対象：' + clip(describeLineTask(target), 90);
const confirmCard = session => buttons('このタスクに追加しますか？\n' + clip(describeLineTask(session.target), 50) + '\n申し送り：' + clip(session.text, 75), [
  action('このタスクに追加', 'lh:save:' + session.nonce), action('キャンセル', 'lh:cancel:' + session.nonce)
]);
export function createLineHandoffProcessor({ store, reply, fetcher = fetch, env, now = Date.now }) {
  return async event => {
    const text = event.type === 'message' && event.message?.type === 'text' ? event.message.text.normalize('NFKC').trim() : '';
    const search = text.match(/^申し送り(?:[\s:]|$)([\s\S]*)/);
    const addition = text.match(/^追記(?:[\s:]|$)([\s\S]*)/);
    const data = event.type === 'postback' ? String(event.postback?.data || '') : '';
    const start = data.match(/^lh:start:(line_[a-f0-9]{40})$/);
    const command = data.match(/^lh:(choose|save|cancel):([a-f0-9]{24})(?::([0-2]))?$/);
    if (!search && !addition && !start && !command) return false;
    const groupId = event.source.groupId, userId = event.source.userId;
    const sessionPath = '_server_integrations/line_handoff_' + digest(groupId + ':' + userId);
    const eventId = event.webhookEventId || (event.message?.id ? 'message:' + event.message.id : JSON.stringify([event.timestamp, groupId, userId, data]));
    const receiptPath = '_server_integrations/line_handoff_event_' + digest(eventId);
    const nonce = digest(eventId).slice(0, 24);
    const paths = [lineConfigPath, sessionPath, receiptPath, 'app_data/shared_state', ...(start ? [linePendingPath(start[1])] : [])];
    let authorName = 'LINE投稿者';
    if (command?.[1] === 'save') {
      try {
        const response = await fetcher('https://api.line.me/v2/bot/group/' + encodeURIComponent(groupId) + '/member/' + encodeURIComponent(userId), { headers: { Authorization: 'Bearer ' + env.LINE_CHANNEL_ACCESS_TOKEN }, signal: AbortSignal.timeout(5000) });
        if (response.ok) authorName = clip((await response.json()).displayName || authorName, 80);
      } catch { /* Saving must still work if the display name is unavailable. */ }
    }
    const message = await store.transact(paths, values => {
      if (values[lineConfigPath]?.groupId !== groupId) return { result: 'グループとの連携が変更されています。' };
      if (values[receiptPath]) return { result: values[receiptPath].reply };
      const state = values['app_data/shared_state'];
      if (!state) throw new Error('Missing shared data');
      const current = values[sessionPath];
      const finish = (message, writes = []) => ({ writes: [...writes, { path: receiptPath, value: { reply: message, createdAt: new Date(now()).toISOString() } }], result: message });
      const sessionWrite = value => ({ path: sessionPath, value });
      const begin = target => {
        const session = { nonce, groupId, userId, status: 'awaiting', target, expires: now() + 1800000 };
        return finish(buttons(prompt(target), [action('キャンセル', 'lh:cancel:' + nonce)]), [sessionWrite(session)]);
      };
      if (start) {
        const pending = values[linePendingPath(start[1])];
        if (!pending || pending.status !== 'registered' || pending.groupId !== groupId) return finish('このタスクを開けません。「申し送り 件名」で探してください。');
        const target = resolveLineTask(state, { id: pending.id, ownerUid: pending.ownerUid, kind: pending.kind });
        if (!target) return finish('タスクが削除されています。「申し送り 件名」で探し直してください。');
        return begin(target);
      }
      if (search) {
        const query = search[1].trim();
        if (!query) return finish('「申し送り 件名」と送ってください。例：申し送り 217号室');
        const targets = searchLineTasks(state, query);
        if (!targets.length) return finish('該当するタスクがありません。件名の一部やパートナー名で探してください。');
        if (targets.length > 3) return finish('候補が' + targets.length + '件あります。日付やパートナー名も入れて絞ってください。例：申し送り 217号室 2026-10-20');
        const session = { nonce, groupId, userId, status: 'selecting', targets, expires: now() + 1800000 };
        return finish(buttons('投稿した本人が対象を選んでください。\n' + targets.map((target, index) => (index + 1) + '：' + clip(describeLineTask(target).replaceAll('\n', ' '), 36)).join('\n'), [
          ...targets.map((target, index) => action((index + 1) + '：' + target.subject, 'lh:choose:' + nonce + ':' + index)), action('キャンセル', 'lh:cancel:' + nonce)
        ]), [sessionWrite(session)]);
      }
      if (!current || current.groupId !== groupId || current.userId !== userId || current.expires < now()) return finish('申し送りの入力が見つからないか、30分の期限が切れています。「申し送り 件名」で対象を選び直してください。');
      if (command) {
        const [, operation, suppliedNonce, index] = command;
        if (suppliedNonce !== current.nonce) return finish('このボタンは入力した本人だけが使えます。古いボタンの場合は、最新の案内から操作してください。');
        if (current.status === 'saved') return finish('この申し送りは追加済みです。新しい内容は「申し送り 件名」から追加してください。');
        if (current.status === 'cancelled') return finish('キャンセル済みです。');
        if (operation === 'cancel') return finish('申し送りをキャンセルしました。', [sessionWrite({ ...current, status: 'cancelled' })]);
        if (operation === 'choose') {
          if (current.status !== 'selecting' || !current.targets?.[Number(index)] || index === undefined) return finish('最新の案内から対象を選んでください。');
          const target = resolveLineTask(state, current.targets[Number(index)]);
          if (!target) return finish('タスクが削除されています。「申し送り 件名」で探し直してください。');
          return finish(buttons(prompt(target), [action('キャンセル', 'lh:cancel:' + current.nonce)]), [sessionWrite({ ...current, status: 'awaiting', target })]);
        }
        if (current.status !== 'confirming' || !current.text) return finish('先に「追記 内容」の形で申し送りを送ってください。');
        const target = resolveLineTask(state, current.target);
        if (!target) return finish('タスクが削除されています。申し送りは保存していません。対象を選び直してください。');
        const note = { id: 'line_note_' + current.nonce, text: current.text, kind: 'handoff', source: 'line', authorUid: 'line_' + digest(userId).slice(0, 24), authorName: 'LINE：' + authorName, createdAt: new Date(now()).toISOString() };
        const changes = appendLineHandoff(state, target, note);
        return finish('申し送りを追加しました。\n' + describeLineTask(target), [
          sessionWrite({ ...current, status: 'saved' }),
          ...(Object.keys(changes).length ? [{ path: 'app_data/shared_state', value: changes, fields: Object.keys(changes) }] : [])
        ]);
      }
      if (!['awaiting', 'confirming'].includes(current.status)) return finish('先に「申し送り 件名」で対象を選んでください。');
      const content = addition[1].trim();
      if (!content || content.length > 5000) return finish('「追記」の後に申し送りを書いてください。5000文字まで入力できます。');
      const target = resolveLineTask(state, current.target);
      if (!target) return finish('タスクが削除されています。「申し送り 件名」で探し直してください。');
      // Each replacement text invalidates the previous confirmation button.
      const next = { ...current, target, nonce, text: content, status: 'confirming', expires: now() + 1800000 };
      return finish(confirmCard(next), [sessionWrite(next)]);
    });
    await reply(event, message);
    return true;
  };
}
