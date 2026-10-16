import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, generateKeyPairSync } from 'node:crypto';
import { configuration, seal, unseal, signSession, readSession, verifyRequest, decodeFields, privateStore } from '../api/_lib/report-auth.js';
import { createReportHandler } from '../api/daily-report.js';

const secret = randomBytes(32).toString('base64');
const email = 'admin@example.com';
const config = { ready: true, secret, admins: [email], allowed: [email, 'member@example.com'] };
const csrf = 'a'.repeat(64);
const request = (body, user = email) => ({ method: 'POST', headers: { origin: 'https://team-shift-app.vercel.app', 'content-type': 'application/json', 'x-report-csrf': csrf, cookie: `__Host-teamshift_report_csrf=${csrf}; __Host-teamshift_report_session=${signSession(user, secret)}` }, body });
const response = () => ({ headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(status) { this.code = status; return this; }, json(value) { this.value = value; return this; } });
function fixture(options = {}) {
  const state = { record: { email, refreshToken: 'server-only-refresh' }, reads: 0, saves: 0, released: 0, exchanges: 0, access: 0 };
  const client = { setCredentials(value) { state.credentials = value; }, async getAccessToken() { state.access++; if (options.refreshError) throw options.refreshError; return { token: 'server-only-access' }; }, async getToken() { state.exchanges++; return { tokens: { id_token: 'verified-token', access_token: 'temporary-access', refresh_token: 'new-refresh', scope: 'https://www.googleapis.com/auth/drive' } }; } };
  const store = { async get() { return state.record; }, async put(value) { state.record = value; }, async source() { state.reads++; return { teamData: { tasks: { '2026-10-15': { u: [{ id: 'a', subject: 'canonical task', completed: true, completedAt: '2026-10-15T01:00:00Z' }] } } } }; }, async lock() { if (options.lockError) throw options.lockError; return async () => { state.released++; }; } };
  const handler = createReportHandler({ configure: () => config, makeClient: () => client, makeStore: () => store, verifyUser: async () => options.identity || email, saveReport: async (token, report) => { assert.equal(token, 'server-only-access'); assert.equal(report.entries[0].text, 'canonical task'); state.saves++; if (options.saveError) throw options.saveError; return { id: 'month', url: 'https://docs.google.com/spreadsheets/d/month/edit', count: 1 }; }, fetcher: async () => ({ ok: true, json: async () => ({ mimeType: 'application/vnd.google-apps.folder', capabilities: { canAddChildren: true } }) }) });
  return { handler, state, store };
}

