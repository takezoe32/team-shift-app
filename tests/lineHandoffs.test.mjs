import test from 'node:test';
import assert from 'node:assert/strict';
import { searchLineTasks, resolveLineTask, appendLineHandoff } from '../src/lineHandoffs.mjs';
import { createLineHandoffProcessor, registeredTaskCard } from '../api/_lib/line-handoff.js';
import { lineConfigPath, linePendingPath } from '../api/_lib/line-store.js';

function state() {
  return { teamData: { shifts: { retained: true }, tasks: { '2026-10-20': { owner: [
    { id: 'member1', subject: '217号室の防水調査', text: '登録時の説明', updates: [], images: [{ imageUrl: 'original' }] },
    { id: 'private', subject: '217号室の個人メモ', text: 'private', visibility: 'private' }
  ] } } }, partnerItems: [{ id: 'partner1', subject: '217号室の防水調査', content: '登録時の業者説明', partnerName: '山下健装', date: '2026-10-20', time: '10:00', images: [{ imageUrl: 'partner-original' }] }] };
}
test('search includes public member and partner tasks and separates matching titles by date/type', () => {
  const data = state();
  assert.equal(searchLineTasks(data, '217号室').length, 2);
  assert.equal(searchLineTasks(data, '217号室 山下健装')[0].kind, 'partner');
  assert.equal(searchLineTasks(data, '2026/10/20 217号室').length, 2);
  assert.deepEqual(searchLineTasks(data, '個人メモ'), []);
});
test('handoff appends preserve original text/images and follow moved tasks', () => {
  const data = state(), reference = { kind: 'member', id: 'member1', ownerUid: 'owner' };
  const note = { id: 'line_note_1', kind: 'handoff', text: '部品を発注しました', authorName: 'LINE：担当', createdAt: '2026-10-20T00:00:00Z' };
  const changes = appendLineHandoff(data, reference, note);
  const edited = changes.teamData.tasks['2026-10-20'].owner[0];
  assert.equal(edited.text, '登録時の説明');
  assert.deepEqual(edited.images, [{ imageUrl: 'original' }]);
  assert.deepEqual(edited.updates, [note]);
  assert.deepEqual(appendLineHandoff({ ...data, ...changes }, reference, note), {});
  data.teamData.tasks['2026-10-21'] = data.teamData.tasks['2026-10-20'];
  delete data.teamData.tasks['2026-10-20'];
  assert.equal(resolveLineTask(data, reference).date, '2026-10-21');
  const partner = appendLineHandoff(data, { kind: 'partner', id: 'partner1' }, note).partnerItems[0];
  assert.equal(partner.content, '登録時の業者説明');
  assert.equal(partner.updates[0].kind, 'initial');
  assert.equal(partner.updates[1].id, note.id);
  assert.throws(() => appendLineHandoff(data, { kind: 'member', id: 'private', ownerUid: 'owner' }, note), /削除/);
});
function fixture() {
  let time = Date.parse('2026-10-20T01:00:00Z'), eventCount = 0;
  const taskId = 'line_' + 'a'.repeat(40);
  const shared = state();
  shared.partnerItems[0].id = taskId;
  const docs = { [lineConfigPath]: { groupId: 'G1' }, 'app_data/shared_state': shared, [linePendingPath(taskId)]: { id: taskId, status: 'registered', kind: 'partner', ownerUid: 'owner', groupId: 'G1' } };
  const replies = [];
  const store = { transact: async (paths, plan) => {
    const result = plan(Object.fromEntries(paths.map(path => [path, structuredClone(docs[path] || null)])));
    for (const write of result.writes || []) docs[write.path] = write.fields ? { ...docs[write.path], ...write.value } : write.value;
    return result.result;
  } };
  const process = createLineHandoffProcessor({ store, reply: async (_event, message) => replies.push(message), env: { LINE_CHANNEL_ACCESS_TOKEN: 'token' }, now: () => time, fetcher: async () => ({ ok: true, json: async () => ({ displayName: '竹添' }) }) });
  const send = async (input, userId = 'U1', sameEvent) => {
    const event = sameEvent || { webhookEventId: 'event-' + (++eventCount), timestamp: time, source: { groupId: 'G1', userId }, ...(typeof input === 'string' ? { type: 'message', message: { id: 'message-' + eventCount, type: 'text', text: input } } : { type: 'postback', postback: { data: input.data } }) };
    const handled = await process(event);
    return { handled, event, reply: replies[replies.length - 1] };
  };
  const actions = message => message.template.actions;
  return { docs, replies, taskId, send, actions, advance: milliseconds => { time += milliseconds; } };
}
test('registered reply has a reusable add-handoff button', () => {
  const card = registeredTaskCard('line_' + 'a'.repeat(40), 'partner', { date: '2026-10-20', subject: '作業' });
  assert.equal(card.template.actions[0].label, '申し送りを追加');
  assert.match(card.template.actions[0].data, /^lh:start:/);
});
test('direct start, text, confirm saves a note once and does not capture normal group conversation', async () => {
  const f = fixture();
  assert.equal((await f.send('普通の会話')).handled, false);
  await f.send({ data: 'lh:start:' + f.taskId });
  const preview = await f.send('追記 部品を発注しました');
  const save = f.actions(preview.reply)[0];
  const attempt = await f.send(save);
  assert.match(attempt.reply, /追加しました/);
  await f.send(save);
  await f.send(null, 'U1', attempt.event);
  const item = f.docs['app_data/shared_state'].partnerItems[0];
  assert.equal(item.updates.filter(update => update.kind === 'handoff').length, 1);
  assert.equal(item.updates[1].authorName, 'LINE：竹添');
  assert.equal(item.content, '登録時の業者説明');
});
test('search choices and confirmation are isolated by actor; old confirmation cannot save replacement text', async () => {
  const f = fixture();
  const result = await f.send('申し送り 217号室');
  const pick = f.actions(result.reply)[0];
  await f.send(pick, 'U2');
  assert.equal(f.docs['app_data/shared_state'].teamData.tasks['2026-10-20'].owner[0].updates.length, 0);
  await f.send(pick);
  const first = await f.send('追記 古い本文'), old = f.actions(first.reply)[0];
  const replacement = await f.send('追記 修正した本文');
  await f.send(old);
  assert.equal(f.docs['app_data/shared_state'].teamData.tasks['2026-10-20'].owner[0].updates.length, 0);
  await f.send(f.actions(replacement.reply)[0], 'U2');
  assert.equal(f.docs['app_data/shared_state'].teamData.tasks['2026-10-20'].owner[0].updates.length, 0);
  await f.send(f.actions(replacement.reply)[0]);
  assert.equal(f.docs['app_data/shared_state'].teamData.tasks['2026-10-20'].owner[0].updates[0].text, '修正した本文');
});
test('cancel, expiry and deleted task do not save notes', async () => {
  const f = fixture();
  await f.send({ data: 'lh:start:' + f.taskId });
  let preview = await f.send('追記 取り消す');
  await f.send(f.actions(preview.reply)[1]);
  await f.send(f.actions(preview.reply)[0]);
  assert.equal(f.docs['app_data/shared_state'].partnerItems[0].updates, undefined);
  await f.send({ data: 'lh:start:' + f.taskId });
  preview = await f.send('追記 期限切れ');
  f.advance(1800001);
  await f.send(f.actions(preview.reply)[0]);
  assert.equal(f.docs['app_data/shared_state'].partnerItems[0].updates, undefined);
  await f.send({ data: 'lh:start:' + f.taskId });
  preview = await f.send('追記 削除済み');
  f.docs['app_data/shared_state'].partnerItems = [];
  const result = await f.send(f.actions(preview.reply)[0]);
  assert.match(result.reply, /削除/);
});
test('redelivered search does not overwrite newer confirmation session', async () => {
  const f = fixture();
  const search = await f.send('申し送り 山下健装');
  await f.send(f.actions(search.reply)[0]);
  const preview = await f.send('追記 保存する本文');
  await f.send(null, 'U1', search.event);
  await f.send(f.actions(preview.reply)[0]);
  assert.equal(f.docs['app_data/shared_state'].partnerItems[0].updates[1].text, '保存する本文');
});
test('cross-group commands and excessive search results do not save notes', async () => {
  const f = fixture();
  const fake = { webhookEventId: 'other-group', timestamp: Date.now(), source: { groupId: 'G2', userId: 'U1' }, type: 'postback', postback: { data: 'lh:start:' + f.taskId } };
  await f.send(null, 'U1', fake);
  assert.equal(f.docs['app_data/shared_state'].partnerItems[0].updates, undefined);
  const tasks = f.docs['app_data/shared_state'].teamData.tasks['2026-10-20'].owner;
  for (let index = 0; index < 4; index++) tasks.push({ id: 'task-' + index, subject: '217号室 追加' + index });
  const result = await f.send('申し送り 217号室');
  assert.match(result.reply, /絞って/);
});
