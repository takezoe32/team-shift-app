import test from 'node:test';
import assert from 'node:assert/strict';
import { createLineSettingsHandler } from '../api/line-settings.js';
import { makeLineStore, lineConfigPath, linePendingPath } from '../api/_lib/line-store.js';
import { signSession, decodeFields } from '../api/_lib/report-auth.js';

const secret = Buffer.alloc(32, 1).toString('base64');
const config = { ready: true, secret, allowed: ['owner@example.com'], admins: ['owner@example.com'] };
const now = Date.parse('2026-10-19T00:00:00Z');
const users = { owner: { email: 'owner@example.com', name: '管理者', role: 'admin' }, u: { name: '担当', role: 'staff' } };
function fixture() {
  const id = 'line_' + 'a'.repeat(40), path = linePendingPath(id);
  const docs = { 'app_data/shared_state': { users, roles: { admin: { level: 40 } }, teamData: { tasks: {} } }, [path]: { id, ownerUid: 'owner', status: 'review', kind: 'member', text: 'タスク 作業', draft: { text: '作業' } } };
  const store = { ensurePrivate: async () => {}, read: async path => docs[path], inbox: async () => [docs[path]], transact: async (paths, plan) => { const out = plan(Object.fromEntries(paths.map(path => [path, structuredClone(docs[path] || null)]))); for (const write of out.writes || []) docs[write.path] = write.fields ? { ...docs[write.path], ...write.value } : write.value; return out.result; } };
  const handler = createLineSettingsHandler({ env: { LINE_CHANNEL_SECRET: 'secret', LINE_CHANNEL_ACCESS_TOKEN: 'token' }, configure: () => config, makeStore: () => store, now: () => now });
  const run = async (body, authenticated = true, csrf = true) => {
    const req = { method: body ? 'POST' : 'GET', body, headers: { origin: 'https://team-shift-app.vercel.app', 'content-type': 'application/json', cookie: (authenticated ? '__Host-teamshift_report_session=' + signSession('owner@example.com', secret) + '; ' : '') + '__Host-teamshift_report_csrf=csrf', 'x-report-csrf': csrf ? 'csrf' : 'bad' } };
    const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } };
    await handler(req, res); return res;
  };
  return { run, docs, id, path };
}
test('LINE settings require owner authentication and CSRF for all mutations', async () => {
  const f = fixture();
  assert.equal((await f.run({ action: 'pair' }, false)).code, 403);
  assert.equal((await f.run({ action: 'pair' }, true, false)).code, 400);
  assert.equal(f.docs[lineConfigPath], undefined);
  const status = await f.run(null, false);
  assert.equal(status.body.authenticated, false);
  assert.equal('inbox' in status.body, false);
});
test('pair command expires in ten minutes and stores a hash, not the command', async () => {
  const f = fixture(), result = await f.run({ action: 'pair' });
  assert.equal(result.code, 200);
  assert.match(result.body.command, /^LINE連携 [a-f0-9]{32}$/);
  assert.equal(f.docs[lineConfigPath].pairExpires, now + 600000);
  assert.equal(f.docs[lineConfigPath].ownerUid, 'owner');
  assert.equal(JSON.stringify(f.docs[lineConfigPath]).includes(result.body.command.slice(7)), false);
});
test('review validates assignees and dates then registers at most once', async () => {
  const f = fixture();
  const invalid = await f.run({ action: 'register', id: f.id, kind: 'member', draft: { date: '2026-02-30' } });
  assert.equal(invalid.code, 400);
  const body = { action: 'register', id: f.id, kind: 'member', draft: { subject: '確認済み', date: '2026-10-20', assigneeIds: ['u'] } };
  assert.equal((await f.run(body)).code, 200);
  assert.equal((await f.run(body)).code, 200);
  assert.equal(f.docs['app_data/shared_state'].teamData.tasks['2026-10-20'].owner.length, 1);
  assert.equal(f.docs[f.path].status, 'registered');
});
test('review dismissal does not change tasks', async () => {
  const f = fixture();
  await f.run({ action: 'dismiss', id: f.id });
  assert.equal(f.docs[f.path].status, 'cancelled');
  assert.deepEqual(f.docs['app_data/shared_state'].teamData.tasks, {});
});
test('Firestore optimistic commit retries conflicts and masks unrelated fields', async () => {
  let version = 1, commits = 0;
  const seen = [];
  const fetcher = async (url, options = {}) => {
    if (url.endsWith(':commit')) {
      const body = JSON.parse(options.body); seen.push(body); commits++;
      if (commits === 1) { version++; return { status: 412, ok: false }; }
      return { status: 200, ok: true, json: async () => ({}) };
    }
    return { status: 200, ok: true, json: async () => ({ updateTime: 'v' + version, fields: { count: { integerValue: String(version) } } }) };
  };
  const store = makeLineStore({ FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: 'team-shift-app' }) }, fetcher, () => ({ getAccessToken: async () => 'token' }));
  const result = await store.transact(['app_data/shared_state'], values => ({ writes: [{ path: 'app_data/shared_state', value: { count: values['app_data/shared_state'].count + 1 }, fields: ['count'] }], result: 'ok' }));
  assert.equal(result, 'ok');
  assert.equal(commits, 2);
  assert.deepEqual(seen[1].writes[0].currentDocument, { updateTime: 'v2' });
  assert.deepEqual(seen[1].writes[0].updateMask.fieldPaths, ['count']);
  assert.equal(decodeFields(seen[1].writes[0].update.fields).count, 3);
});
test('LINE storage rejects publicly readable integration records', async () => {
  const env = { FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: 'team-shift-app' }) };
  for (const status of [200, 404]) {
    const store = makeLineStore(env, async () => ({ status }), () => ({}));
    await assert.rejects(store.ensurePrivate(), /Firestore/);
  }
});
