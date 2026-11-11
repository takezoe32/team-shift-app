import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { MEDIA_FOLDER_ID } from '../../src/dailyReport.mjs';
import { RECEIPT_DRAFT_BYTES, RECEIPT_DRAFT_MAX, RECEIPT_DRAFT_DAYS, receiptDraftId, receiptDraftMime } from '../../src/receiptDrafts.mjs';
import { japanToday, japanTime } from '../../src/japanTime.mjs';
import { fault } from './report-auth.js';

// レシートの一時保存 (kind=receipt-draft on /api/task-files, which already holds the Drive session; the Vercel plan
// allows no more functions). Each file carries its owner's uid; every list, open and delete checks it, so only
// the account that saved a receipt can see or touch it — not other members, not administrators.
const KEY = 'teamShiftReceiptDraft', DRIVE = 'https://www.googleapis.com/drive/v3/files';
const owned = (meta, uid) => meta?.parents?.includes(MEDIA_FOLDER_ID) && meta.appProperties?.[KEY] === uid;

export async function handleReceiptDraft({ req, res, call, uid, params, now }) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw fault(403, 'アカウントを確認できません。');
  const meta = async id => {
    if (!receiptDraftId(id)) throw fault(400, '一時保存したレシートを確認してください。');
    const value = await (await call(`${DRIVE}/${id}?fields=id,size,mimeType,createdTime,parents,appProperties,trashed&supportsAllDrives=true`)).json();
    if (!owned(value, uid) || value.trashed) throw fault(404, 'この一時保存は見つかりません。保存したアカウントでのみ開けます。');
    return value;
  };
  const list = async () => {
    const q = `'${MEDIA_FOLDER_ID}' in parents and trashed=false and appProperties has { key='${KEY}' and value='${uid}' }`;
    const found = await (await call(`${DRIVE}?q=${encodeURIComponent(q)}&fields=files(id,size,createdTime,parents,appProperties)&orderBy=createdTime%20desc&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true&corpora=allDrives`)).json();
    const files = (found.files || []).filter(file => owned(file, uid)), limit = now() - RECEIPT_DRAFT_DAYS * 86400000;
    const old = files.filter(file => Date.parse(file.createdTime) < limit);
    await Promise.all(old.map(file => trash(file.id).catch(() => {})));
    return files.filter(file => !old.includes(file));
  };
  const trash = id => call(`${DRIVE}/${id}?supportsAllDrives=true`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });

  if (req.method === 'GET') {
    const id = params.get('id');
    if (!id) return res.status(200).json({ drafts: (await list()).map(file => ({ id: file.id, savedAt: file.createdTime, bytes: Number(file.size) || 0 })) });
    const file = await meta(id);
    if (Number(file.size) > RECEIPT_DRAFT_BYTES) throw fault(413, '画像が大きすぎます。');
    const data = Buffer.from(await (await call(`${DRIVE}/${id}?alt=media&supportsAllDrives=true`)).arrayBuffer());
    let mime; try { mime = receiptDraftMime(data); } catch (e) { throw fault(400, e.message); }
    res.setHeader('Content-Type', mime); res.setHeader('Content-Disposition', 'inline; filename=receipt');
    return res.status(200).send(data);
  }
  if (req.body?.action === 'delete') { await meta(req.body.id); await trash(req.body.id); return res.status(200).json({ deleted: true }); }
  if (req.body?.action !== 'save') throw fault(400, '操作を確認してください。');
  const base64 = req.body.base64;
  if (typeof base64 !== 'string' || base64.length > Math.ceil(RECEIPT_DRAFT_BYTES / 3) * 4 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw fault(400, '画像のデータを確認してください。');
  const bytes = Buffer.from(base64, 'base64');
  let mime; try { mime = receiptDraftMime(bytes); } catch (e) { throw fault(400, e.message); }
  if ((await list()).length >= RECEIPT_DRAFT_MAX) throw fault(409, `一時保存は1人${RECEIPT_DRAFT_MAX}件までです。入力が終わったものを削除してから保存してください。`);
  const stamp = new Date(now()).toISOString(), name = `receipt_${japanToday(stamp)}_${japanTime(stamp, true).replaceAll(':', '')}.${mime === 'image/png' ? 'png' : 'jpg'}`;
  const boundary = 'teamshift_' + randomBytes(16).toString('hex'), metadata = { name, parents: [MEDIA_FOLDER_ID], appProperties: { [KEY]: uid } };
  const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--`)]);
  const file = await (await call('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,size,createdTime', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body })).json();
  if (!receiptDraftId(file.id)) throw fault(503, '一時保存の結果を確認できません。');
  return res.status(200).json({ draft: { id: file.id, savedAt: file.createdTime || stamp, bytes: bytes.length } });
}
