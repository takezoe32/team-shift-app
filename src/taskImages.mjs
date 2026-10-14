export function getTaskImages(item) {
  const images = [...(Array.isArray(item?.images) ? item.images : []), ...(item?.imageUrl ? [item] : [])];
  const seen = new Set();
  return images.filter(image => image?.imageUrl && !seen.has(image.imageUrl) && seen.add(image.imageUrl)).map(image => ({ imageUrl: image.imageUrl, imageName: image.imageName || '', imagePublicId: image.imagePublicId || '', imageBytes: Number(image.imageBytes || 0) }));
}
export const mergeTaskImages = (item, images) => getTaskImages({ images: [...getTaskImages(item), ...images] });
export function mergePartnerImageChanges(current, changes) {
  const next = { ...current, ...changes };
  if (Array.isArray(changes.images)) next.images = mergeTaskImages(current, changes.images);
  if (Array.isArray(changes.updates)) {
    const updates = [...(current.updates || [])];
    for (const update of changes.updates) if (!updates.some(existing => existing.id === update.id)) updates.push(update);
    next.updates = updates;
  }
  return next;
}
export function validateTaskImageFiles(files) {
  if (files.length > 5) throw new Error('1回に追加できる画像は5枚までです。');
  if (files.some(file => !file.type.startsWith('image/'))) throw new Error('画像ファイルを選択してください。動画にはまだ対応していません。');
  if (files.some(file => file.size > 10 * 1024 * 1024)) throw new Error('画像は1枚10MB以下にしてください。');
}
