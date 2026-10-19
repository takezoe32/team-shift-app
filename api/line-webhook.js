import { createLineHandoffProcessor } from './_lib/line-handoff.js';
import { mentionedCommand } from './_lib/line-mention.js';
import { Buffer } from 'node:buffer';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { makeLineStore, lineConfigPath } from './_lib/line-store.js';
import { createLineRegistrationProcessor } from './_lib/line-registration.js';
import { authorizePrivateLine, privateHelp } from './_lib/line-private.js';
import { lineButtons, lineAction } from './_lib/line-ui.js';

export const config = { api: { bodyParser: false } };
export const hash = value => createHash('sha256').update(String(value)).digest('hex');
export function validSignature(raw, signature, secret) {
  if (!secret || typeof signature !== 'string') return false;
  const expected = createHmac('sha256', secret).update(raw).digest();
  const supplied = Buffer.from(signature, 'base64');
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}
export function taskChoices(id, body) {
  return lineButtons('投稿した本人が種類を選んでください。\n' + [...body].slice(0, 80).join(''), [['member', 'メンバータスク'], ['partner', 'パートナータスク'], ['cancel', 'キャンセル']].map(([kind, label]) => lineAction(label, 'lt:' + id + ':' + kind)), 'タスクの種類を選んでください（投稿した本人が操作してください）');
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
      const processRegistration = createLineRegistrationProcessor({ store, reply, choices: taskChoices, fetcher, env, now });
      for (const incoming of body.events) {
        let event = incoming;
        const privateChat = event.source?.type === 'user';
        if (!event.source?.userId || (!privateChat && (event.source.type !== 'group' || !event.source.groupId))) continue;
        if (privateChat) {
          if (!['message', 'postback', 'follow'].includes(event.type) || (event.type === 'message' && !['text', 'image', 'video'].includes(event.message?.type))) continue;
          const authorized = await authorizePrivateLine({ event, store, fetcher, env, now });
          if (!authorized) { await reply(event, '初回はアプリの「使い方」→「LINEから登録」→「自分のLINEを連携する」で本人用のコードを発行し、この個別トークに送ってください。\n例：連携 コード\nアプリに登録されたメールアドレスとLINEを結び付けます。コードは他の人に渡さないでください。'); continue; }
          event = { ...event, privateAuthorized: true, privateAppUid: authorized.appUid, source: { ...event.source, groupId: 'private:' + event.source.userId } };
          if (event.type === 'message' && ['image', 'video'].includes(event.message.type)) { await processHandoff(event); continue; }
          const text = event.message?.text?.trim() || '';
          if (event.type === 'follow' || (event.type === 'message' && (!text || /^(使い方|ヘルプ|開始|連携(?:\s+[a-f0-9]{32})?)$/.test(text)))) { await reply(event, privateHelp); continue; }
        } else if (event.type === 'message') {
          const text = mentionedCommand(event.message, body.destination);
          if (text === null) continue;
          event = { ...event, message: { ...event.message, text } };
        }
        const groupId = event.source.groupId;
        const pairing = !privateChat && event.type === 'message' && event.message?.type === 'text' && event.message.text.match(/^LINE連携\s+([a-f0-9]{32})\s*$/);
        if (pairing) {
          const connected = await store.transact([lineConfigPath], values => {
            const current = values[lineConfigPath] || {};
            if (!current.pairHash || current.pairHash !== hash(pairing[1]) || current.pairExpires < now()) return { result: false };
            const value = { ...current, ownerUid: current.ownerUid, groupId, linkedAt: new Date(now()).toISOString(), status: 'connected' };
            delete value.pairHash; delete value.pairExpires;
            return { writes: [{ path: lineConfigPath, value }], result: true };
          });
          if (connected) await reply(event, 'このグループを管理課アプリと連携しました。公式アカウントをメンションし「タスク 内容」で登録、「追記」で申し送り一覧を開けます。');
          continue;
        }
        const connection = await store.read(lineConfigPath);
        if (!privateChat && (!connection?.groupId || connection.groupId !== groupId)) continue;
        if (event.type === 'message' && !event.message.text.trim()) {
          await reply(event, 'メンションの後ろに、次の言葉を付けて送ってください。\n\n【追記】申し送りできるタスクの一覧を開きます。\n例：@管理課 タスク受付 追記\n\n【タスク＋内容】新しいタスクを登録します。担当は投稿者です。不足項目はLINEで質問します。\n例：@管理課 タスク受付 タスク\n日付：明日\n件名：電球交換\n\n【申し送り＋件名】既存タスクを検索します。\n例：@管理課 タスク受付 申し送り 217号室\n\n一覧を開いた後は、メンション＋番号で対象を選びます。\n例：@管理課 タスク受付 3\n\n対象を選んだ後は、メンション＋追記＋内容で申し送りを書けます。\n例：@管理課 タスク受付 追記 部品を発注しました。\n\n※「@」の候補から公式アカウントを選んでください。選択・確認ボタンはそのまま押せます。');
          continue;
        }
        if (event.type === 'postback' && String(event.postback?.data || '').startsWith('lm:')) { await processHandoff(event); continue; }
        if (await processRegistration(event)) continue;
        if (await processHandoff(event)) continue;
      }
      return res.status(200).json({ ok: true });
    } catch {
      return res.status(503).json({ error: 'LINE処理に失敗しました。サーバー設定を確認してください。' });
    }
  };
}
export default createLineHandler();
