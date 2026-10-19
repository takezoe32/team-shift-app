import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createHmac } from 'node:crypto';
import { createLineHandler } from '../api/line-webhook.js';
import { lineConfigPath } from '../api/_lib/line-store.js';
import { privateMemberPath } from '../api/_lib/line-private.js';
import { issueLineAccountCode, appLineMemberPath } from '../api/_lib/line-account.js';
const timestamp = Date.parse('2026-10-19T03:00:00Z');
function fixture({ inGroup = true, group = 'G1', displayName = '竹添三剛', linked = true } = {}) {
  let counter = 0;
  const docs = { [lineConfigPath]: { ownerUid: 'owner', ...(group ? { groupId: group } : {}), status: 'connected' }, 'app_data/shared_state': { users: { owner: { name: '竹添三剛', email: 'owner@example.com', role: 'admin' }, other: { name: '高橋信次', email: 'other@example.com', role: 'staff' } }, partnerNames: ['山下健装', 'トラステック企画'], teamData: { tasks: {}, shifts: {} } } };
  if (linked) { docs[privateMemberPath('U1')] = { appUid: 'owner', userId: 'U1', email: 'owner@example.com', status: 'active', epoch: 'legacy' }; docs[appLineMemberPath('owner')] = { userId: 'U1' }; }
  const replies = [], requests = [];
  const store = { ensurePrivate: async () => {}, read: async path => structuredClone(docs[path] || null), transact: async (paths, plan) => {
    const result = plan(Object.fromEntries(paths.map(path => [path, structuredClone(docs[path] || null)])));
    for (const write of result.writes || []) docs[write.path] = write.fields ? { ...docs[write.path], ...write.value } : write.value;
    return result.result;
  } };
  const fetcher = async (url, options = {}) => {
    requests.push(url);
    if (url.includes('/group/')) return { ok: inGroup, status: inGroup ? 200 : 404, json: async () => ({ displayName }) };
    if (url.includes('/profile/')) return { ok: true, json: async () => ({ displayName }) };
    assert.ok(url.endsWith('/message/reply'));
    replies.push(JSON.parse(options.body));
    return { ok: true };
  };
  const handler = createLineHandler({ env: { VERCEL_ENV: 'production', LINE_CHANNEL_SECRET: 'secret', LINE_CHANNEL_ACCESS_TOKEN: 'token' }, makeStore: () => store, fetcher, now: () => timestamp });
  const send = async (input, userId = 'U1', repeated) => {
    const id = 'private-' + ++counter;
    const event = repeated || { webhookEventId: id, timestamp, replyToken: 'reply-' + userId, source: { type: 'user', userId }, ...(typeof input === 'string' ? { type: 'message', message: { type: 'text', id, text: input } } : { type: 'postback', postback: { data: input.data } }) };
    const raw = Buffer.from(JSON.stringify({ destination: 'bot', events: [event] })), req = Readable.from([raw]);
    req.method = 'POST'; req.headers = { 'x-line-signature': createHmac('sha256', 'secret').update(raw).digest('base64') };
    const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } };
    await handler(req, res);
    assert.equal(res.code, 200, JSON.stringify(res.body));
    return { event, messages: replies.at(-1)?.messages };
  };
  const buttons = () => { const card = replies.at(-1).messages.at(-1); return card.type === 'flex' ? card.contents.body.contents.filter(item => item.type === 'button').map(item => item.action) : card.template.actions; };
  const press = async label => { const button = buttons().find(action => action.label === label); assert.ok(button, label); return send(button); };
  return { docs, store, send, press, buttons, replies, requests };
}

