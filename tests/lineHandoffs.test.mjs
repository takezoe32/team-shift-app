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
  const actions = message => { const card = Array.isArray(message) ? message[1] : message; return card.type === 'flex' ? card.contents.body.contents.filter(item => item.type === 'button').map(item => item.action) : card.template.actions; };
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
  const pick = '1';
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
  await f.send('1');
  const preview = await f.send('追記 保存する本文');
  await f.send(null, 'U1', search.event);
  await f.send(f.actions(preview.reply)[0]);
  assert.equal(f.docs['app_data/shared_state'].partnerItems[0].updates[1].text, '保存する本文');
});
test('vertical lists show ten tasks, select by number and preserve actor isolation', async () => {
  const f = fixture(), shared = f.docs['app_data/shared_state'];
  const tasks = shared.teamData.tasks['2026-10-20'].owner;
  tasks.push({ id: 'done', subject: '終了タスク', completed: true });
  for (let index = 0; index < 15; index++) tasks.push({ id: 'extra-' + index, subject: '追加タスク' + index, updates: [] });
  assert.equal((await f.send('123')).handled, false);
  let result = await f.send('申し送り');
  const member = f.actions(result.reply).find(a => a.label === 'メンバー');
  assert.equal((await f.send('1', 'U2')).handled, false);
  result = await f.send(member);
  assert.match(result.reply[0].text, /1〜10件／全16件/);
  assert.equal(result.reply[0].text.includes('個人メモ'), false);
  assert.equal(result.reply[0].text.includes('終了タスク'), false);
  const page = f.actions(result.reply).find(a => a.label === '次の10件');
  assert.match((await f.send(page, 'U2')).reply, /入力/);
  result = await f.send(page);
  assert.match(result.reply[0].text, /11〜16件／全16件/);
  assert.match((await f.send('1')).reply, /今表示/);
  assert.match((await f.send('999999')).reply, /今表示/);
  await f.send('１１');
  const preview = await f.send('追記 ページから追加');
  await f.send(f.actions(preview.reply)[0]);
  const saved = f.docs['app_data/shared_state'].teamData.tasks['2026-10-20'].owner.find(task => task.id === 'extra-9');
  assert.equal(saved.updates[0].text, 'ページから追加');
  assert.equal((await f.send('11')).handled, false);
});

test('paging wraps, back switches types, empty categories and expiry are safe', async () => {
  const f = fixture(), shared = f.docs['app_data/shared_state'];
  for (let index = 0; index < 10; index++) shared.partnerItems.push({ id: 'p' + index, subject: '追加', date: '2026-10-20' });
  let result = await f.send('申し送り');
  result = await f.send(f.actions(result.reply).find(a => a.label === 'パートナー'));
  let page = f.actions(result.reply).find(a => a.label === '次の10件');
  result = await f.send(page);
  assert.match(result.reply[0].text, /11〜11件／全11件/);
  page = f.actions(result.reply).find(a => a.label === '最初の10件へ');
  result = await f.send(page);
  assert.match(result.reply[0].text, /1〜10件／全11件/);
  assert.match((await f.send({ data: page.data.replace(/:[0-9]+$/, ':999999') })).reply, /最新の案内/);
  result = await f.send(f.actions(result.reply).find(a => a.label === '種類選択に戻る'));
  result = await f.send(f.actions(result.reply).find(a => a.label === 'メンバー'));
  assert.match(result.reply[0].text, /メンバータスク/);
  assert.match(result.reply[0].text, /全1件/);
  f.advance(1800001);
  assert.equal((await f.send('1')).handled, false);
  assert.match((await f.send(page)).reply, /期限/);
  result = await f.send('申し送り');
  shared.teamData.tasks = {};
  result = await f.send(f.actions(result.reply).find(a => a.label === 'メンバー'));
  assert.match(result.reply.template.text, /ありません/);
});

test('search uses vertical mixed results and orders today, overdue then upcoming in JST', async () => {
  const f = fixture(), shared = f.docs['app_data/shared_state'];
  shared.partnerItems.push(
    { id: 'future', subject: '調査', date: '2026-10-21' },
    { id: 'old', subject: '調査', date: '2026-10-18' },
    { id: 'yesterday', subject: '調査', date: '2026-10-19' }
  );
  const result = await f.send('申し送り 調査');
  const text = result.reply[0].text;
  assert.ok(text.indexOf('2026-10-20') < text.indexOf('2026-10-19'));
  assert.ok(text.indexOf('2026-10-19') < text.indexOf('2026-10-18'));
  assert.ok(text.indexOf('2026-10-18') < text.indexOf('2026-10-21'));
  await f.send('5');
  shared.partnerItems = shared.partnerItems.filter(p => p.id !== 'future');
  const preview = await f.send('追記 削除されたタスク');
  assert.match(preview.reply, /削除/);
  shared.teamData.tasks = {};
  shared.partnerItems = [];
  assert.match((await f.send('申し送り')).reply, /ありません/);
});

test('long vertical entries stay within text limit and cancelled selection ignores numbers', async () => {
  const f = fixture(), shared = f.docs['app_data/shared_state'];
  shared.partnerItems = Array.from({ length: 10 }, (_, i) => ({ id: 'long' + i, subject: 'あ'.repeat(2000), partnerName: 'い'.repeat(200), date: '2026-10-20' }));
  let result = await f.send('申し送り あ');
  assert.ok(result.reply[0].text.length <= 5000);
  assert.equal(result.reply.length, 2);
  result = await f.send(f.actions(result.reply).find(a => a.label === 'キャンセル'));
  assert.match(result.reply, /キャンセル/);
  assert.equal((await f.send('1')).handled, false);
});

