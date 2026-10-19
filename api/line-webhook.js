import { createLineHandoffProcessor, registeredTaskCard } from './_lib/line-handoff.js';
import { Buffer } from 'node:buffer';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { makeLineStore, lineConfigPath, linePendingPath } from './_lib/line-store.js';
import { taskBody, extractLineTask, reviewReasons, lineTaskChanges } from '../src/lineTasks.mjs';

export const config = { api: { bodyParser: false } };
export const hash = value => createHash('sha256').update(String(value)).digest('hex');
export function validSignature(raw, signature, secret) {
  if (!secret || typeof signature !== 'string') return false;
  const expected = createHmac('sha256', secret).update(raw).digest();
  const supplied = Buffer.from(signature, 'base64');
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}
export function taskChoices(id, body) {
  return { type: 'template', altText: 'タスクの種類を選んでください（投稿した本人が操作してください）', template: {
    type: 'buttons', text: '投稿した本人が種類を選んでください。\n' + [...body].slice(0, 80).join(''),
    actions: [['member', 'メンバータスク'], ['partner', 'パートナータスク'], ['cancel', 'キャンセル']].map(([kind, label]) => ({ type: 'postback', label, data: 'lt:' + id + ':' + kind }))
  } };
}
export function createLineHandler({ env = globalThis.process.env, makeStore = makeLineStore, fetcher = fetch, now = Date.now } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    try {
      if (env.VERCEL_ENV !== 'production' || !env.LINE_CHANNEL_SECRET) return res.status(503).json({ error: 'LINE setup required' });
      const chunks = [];
      let size = 0;
      for await (const chunk of req) { const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += bytes.length; if (size > 1024 * 1024) return res.status(413).end(); chunks.push(bytes); }
      const raw = Buffer.concat(chunks);
      if (!validSignature(raw, req.headers['x-line-signature'], env.LINE_CHANNEL_SECRET)) return res.status(401).json({ error: 'Invalid signature' });
      let body;
      try { body = JSON.parse(raw.toString('utf8')); } catch { return res.status(400).end(); }
      if (!Array.isArray(body.events) || body.events.length > 100) return res.status(400).end();
      if (!body.events.length) return res.status(200).json({ ok: true });
      if (!env.LINE_CHANNEL_ACCESS_TOKEN) return res.status(503).json({ error: 'LINE setup required' });
      const store = makeStore(env, fetcher);
      await store.ensurePrivate();
      const reply = async (event, message) => {
        if (!event.replyToken) return;
        const response = await fetcher('https://api.line.me/v2/bot/message/reply', { method: 'POST', headers: { Authorization: 'Bearer ' + env.LINE_CHANNEL_ACCESS_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify({ replyToken: event.replyToken, messages: Array.isArray(message) ? message : [typeof message === 'string' ? { type: 'text', text: message } : message] }), signal: AbortSignal.timeout(10000) });
        // Expired/already-used reply tokens cannot be retried successfully.
        if (!response.ok && response.status !== 400) throw new Error('LINE reply failed');
      };
      const processHandoff = createLineHandoffProcessor({ store, reply, fetcher, env, now });
      for (const event of body.events) {
        if (event.source?.type !== 'group' || !event.source.groupId || !event.source.userId) continue;
        const groupId = event.source.groupId, userId = event.source.userId;
        const pairing = event.type === 'message' && event.message?.type === 'text' && event.message.text.match(/^LINE連携\s+([a-f0-9]{32})\s*$/);
        if (pairing) {
          const connected = await store.transact([lineConfigPath], values => {
            const current = values[lineConfigPath] || {};
            if (!current.pairHash || current.pairHash !== hash(pairing[1]) || current.pairExpires < now()) return { result: false };
            return { writes: [{ path: lineConfigPath, value: { ownerUid: current.ownerUid, groupId, linkedAt: new Date(now()).toISOString(), status: 'connected' } }], result: true };
          });
          if (connected) await reply(event, 'このグループを管理課アプリと連携しました。「タスク」で始まる文章を投稿すると、種類を選ぶボタンが表示されます。');
          continue;
        }
        const connection = await store.read(lineConfigPath);
        if (!connection?.groupId || connection.groupId !== groupId) continue;
        if (await processHandoff(event)) continue;
        if (event.type === 'message' && event.message?.type === 'text') {
          const text = event.message.text, content = taskBody(text);
          if (content === null) continue;
          if (!content || content.length > 5000) { await reply(event, '「タスク」の後に内容を入力してください。5000文字まで登録できます。'); continue; }
          const id = 'line_' + hash(event.message.id).slice(0, 40), path = linePendingPath(id);
          const pending = await store.transact([lineConfigPath, path], values => {
            if (values[lineConfigPath]?.groupId !== groupId) return { result: null };
            if (values[path]) return { result: values[path] };
            const value = { id, groupId, userId, ownerUid: values[lineConfigPath].ownerUid, text, timestamp: event.timestamp, expires: now() + 86400000, status: 'choosing', createdAt: new Date(now()).toISOString() };
            return { writes: [{ path, value }], result: value };
          });
          if (pending?.status === 'choosing' && pending.expires > now()) await reply(event, taskChoices(id, content));
        }
        if (event.type === 'postback') {
          const match = String(event.postback?.data || '').match(/^lt:(line_[a-f0-9]{40}):(member|partner|cancel)$/);
          if (!match) continue;
          const [, id, kind] = match, path = linePendingPath(id);
          const message = await store.transact([lineConfigPath, path, 'app_data/shared_state'], values => {
            const current = values[path], state = values['app_data/shared_state'];
            if (values[lineConfigPath]?.groupId !== groupId) return { result: '連携が変更されています。' };
            if (!current || current.groupId !== groupId || current.userId !== userId) return { result: 'このボタンは投稿した本人だけが操作できます。' };
            if (current.status !== 'choosing') return { result: current.status === 'registered' ? registeredTaskCard(current.id, current.kind, current.draft) : current.status === 'review' ? 'アプリの「LINEからの要確認」に保存済みです。' : 'キャンセル済みです。' };
            if (current.expires < now()) return { result: '選択期限が切れました。「タスク」で始めて投稿し直してください。' };
            if (kind === 'cancel') return { writes: [{ path, value: { ...current, status: 'cancelled' } }], result: 'タスクの登録をキャンセルしました。' };
            if (!state) throw new Error('Missing shared data');
            const draft = extractLineTask(current.text, current.timestamp, state.users || {}, state.partnerNames || []);
            const reasons = reviewReasons(draft, kind, state.users || {});
            if (reasons.length) return { writes: [{ path, value: { ...current, kind, draft, reasons, status: 'review' } }], result: '確認が必要です：' + reasons.join('・') + '\nアプリの設定 →「LINEタスク連携」で管理者が確認・登録できます。' };
            const changes = lineTaskChanges(state, current, draft, kind, now());
            return { writes: [{ path, value: { ...current, kind, draft, status: 'registered' } }, ...(Object.keys(changes).length ? [{ path: 'app_data/shared_state', value: changes, fields: Object.keys(changes) }] : [])], result: registeredTaskCard(current.id, kind, draft) };
          });
          await reply(event, message);
        }
      }
      return res.status(200).json({ ok: true });
    } catch {
      return res.status(503).json({ error: 'LINE処理に失敗しました。サーバー設定を確認してください。' });
    }
  };
}
export default createLineHandler();
