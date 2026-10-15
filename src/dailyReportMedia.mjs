import { REPORT_FOLDER_ID, MEDIA_FOLDER_ID } from './dailyReport.mjs';

// Copy attachments into Drive so deleting the original task cannot remove the report's files.
export async function archiveReportMedia(report, call, fetcher) {
  if (!(report.media || []).length) return [];
  const root = await call(`https://www.googleapis.com/drive/v3/files/${MEDIA_FOLDER_ID}?fields=id,mimeType,capabilities&supportsAllDrives=true`);
  if (root.mimeType !== 'application/vnd.google-apps.folder' || !root.capabilities?.canAddChildren) throw new Error('画像・動画の保存先フォルダにファイルを追加する権限がありません。');
  const month = report.date.slice(0, 7);
  const folderQuery = `'${MEDIA_FOLDER_ID}' in parents and trashed=false and name='${month}'`;
  const folders = await call(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id,mimeType)&supportsAllDrives=true&includeItemsFromAllDrives=true`);
  if (folders.files?.length > 1) throw new Error('画像・動画の月別フォルダが重複しています。保存先を確認してください。');
  let folder = folders.files?.[0];
  if (folder && folder.mimeType !== 'application/vnd.google-apps.folder') throw new Error('画像・動画の月別保存先がフォルダではありません。');
  if (!folder) folder = await call('https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: month, mimeType: 'application/vnd.google-apps.folder', parents: [MEDIA_FOLDER_ID] }) });
  const saved = [];
  for (const media of report.media || []) {
    let source;
    try { source = new URL(media.imageUrl); } catch { throw new Error('添付ファイルのURLが不正です。'); }
    if (source.protocol !== 'https:' || source.hostname !== 'res.cloudinary.com') throw new Error('添付ファイルの保存元を確認できません。');
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source.href));
    const key = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
    const query = `'${folder.id}' in parents and trashed=false and appProperties has { key='teamShiftMediaKey' and value='${key}' }`;
    const found = await call(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,webViewLink)&supportsAllDrives=true&includeItemsFromAllDrives=true`);
    let file = found.files?.[0];
    if (!file) {
      // Move the already archived file instead of creating another copy.
      const legacyQuery = `'${REPORT_FOLDER_ID}' in parents and trashed=false and appProperties has { key='teamShiftMediaDate' and value='${report.date}' } and appProperties has { key='teamShiftMediaKey' and value='${key}' }`;
      const legacy = await call(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(legacyQuery)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`);
      if (legacy.files?.[0]) {
        file = await call(`https://www.googleapis.com/drive/v3/files/${legacy.files[0].id}?addParents=${folder.id}&removeParents=${REPORT_FOLDER_ID}&fields=id&supportsAllDrives=true`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appProperties: { teamShiftMediaMonth: month, teamShiftMediaDate: report.date, teamShiftMediaKey: key } }) });
      }
    }
    if (!file) {
      // Never send the user's Google token to the attachment host.
      const response = await fetcher(source.href);
      if (!response.ok) throw new Error('添付ファイルを取得できませんでした。日報を再作成してください。');
      const blob = await response.blob();
      if (!/^(image|video)\//.test(blob.type)) throw new Error('添付ファイルが画像・動画として取得できませんでした。');
      const name = media.imageName || source.pathname.split('/').at(-1) || (media.mediaType === 'video' ? '動画' : '画像');
      const metadata = { name: `${report.date}_${name}`, parents: [folder.id], mimeType: blob.type, appProperties: { teamShiftMediaDate: report.date, teamShiftMediaMonth: month, teamShiftMediaKey: key } };
      const boundary = 'teamshift_media_' + crypto.randomUUID();
      const body = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${blob.type}\r\n\r\n`, blob, `\r\n--${boundary}--`]);
      file = await call('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
    }
    saved.push({ ...media, savedUrl: `https://drive.google.com/file/d/${file.id}/view` });
  }
  return saved;
}
const literal = value => ({ userEnteredValue: { stringValue: String(value || '') } });
const formula = value => ({ userEnteredValue: { formulaValue: value } });
const quote = value => '"' + value.replaceAll('"', '""') + '"';
export function mediaSheetRequests(sheetId, media, rowCount = 1000, columnCount = 32) {
  const images = media.filter(item => item.mediaType !== 'video');
  const videos = media.filter(item => item.mediaType === 'video');
  const requiredRows = Math.max(43, images.length + 2, videos.length + 2);
  const requests = [{ updateSheetProperties: { properties: { sheetId, gridProperties: { columnCount: Math.max(42, columnCount), rowCount: Math.max(rowCount, requiredRows) } }, fields: 'gridProperties.columnCount,gridProperties.rowCount' } }];
  for (const [items, start, title] of [[images, 32, '画像'], [videos, 38, '動画']]) {
    const rows = [{ values: [literal(title)] }, { values: ['タスク', 'ファイル名', '担当者', '保存ファイル', ...(title === '画像' ? ['プレビュー'] : [])].map(literal) }];
    for (const item of items) rows.push({ values: [literal(item.task), literal(item.imageName || title), literal(item.names), formula(`=HYPERLINK(${quote(item.savedUrl)},${quote(title + 'を開く')})`), ...(title === '画像' ? [formula(`=IMAGE(${quote(item.imageUrl)})`)] : [])] });
    // The full range also clears stale attachment rows when a report is regenerated.
    requests.push({ updateCells: { range: { sheetId, startRowIndex: 0, endRowIndex: Math.max(rowCount, requiredRows), startColumnIndex: start, endColumnIndex: start + (title === '画像' ? 5 : 4) }, rows, fields: 'userEnteredValue' } });
    requests.push({ repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 2, startColumnIndex: start, endColumnIndex: start + (title === '画像' ? 5 : 4) }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.9, green: 0.95, blue: 1 } } }, fields: 'userEnteredFormat.textFormat.bold,userEnteredFormat.backgroundColor' } });
    requests.push({ updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: start, endIndex: start + (title === '画像' ? 5 : 4) }, properties: { pixelSize: 160 }, fields: 'pixelSize' } });
    requests.push({ repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: requiredRows, startColumnIndex: start, endColumnIndex: start + (title === '画像' ? 5 : 4) }, cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'TOP' } }, fields: 'userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment' } });
  }
  return requests;
}
