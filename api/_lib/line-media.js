import { Buffer } from 'node:buffer';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { lineConfigPath } from './line-store.js';
import { privateMemberPath } from './line-private.js';
import { appLineMemberPath } from './line-account.js';
import { lineButtons, lineAction } from './line-ui.js';
import { resolveLineTask } from '../../src/lineHandoffs.mjs';
import { taskVideoPlaybackUrl } from '../../src/taskImages.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const sharedPath = 'app_data/shared_state';
export const handoffPath = event => '_server_integrations/line_handoff_' + hash(event.source.groupId + ':' + event.source.userId);
const mediaPath = id => '_server_integrations/line_media_' + id;
export const mediaImages = session => (session.attachments || []).filter(item => item.status === 'ready').map(item => item.asset);
export function mediaPending(session) {
  const attachments = session.attachments || [];
  if (attachments.some(item => item.status !== 'ready')) return true;
  return attachments.some(item => item.setId && attachments.filter(other => other.setId === item.setId).length < item.setTotal);
}
export const mediaSummary = session => {
  const items = session.attachments || [];
  return '画像 ' + items.filter(item => item.type === 'image' && item.status === 'ready').length + '枚・動画 ' + items.filter(item => item.type === 'video' && item.status === 'ready').length + '本' + (mediaPending(session) ? '（受信中、または再試行が必要な添付があります）' : '');
};
async function boundedBytes(response, limit) {
  if (Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw new Error('ファイルが大きすぎます。画像は10MB、動画は25MB以下にしてください。'); }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('添付ファイルを取得できませんでした。');
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error('ファイルが大きすぎます。画像は10MB、動画は25MB以下にしてください。'); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  if (!size) throw new Error('空の添付ファイルは追加できません。');
  return Buffer.concat(chunks);
}
export async function uploadLineMedia({ record, env, fetcher = fetch }) {
  const response = await fetcher('https://api-data.line.me/v2/bot/message/' + encodeURIComponent(record.messageId) + '/content', { headers: { Authorization: 'Bearer ' + env.LINE_CHANNEL_ACCESS_TOKEN }, redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (response.status === 202) throw new Error('LINEで動画を準備中です。少し待って「添付を再試行」を押してください。');
  if (!response.ok) throw new Error('LINEから添付を取得できませんでした。再試行するか、もう一度送ってください。');
  const mime = response.headers.get('content-type')?.split(';')[0];
  if (!(record.type === 'image' ? ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] : ['video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp']).includes(mime)) throw new Error('この画像・動画形式には対応していません。画像はJPEG・PNG、動画はMP4で送ってください。');
  const bytes = await boundedBytes(response, (record.type === 'image' ? 10 : 25) * 1024 * 1024);
  const publicId = 'line_' + createHmac('sha256', env.LINE_CHANNEL_SECRET).update(record.userId + ':' + record.messageId).digest('hex');
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mime }), publicId);
  form.append('upload_preset', 'teamshift_tasks');
  form.append('public_id', publicId);
  const uploaded = await fetcher('https://api.cloudinary.com/v1_1/hfkn6ad1/' + record.type + '/upload', { method: 'POST', body: form, redirect: 'error', signal: AbortSignal.timeout(25000) });
  if (!uploaded.ok) throw new Error('添付の保存に失敗しました。「添付を再試行」を押してください。');
  const asset = await uploaded.json();
  let url;
  try { url = new URL(asset.secure_url); } catch { throw new Error('添付の保存結果を確認できません。'); }
  // The existing unsigned preset may generate its own ID instead of public_id.
  if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || !url.pathname.startsWith('/hfkn6ad1/' + record.type + '/upload/') || typeof asset.public_id !== 'string' || !asset.public_id || !(asset.bytes > 0)) throw new Error('添付の保存結果を確認できません。');
  if (record.type === 'video' && (!(asset.duration > 0) || asset.duration > 30)) throw new Error('動画は30秒以内にしてください。短くして、もう一度送ってください。');
  return { imageUrl: url.href, imageName: record.type === 'image' ? 'LINEの画像' : 'LINEの動画', imagePublicId: asset.public_id, imageBytes: asset.bytes, ...(record.type === 'video' ? { mediaType: 'video', duration: asset.duration, playbackUrl: taskVideoPlaybackUrl(url.href) } : {}) };
}
export function createLineMediaProcessor({ store, reply, env, fetcher, now, confirmCard }) {
  return async event => {
    const incoming = event.type === 'message' && ['image', 'video'].includes(event.message?.type);
    const operation = event.type === 'postback' && String(event.postback?.data || '').match(/^lm:(retry|remove):([a-f0-9]{64})$/);
    if (!incoming && !operation) return false;
    if (event.source?.type !== 'user' || !event.privateAuthorized || !event.privateAppUid) return false;
    const message = event.message;
    if (incoming && (!/^[a-zA-Z0-9_-]{1,128}$/.test(message.id || '') || message.contentProvider?.type !== 'line')) { await reply(event, 'LINEから画像・動画を直接送ってください。外部リンクの添付には対応していません。'); return true; }
    if (incoming && message.type === 'video' && Number(message.duration) > 30000) { await reply(event, '動画は30秒以内にしてください。短くしてから送ってください。'); return true; }
    const id = operation?.[2] || hash(event.source.userId + ':' + message.id), path = mediaPath(id), sessionPath = handoffPath(event);
    const memberPath = privateMemberPath(event.source.userId), reversePath = appLineMemberPath(event.privateAppUid);
    const paths = [lineConfigPath, sharedPath, sessionPath, path, memberPath, reversePath];
    const allowed = values => {
      const config = values[lineConfigPath], binding = values[memberPath], user = values[sharedPath]?.users?.[event.privateAppUid];
      return config?.ownerUid && config.status !== 'disconnected' && binding?.status === 'active' && binding.appUid === event.privateAppUid && binding.epoch === (config.accessEpoch || 'legacy') && values[reversePath]?.userId === event.source.userId && user && user.role !== 'viewer' && String(user.email || '').trim().toLowerCase() === binding.email;
    };
    const validSession = session => session && session.privateChat && session.groupId === event.source.groupId && session.userId === event.source.userId && (!session.appUid || session.appUid === event.privateAppUid) && ['awaiting', 'confirming'].includes(session.status) && session.expires > now();
    const freshNonce = () => randomBytes(12).toString('hex');
    const state = await store.transact(paths, values => {
      const session = values[sessionPath], previous = values[path];
      if (!allowed(values) || !validSession(session) || !resolveLineTask(values[sharedPath], session.target)) return { result: { message: '先に「追記」で対象タスクを選んでから、画像・動画を送ってください。' } };
      const draftId = session.draftId || session.nonce;
      if (previous && (previous.userId !== event.source.userId || previous.appUid !== event.privateAppUid || previous.draftId !== draftId)) return { result: { message: 'この添付は別の入力用です。画像・動画をもう一度送ってください。' } };
      let attachments = session.attachments || [];
      if (operation && !previous) return { result: { message: '添付が見つかりません。もう一度送ってください。' } };
      if (previous && !attachments.some(item => item.id === id)) return { result: { message: 'この添付は取り消されています。必要な場合は画像・動画をもう一度送ってください。' } };
      if (operation?.[1] === 'remove') {
        attachments = attachments.filter(item => item.id !== id);
        // Removing one photo from an album also removes the missing-album wait.
        attachments = attachments.map(item => previous.setId && item.setId === previous.setId ? { ...item, setId: '', setTotal: 0 } : item);
        const next = { ...session, attachments, nonce: freshNonce() };
        return { writes: [{ path: sessionPath, value: next }], result: { message: confirmCard(next) } };
      }
      if (previous?.status === 'ready' && attachments.some(item => item.id === id && item.status === 'ready')) return { result: { message: confirmCard(session) } };
      if (previous?.status === 'loading' && previous.leaseUntil > now()) return { result: { message: lineButtons('添付を受信中です。完了をお待ちください。しばらく反応がない場合は再試行できます。', [lineAction('添付を再試行', 'lm:retry:' + id), lineAction('この添付を除く', 'lm:remove:' + id), lineAction('キャンセル', 'lh:cancel:' + session.nonce)]) } };
      const record = previous || { id, messageId: message.id, type: message.type, userId: event.source.userId, appUid: event.privateAppUid, draftId, ...(message.imageSet?.id ? { setId: String(message.imageSet.id), setTotal: Math.max(1, Math.min(100, Math.floor(Number(message.imageSet.total) || 1))) } : {}) };
      const others = attachments.filter(item => item.id !== id);
      const projected = [...others, record].filter(item => item.type === 'image');
      const sets = new Map();
      let expectedImages = 0;
      for (const item of projected) { if (item.setId) sets.set(item.setId, Math.max(sets.get(item.setId) || 0, item.setTotal || 1)); else expectedImages++; }
      expectedImages += [...sets.values()].reduce((sum, total) => sum + total, 0);
      if (expectedImages > 5 || (record.type === 'video' && others.some(item => item.type === 'video'))) return { result: { message: '1回の追記は画像5枚・動画1本までです。残りは別の追記で送ってください。' } };
      const lease = freshNonce(), next = { ...session, draftId, appUid: event.privateAppUid, nonce: freshNonce(), attachments: [...others, { id, type: record.type, status: 'loading', ...(record.setId ? { setId: record.setId, setTotal: record.setTotal } : {}) }] };
      const loading = { ...record, status: 'loading', lease, leaseUntil: now() + 90000 };
      return { writes: [{ path, value: loading }, { path: sessionPath, value: next }], result: { record: loading } };
    });
    if (state.message) { await reply(event, state.message); return true; }
    let asset, error;
    try { asset = state.record.asset || await uploadLineMedia({ record: state.record, env, fetcher }); }
    catch (failure) { error = /^(LINE|添付|動画|ファイル|この画像|空の)/.test(failure.message) ? failure.message : '添付を受信できませんでした。少し待って再試行してください。'; }
    const result = await store.transact(paths, values => {
      const session = values[sessionPath], record = values[path];
      if (!allowed(values) || !validSession(session) || session.draftId !== state.record.draftId || record?.lease !== state.record.lease || !session.attachments?.some(item => item.id === id)) return { result: '入力が変更・終了されているため、この添付はタスクに追加していません。' };
      const next = { ...session, nonce: freshNonce(), status: 'confirming', attachments: session.attachments.map(item => item.id === id ? { ...item, status: error ? 'error' : 'ready', ...(asset ? { asset } : {}) } : item) };
      const writes = [{ path, value: { ...record, status: error ? 'error' : 'ready', ...(asset ? { asset } : {}) } }, { path: sessionPath, value: next }];
      const response = error ? lineButtons(error + '\nまだタスクには保存されていません。', [lineAction('添付を再試行', 'lm:retry:' + id), lineAction('この添付を除く', 'lm:remove:' + id), lineAction('キャンセル', 'lh:cancel:' + next.nonce)]) : confirmCard(next);
      return { writes, result: response };
    });
    await reply(event, result);
    return true;
  };
}
