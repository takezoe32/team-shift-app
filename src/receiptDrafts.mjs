// レシートの一時保存: a phone photographs a receipt and keeps it in the app's private Drive folder, so the
// same account can finish the input on a PC. Only the account that saved it can list, open or delete it.
export const RECEIPT_DRAFT_BYTES = 3 * 1024 * 1024; // after the phone shrinks the photo (request bodies stay under 4.5MB)
export const RECEIPT_DRAFT_MAX = 20; // per account
export const RECEIPT_DRAFT_DAYS = 30; // older ones are moved to the Drive trash when the owner next opens the list
export const receiptDraftId = id => /^[A-Za-z0-9_-]{10,200}$/.test(String(id || ''));

// JPEG or PNG by its first bytes; anything else is refused.
export function receiptDraftMime(bytes) {
  if (!bytes?.length || bytes.length > RECEIPT_DRAFT_BYTES) throw new Error('一時保存できる画像は3MBまでです。');
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if ([0x89, 0x50, 0x4e, 0x47].every((value, i) => bytes[i] === value)) return 'image/png';
  throw new Error('JPEG・PNGの画像を選択してください。');
}

// Shrinks a phone photo to a JPEG of at most 3MB, keeping enough resolution for reading the text later.
export async function shrinkReceiptPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    for (const [side, quality] of [[3000, 0.9], [3000, 0.8], [2400, 0.8], [2000, 0.75], [1600, 0.7]]) {
      const ratio = Math.min(1, side / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
      const context = canvas.getContext('2d'); if (!context) break;
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
      if (blob && blob.size <= RECEIPT_DRAFT_BYTES) return blob;
    }
  } finally { URL.revokeObjectURL(url); }
  throw new Error('画像を一時保存用に縮小できませんでした。JPEGで撮り直してください。');
}

const api = '/api/task-files?kind=receipt-draft';
async function result(response, fallback) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || fallback);
  return data;
}
const post = (body, fetcher) => fetcher('/api/task-files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'receipt-draft', ...body }) });
export async function listReceiptDrafts(fetcher = fetch) {
  return (await result(await fetcher(api), '一時保存したレシートを読み込めませんでした。')).drafts || [];
}
export async function saveReceiptDraft(uid, blob, fetcher = fetch) {
  const base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('画像を読み込めませんでした。')); reader.readAsDataURL(blob); });
  return (await result(await post({ action: 'save', appUid: uid, base64 }, fetcher), '一時保存できませんでした。通信を確認してもう一度お試しください。')).draft;
}
export async function openReceiptDraft(id, fetcher = fetch) {
  if (!receiptDraftId(id)) throw new Error('一時保存したレシートを確認できません。');
  const response = await fetcher(api + '&id=' + encodeURIComponent(id));
  if (!response.ok) await result(response, '一時保存したレシートを開けませんでした。');
  const blob = await response.blob();
  return new File([blob], 'receipt.jpg', { type: blob.type?.startsWith('image/') ? blob.type : 'image/jpeg' });
}
export async function deleteReceiptDraft(uid, id, fetcher = fetch) {
  await result(await post({ action: 'delete', appUid: uid, id }, fetcher), '一時保存を削除できませんでした。');
}