test('private task command returns form and saves only after confirmation; no group or push messages', async () => {
  const f = fixture();
  await f.send('タスク');
  await f.press('メンバータスク');
  assert.equal(f.replies.at(-1).messages[1].text, '件名：\n日付：\n内容：');
  await f.send('件名：電球交換\n日付：明日\n内容：ロビーを点検します。');
  assert.match(f.replies.at(-1).messages[0].text, /担当：竹添三剛/);
  assert.deepEqual(f.docs['app_data/shared_state'].teamData.tasks, {});
  const save = f.buttons().find(action => action.label === '登録');
  const result = await f.send(save);
  await f.send(null, 'U1', result.event);
  await f.send(save);
  const tasks = f.docs['app_data/shared_state'].teamData.tasks['2026-10-20'].owner;
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].text, 'ロビーを点検します。');
  assert.deepEqual(tasks[0].assigneeIds, ['owner']);
  assert.ok(f.replies.every(reply => reply.replyToken === 'reply-U1' && !('to' in reply)));
  assert.equal(f.requests.some(url => url.endsWith('/push')), false);
});

test('private partner form rechecks missing fields, suggests known company and allows editing before save', async () => {
  const f = fixture();
  await f.send('タスク'); await f.press('パートナータスク');
  assert.match(f.replies.at(-1).messages[1].text, /時間：\nパートナー：/);
  await f.send('件名：防水調査\n日付：2026/02/30\n時間：12:07\nパートナー：山下健創\n内容：');
  assert.match(f.replies.at(-1).messages[0].text, /日付・時間/);
  await f.send('件名：防水調査\n日付：明日\n時間：12:00\nパートナー：山下健創\n内容：浴室');
  await f.press('山下健装');
  assert.equal(f.docs['app_data/shared_state'].partnerItems, undefined);
  await f.press('修正');
  assert.match(f.replies.at(-1).messages[1].text, /パートナー：山下健装/);
  await f.send('件名：防水調査（変更）\n日付：明日\n時間：13:00\nパートナー：山下健装\n内容：洗面台も確認');
  await f.press('登録');
  const item = f.docs['app_data/shared_state'].partnerItems[0];
  assert.equal(item.subject, '防水調査(変更)');
  assert.equal(item.time, '13:00');
  assert.equal(item.partnerName, '山下健装');
});

test('verified email mapping overrides a different LINE display name without asking for identity', async () => {
  const f = fixture({ displayName: 'たけぞえ' });
  await f.send('タスク'); await f.press('メンバータスク');
  await f.send('件名：点検\n日付：明日\n内容：');
  assert.match(f.replies.at(-1).messages[0].text, /担当：竹添三剛/);
  assert.deepEqual(f.docs['app_data/shared_state'].teamData.tasks, {});
  await f.press('登録');
  await f.send('タスク'); await f.press('メンバータスク');
  await f.send('件名：点検2\n日付：明日\n内容：');
  await f.press('登録');
  assert.equal(f.docs['app_data/shared_state'].teamData.tasks['2026-10-20'].owner.length, 2);
});

test('private handoff uses contents form and confirms full note before adding', async () => {
  const f = fixture();
  f.docs['app_data/shared_state'].teamData.tasks = { '2026-10-20': { owner: [{ id: 'task', subject: '点検', text: '元の本文', updates: [] }] } };
  await f.send('追記'); await f.press('メンバー');
  assert.match(f.replies.at(-1).messages[0].text, /対象の番号だけ/);
  await f.send('1');
  assert.equal(f.replies.at(-1).messages[1].text, '内容：');
  await f.send('内容：部品を発注しました。\n明日再点検します。');
  assert.match(f.replies.at(-1).messages[1].text, /明日再点検/);
  assert.equal(f.docs['app_data/shared_state'].teamData.tasks['2026-10-20'].owner[0].updates.length, 0);
  await f.press('このタスクに追加');
  const task = f.docs['app_data/shared_state'].teamData.tasks['2026-10-20'].owner[0];
  assert.equal(task.text, '元の本文');
  assert.equal(task.updates.length, 1);
  assert.equal(task.updates[0].authorName, 'LINE：竹添三剛');
});

