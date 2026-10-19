import { createHash, randomBytes } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { CLIENT_ID } from './report-auth.js';
import { lineConfigPath } from './line-store.js';
const hash = value => createHash('sha256').update(String(value)).digest('hex');
export const accountCodePath = code => '_server_integrations/line_account_code_' + hash(code);
export const accountRequestPath = uid => '_server_integrations/line_account_request_' + hash(uid);
export const appLineMemberPath = uid => '_server_integrations/line_app_member_' + hash(uid);
const emailOf = value => String(value || '').trim().toLowerCase();
export async function verifyLineAccountCredential(credential) {
  const ticket = await new OAuth2Client(CLIENT_ID).verifyIdToken({ idToken: credential, audience: CLIENT_ID });
  const payload = ticket.getPayload();
  if (!payload?.email_verified || !payload.email) throw new Error('本人確認に失敗しました。');
  return emailOf(payload.email);
}
export async function issueLineAccountCode({ store, email, expectedUid, now }) {
  email = emailOf(email);
  const snapshot = await store.read('app_data/shared_state');
  const matches = Object.entries(snapshot?.users || {}).filter(([, user]) => emailOf(user.email) === email && user.role !== 'viewer');
  if (matches.length !== 1 || matches[0][0] !== expectedUid) throw new Error('アプリに登録された自分のGoogleアカウントで確認してください。');
  const uid = matches[0][0], code = randomBytes(16).toString('hex'), path = accountCodePath(code), requestPath = accountRequestPath(uid);
  await store.transact([lineConfigPath, 'app_data/shared_state', path, requestPath], values => {
    const user = values['app_data/shared_state']?.users?.[uid], current = values[lineConfigPath] || {};
    const duplicates = Object.values(values['app_data/shared_state']?.users || {}).filter(candidate => emailOf(candidate.email) === email && candidate.role !== 'viewer');
    if (!user || emailOf(user.email) !== email || user.role === 'viewer' || duplicates.length !== 1) throw new Error('アプリに登録された自分のGoogleアカウントで確認してください。');
    if (current.status === 'disconnected') throw new Error('LINE連携が停止されています。管理者へ確認してください。');
    return { writes: [
      { path: lineConfigPath, value: { ...current, ownerUid: current.ownerUid || uid, status: current.status || 'private' } },
      { path, value: { appUid: uid, email, expires: now() + 600000, used: false, epoch: current.accessEpoch || 'legacy' } },
      { path: requestPath, value: { codeHash: hash(code) } }
    ] };
  });
  return { command: '連携 ' + code, expiresInMinutes: 10 };
}
