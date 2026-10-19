import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import { createLineHandler } from '../api/line-webhook.js';
import { lineConfigPath } from '../api/_lib/line-store.js';
import { privateMemberPath } from '../api/_lib/line-private.js';
import { appLineMemberPath } from '../api/_lib/line-account.js';
import { lineActions } from './helpers/lineCards.mjs';

const timestamp = Date.parse('2026-10-19T03:00:00Z'), shared = 'app_data/shared_state';
function fixture() {
  let counter = 0, videoProcessing = false, mimeOverride = '', sizeOverride = 0, gate = null, duration = 8;
  const docs = { [lineConfigPath]: { ownerUid: 'owner', status: 'connected' }, [shared]: { users: { owner: { email: 'owner@example.com', name: '担当者', role: 'admin' } }, teamData: { tasks: { '2026-10-19': { owner: [{ id: 'member', subject: '点検', text: '元の説明', images: [{ imageUrl: 'https://res.cloudinary.com/hfkn6ad1/image/upload/original.jpg' }], updates: [] }] } } }, partnerItems: [{ id: 'partner', partnerName: '山下健装', date: '2026-10-19', time: '10:00', subject: '工事', content: '元の工事説明' }] }, [privateMemberPath('U1')]: { appUid: 'owner', email: 'owner@example.com', status: 'active', epoch: 'legacy' }, [appLineMemberPath('owner')]: { userId: 'U1' } };
  const store = { ensurePrivate: async () => {}, read: async path => structuredClone(docs[path] || null), transact: async (paths, plan) => {
    const result = plan(Object.fromEntries(paths.map(path => [path, structuredClone(docs[path] || null)])));
    for (const write of result.writes || []) docs[write.path] = write.fields ? { ...docs[write.path], ...write.value } : write.value;
    return result.result;
  } };
  const replies = [], uploads = [], downloads = [];
  const fetcher = async (url, options = {}) => {
    if (url.includes('api-data.line.me')) {
      downloads.push({ url, options });
      if (videoProcessing && url.includes('video')) return new Response(null, { status: 202 });
      const video = url.includes('video');
      return new Response(new Uint8Array(20), { headers: { 'content-type': mimeOverride || (video ? 'video/mp4' : 'image/jpeg'), 'content-length': String(sizeOverride || 20) } });
    }
    if (url.includes('api.cloudinary.com')) {
      uploads.push({ url, options });
      if (gate) await gate;
      const type = url.includes('/video/') ? 'video' : 'image', id = 'preset_generated_' + uploads.length;
      return { ok: true, json: async () => ({ secure_url: 'https://res.cloudinary.com/hfkn6ad1/' + type + '/upload/' + id + (type === 'video' ? '.mp4' : '.jpg'), public_id: id, bytes: 20, duration }) };
    }
    if (url.includes('/profile/')) return { ok: true, json: async () => ({ displayName: 'LINEの担当者' }) };
    assert.ok(url.endsWith('/message/reply'));
    replies.push(JSON.parse(options.body)); return { ok: true };
  };
  const handler = createLineHandler({ env: { VERCEL_ENV: 'production', LINE_CHANNEL_SECRET: 'secret', LINE_CHANNEL_ACCESS_TOKEN: 'token' }, makeStore: () => store, fetcher, now: () => timestamp });
  const send = async (input, { userId = 'U1', repeat, group = false } = {}) => {
    const id = 'event-' + ++counter;
    const event = repeat || { webhookEventId: id, timestamp, replyToken: 'reply-' + id, source: group ? { type: 'group', groupId: 'G1', userId } : { type: 'user', userId }, ...(typeof input === 'string' ? { type: 'message', message: { type: 'text', id, text: input } } : ['image', 'video'].includes(input.type) ? { type: 'message', message: input } : { type: 'postback', postback: { data: input.data } }) };
    const body = Buffer.from(JSON.stringify({ destination: 'bot', events: [event] })), req = Readable.from([body]);
    req.method = 'POST'; req.headers = { 'x-line-signature': createHmac('sha256', 'secret').update(body).digest('base64') };
    const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } };
    await handler(req, res); assert.equal(res.code, 200, JSON.stringify(res.body));
    return { event, messages: replies.at(-1)?.messages };
  };
  const actions = () => lineActions(replies.at(-1)?.messages || []);
  const press = label => { const action = actions().find(item => item.label === label); assert.ok(action, label); return send(action); };
  const begin = async (kind = 'メンバー') => { await send('追記'); await press(kind); await send('1'); };
  const media = (id, type = 'image', extra = {}) => ({ type, id, contentProvider: { type: 'line' }, ...(type === 'video' ? { duration: 8000 } : {}), ...extra });
  const session = () => Object.entries(docs).find(([path]) => /^_server_integrations\/line_handoff_[a-f0-9]{64}$/.test(path))?.[1];
  return { docs, send, press, begin, media, actions, session, downloads, uploads, replies, processing: value => { videoProcessing = value; }, mime: value => { mimeOverride = value; }, size: value => { sizeOverride = value; }, duration: value => { duration = value; }, gate: value => { gate = value; } };
}
test('text, image and video are confirmed together and saved once without changing original attachments', async () => {
  const f = fixture(); await f.begin(); await f.send('現場を確認しました。');
  const stale = f.actions().find(action => action.label === 'このタスクに追加');
  const first = await f.send(f.media('image1')); await f.send(f.media('video1', 'video'));
  await f.send(null, { repeat: first.event });
  assert.equal(f.uploads.length, 2);
  await f.send(stale);
  assert.equal(f.docs[shared].teamData.tasks['2026-10-19'].owner[0].updates.length, 0);
  const latest = f.replies.slice().reverse().flatMap(reply => lineActions(reply.messages)).find(action => action.label === 'このタスクに追加');
  await f.send(latest); await f.send(latest);
  const task = f.docs[shared].teamData.tasks['2026-10-19'].owner[0];
  assert.equal(task.updates.length, 1); assert.equal(task.text, '元の説明'); assert.equal(task.images.length, 1);
  assert.equal(task.updates[0].text, '現場を確認しました。'); assert.equal(task.updates[0].images.length, 2);
  assert.equal(task.updates[0].images[1].mediaType, 'video');
  assert.match(task.updates[0].images[1].playbackUrl, /f_mp4/);
  assert.ok(f.downloads.every(item => item.options.headers.Authorization === 'Bearer token'));
  assert.ok(f.uploads.every(item => !item.options.headers?.Authorization && item.options.body.get('upload_preset') === 'teamshift_tasks'));
});
test('image-only and video-only partner handoffs keep the original body', async () => {
  for (const type of ['image', 'video']) {
    const f = fixture(); await f.begin('パートナー'); await f.send(f.media(type + '1', type));
    assert.ok(f.replies.at(-1).messages.every(message => message.type !== 'text' || message.text.length > 0));
    await f.press('このタスクに追加');
    const item = f.docs[shared].partnerItems[0];
    assert.equal(item.content, '元の工事説明'); assert.equal(item.updates[0].kind, 'initial');
    assert.equal(item.updates[1].text, ''); assert.equal(item.updates[1].images.length, 1);
  }
});
test('unlinked users, group photos, missing target and external content never download or upload', async () => {
  const f = fixture();
  await f.send(f.media('unknown'), { userId: 'U2' }); await f.send(f.media('group'), { group: true }); await f.send(f.media('no-target'));
  await f.begin(); await f.send(f.media('external', 'image', { contentProvider: { type: 'external', originalContentUrl: 'http://127.0.0.1/secret' } }));
  assert.equal(f.downloads.length, 0); assert.equal(f.uploads.length, 0);
});
test('a LINE photo album waits for every photo before exposing the save button', async () => {
  const f = fixture(); await f.begin();
  await f.send(f.media('image1', 'image', { imageSet: { id: 'album', index: 1, total: 2 } }));
  assert.equal(f.actions().some(action => action.label === 'このタスクに追加'), false);
  await f.send(f.media('image2', 'image', { imageSet: { id: 'album', index: 2, total: 2 } }));
  await f.send('確認');
  assert.equal(f.session().text, undefined);
  await f.press('このタスクに追加');
  assert.equal(f.docs[shared].teamData.tasks['2026-10-19'].owner[0].updates[0].images.length, 2);
});
test('pending uploads invalidate older save buttons and preserve a newly written description', async () => {
  const f = fixture(); await f.begin(); await f.send('点検前');
  const oldSave = f.actions().find(action => action.label === 'このタスクに追加');
  let release; f.gate(new Promise(resolve => { release = resolve; }));
  const receiving = f.send(f.media('image1'));
  for (let attempt = 0; !f.uploads.length && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal(f.uploads.length, 1);
  await f.send(oldSave); await f.send('点検後'); await f.send('確認');
  assert.equal(f.actions().some(action => action.label === 'このタスクに追加'), false);
  assert.equal(f.docs[shared].teamData.tasks['2026-10-19'].owner[0].updates.length, 0);
  release(); await receiving; await f.send('確認'); await f.press('このタスクに追加');
  const note = f.docs[shared].teamData.tasks['2026-10-19'].owner[0].updates[0];
  assert.equal(note.text, '点検後'); assert.equal(note.images.length, 1);
});
test('processing videos retry safely and removed media cannot return through an old event or button', async () => {
  const f = fixture(); await f.begin(); f.processing(true);
  const event = await f.send(f.media('video1', 'video')); assert.equal(f.uploads.length, 0);
  const retry = f.actions().find(action => action.label === '添付を再試行');
  f.processing(false); await f.send(retry); assert.equal(f.uploads.length, 1);
  await f.send(f.media('image1')); f.mime('application/octet-stream'); await f.send(f.media('invalid'));
  const removedRetry = f.actions().find(action => action.label === '添付を再試行');
  await f.press('この添付を除く'); await f.send(removedRetry);
  assert.equal(f.session().attachments.length, 2);
  await f.send(null, { repeat: event.event }); assert.equal(f.uploads.length, 2);
});
test('size, duration and per-handoff counts are enforced before task persistence', async () => {
  const f = fixture(); await f.begin();
  await f.send(f.media('video-too-long', 'video', { duration: 31000 })); assert.equal(f.downloads.length, 0);
  f.size(11 * 1024 * 1024); await f.send(f.media('too-large')); assert.equal(f.uploads.length, 0);
  await f.press('この添付を除く'); f.size(0);
  for (let index = 0; index < 5; index++) await f.send(f.media('image' + index));
  await f.send(f.media('image6')); assert.equal(f.uploads.length, 5);
  await f.send(f.media('video1', 'video')); await f.send(f.media('video2', 'video')); assert.equal(f.uploads.length, 6);
  assert.equal(f.docs[shared].teamData.tasks['2026-10-19'].owner[0].updates.length, 0);
});
test('cancellation or authorization revocation while uploading cannot attach to a task', async () => {
  for (const mode of ['cancel', 'revoke']) {
    const f = fixture(); await f.begin();
    let release; f.gate(new Promise(resolve => { release = resolve; }));
    const receiving = f.send(f.media('image1'));
    for (let attempt = 0; !f.uploads.length && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 1));
    assert.equal(f.uploads.length, 1);
    if (mode === 'cancel') await f.send({ data: 'lh:cancel:' + f.session().nonce });
    else f.docs[privateMemberPath('U1')].status = 'revoked';
    release(); await receiving;
    assert.equal(f.docs[shared].teamData.tasks['2026-10-19'].owner[0].updates.length, 0);
    assert.equal(f.session().attachments[0].status, 'loading');
  }
});