test('unknown friends cannot see tasks, members or buttons without a valid private invite', async () => {
  const f = fixture({ inGroup: false, linked: false });
  const before = structuredClone(f.docs);
  await f.send('タスク');
  assert.match(f.replies.at(-1).messages[0].text, /本人用のコード/);
  assert.deepEqual(f.docs, before);
  await f.send({ data: 'lh:start:line_' + 'a'.repeat(40) });
  assert.match(f.replies.at(-1).messages[0].text, /本人用のコード/);
  assert.deepEqual(f.docs, before);
});

test('personal code binds verified email once, expires, and supersedes an older code', async () => {
  const f = fixture({ inGroup: false, group: '', linked: false });
  let result = await issueLineAccountCode({ store: f.store, email: 'owner@example.com', expectedUid: 'owner', now: () => timestamp });
  const old = result.command;
  result = await issueLineAccountCode({ store: f.store, email: 'owner@example.com', expectedUid: 'owner', now: () => timestamp });
  await f.send(old);
  assert.equal(f.docs[privateMemberPath('U1')], undefined);
  await f.send(result.command);
  assert.equal(f.docs[privateMemberPath('U1')].appUid, 'owner');
  assert.deepEqual(f.docs['app_data/shared_state'].lineLinkedMembers, { owner: 'owner@example.com' });
  assert.match(f.replies.at(-1).messages[0].text, /メンションは不要/);
  await f.send(result.command, 'U2');
  assert.equal(f.docs[privateMemberPath('U2')], undefined);
  const expired = await issueLineAccountCode({ store: f.store, email: 'other@example.com', expectedUid: 'other', now: () => timestamp - 600001 });
  await f.send(expired.command, 'U2');
  assert.equal(f.docs[privateMemberPath('U2')], undefined);
  const replacement = await issueLineAccountCode({ store: f.store, email: 'owner@example.com', expectedUid: 'owner', now: () => timestamp });
  await f.send(replacement.command, 'U2');
  assert.equal(f.docs[privateMemberPath('U2')].appUid, 'owner');
  await f.send('タスク', 'U1');
  assert.match(f.replies.at(-1).messages[0].text, /本人用のコード/);
  f.docs['app_data/shared_state'].users.owner.role = 'viewer';
  await f.send('タスク', 'U2');
  assert.match(f.replies.at(-1).messages[0].text, /本人用のコード/);
  f.docs['app_data/shared_state'].users.owner.role = 'admin';
  f.docs[lineConfigPath].accessEpoch = 'new-epoch';
  await f.send('タスク', 'U2');
  assert.match(f.replies.at(-1).messages[0].text, /本人用のコード/);
});

test('another enrolled user cannot save a private registration or reuse stale confirmation', async () => {
  const f = fixture();
  await f.send('タスク'); await f.press('メンバータスク');
  await f.send('件名：点検\n日付：明日\n内容：');
  const old = f.buttons().find(action => action.label === '登録');
  await f.send(old, 'U2');
  assert.deepEqual(f.docs['app_data/shared_state'].teamData.tasks, {});
  await f.send('タスク'); await f.press('メンバータスク');
  await f.send('件名：別の点検\n日付：明日\n内容：');
  await f.send(old);
  assert.deepEqual(f.docs['app_data/shared_state'].teamData.tasks, {});
  const pending = Object.entries(f.docs).find(([path, value]) => path.startsWith('_server_integrations/line_task_') && value.draft?.subject === '別の点検');
  pending[1].expires = timestamp - 1;
  const valid = f.replies.slice().reverse().find(reply => reply.messages.at(-1)?.template?.actions?.some(action => action.label === '登録')).messages.at(-1).template.actions.find(action => action.label === '登録');
  await f.send(valid);
  assert.deepEqual(f.docs['app_data/shared_state'].teamData.tasks, {});
});

test('existing linked members get a display marker on their next private operation', async () => {
  const f = fixture();
  assert.equal(f.docs['app_data/shared_state'].lineLinkedMembers, undefined);
  await f.send('使い方');
  assert.deepEqual(f.docs['app_data/shared_state'].lineLinkedMembers, { owner: 'owner@example.com' });
  assert.deepEqual(f.docs['app_data/shared_state'].teamData, { tasks: {}, shifts: {} });
});
