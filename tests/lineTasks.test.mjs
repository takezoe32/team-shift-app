import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createHmac } from 'node:crypto';
import { extractLineTask, taskBody, reviewReasons, lineTaskChanges } from '../src/lineTasks.mjs';
import { createLineHandler, validSignature, taskChoices, hash } from '../api/line-webhook.js';
import { lineConfigPath, linePendingPath } from '../api/_lib/line-store.js';

const timestamp = Date.parse('2026-10-19T02:00:00Z');
const users = { admin: { name: '竹添三剛', role: 'admin' }, other: { name: '高橋信次', role: 'staff' }, viewer: { name: '閲覧者', role: 'viewer' } };
const text = 'タスク\n日付：明日\n件名：電球交換\n時間：10:15\n担当：竹添・高橋';
test('only explicit leading task command is handled', () => {
  assert.equal(taskBody('雑談 タスク 明日'), null);
  assert.equal(taskBody('タスクを終了しました'), null);
  assert.equal(taskBody('タスク管理について'), null);
  assert.equal(taskBody('タスク：電球交換'), '電球交換');
});
test('structured text extracts Japanese date, quarter-hour time and multiple known assignees', () => {
  const draft = extractLineTask(text, timestamp, users);
  assert.equal(draft.date, '2026-10-20');
  assert.equal(draft.time, '10:15');
  assert.equal(draft.subject, '電球交換');
  assert.deepEqual(draft.assigneeIds, ['admin', 'other']);
  assert.deepEqual(reviewReasons(draft, 'member', users), []);
});
test('ambiguity, missing fields, invalid dates and non-quarter time go to review', () => {
  const missing = extractLineTask('タスク 電球交換', timestamp, users);
  assert.deepEqual(reviewReasons(missing, 'member', users), ['日付', '担当者']);
  for (const date of ['2026/02/30', '10/18', '明日か明後日']) {
    assert.equal(extractLineTask('タスク\n日付：' + date + '\n件名：作業', timestamp, users).date, '');
  }
  const badTime = extractLineTask(text.replace('10:15', '10:10'), timestamp, users);
  assert.equal(badTime.time, '');
  assert.ok(reviewReasons(badTime, 'partner', users).includes('開始時刻（15分刻み）'));
  assert.deepEqual(extractLineTask(text.replace('竹添・高橋', '不明な人'), timestamp, users).assigneeIds, []);
  assert.deepEqual(extractLineTask(text.replace('竹添・高橋', '閲覧者'), timestamp, users).assigneeIds, []);
});
test('natural phrases and explicit year cross over correctly in JST', () => {
  const draft = extractLineTask('タスク 明日10時に217号室の防水調査。担当は竹添さん', timestamp, users, ['山下健装']);
  assert.equal(draft.date, '2026-10-20');
  assert.equal(draft.time, '10:00');
  assert.deepEqual(draft.assigneeIds, ['admin']);
  assert.equal(extractLineTask('タスク\n日付：明日\n件名：作業', Date.parse('2026-12-31T14:00:00Z'), users).date, '2027-01-01');
});
test('registration preserves other state and never appends the same id twice', () => {
  const state = { users, teamData: { shifts: { x: 1 }, tasks: {} }, partnerItems: [], partnerNames: [] };
  const draft = extractLineTask(text, timestamp, users);
  const pending = { id: 'line_task', ownerUid: 'admin' };
  const member = lineTaskChanges(state, pending, draft, 'member', timestamp);
  assert.equal(member.teamData.tasks[draft.date].admin[0].ownerUid, 'admin');
  assert.equal(member.teamData.shifts.x, 1);
  assert.deepEqual(member.teamData.tasks[draft.date].admin[0].updates, []);
  assert.deepEqual(lineTaskChanges({ ...state, ...member }, pending, draft, 'member', timestamp), {});
  const partner = lineTaskChanges(state, pending, { ...draft, partnerName: '山下健装' }, 'partner', timestamp);
  assert.deepEqual(partner.partnerNames, ['山下健装']);
  assert.equal(partner.partnerItems[0].assigneeUid, 'admin');
});
test('signature covers exact raw bytes, including Japanese and newlines', () => {
  const raw = Buffer.from('日本語\nテスト');
  const sig = createHmac('sha256', 'secret').update(raw).digest('base64');
  assert.equal(validSignature(raw, sig, 'secret'), true);
  assert.equal(validSignature(Buffer.from('日本語\r\nテスト'), sig, 'secret'), false);
  assert.equal(validSignature(raw, sig, 'wrong'), false);
  assert.equal(validSignature(raw, '', 'secret'), false);
  const choices = taskChoices('line_' + 'a'.repeat(40), 'work');
  assert.equal(choices.template.type, 'buttons');
  assert.deepEqual(choices.template.actions.map(action => action.label), ['メンバータスク', 'パートナータスク', 'キャンセル']);
});

