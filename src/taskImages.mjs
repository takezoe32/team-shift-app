import { changeHandoff } from './handoffEdit.mjs';
export function getTaskImages(item) {
  const images = [...(Array.isArray(item?.images) ? item.images : []), ...(item?.imageUrl ? [item] : [])];
  const seen = new Set();
  return images.filter(image => image?.imageUrl && !seen.has(image.imageUrl) && seen.add(image.imageUrl)).map(image => ({ imageUrl: image.imageUrl, imageName: image.imageName || '', imagePublicId: image.imagePublicId || '', imageBytes: Number(image.imageBytes || 0), ...(image.mediaType === 'video' ? { mediaType: 'video', duration: Number(image.duration || 0), playbackUrl: image.playbackUrl || taskVideoPlaybackUrl(image.imageUrl) } : {}) }));
}
export const mergeTaskImages = (item, images) => getTaskImages({ images: [...getTaskImages(item), ...images] });
export function mergePartnerImageChanges(current, changes) {
  if (changes.handoffOperation) {
    const { handoffOperation, ...other } = changes;
    return { ...current, ...other, ...changeHandoff(current, handoffOperation, 'content') };
  }
  const next = { ...current, ...changes };
  if (Array.isArray(changes.images)) next.images = mergeTaskImages(current, changes.images);
  if (Array.isArray(changes.updates)) {
    const updates = [...(current.updates?.length ? current.updates : current.content ? [{ id: 'legacy_' + current.id, text: current.content, authorUid: current.createdByUid || '', authorName: current.createdByName || '登録時の内容', createdAt: current.createdAt || null, kind: 'initial' }] : [])];
    for (const update of changes.updates) if (!updates.some(existing => existing.id === update.id)) updates.push(update);
    next.updates = updates;
  }
  return next;
}
export function validateTaskImageFiles(files) {
  const videos = files.filter(isTaskVideo);
  const images = files.filter(file => String(file.type || '').startsWith('image/'));
  if (images.length > 5) throw new Error('1回に追加できる画像は5枚までです。');
  if (videos.length > 1) throw new Error('1回に追加できる動画は1本までです。');
  if (images.length + videos.length !== files.length) throw new Error('画像または動画ファイルを選択してください。');
  if (images.some(file => file.size > 10 * 1024 * 1024)) throw new Error('画像は1枚10MB以下にしてください。');
}

export const isTaskVideo = file => file.type?.startsWith('video/') || (!file.type && /\.(mp4|mov|m4v|webm|3gp)$/i.test(file.name || ''));

export function taskVideoPlaybackUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'res.cloudinary.com' || !url.pathname.includes('/video/upload/')) return value;
    url.pathname = url.pathname.replace('/video/upload/', '/video/upload/f_mp4,vc_h264,ac_aac,q_auto,c_limit,w_1280/').replace(/\.[^/.]+$/, '.mp4');
    return url.href;
  } catch { return value; }
}

const durationCache = new WeakMap();
export async function validateTaskVideo(file) {
  validateTaskImageFiles([file]);
  if (!isTaskVideo(file)) return 0;
  if (durationCache.has(file)) return durationCache.get(file);
  const duration = await new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    const cleanup = () => { clearTimeout(timer); video.onerror = null; video.onloadedmetadata = null; video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); };
    const fail = () => { cleanup(); reject(new Error('動画の長さを確認できません。MP4形式で保存するか、スマートフォンの撮影形式を互換性優先にして撮り直してください。')); };
    const timer = setTimeout(fail, 15000);
    video.preload = 'metadata';
    video.onloadedmetadata = () => { const value = video.duration; video.onloadedmetadata = null; video.onerror = null; cleanup(); Number.isFinite(value) && value > 0 ? resolve(value) : reject(new Error('動画の長さを確認できません。')); };
    video.onerror = fail;
    video.src = url;
  });
  if (duration > 30) throw new Error('動画は30秒以内にしてください。短く撮影するか、端末でトリミングしてください。');
  durationCache.set(file, duration);
  return duration;
}
