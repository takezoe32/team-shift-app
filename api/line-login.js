import { createHash, randomBytes } from 'node:crypto';
import { APP_ORIGIN, configuration, cookies, seal, unseal, verifyRequest, fault } from './_lib/report-auth.js';
import { verifyLineAccountCredential, appLineMemberPath } from './_lib/line-account.js';
import { privateMemberPath } from './_lib/line-private.js';
import { makeLineStore, lineConfigPath } from './_lib/line-store.js';

const MEMBER = '__Host-teamshift_line_member', FLOW = '__Host-teamshift_line_flow';
const sharedPath = 'app_data/shared_state';
const hash = value => createHash('sha256').update(value).digest('hex');
const emailOf = value => String(value || '').trim().toLowerCase();
const flowPath = state => '_server_integrations/line_login_' + hash(state);
const callbackUrl = APP_ORIGIN + '/api/line-login';
const setCookie = (name, value, age) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const memberFor = (state, uid, email) => {
  const user = state?.users?.[uid];
  const matches = Object.values(state?.users || {}).filter(item => item.role !== 'viewer' && emailOf(item.email) === email);
  return user && user.role !== 'viewer' && emailOf(user.email) === email && matches.length === 1 ? user : null;
};
function readMember(req, config, now) {
  try {
    const member = unseal(cookies(req)[MEMBER], config.secret);
    return member.purpose === 'line-member' && member.expires > now() ? member : null;
  } catch { return null; }
}
export function createLineLoginHandler({ env = globalThis.process.env, configure = configuration, makeStore = makeLineStore, verifyGoogle = verifyLineAccountCredential, fetcher = fetch, now = Date.now } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    const query = new URL(req.url || '/', APP_ORIGIN).searchParams;
    const callback = req.method === 'GET' && (query.has('code') || query.has('state') || query.has('error'));
    const redirect = result => {
      res.setHeader('Set-Cookie', setCookie(FLOW, '', 0));
      res.setHeader('Location', APP_ORIGIN + '/?line_link=' + result + '#help-line');
      return res.status(303).end();
    };
    try {
      const config = configure(env);
      if (!config.ready || (env.VERCEL_ENV && env.VERCEL_ENV !== 'production')) throw fault(503, 'LINE連携のサーバー設定を確認してください。');
      const ready = /^\d+$/.test(env.LINE_LOGIN_CHANNEL_ID || '') && !!env.LINE_LOGIN_CHANNEL_SECRET && !!env.LINE_CHANNEL_ACCESS_TOKEN;
      if (req.method === 'DELETE') {
        verifyRequest(req, false);
        res.setHeader('Set-Cookie', [setCookie(MEMBER, '', 0), setCookie(FLOW, '', 0)]);
        return res.status(200).json({ done: true });
      }
      if (req.method === 'GET' && !callback) return res.status(200).json({ ready });
      if (!['GET', 'POST'].includes(req.method)) return res.status(405).end();
      if (req.method === 'POST') verifyRequest(req, false);
      const store = makeStore(env);
      await store.ensurePrivate();
      if (req.method === 'POST' && req.body?.action === 'session') {
        if (typeof req.body.credential !== 'string' || req.body.credential.length > 10000 || typeof req.body.appUid !== 'string') throw fault(400, '本人確認をやり直してください。');
        const email = await verifyGoogle(req.body.credential), uid = req.body.appUid;
        if (!memberFor(await store.read(sharedPath), uid, email)) throw fault(403, 'アプリに登録された自分のGoogleアカウントで確認してください。');
        res.setHeader('Set-Cookie', setCookie(MEMBER, seal({ purpose: 'line-member', uid, email, expires: now() + 30 * 86400000 }, config.secret), 30 * 86400));
        return res.status(200).json({ authenticated: true });
      }
      if (!ready) throw fault(503, 'LINEログインの初回設定がまだ完了していません。');
      if (req.method === 'POST') {
        if (req.body?.action !== 'start') throw fault(400, '操作を確認してください。');
        const member = readMember(req, config, now);
        if (!member || member.uid !== req.body.appUid) throw fault(401, 'アプリと同じGoogleアカウントで本人確認してください。');
        const state = randomBytes(32).toString('hex'), nonce = randomBytes(32).toString('hex'), verifier = randomBytes(48).toString('base64url');
        const path = flowPath(state), browser = randomBytes(32).toString('hex');
        await store.transact([path, lineConfigPath, sharedPath], values => {
          const current = values[lineConfigPath] || {};
          if (current.status === 'disconnected') throw fault(403, 'LINE連携が停止されています。管理者へ確認してください。');
          if (!memberFor(values[sharedPath], member.uid, member.email)) throw fault(403, 'メンバー登録情報が変更されています。ログインし直してください。');
          return { writes: [{ path, value: { uid: member.uid, email: member.email, nonce, verifier, browserHash: hash(browser), expires: now() + 600000, epoch: current.accessEpoch || 'legacy', used: false } }] };
        });
        const url = new URL('https://access.line.me/oauth2/v2.1/authorize');
        url.search = new URLSearchParams({ response_type: 'code', client_id: env.LINE_LOGIN_CHANNEL_ID, redirect_uri: callbackUrl, state, nonce, scope: 'openid profile', bot_prompt: 'aggressive', code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
        res.setHeader('Set-Cookie', setCookie(FLOW, browser, 600));
        return res.status(200).json({ url: url.toString() });
      }
      const state = query.get('state'), browser = cookies(req)[FLOW];
      if (!/^[a-f0-9]{64}$/.test(state || '') || !/^[a-f0-9]{64}$/.test(browser || '')) throw fault(400, '連携を最初からやり直してください。');
      const path = flowPath(state);
      const flow = await store.transact([path], values => {
        const value = values[path];
        const member = readMember(req, config, now);
        if (!value || value.used || value.expires <= now() || value.browserHash !== hash(browser) || !member || member.uid !== value.uid || member.email !== value.email) throw fault(400, '連携を最初からやり直してください。');
        return { writes: [{ path, value: { ...value, used: true } }], result: value };
      });
      if (query.has('error')) return redirect('cancelled');
      const code = query.get('code');
      if (!code || code.length > 2048) throw fault(400, 'LINEの本人確認をやり直してください。');
      const post = async (url, body) => {
        const response = await fetcher(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body), signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw fault(400, 'LINEの本人確認をやり直してください。');
        return response.json();
      };
      const token = await post('https://api.line.me/oauth2/v2.1/token', { grant_type: 'authorization_code', code, redirect_uri: callbackUrl, client_id: env.LINE_LOGIN_CHANNEL_ID, client_secret: env.LINE_LOGIN_CHANNEL_SECRET, code_verifier: flow.verifier });
      if (!token.id_token || typeof token.access_token !== 'string' || !token.access_token) throw fault(400, 'LINEの本人確認をやり直してください。');
      const identity = await post('https://api.line.me/oauth2/v2.1/verify', { id_token: token.id_token, client_id: env.LINE_LOGIN_CHANNEL_ID, nonce: flow.nonce });
      if (identity.iss !== 'https://access.line.me' || String(identity.aud) !== env.LINE_LOGIN_CHANNEL_ID || identity.nonce !== flow.nonce || !Number.isFinite(identity.exp) || identity.exp <= now() / 1000 || !/^U[a-f0-9]{32}$/.test(identity.sub || '')) throw fault(400, 'LINEの本人確認をやり直してください。');
      const friendship = await fetcher('https://api.line.me/friendship/v1/status', { headers: { Authorization: 'Bearer ' + token.access_token }, signal: AbortSignal.timeout(12000) });
      if (!friendship.ok || (await friendship.json()).friendFlag !== true) return redirect('friend_required');
      // Also check the actual bot, detecting a Login channel under the wrong provider.
      const profileResponse = await fetcher('https://api.line.me/v2/bot/profile/' + identity.sub, { headers: { Authorization: 'Bearer ' + env.LINE_CHANNEL_ACCESS_TOKEN }, signal: AbortSignal.timeout(12000) });
      if (!profileResponse.ok) return redirect('friend_required');
      const profile = await profileResponse.json();
      if (profile.userId !== identity.sub) throw fault(400, 'LINEの本人確認をやり直してください。');
      const privatePath = privateMemberPath(identity.sub), reversePath = appLineMemberPath(flow.uid);
      const bindingPath = '_server_integrations/line_member_' + hash('private:' + identity.sub + ':' + identity.sub);
      await store.transact([lineConfigPath, sharedPath, privatePath, reversePath, bindingPath], values => {
        const current = values[lineConfigPath] || {}, shared = values[sharedPath];
        if (current.status === 'disconnected' || flow.epoch !== (current.accessEpoch || 'legacy') || !memberFor(shared, flow.uid, flow.email)) throw fault(403, 'メンバー登録情報が変更されています。連携をやり直してください。');
        const binding = { appUid: flow.uid, userId: identity.sub, email: flow.email, displayName: String(profile.displayName || ''), status: 'active', epoch: current.accessEpoch || 'legacy', confirmedAt: new Date(now()).toISOString() };
        const lineLinkedMembers = { ...shared.lineLinkedMembers };
        if (values[privatePath]?.appUid) delete lineLinkedMembers[values[privatePath].appUid];
        lineLinkedMembers[flow.uid] = flow.email;
        return { writes: [
          { path: lineConfigPath, value: { ...current, ownerUid: current.ownerUid || flow.uid, status: current.status || 'private' } },
          { path: sharedPath, value: { lineLinkedMembers }, fields: ['lineLinkedMembers'] },
          { path: privatePath, value: binding }, { path: reversePath, value: { userId: identity.sub } },
          { path: bindingPath, value: { ...binding, groupId: 'private:' + identity.sub } }
        ] };
      });
      return redirect('success');
    } catch (error) {
      if (callback) return redirect('failed');
      return res.status(error.status || 400).json({ error: error.status ? error.message : 'LINE連携に失敗しました。時間をおいてやり直してください。' });
    }
  };
}
export default createLineLoginHandler();
