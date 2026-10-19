import test from 'node:test';
import assert from 'node:assert/strict';
import { lineActions, lineText } from './helpers/lineCards.mjs';
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
  assert.equal(choices.type, 'flex');
  assert.deepEqual(lineActions(choices).map(action => action.label), ['メンバータスク', 'パートナータスク', 'キャンセル']);
});

function fixture({ displayName = '竹添三剛', profileUnavailable = false } = {}) {
  const docs = {
    [lineConfigPath]: { ownerUid: 'admin', groupId: 'G1' },
    'app_data/shared_state': { users: structuredClone(users), partnerNames: ['山下健装'], teamData: { tasks: {}, shifts: {} } }
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
  const handler = createLineHandler({ env: { VERCEL_ENV: 'production', LINE_CHANNEL_SECRET: 'secret', LINE_CHANNEL_ACCESS_TOKEN: 'token' }, makeStore: () => store, now: () => timestamp, fetcher: async (url, options) => { if (url.includes('/member/')) return { ok: !profileUnavailable, json: async () => ({ displayName }) }; replies.push(JSON.parse(options.body)); return { ok: true }; } });
  const send = async (events, valid = true) => {
    const raw = Buffer.from(JSON.stringify({ events }));
    const req = Readable.from([raw]);
    req.method = 'POST'; req.headers = { 'x-line-signature': valid ? createHmac('sha256', 'secret').update(raw).digest('base64') : 'wrong' };
    const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; }, end() { return this; } };
    await handler(req, res);
    return res;
  };
  const message = (id = '123', value = text, groupId = 'G1') => ({ type: 'message', timestamp, replyToken: 'reply', source: { type: 'group', groupId, userId: 'U1' }, message: { type: 'text', id, text: '@管理課 タスク受付 ' + value, mention: { mentionees: [{ type: 'user', isSelf: true, index: 0, length: '@管理課 タスク受付'.length }] } } });
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
  assert.equal(response.messages[1].type, 'flex');
  assert.equal((await f.send([f.message('number', '1')])).code, 200);
  assert.match(lineText(f.replies.at(-1).messages[0]), /追記 内容/);
});

test('mention gate ignores unmentioned task, alias, numeric input and pairing without writes or replies', async () => {
  const f = fixture();
  f.docs['app_data/shared_state'].teamData.tasks = { '2026-10-20': { admin: [{ id: 'task', subject: '点検', updates: [] }] } };
  const before = structuredClone(f.docs);
  const events = ['タスク\n日付：明日\n件名：点検', '追記', '申し送り', '1', 'LINE連携 ' + 'a'.repeat(32)].map((value, i) => {
    const event = f.message('ignored-' + i, value);
    delete event.message.mention;
    return event;
  });
  const other = f.message('other', '追記');
  other.message.mention.mentionees[0].isSelf = false;
  const all = f.message('all', '追記');
  all.message.mention.mentionees[0].type = 'all';
  await f.send([...events, other, all]);
  assert.deepEqual(f.docs, before);
  assert.equal(f.replies.length, 0);
  await f.send([f.message('alias', '追記')]);
  const choices = f.replies.at(-1).messages[0].contents.body.contents.filter(item => item.type === 'button').map(item => item.action);
  assert.deepEqual(choices.map(a => a.label), ['メンバー', 'パートナー', 'キャンセル']);
  const pickKind = { ...f.postback(), postback: { data: choices[0].data } };
  await f.send([pickKind]);
  assert.equal(f.replies.at(-1).messages[0].type, 'text');
  const bareNumber = f.message('bare-number', '1');
  delete bareNumber.message.mention;
  const count = f.replies.length;
  await f.send([bareNumber]);
  assert.equal(f.replies.length, count);
  await f.send([f.message('pick', '1')]);
  const bareNote = f.message('bare-note', '追記 メンションなし');
  delete bareNote.message.mention;
  await f.send([bareNote]);
  await f.send([f.message('note', '追記 メンションあり')]);
  assert.match(lineText(f.replies.at(-1).messages[0]), /メンションあり/);
  assert.doesNotMatch(lineText(f.replies.at(-1).messages[0]), /メンションなし/);
});

