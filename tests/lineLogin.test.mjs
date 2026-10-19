import test from 'node:test';
import assert from 'node:assert/strict';
import { createLineLoginHandler } from '../api/line-login.js';
import { lineConfigPath } from '../api/_lib/line-store.js';
import { privateMemberPath, authorizePrivateLine } from '../api/_lib/line-private.js';
import { appLineMemberPath } from '../api/_lib/line-account.js';

const timestamp = Date.parse('2026-10-19T03:00:00Z'), userId = 'U' + 'a'.repeat(32);
const sharedPath = 'app_data/shared_state';
function fixture() {
  let time = timestamp, failure = '', identityPatch = {};
  const docs = { [lineConfigPath]: { ownerUid: 'owner', status: 'connected', groupId: 'G1' }, [sharedPath]: { users: { owner: { email: 'owner@example.com', role: 'admin' }, staff: { email: 'staff@example.com', role: 'staff' } }, teamData: { tasks: {} } } };
  const store = { ensurePrivate: async () => {}, read: async path => structuredClone(docs[path] || null), transact: async (paths, plan) => {
    const result = plan(Object.fromEntries(paths.map(path => [path, structuredClone(docs[path] || null)])));
    for (const write of result.writes || []) docs[write.path] = write.fields ? { ...docs[write.path], ...write.value } : write.value;
    return result.result;
  } };
  const jar = {}, requests = [];
  const env = { VERCEL_ENV: 'production', LINE_LOGIN_CHANNEL_ID: '123456', LINE_LOGIN_CHANNEL_SECRET: 'login-secret', LINE_CHANNEL_ACCESS_TOKEN: 'bot-secret' };
  const fetcher = async (url, options) => {
    const body = options.body ? Object.fromEntries(options.body) : {};
    requests.push({ url, body, options });
    if (url.endsWith('/token')) return { ok: failure !== 'token', json: async () => ({ access_token: 'access', id_token: 'id-token', refresh_token: 'refresh' }) };
    if (url.endsWith('/verify')) return { ok: failure !== 'verify', json: async () => ({ iss: 'https://access.line.me', aud: '123456', exp: time / 1000 + 3600, sub: userId, nonce: body.nonce, ...identityPatch }) };
    if (url.endsWith('/friendship/v1/status')) return { ok: true, json: async () => ({ friendFlag: failure !== 'friend' }) };
    assert.equal(url, 'https://api.line.me/v2/bot/profile/' + userId);
    return { ok: failure !== 'provider', json: async () => ({ userId, displayName: 'アプリとは異なるLINE名' }) };
  };
  const handler = createLineLoginHandler({ env, configure: () => ({ ready: true, secret: Buffer.alloc(32, 9).toString('base64') }), makeStore: () => store, verifyGoogle: async credential => {
    if (credential === 'bad') throw new Error('secret upstream response');
    return credential + '@example.com';
  }, fetcher, now: () => time });
  const run = async ({ body, url = '/api/line-login', method = body ? 'POST' : 'GET', origin = 'https://team-shift-app.vercel.app', useCookies = true } = {}) => {
    const headers = { origin, 'content-type': 'application/json', cookie: useCookies ? Object.entries(jar).map(([key, value]) => key + '=' + value).join('; ') : '' };
    const res = { code: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } };
    await handler({ method, url, body, headers }, res);
    for (const value of [].concat(res.headers['Set-Cookie'] || [])) { const [key, item] = value.split(';')[0].split('='); if (item) jar[key] = item; else delete jar[key]; }
    return res;
  };
  const session = (uid = 'staff') => run({ body: { action: 'session', appUid: uid, credential: uid } });
  const start = async (uid = 'staff') => { await session(uid); const result = await run({ body: { action: 'start', appUid: uid } }); assert.equal(result.code, 200); return new URL(result.body.url); };
  const callback = (url, extra = 'code=auth-code', options = {}) => run({ url: '/api/line-login?state=' + url.searchParams.get('state') + '&' + extra, ...options });
  return { docs, store, jar, env, requests, run, session, start, callback, setTime: value => { time = value; }, fail: value => { failure = value; }, identity: value => { identityPatch = value; } };
}
test('verified member links LINE without an emailed/manual code, preserving shared tasks', async () => {
  const f = fixture(), url = await f.start();
  assert.equal(url.searchParams.get('scope'), 'openid profile');
  assert.equal(url.searchParams.get('bot_prompt'), 'aggressive');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  const result = await f.callback(url);
  assert.equal(result.code, 303); assert.match(result.headers.Location, /line_link=success#help-line$/);
  assert.equal(f.docs[privateMemberPath(userId)].appUid, 'staff');
  assert.equal(f.docs[privateMemberPath(userId)].displayName, 'アプリとは異なるLINE名');
  assert.deepEqual(f.docs[sharedPath].lineLinkedMembers, { staff: 'staff@example.com' });
  assert.deepEqual(f.docs[sharedPath].teamData, { tasks: {} });
  assert.equal(f.docs[lineConfigPath].groupId, 'G1');
  assert.equal(JSON.stringify(f.docs).includes('id-token'), false);
  assert.equal(JSON.stringify(f.docs).includes('refresh'), false);
  assert.equal(JSON.stringify(f.docs[sharedPath]).includes(userId), false);
  assert.equal(f.requests[0].body.code_verifier.length >= 43, true);
  assert.deepEqual(await authorizePrivateLine({ event: { type: 'follow', source: { userId } }, store: f.store, now: () => timestamp }), { appUid: 'staff' });
});
test('unproved app ID, foreign origins and mismatched Google identity cannot start linking', async () => {
  const f = fixture();
  assert.equal((await f.run({ body: { action: 'start', appUid: 'staff' } })).code, 401);
  assert.equal((await f.run({ body: { action: 'session', appUid: 'owner', credential: 'staff' } })).code, 403);
  assert.equal((await f.run({ body: { action: 'session', appUid: 'staff', credential: 'staff' }, origin: 'https://evil.example' })).code, 403);
  await f.session();
  assert.equal((await f.run({ body: { action: 'start', appUid: 'owner' } })).code, 401);
});
test('state is browser-bound, single-use and expires; cancelling never links', async () => {
  for (const mode of ['foreign', 'expired', 'cancel', 'replay']) {
    const f = fixture(), url = await f.start();
    if (mode === 'expired') f.setTime(timestamp + 600001);
    const result = await f.callback(url, mode === 'cancel' ? 'error=access_denied' : 'code=auth-code', { useCookies: mode !== 'foreign' });
    if (mode === 'replay') { assert.match(result.headers.Location, /success/); const replay = await f.callback(url); assert.match(replay.headers.Location, /failed/); assert.equal(f.requests.length, 4); }
    else { assert.equal(f.docs[privateMemberPath(userId)], undefined); assert.equal(f.requests.length, 0); assert.match(result.headers.Location, mode === 'cancel' ? /cancelled/ : /failed/); }
  }
});
test('LINE token, nonce, audience, expiry and bot friendship must all validate', async () => {
  for (const mode of ['token', 'verify', 'friend', 'provider', 'nonce', 'aud', 'exp', 'missing-exp']) {
    const f = fixture(), url = await f.start();
    if (['token', 'verify', 'friend', 'provider'].includes(mode)) f.fail(mode);
    else f.identity(mode === 'missing-exp' ? { exp: undefined } : { [mode]: mode === 'exp' ? timestamp / 1000 - 1 : 'invalid' });
    const result = await f.callback(url);
    assert.match(result.headers.Location, ['friend', 'provider'].includes(mode) ? /friend_required/ : /failed/);
    assert.equal(f.docs[privateMemberPath(userId)], undefined);
    assert.equal(f.docs[sharedPath].lineLinkedMembers, undefined);
  }
});
test('removed, duplicate, changed-email and demoted members cannot finish authorization', async () => {
  for (const mode of ['removed', 'duplicate', 'email', 'viewer', 'disconnect', 'epoch']) {
    const f = fixture(), url = await f.start();
    if (mode === 'removed') delete f.docs[sharedPath].users.staff;
    if (mode === 'duplicate') f.docs[sharedPath].users.duplicate = { email: 'staff@example.com', role: 'staff' };
    if (mode === 'email') f.docs[sharedPath].users.staff.email = 'changed@example.com';
    if (mode === 'viewer') f.docs[sharedPath].users.staff.role = 'viewer';
    if (mode === 'disconnect') f.docs[lineConfigPath].status = 'disconnected';
    if (mode === 'epoch') f.docs[lineConfigPath].accessEpoch = 'new';
    const result = await f.callback(url); assert.match(result.headers.Location, /failed/);
    assert.equal(f.docs[privateMemberPath(userId)], undefined);
  }
});
test('moving a LINE identity to a different member removes the old badge and old authorization', async () => {
  const f = fixture();
  await f.callback(await f.start());
  await f.callback(await f.start('owner'));
  assert.deepEqual(f.docs[sharedPath].lineLinkedMembers, { owner: 'owner@example.com' });
  assert.equal(f.docs[privateMemberPath(userId)].appUid, 'owner');
  assert.equal(f.docs[appLineMemberPath('owner')].userId, userId);
});
test('switching app accounts during LINE authorization invalidates the older flow', async () => {
  const f = fixture(), url = await f.start();
  await f.session('owner');
  const result = await f.callback(url);
  assert.match(result.headers.Location, /failed/);
  assert.equal(f.requests.length, 0);
  assert.equal(f.docs[privateMemberPath(userId)], undefined);
});
test('missing setup is explicit, session cookies are protected and logout clears the proof', async () => {
  const f = fixture(); delete f.env.LINE_LOGIN_CHANNEL_SECRET;
  assert.deepEqual((await f.run()).body, { ready: false });
  const result = await f.session();
  assert.match(result.headers['Set-Cookie'], /HttpOnly; Secure; SameSite=Lax/);
  assert.equal((await f.run({ body: { action: 'start', appUid: 'staff' } })).code, 503);
  await f.run({ method: 'DELETE' });
  f.env.LINE_LOGIN_CHANNEL_SECRET = 'secret';
  assert.equal((await f.run({ body: { action: 'start', appUid: 'staff' } })).code, 401);
  const invalid = await f.run({ body: { action: 'session', appUid: 'staff', credential: 'bad' } });
  assert.equal(JSON.stringify(invalid.body).includes('upstream'), false);
});
