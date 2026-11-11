import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createTaskFileHandler } from '../api/task-files.js';
import { seal } from '../api/_lib/report-auth.js';
import { MEDIA_FOLDER_ID } from '../src/dailyReport.mjs';
import { receiptDraftMime, RECEIPT_DRAFT_BYTES } from '../src/receiptDrafts.mjs';

const secret = Buffer.alloc(32, 6).toString('base64'), now = () => Date.UTC(2026, 10, 11, 1, 0);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
// A fake Drive: files keyed by id, each with an owner uid in appProperties.
function fixture({ role = 'staff', files = {} } = {}) {
  const calls = [], drive = { ...files };
  const source = { users: { u: { email: 'u@example.com', role }, v: { email: 'v@example.com', role: 'admin' } } };
  const json = value => ({ ok: true, json: async () => value, arrayBuffer: async () => value });
  const handler = createTaskFileHandler({ now, configure: () => ({ ready: true, secret }), makeStore: () => ({ source: async () => source, get: async () => ({ refreshToken: 'r' }) }), makeClient: () => ({ setCredentials() {}, getAccessToken: async () => ({ token: 'a' }) }), fetcher: async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes('/upload/')) { const id = 'draft_' + (Object.keys(drive).length + 1) + '_abcdef'; drive[id] = { id, size: String(jpeg.length), createdTime: new Date(now()).toISOString(), parents: [MEDIA_FOLDER_ID], appProperties: { teamShiftReceiptDraft: decodeURIComponent(options.body.toString()).match(/"teamShiftReceiptDraft":"([^"]+)"/)[1] }, data: jpeg }; return json({ id, size: String(jpeg.length), createdTime: drive[id].createdTime }); }
    if (url.includes('?q=')) { const owner = decodeURIComponent(url).match(/value='([^']+)'/)[1]; return json({ files: Object.values(drive).filter(f => !f.trashed && f.appProperties.teamShiftReceiptDraft === owner) }); }
    const id = url.match(/files\/([A-Za-z0-9_-]+)/)[1], file = drive[id];
    if (!file) return { ok: false, status: 404 };
    if (options.method === 'PATCH') { file.trashed = true; return json({}); }
    if (url.includes('alt=media')) return { ok: true, arrayBuffer: async () => file.data };
    return json(file);
  } });
  return { handler, drive, calls };
}
const cookie = uid => '__Host-teamshift_line_member=' + seal({ purpose: 'line-member', uid, email: uid + '@example.com', expires: now() + 60000 }, secret);
const get = (uid, id = '') => ({ method: 'GET', url: '/api/task-files?kind=receipt-draft' + (id ? '&id=' + id : ''), headers: { cookie: cookie(uid) } });
const post = (uid, body) => ({ method: 'POST', url: '/api/task-files', headers: { origin: 'https://team-shift-app.vercel.app', 'content-type': 'application/json', cookie: cookie(uid) }, body: { kind: 'receipt-draft', appUid: uid, ...body } });
async function run(handler, request) { const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.code = n; return this; }, json(data) { this.data = data; return this; }, send(data) { this.data = data; return this; } }; await handler(request, res); return res; }

test('JPEG・PNGだけを3MBまで受け付ける', () => {
  assert.equal(receiptDraftMime(jpeg), 'image/jpeg');
  assert.equal(receiptDraftMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0])), 'image/png');
  assert.throws(() => receiptDraftMime(Buffer.from('<html>')));
  assert.throws(() => receiptDraftMime(Buffer.alloc(RECEIPT_DRAFT_BYTES + 1, 0xff)));
});
test('保存した本人だけが一覧・表示・削除でき、管理者を含む他のメンバーには見えない', async () => {
  const { handler, drive } = fixture();
  const saved = await run(handler, post('u', { action: 'save', base64: jpeg.toString('base64') }));
  assert.equal(saved.code, 200);
  const id = saved.data.draft.id;
  assert.equal(drive[id].appProperties.teamShiftReceiptDraft, 'u');
  assert.deepEqual((await run(handler, get('u'))).data.drafts.map(d => d.id), [id]);
  const image = await run(handler, get('u', id));
  assert.equal(image.code, 200); assert.equal(image.headers['Content-Type'], 'image/jpeg');
  assert.deepEqual((await run(handler, get('v'))).data.drafts, []);
  assert.equal((await run(handler, get('v', id))).code, 404);
  assert.equal((await run(handler, post('v', { action: 'delete', id }))).code, 404);
  assert.equal(drive[id].trashed, undefined);
  assert.equal((await run(handler, post('u', { action: 'delete', id }))).code, 200);
  assert.equal(drive[id].trashed, true);
});
test('閲覧ユーザー・別UID・画像以外は保存しない。タスク添付としては開けない', async () => {
  for (const [role, uid, body] of [['viewer', 'u', jpeg], ['staff', 'v', jpeg], ['staff', 'u', Buffer.from('<html>')]]) {
    const { handler, calls } = fixture({ role }), request = post('u', { action: 'save', base64: body.toString('base64') });
    request.body.appUid = uid;
    assert.ok([400, 403].includes((await run(handler, request)).code));
    assert.equal(calls.filter(c => c.url.includes('/upload/')).length, 0);
  }
  const { handler } = fixture();
  const id = (await run(handler, post('u', { action: 'save', base64: jpeg.toString('base64') }))).data.draft.id;
  const asTaskFile = { method: 'GET', url: '/api/task-files?id=' + id, headers: { cookie: cookie('u') } };
  assert.equal((await run(handler, asTaskFile)).code, 403);
});
test('30日を過ぎた一時保存は一覧を開いたときにゴミ箱へ移す', async () => {
  const old = { id: 'old_receipt_123', size: '8', createdTime: new Date(now() - 31 * 86400000).toISOString(), parents: [MEDIA_FOLDER_ID], appProperties: { teamShiftReceiptDraft: 'u' }, data: jpeg };
  const { handler, drive } = fixture({ files: { [old.id]: old } });
  assert.deepEqual((await run(handler, get('u'))).data.drafts, []);
  assert.equal(drive[old.id].trashed, true);
});
