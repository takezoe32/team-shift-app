import { randomBytes } from 'node:crypto';
import { configuration, sessionFrom, csrfToken, verifyRequest } from './_lib/report-auth.js';
import { makeLineStore, lineConfigPath, linePendingPath } from './_lib/line-store.js';
import { hash } from './line-webhook.js';
import { reviewReasons, lineTaskChanges } from '../src/lineTasks.mjs';
import { issueLineAccountCode, verifyLineAccountCredential } from './_lib/line-account.js';

export function createLineSettingsHandler({ env = globalThis.process.env, configure = configuration, makeStore = makeLineStore, verifyGoogle = verifyLineAccountCredential, now = Date.now } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const config = configure(env);
      if (!config.ready) return res.status(503).json({ error: 'サーバーの認証設定を確認してください。' });
      const session = sessionFrom(req, config);
      const admin = session && config.admins.includes(session.email);
      const ready = !!env.LINE_CHANNEL_SECRET && !!env.LINE_CHANNEL_ACCESS_TOKEN;
      if (req.method === 'POST' && req.body?.action === 'accountLink') {
        verifyRequest(req, false);
        if (!ready || typeof req.body.credential !== 'string' || !req.body.credential || req.body.credential.length > 10000 || typeof req.body.appUid !== 'string') return res.status(400).json({ error: '本人確認をやり直してください。' });
        const email = await verifyGoogle(req.body.credential);
        const accountStore = makeStore(env);
        await accountStore.ensurePrivate();
        return res.status(200).json(await issueLineAccountCode({ store: accountStore, email, expectedUid: req.body.appUid, now }));
      }
      if (req.method === 'GET' && !admin) return res.status(200).json({ authenticated: false, ready, csrf: csrfToken(req, res) });
      if (!admin) return res.status(403).json({ error: '管理者のGoogleログインを確認してください。' });
      const store = makeStore(env);
      await store.ensurePrivate();
      if (req.method === 'GET') {
        const connection = await store.read(lineConfigPath);
        return res.status(200).json({ authenticated: true, ready, csrf: csrfToken(req, res), connected: !!connection?.groupId, privateReady: !!connection?.ownerUid && connection.status !== 'disconnected', linkedAt: connection?.linkedAt || '', inbox: (await store.inbox()).map(item => ({ id: item.id, text: item.text, kind: item.kind, draft: item.draft, reasons: item.reasons, createdAt: item.createdAt })) });
      }
      if (req.method !== 'POST') return res.status(405).end();
      verifyRequest(req);
      const body = req.body || {};
      if (body.action === 'pair') {
        if (!ready) return res.status(503).json({ error: 'LINE_CHANNEL_SECRETとLINE_CHANNEL_ACCESS_TOKENを設定してください。' });
        const code = randomBytes(16).toString('hex');
        await store.transact([lineConfigPath, 'app_data/shared_state'], values => {
          const state = values['app_data/shared_state'] || {};
          const owner = Object.entries(state.users || {}).find(([, user]) => String(user.email || '').trim().toLowerCase() === session.email);
          if (!owner || owner[1].role === 'viewer' || Number((state.roles || { admin: { level: 40 } })[owner[1].role]?.level || 0) < 40) throw new Error('管理者の登録情報を確認してください。');
          const current = values[lineConfigPath] || {};
          return { writes: [{ path: lineConfigPath, value: { ...current, ownerUid: owner[0], pairHash: hash(code), pairExpires: now() + 600000 } }] };
        });
        return res.status(200).json({ command: 'LINE連携 ' + code });
      }
      if (body.action === 'disconnect') {
        await store.transact([lineConfigPath], values => ({ writes: [{ path: lineConfigPath, value: { ownerUid: values[lineConfigPath]?.ownerUid || '', status: 'disconnected', accessEpoch: randomBytes(16).toString('hex') } }] }));
        return res.status(200).json({ done: true });
      }
      if (!['register', 'dismiss'].includes(body.action) || !/^line_[a-f0-9]{40}$/.test(body.id || '')) return res.status(400).json({ error: '操作を確認してください。' });
      const path = linePendingPath(body.id);
      const result = await store.transact([path, 'app_data/shared_state'], values => {
        const pending = values[path], state = values['app_data/shared_state'];
        if (!pending || pending.status !== 'review') return { result: { done: true } };
        if (body.action === 'dismiss') return { writes: [{ path, value: { ...pending, status: 'cancelled' } }], result: { done: true } };
        const input = body.draft || {};
        const draft = {
          date: String(input.date || '').slice(0, 10), time: String(input.time || '').slice(0, 5),
          subject: String(input.subject || '').trim().slice(0, 120), text: pending.draft?.text || pending.text,
          partnerName: String(input.partnerName || '').trim().slice(0, 120),
          assigneeIds: [...new Set(Array.isArray(input.assigneeIds) ? input.assigneeIds.filter(id => typeof id === 'string').slice(0, 30) : [])],
          important: input.important === true
        };
        const kind = body.kind;
        const reasons = reviewReasons(draft, kind, state?.users || {});
        if (reasons.length) throw new Error('入力してください：' + reasons.join('・'));
        const changes = lineTaskChanges(state, pending, draft, kind, now());
        return { writes: [{ path, value: { ...pending, draft, kind, status: 'registered' } }, ...(Object.keys(changes).length ? [{ path: 'app_data/shared_state', value: changes, fields: Object.keys(changes) }] : [])], result: { done: true } };
      });
      return res.status(200).json(result);
    } catch (error) {
      // Do not expose credentials or upstream response bodies.
      const message = /^(入力してください：|管理者の登録情報|アプリに登録された|LINE連携が停止|本人確認)/.test(error.message) ? error.message : 'LINE連携の処理に失敗しました。認証・保存設定を確認してください。';
      return res.status(400).json({ error: message });
    }
  };
}
export default createLineSettingsHandler();
