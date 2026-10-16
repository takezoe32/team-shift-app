import { Buffer } from 'node:buffer';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual, createSign } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';

export const CLIENT_ID = '147696997284-sttbu4gtchokcqqn0votaeq49s17dtbf.apps.googleusercontent.com';
export const APP_ORIGIN = 'https://team-shift-app.vercel.app';
const SESSION = '__Host-teamshift_report_session';
const CSRF = '__Host-teamshift_report_csrf';
const normalize = value => String(value || '').trim().toLowerCase();
export const fault = (status, message, code = '') => Object.assign(new Error(message), { status, code });
export function configuration(env = globalThis.process.env) {
  const missing = ['GOOGLE_CLIENT_SECRET', 'REPORT_AUTH_SECRET', 'FIREBASE_SERVICE_ACCOUNT_JSON'].filter(key => !env[key]);
  if (missing.length) return { ready: false, missing };
  if (Buffer.from(env.REPORT_AUTH_SECRET, 'base64').length !== 32) throw fault(503, 'REPORT_AUTH_SECRETの設定を確認してください。');
  let service;
  try { service = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON); } catch { throw fault(503, 'サーバーのデータ保存設定を確認してください。'); }
  if (service.project_id !== 'team-shift-app' || !service.client_email || !service.private_key) throw fault(503, 'サーバーのデータ保存設定を確認してください。');
  const admins = (env.REPORT_ADMIN_EMAILS || 'mitsutake.takezoe@plandosee.co.jp').split(',').map(normalize).filter(Boolean);
  const allowed = [...new Set([...admins, ...(env.REPORT_ALLOWED_EMAILS || '').split(',').map(normalize).filter(Boolean)])];
  return { ready: true, secret: env.REPORT_AUTH_SECRET, clientSecret: env.GOOGLE_CLIENT_SECRET, service, admins, allowed };
}
const key = (secret, purpose) => createHash('sha256').update(purpose + ':' + secret).digest();
export function seal(value, secret) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(secret, 'drive-refresh'), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(part => part.toString('base64url')).join('.');
}
export function unseal(value, secret) {
  const [iv, tag, encrypted] = String(value).split('.').map(part => Buffer.from(part, 'base64url'));
  const cipher = createDecipheriv('aes-256-gcm', key(secret, 'drive-refresh'), iv);
  cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(encrypted), cipher.final()]).toString('utf8'));
}
export function signSession(email, secret, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ email: normalize(email), exp: Math.floor(now / 1000) + 30 * 86400 })).toString('base64url');
  return body + '.' + createHmac('sha256', key(secret, 'report-session')).update(body).digest('base64url');
}
export function readSession(value, secret, allowed, now = Date.now()) {
  try {
    const [body, signature] = String(value || '').split('.');
    const expected = createHmac('sha256', key(secret, 'report-session')).update(body).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const session = JSON.parse(Buffer.from(body, 'base64url').toString());
    return session.exp > now / 1000 && allowed.includes(session.email) ? session : null;
  } catch { return null; }
}
export function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(part => part.trim().split('=')).filter(parts => parts.length === 2));
}
export const sessionFrom = (req, config) => readSession(cookies(req)[SESSION], config.secret, config.allowed);
export function cookie(name, value, age) { return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`; }
export function issueSession(res, email, config) { res.setHeader('Set-Cookie', cookie(SESSION, signSession(email, config.secret), 30 * 86400)); }
export function csrfToken(req, res) {
  let value = cookies(req)[CSRF];
  if (!/^[a-f0-9]{64}$/.test(value || '')) { value = randomBytes(32).toString('hex'); res.setHeader('Set-Cookie', cookie(CSRF, value, 86400)); }
  return value;
}
export function verifyRequest(req, csrf = true) {
  if (req.headers.origin !== APP_ORIGIN || req.headers['content-type']?.split(';')[0] !== 'application/json') throw fault(403, 'アプリの画面から操作してください。');
  if (csrf && (!cookies(req)[CSRF] || req.headers['x-report-csrf'] !== cookies(req)[CSRF])) throw fault(403, '画面を再読み込みしてから操作してください。');
}
export function clearSession(res) { res.setHeader('Set-Cookie', cookie(SESSION, '', 0)); }
export function oauth(config) { return new OAuth2Client(CLIENT_ID, config.clientSecret, 'postmessage'); }
export async function verifyIdentity(client, idToken, allowed) {
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: CLIENT_ID });
    const user = ticket.getPayload();
    if (!user.email_verified || !allowed.includes(normalize(user.email))) throw new Error('not permitted');
    return normalize(user.email);
  } catch { throw fault(403, '日報を保存する権限があるGoogleアカウントでログインしてください。'); }
}

// Only the server service account can authenticate this storage client. The OAuth
// refresh token is additionally encrypted before persistence and never returned.
export function privateStore(config, fetcher = fetch) {
  let token, expires = 0;
  const root = 'https://firestore.googleapis.com/v1/projects/team-shift-app/databases/(default)/documents/';
  const request = async (path, options = {}) => {
    if (!token || Date.now() >= expires) {
      const now = Math.floor(Date.now() / 1000);
      const head = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
      const body = Buffer.from(JSON.stringify({ iss: config.service.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })).toString('base64url');
      const unsigned = head + '.' + body;
      const signature = createSign('RSA-SHA256').update(unsigned).sign(config.service.private_key, 'base64url');
      const response = await fetcher('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: unsigned + '.' + signature }), signal: AbortSignal.timeout(10000) });
      const data = await response.json();
      if (!response.ok || !data.access_token) throw fault(503, 'サーバーのデータ保存認証に失敗しました。');
      token = data.access_token; expires = Date.now() + 3300000;
    }
    const response = await fetcher(root + path, { ...options, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...options.headers }, signal: AbortSignal.timeout(15000) });
    if (response.status === 404) return null;
    if (response.status === 409 || response.status === 412) throw fault(409, '別の日報保存が進行中です。少し待ってから実行してください。');
    if (!response.ok) throw fault(503, 'サーバーのデータ保存先にアクセスできません。');
    return response.status === 204 ? {} : response.json();
  };
  const path = '_server_integrations/daily_report_drive';
  return {
    async automaticRun(date) {
      const doc = await request('_server_integrations/report_auto_' + date);
      return doc?.fields?.status?.stringValue === 'saved';
    },
    async completeAutomaticRun(date, fileId, savedAt) {
      await request('_server_integrations/report_auto_' + date, { method: 'PATCH', body: JSON.stringify({ fields: {
        status: { stringValue: 'saved' }, date: { stringValue: date },
        fileId: { stringValue: fileId }, savedAt: { stringValue: savedAt }
      } }) });
    },
    async get() { const doc = await request(path); return doc?.fields?.encrypted?.stringValue ? unseal(doc.fields.encrypted.stringValue, config.secret) : null; },
    async put(value) {
      const publicRead = await fetcher(root + path, { signal: AbortSignal.timeout(10000) });
      if (![401, 403].includes(publicRead.status)) throw fault(503, '連携情報の保存先を保護するFirestoreルールの設定が必要です。');
      await request(path, { method: 'PATCH', body: JSON.stringify({ fields: { encrypted: { stringValue: seal(value, config.secret) } } }) }); },
    async source() { const doc = await request('app_data/shared_state'); if (!doc) throw fault(404, '共有データが見つかりません。'); return decodeFields(doc.fields); },
    async lock(month) {
      const lockPath = '_server_integrations/report_lock_' + month;
      const previous = await request(lockPath);
      if (Number(previous?.fields?.expires?.integerValue || 0) > Date.now()) throw fault(409, '別の日報保存が進行中です。少し待ってから実行してください。');
      const nonce = randomBytes(16).toString('hex');
      const condition = previous ? 'currentDocument.updateTime=' + encodeURIComponent(previous.updateTime) : 'currentDocument.exists=false';
      await request(lockPath + '?' + condition, { method: 'PATCH', body: JSON.stringify({ fields: { expires: { integerValue: String(Date.now() + 600000) }, nonce: { stringValue: nonce } } }) });
      return async () => { const current = await request(lockPath); if (current?.fields?.nonce?.stringValue === nonce) await request(lockPath + '?currentDocument.updateTime=' + encodeURIComponent(current.updateTime), { method: 'DELETE' }); };
    }
  };
}
export function decodeFields(fields = {}) {
  const decode = value => {
    if ('nullValue' in value) return null;
    if ('mapValue' in value) return decodeFields(value.mapValue.fields);
    if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
    if ('integerValue' in value || 'doubleValue' in value) return Number(value.integerValue ?? value.doubleValue);
    return value.stringValue ?? value.booleanValue ?? value.timestampValue ?? null;
  };
  return Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, decode(value)]));
}