test('preview uses canonical data without Drive writes, OAuth refresh or a monthly lock', async () => {
  const { handler, state } = fixture(); const res = response();
  await handler(request({ action: 'preview', date: '2026-10-15', fields: { weather: '晴れ' }, report: { entries: [{ text: 'forged' }] } }), res);
  assert.equal(res.code, 200);
  assert.equal(res.value.report.entries[0].text, 'canonical task');
  assert.deepEqual(res.value.fields, { weather: '晴れ' });
  assert.equal(state.reads, 1); assert.equal(state.access, 0); assert.equal(state.exchanges, 0); assert.equal(state.saves, 0); assert.equal(state.released, 0);
  assert.ok(!JSON.stringify(res.value).includes('server-only'));
});
test('preview requires a session and validates its date and manual fields before reading', async () => {
  const { handler, state } = fixture();
  const req = request({ action: 'preview', date: '2026-10-15' }); req.headers.cookie = `__Host-teamshift_report_csrf=${csrf}`;
  const unauthenticated = response(); await handler(req, unauthenticated); assert.equal(unauthenticated.code, 401);
  for (const body of [{ action: 'preview', date: 'bad' }, { action: 'preview', date: '2026-10-15', fields: { remarks: 42 } }]) {
    const res = response(); await handler(request(body), res); assert.equal(res.code, 400);
  }
  assert.equal(state.reads, 0); assert.equal(state.saves, 0);
});
test('server configuration fails closed and secret must have 256 bits', () => {
  assert.equal(configuration({}).ready, false);
  assert.throws(() => configuration({ GOOGLE_CLIENT_SECRET: 'x', REPORT_AUTH_SECRET: 'short', FIREBASE_SERVICE_ACCOUNT_JSON: '{}' }));
});
test('refresh tokens are encrypted, authenticated, and cannot be decrypted with a different secret', () => {
  const encrypted = seal({ refreshToken: 'private-refresh' }, secret);
  assert.ok(!encrypted.includes('private-refresh'));
  assert.equal(unseal(encrypted, secret).refreshToken, 'private-refresh');
  assert.throws(() => unseal(encrypted, randomBytes(32).toString('base64')));
  assert.throws(() => unseal('invalid', secret));
});
test('session rejects tampering, expiry, and unregistered users', () => {
  const value = signSession(email, secret, 100000);
  assert.equal(readSession(value, secret, [email], 100001).email, email);
  assert.equal(readSession(value + 'x', secret, [email], 100001), null);
  assert.equal(readSession(value, secret, [], 100001), null);
  assert.equal(readSession(value, secret, [email], 100000 + 31 * 86400000), null);
});
test('cross-origin and missing CSRF mutations are rejected', () => {
  assert.doesNotThrow(() => verifyRequest(request({})));
  const cross = request({}); cross.headers.origin = 'https://attacker.example';
  assert.throws(() => verifyRequest(cross));
  const noCsrf = request({}); delete noCsrf.headers['x-report-csrf'];
  assert.throws(() => verifyRequest(noCsrf));
});
test('Firestore nested source data decodes without losing booleans, arrays or numeric counts', () => {
  assert.deepEqual(decodeFields({ users: { mapValue: { fields: { u: { mapValue: { fields: { name: { stringValue: '竹添' } } } } } } }, completed: { booleanValue: false }, stock: { integerValue: '3' }, list: { arrayValue: { values: [{ stringValue: 'a' }] } } }), { users: { u: { name: '竹添' } }, completed: false, stock: 3, list: ['a'] });
});
test('normal saves refresh on the server without a new authorization-code exchange and ignore client task data', async () => {
  const { handler, state } = fixture();
  for (let i = 0; i < 2; i++) {
    const res = response(); await handler(request({ action: 'save', date: '2026-10-15', report: { entries: [{ text: 'forged' }] } }), res);
    assert.equal(res.code, 200); assert.equal(res.value.count, 1);
    assert.ok(!JSON.stringify(res.value).includes('server-only'));
    assert.ok(res.headers['Set-Cookie'].includes('HttpOnly; Secure; SameSite=Strict'));
  }
  assert.equal(state.exchanges, 0); assert.equal(state.access, 2); assert.equal(state.saves, 2); assert.equal(state.released, 2);
});
test('unauthenticated saves never obtain a Drive token or read task data', async () => {
  const { handler, state } = fixture(); const req = request({ action: 'save', date: '2026-10-15' }); req.headers.cookie = `__Host-teamshift_report_csrf=${csrf}`;
  const res = response(); await handler(req, res);
  assert.equal(res.code, 401); assert.equal(state.access, 0); assert.equal(state.reads, 0);
});
test('a normal member cannot replace the shared Drive connection', async () => {
  const { handler, state } = fixture(); const res = response();
  await handler(request({ action: 'connect', code: 'one-time-code' }, 'member@example.com'), res);
  assert.equal(res.code, 403); assert.equal(state.exchanges, 0);
});
test('initial connection requires the same approved admin and stores only a server-side refresh token', async () => {
  const { handler, state } = fixture(); const res = response();
  await handler(request({ action: 'connect', code: 'one-time-code' }), res);
  assert.equal(res.code, 200); assert.equal(state.record.refreshToken, 'new-refresh');
  assert.ok(!JSON.stringify(res.value).includes('refresh'));
  const wrong = fixture({ identity: 'other@example.com' }); const wrongRes = response();
  await wrong.handler(request({ action: 'connect', code: 'one-time-code' }), wrongRes);
  assert.equal(wrongRes.code, 403);
});
test('revoked refresh token requires explicit reconnect, with no secret or upstream error disclosure', async () => {
  const { handler, state } = fixture({ refreshError: { response: { data: { error: 'invalid_grant', secret: 'must-not-return' } } } }); const res = response();
  await handler(request({ action: 'save', date: '2026-10-15' }), res);
  assert.equal(res.value.code, 'RECONNECT_REQUIRED'); assert.equal(state.record.needsReconnect, true);
  assert.equal(state.saves, 0); assert.ok(!JSON.stringify(res.value).includes('must-not-return'));
});
test('transient refresh failure does not discard the connection and failed saves release their lock', async () => {
  const transient = fixture({ refreshError: new Error('network secret') }); const res = response();
  await transient.handler(request({ action: 'save', date: '2026-10-15' }), res);
  assert.equal(res.code, 503); assert.equal(transient.state.record.refreshToken, 'server-only-refresh');
  assert.ok(!JSON.stringify(res.value).includes('network secret'));
  const failed = fixture({ saveError: new Error('failed save') });
  await failed.handler(request({ action: 'save', date: '2026-10-15' }), response());
  assert.equal(failed.state.released, 1);
});
test('status never returns refresh credentials, and logout expires the signed session', async () => {
  const { handler } = fixture(); const req = request({}); req.method = 'GET'; const res = response();
  await handler(req, res); assert.equal(res.value.connected, true); assert.ok(!JSON.stringify(res.value).includes('server-only'));
  const logout = response(); await handler(request({ action: 'logout' }), logout);
  assert.ok(logout.headers['Set-Cookie'].includes('Max-Age=0'));
});


test('connection storage refuses a publicly readable Firestore document and persists only ciphertext when protected', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const storeConfig = { ...config, service: { client_email: 'server@example.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) } };
  let written, protectedPath = false;
  const fetcher = async (url, options = {}) => {
    if (!options.headers?.Authorization && url.includes('firestore.googleapis.com')) return { status: protectedPath ? 403 : 200 };
    if (url === 'https://oauth2.googleapis.com/token') return { ok: true, json: async () => ({ access_token: 'store-access' }) };
    if (options.method === 'PATCH') { written = JSON.parse(options.body); return { ok: true, status: 200, json: async () => ({}) }; }
    return { ok: true, status: 200, json: async () => written };
  };
  const store = privateStore(storeConfig, fetcher);
  await assert.rejects(() => store.put({ refreshToken: 'private-value' }), /Firestore/);
  assert.equal(written, undefined);
  protectedPath = true;
  await store.put({ refreshToken: 'private-value' });
  assert.ok(!JSON.stringify(written).includes('private-value'));
  assert.equal((await store.get()).refreshToken, 'private-value');
});
test('a concurrent month lock prevents a second report write', async () => {
  const { handler, state } = fixture({ lockError: Object.assign(new Error('busy'), { status: 409 }) }); const res = response();
  await handler(request({ action: 'save', date: '2026-10-15' }), res);
  assert.equal(res.code, 409); assert.equal(state.saves, 0); assert.equal(state.reads, 0);
});
test('invalid dates fail before obtaining a Google access token', async () => {
  const { handler, state } = fixture(); const res = response();
  await handler(request({ action: 'save', date: '2026-02-30' }), res);
  assert.equal(res.code, 400); assert.equal(state.access, 0);
});