test('mention alone returns help without changing a task or active handoff session', async () => {
  const f = fixture();
  f.docs['app_data/shared_state'].teamData.tasks = { '2026-10-20': { admin: [{ id: 'task', subject: '点検', updates: [] }] } };
  await f.send([f.message('open', '追記')]);
  const before = structuredClone(f.docs);
  for (const content of ['', '　', '\n  ']) {
    const response = await f.send([f.message('help-' + content, content)]);
    assert.equal(response.code, 200);
    const help = f.replies.at(-1).messages[0];
    assert.equal(help.type, 'text');
    for (const keyword of ['【追記】', '【タスク＋内容】', '【申し送り＋件名】', '受付 3', '追記 部品']) assert.ok(help.text.includes(keyword));
    assert.deepEqual(f.docs, before);
  }
  const unmentioned = f.message('plain-help', '');
  delete unmentioned.message.mention;
  const count = f.replies.length;
  await f.send([unmentioned]);
  assert.equal(f.replies.length, count);
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
test('missing partner name is asked in LINE, and cancellation never creates a task', async () => {
  const f = fixture();
  await f.send([f.message()]);
  await f.send([f.postback('123', 'partner')]);
  const id = 'line_' + hash('123').slice(0, 40);
  assert.equal(f.docs[linePendingPath(id)].status, 'collecting');
  assert.equal(f.docs[linePendingPath(id)].step, 'partner');
  assert.match(lineText(f.replies.at(-1).messages[0]), /パートナー名を入力/);
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

const replyActions = f => lineActions(f.replies.at(-1).messages.at(-1));
const pressReply = (f, label, userId = 'U1') => {
  const button = replyActions(f).find(action => action.label === label);
  assert.ok(button, 'missing button ' + label);
  return f.send([{ ...f.postback('unused', 'member', userId), postback: { data: button.data } }]);
};

test('poster is the sole assignee even when text names another member', async () => {
  const f = fixture({ displayName: '高橋信次' });
  await f.send([f.message('self', 'タスク\n日付：明日\n件名：点検\n担当：竹添')]);
  await f.send([f.postback('self', 'member')]);
  const task = f.docs['app_data/shared_state'].teamData.tasks['2026-10-20'].other[0];
  assert.deepEqual(task.assigneeIds, ['other']);
  assert.equal(task.ownerUid, 'other');
});

test('missing partner is asked, typo suggestions need confirmation, sender remains assignee', async () => {
  const f = fixture();
  await f.send([f.message('p1', 'タスク 山下健創が明日の12時来館')]);
  await f.send([f.postback('p1', 'partner')]);
  assert.match(lineText(f.replies.at(-1).messages[0]), /パートナー名を入力/);
  await f.send([f.message('answer-p1', '山下健創')]);
  assert.match(lineText(f.replies.at(-1).messages[0]), /この中のパートナー/);
  assert.equal(f.docs['app_data/shared_state'].partnerItems, undefined);
  const suggestion = replyActions(f).find(action => action.label === '山下健装');
  await f.send([{ ...f.postback('unused', 'partner', 'U2'), postback: { data: suggestion.data } }]);
  assert.equal(f.docs['app_data/shared_state'].partnerItems, undefined);
  await pressReplyFromSaved(f, suggestion);
  const item = f.docs['app_data/shared_state'].partnerItems[0];
  assert.equal(item.partnerName, '山下健装');
  assert.deepEqual(item.assigneeIds, ['admin']);
  assert.equal(item.date, '2026-10-20');
  assert.equal(item.time, '12:00');
  await pressReplyFromSaved(f, suggestion);
  assert.equal(f.docs['app_data/shared_state'].partnerItems.length, 1);
});
const pressReplyFromSaved = (f, button) => f.send([{ ...f.postback(), postback: { data: button.data } }]);

test('unmatched LINE name chooses self once; missing date/time are completed without admin', async () => {
  const f = fixture({ displayName: 'たけぞえみつたけ' });
  await f.send([f.message('identity', 'タスク\n件名：点検\nパートナー：山下健装')]);
  await f.send([f.postback('identity', 'partner')]);
  assert.match(f.replies.at(-1).messages[0].text, /あなた自身/);
  assert.doesNotMatch(f.replies.at(-1).messages[0].text, /閲覧者/);
  await f.send([f.message('who', '高橋信次')]);
  assert.match(lineText(f.replies.at(-1).messages[0]), /高橋信次/);
  await pressReply(f, '本人です');
  assert.match(lineText(f.replies.at(-1).messages[0]), /日付/);
  await f.send([f.message('bad-date', '2026/02/30')]);
  assert.match(lineText(f.replies.at(-1).messages[0]), /日付/);
  await f.send([f.message('good-date', '明日')]);
  assert.match(lineText(f.replies.at(-1).messages[0]), /開始時刻/);
  await f.send([f.message('bad-time', '12:07')]);
  assert.match(lineText(f.replies.at(-1).messages[0]), /開始時刻/);
  await f.send([f.message('good-time', '12:15')]);
  assert.deepEqual(f.docs['app_data/shared_state'].partnerItems[0].assigneeIds, ['other']);
  await f.send([f.message('next', 'タスク\n日付：明日\n件名：電球交換')]);
  await f.send([f.postback('next', 'member')]);
  assert.deepEqual(f.docs['app_data/shared_state'].teamData.tasks['2026-10-20'].other[0].assigneeIds, ['other']);
});

test('new partner is explicitly confirmed and remains confirmed through a missing time question', async () => {
  const f = fixture();
  await f.send([f.message('new-company', 'タスク\n日付：明日\n件名：設備点検\nパートナー：新しい会社')]);
  await f.send([f.postback('new-company', 'partner')]);
  await pressReply(f, '入力名で新規登録');
  assert.match(lineText(f.replies.at(-1).messages[0]), /開始時刻/);
  await f.send([f.message('new-time', '13:00')]);
  assert.equal(f.docs['app_data/shared_state'].partnerItems[0].partnerName, '新しい会社');
  assert.ok(f.docs['app_data/shared_state'].partnerNames.includes('新しい会社'));
});

test('collecting registration refuses stale buttons, expired replies and unmentioned answers', async () => {
  const f = fixture();
  await f.send([f.message('stale', 'タスク\n日付：明日\n件名：点検\n時間：10:00')]);
  await f.send([f.postback('stale', 'partner')]);
  await f.send([f.message('typo', '山下健創')]);
  const old = replyActions(f).find(action => action.label === '山下健装');
  await f.send([f.message('new-answer', '別の会社')]);
  await pressReplyFromSaved(f, old);
  assert.match(f.replies.at(-1).messages[0].text, /古いボタン/);
  const pending = f.docs[linePendingPath('line_' + hash('stale').slice(0, 40))];
  assert.equal(pending.status, 'collecting');
  const bare = f.message('without-mention', '山下健装');
  delete bare.message.mention;
  await f.send([bare]);
  assert.equal(pending.status, 'collecting');
  pending.expires = timestamp - 1;
  await f.send([f.message('expired-answer', '山下健装')]);
  assert.equal(f.docs['app_data/shared_state'].partnerItems, undefined);
});

test('registration works with no app admin account and profile unavailable uses self-selection', async () => {
  const f = fixture({ profileUnavailable: true });
  delete f.docs['app_data/shared_state'].users.admin;
  await f.send([f.message('no-admin', 'タスク\n日付：明日\n件名：点検')]);
  await f.send([f.postback('no-admin', 'member')]);
  assert.match(f.replies.at(-1).messages[0].text, /高橋信次/);
  await f.send([f.message('my-name', '高橋信次')]);
  await pressReply(f, '本人です');
  assert.deepEqual(f.docs['app_data/shared_state'].teamData.tasks['2026-10-20'].other[0].assigneeIds, ['other']);
});

test('registration questions and handoff numbers do not compete after switching modes', async () => {
  const f = fixture();
  f.docs['app_data/shared_state'].teamData.tasks = { '2026-10-20': { admin: [{ id: 'existing', subject: '点検', updates: [] }] } };
  await f.send([f.message('incomplete', 'タスク\n件名：新規作業')]);
  await f.send([f.postback('incomplete', 'member')]);
  assert.match(lineText(f.replies.at(-1).messages[0]), /日付/);
  await f.send([f.message('handoff-switch', '申し送り 点検')]);
  await f.send([f.message('pick-existing', '1')]);
  assert.match(lineText(f.replies.at(-1).messages[0]), /追記 内容/);
  await f.send([f.message('handoff-body', '追記 確認しました')]);
  assert.match(lineText(f.replies.at(-1).messages[0]), /確認しました/);
  await f.send([f.message('new-task-switch', 'タスク\n日付：明日\n件名：別の新規作業')]);
  const note = f.message('stale-note', '追記 古い対象には保存しない');
  await f.send([note]);
  assert.equal(f.docs['app_data/shared_state'].teamData.tasks['2026-10-20'].admin[0].updates.length, 0);
});