function fixture() {
  const docs = {
    [lineConfigPath]: { ownerUid: 'admin', groupId: 'G1' },
    'app_data/shared_state': { users, partnerNames: ['山下健装'], teamData: { tasks: {}, shifts: {} } }
  };
  const replies = [];
  const store = {
    ensurePrivate: async () => {},
    read: async path => structuredClone(docs[path] || null),
    transact: async (paths, plan) => {
      const values = Object.fromEntries(paths.map(path => [path, structuredClone(docs[path] || null)]));
      const result = plan(values);
      for (const write of result.writes || []) docs[write.path] = write.fields ? { ...docs[write.path], ...write.value } : write.value;
      return result.result;
    }
  };
  const handler = createLineHandler({ env: { VERCEL_ENV: 'production', LINE_CHANNEL_SECRET: 'secret', LINE_CHANNEL_ACCESS_TOKEN: 'token' }, makeStore: () => store, now: () => timestamp, fetcher: async (_url, options) => { replies.push(JSON.parse(options.body)); return { ok: true }; } });
  const send = async (events, valid = true) => {
    const raw = Buffer.from(JSON.stringify({ events }));
    const req = Readable.from([raw]);
    req.method = 'POST'; req.headers = { 'x-line-signature': valid ? createHmac('sha256', 'secret').update(raw).digest('base64') : 'wrong' };
    const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; }, end() { return this; } };
    await handler(req, res);
    return res;
  };
  const message = (id = '123', value = text, groupId = 'G1') => ({ type: 'message', timestamp, replyToken: 'reply', source: { type: 'group', groupId, userId: 'U1' }, message: { type: 'text', id, text: value } });
  const postback = (id = '123', kind = 'member', userId = 'U1') => ({ type: 'postback', timestamp, replyToken: 'reply2', source: { type: 'group', groupId: 'G1', userId }, postback: { data: 'lt:line_' + hash(id).slice(0, 40) + ':' + kind } });
  return { docs, replies, send, message, postback };
}

test('handoff vertical list replies send two valid LINE messages in one request', async () => {
  const f = fixture();
  f.docs['app_data/shared_state'].teamData.tasks = { '2026-10-20': { admin: [{ id: 'task', subject: '防水調査', updates: [] }] } };
  assert.equal((await f.send([f.message('search', '申し送り 防水')])).code, 200);
  const response = f.replies.at(-1);
  assert.equal(response.messages.length, 2);
  assert.equal(response.messages[0].type, 'text');
  assert.match(response.messages[0].text, /1｜2026-10-20/);
  assert.equal(response.messages[1].template.type, 'buttons');
  assert.equal((await f.send([f.message('number', '1')])).code, 200);
  assert.match(f.replies.at(-1).messages[0].template.text, /追記 内容/);
});
test('unsigned, unrelated and unlinked messages do not create records', async () => {
  const f = fixture();
  assert.equal((await f.send([f.message()], false)).code, 401);
  await f.send([f.message('1', '雑談'), f.message('2', text, 'unknown')]);
  assert.equal(Object.keys(f.docs).length, 2);
  assert.equal((await f.send([])).code, 200);
});
test('original sender chooses type; replay, duplicate and stale other-user clicks are safe', async () => {
  const f = fixture();
  await f.send([f.message()]);
  await f.send([f.message()]);
  const id = 'line_' + hash('123').slice(0, 40);
  assert.equal(f.docs[linePendingPath(id)].status, 'choosing');
  await f.send([f.postback('123', 'member', 'U2')]);
  assert.equal(f.docs[linePendingPath(id)].status, 'choosing');
  await f.send([f.postback()]);
  await f.send([f.postback()]);
  assert.equal(f.docs[linePendingPath(id)].status, 'registered');
  assert.equal(f.docs['app_data/shared_state'].teamData.tasks['2026-10-20'].admin.length, 1);
});
test('missing partner name becomes review, and cancellation never creates a task', async () => {
  const f = fixture();
  await f.send([f.message()]);
  await f.send([f.postback('123', 'partner')]);
  const id = 'line_' + hash('123').slice(0, 40);
  assert.equal(f.docs[linePendingPath(id)].status, 'review');
  assert.ok(f.docs[linePendingPath(id)].reasons.includes('パートナー名'));
  await f.send([f.message('456')]);
  await f.send([f.postback('456', 'cancel')]);
  assert.deepEqual(f.docs['app_data/shared_state'].teamData.tasks, {});
});
test('pair command is expiring and required before an unknown group can be linked', async () => {
  const f = fixture(), code = 'a'.repeat(32);
  f.docs[lineConfigPath] = { ownerUid: 'admin', pairHash: hash(code), pairExpires: timestamp + 600000 };
  await f.send([f.message('pair', 'LINE連携 ' + code, 'G2')]);
  assert.equal(f.docs[lineConfigPath].groupId, 'G2');
  assert.equal(f.docs[lineConfigPath].pairHash, undefined);
  await f.send([f.message('pair2', 'LINE連携 ' + code, 'G3')]);
  assert.equal(f.docs[lineConfigPath].groupId, 'G2');
});

test('expired choices cannot register; explicit partner details register once', async () => {
  const f = fixture();
  await f.send([f.message('expired')]);
  const expiredId = 'line_' + hash('expired').slice(0, 40);
  f.docs[linePendingPath(expiredId)].expires = timestamp - 1;
  await f.send([f.postback('expired')]);
  assert.deepEqual(f.docs['app_data/shared_state'].teamData.tasks, {});
  await f.send([f.message('partner', text + '\nパートナー：山下健装')]);
  await f.send([f.postback('partner', 'partner')]);
  await f.send([f.postback('partner', 'partner')]);
  assert.equal(f.docs['app_data/shared_state'].partnerItems.length, 1);
  assert.equal(f.docs['app_data/shared_state'].partnerItems[0].partnerName, '山下健装');
});
