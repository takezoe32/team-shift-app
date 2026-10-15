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
  const requiredRows = Math.max(43, media.length + 2);
  const rows = [{ values: [literal('画像・動画')] }, { values: ['タスク', '担当者（苗字）', '保存ファイル'].map(literal) }];
  for (const item of media) rows.push({ values: [literal(item.task), literal(item.names), formula(`=HYPERLINK(${quote(item.savedUrl)},${quote(item.imageName || (item.mediaType === 'video' ? '動画を開く' : '画像を開く'))})`)] });
  return [
    { updateSheetProperties: { properties: { sheetId, gridProperties: { columnCount: Math.max(35, columnCount), rowCount: Math.max(rowCount, requiredRows) } }, fields: 'gridProperties.columnCount,gridProperties.rowCount' } },
    // Clear the old separate image/video tables as well as stale rows.
    { updateCells: { range: { sheetId, startRowIndex: 0, endRowIndex: Math.max(rowCount, requiredRows), startColumnIndex: 32, endColumnIndex: Math.max(35, columnCount) }, rows, fields: 'userEnteredValue,userEnteredFormat' } },
    { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: 2, startColumnIndex: 32, endColumnIndex: 35 }, cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.9, green: 0.95, blue: 1 } } }, fields: 'userEnteredFormat.textFormat.bold,userEnteredFormat.backgroundColor' } },
    { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 32, endIndex: 35 }, properties: { pixelSize: 180 }, fields: 'pixelSize' } },
    { repeatCell: { range: { sheetId, startRowIndex: 0, endRowIndex: requiredRows, startColumnIndex: 32, endColumnIndex: 35 }, cell: { userEnteredFormat: { wrapStrategy: 'WRAP', verticalAlignment: 'TOP', textFormat: { fontSize: 10 } } }, fields: 'userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment,userEnteredFormat.textFormat.fontSize' } }
  ];
}

export function taskAttachmentRequests(sheetId, report, media, page = 0) {
  const requests = [];
  for (const [items, start, count, column] of [[report.entries, 13, 22, 3], [report.handoff || [], 5, 8, 2]]) {
    for (let i = 0; i < count; i++) {
      const entry = items[page * count + i];
      const attachment = entry && media.find(item => item.taskKey === entry.key);
      requests.push({ repeatCell: {
        range: { sheetId, startRowIndex: start + i, endRowIndex: start + i + 1, startColumnIndex: column, endColumnIndex: column + 1 },
        cell: { userEnteredFormat: { textFormat: { link: attachment ? { uri: attachment.savedUrl } : {} } } },
        fields: 'userEnteredFormat.textFormat.link'
      } });
    }
  }
  return requests;
}
