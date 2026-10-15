import { archiveReportMedia, mediaSheetRequests } from './dailyReportMedia.mjs';
import { REPORT_FOLDER_ID, reportValueRanges, reportPageCount } from './dailyReport.mjs';

export async function saveDailyReportToDrive(token, report, fields = {}, fetcher = fetch) {
  const call = async (url, options = {}) => {
    const response = await fetcher(url, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } });
    const data = await response.json();
    if (!response.ok) {
      const reason = data.error?.errors?.[0]?.reason || data.error?.status || '';
      if (response.status === 404) throw new Error('保存先フォルダまたは日報にアクセスできません。指定フォルダを開けるGoogleアカウントを選んでください。');
      if (response.status === 401) throw new Error('Googleの認証が切れました。もう一度「日報作成」を押してください。');
      if (response.status === 403) throw new Error(`Google Driveへの保存が許可されませんでした。フォルダの編集権限と、Google CloudのDrive API・Sheets APIの有効化を確認してください。${reason ? '（' + reason + '）' : ''}`);
      throw new Error(data.error?.message || 'Google Driveへの保存に失敗しました。');
    }
    return data;
  };
  const folder = await call(`https://www.googleapis.com/drive/v3/files/${REPORT_FOLDER_ID}?fields=id,mimeType,capabilities&supportsAllDrives=true`);
  if (folder.mimeType !== 'application/vnd.google-apps.folder' || !folder.capabilities?.canAddChildren) throw new Error('指定の保存先にファイルを追加する権限がありません。');
  const month = report.date.slice(0, 7);
  const query = `'${REPORT_FOLDER_ID}' in parents and trashed=false and appProperties has { key='teamShiftReportMonth' and value='${month}' }`;
  const found = await call(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,webViewLink)&supportsAllDrives=true&includeItemsFromAllDrives=true`);
  if (found.files?.length > 1) throw new Error('この月の日報が複数あります。保存先で重複を確認してください。');
  let file = found.files?.[0];
  if (file && file.mimeType !== 'application/vnd.google-apps.spreadsheet') throw new Error('既存の日報がGoogleスプレッドシートではありません。');
  if (!file) {
    const templateResponse = await fetcher('/templates/daily-report.xlsx');
    if (!templateResponse.ok) throw new Error('日報の様式を読み込めませんでした。');
    const template = await templateResponse.blob();
    const boundary = 'teamshift_' + crypto.randomUUID();
    const metadata = { name: month + ' 施設管理日誌', mimeType: 'application/vnd.google-apps.spreadsheet', parents: [REPORT_FOLDER_ID], appProperties: { teamShiftReportMonth: month } };
    const body = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`, template, `\r\n--${boundary}--`]);
    file = await call('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink&supportsAllDrives=true', { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
  }
  const spreadsheet = await call(`https://sheets.googleapis.com/v4/spreadsheets/${file.id}?fields=spreadsheetUrl,sheets.properties`);
  const template = spreadsheet.sheets.find(sheet => sheet.properties.title === '_様式');
  if (!template) throw new Error('月次日報に様式シートがありません。削除せず残してください。');
  const day = String(Number(report.date.slice(8)));
  const pageCount = reportPageCount(report);
  const existingTitles = spreadsheet.sheets.map(s => s.properties.title);
  const sheetIds = Object.fromEntries(spreadsheet.sheets.map(s => [s.properties.title, s.properties.sheetId]));
  const usedIds = new Set(Object.values(sheetIds));
  const requests = [];
  for (let page = 0; page < pageCount; page++) {
    const title = page === 0 ? day : `${day}-${page + 1}`;
    if (!existingTitles.includes(title)) {
      let id;
      do { id = Math.floor(Math.random() * 2000000000) + 1; } while (usedIds.has(id));
      usedIds.add(id); sheetIds[title] = id;
      requests.push({ duplicateSheet: { sourceSheetId: template.properties.sheetId, newSheetName: title, newSheetId: id } });
      requests.push({ updateSheetProperties: { properties: { sheetId: id, hidden: false }, fields: 'hidden' } });
    }
  }
  if (!template.properties.hidden) requests.push({ updateSheetProperties: { properties: { sheetId: template.properties.sheetId, hidden: true }, fields: 'hidden' } });
  if (requests.length) await call(`https://sheets.googleapis.com/v4/spreadsheets/${file.id}:batchUpdate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requests }) });
  const archivedMedia = await archiveReportMedia(report, call, fetcher);
  const heights = [];
  for (let page = 0; page < pageCount; page++) for (let i = 0; i < 22; i++) {
    const entry = report.entries[page * 22 + i];
    const lines = Math.max(1, ...(entry?.text || '').split('\n').map(line => Math.ceil([...line].length / 42)), Math.ceil([...(entry?.names || '')].length / 2));
    heights.push({ updateDimensionProperties: { range: { sheetId: sheetIds[page === 0 ? day : `${day}-${page + 1}`], dimension: 'ROWS', startIndex: 13 + i, endIndex: 14 + i }, properties: { pixelSize: Math.max(24, lines * 19 + 6) }, fields: 'pixelSize' } });
  }
  for (let page = 0; page < pageCount; page++) {
    const title = page === 0 ? day : `${day}-${page + 1}`;
    const grid = spreadsheet.sheets.find(sheet => sheet.properties.title === title)?.properties.gridProperties || template.properties.gridProperties || {};
    heights.push(...mediaSheetRequests(sheetIds[title], page === 0 ? archivedMedia : [], grid.rowCount, grid.columnCount));
    for (const [field, start, count] of [['handoff', 5, 8], ['visitors', 35, 4]]) for (let i = 0; i < count; i++) {
      const text = report[field]?.[page * count + i]?.text || '';
      const lines = Math.max(1, ...text.split('\n').map(line => Math.ceil([...line].length / 44)));
      heights.push({ updateDimensionProperties: { range: { sheetId: sheetIds[title], dimension: 'ROWS', startIndex: start + i, endIndex: start + i + 1 }, properties: { pixelSize: Math.max(24, lines * 19 + 6) }, fields: 'pixelSize' } });
    }
  }
  for (const title of existingTitles) if (title.startsWith(day + '-') && /^\d+-\d+$/.test(title) && Number(title.split('-')[1]) > pageCount) {
    const grid = spreadsheet.sheets.find(sheet => sheet.properties.title === title).properties.gridProperties || {};
    heights.push(...mediaSheetRequests(sheetIds[title], [], grid.rowCount, grid.columnCount));
  }
  await call(`https://sheets.googleapis.com/v4/spreadsheets/${file.id}:batchUpdate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requests: heights }) });
  const data = [];
  for (let page = 0; page < pageCount; page++) data.push(...reportValueRanges(report, fields, page === 0 ? day : `${day}-${page + 1}`, page));
  // Clear obsolete overflow task rows after regeneration without deleting handwritten sections.
  for (const title of existingTitles) if (title.startsWith(day + '-') && /^\d+-\d+$/.test(title) && Number(title.split('-')[1]) > pageCount) data.push(...reportValueRanges({ ...report, entries: [], staff: [], handoff: [], visitors: [] }, {}, title, 1));
  await call(`https://sheets.googleapis.com/v4/spreadsheets/${file.id}/values:batchUpdate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ valueInputOption: 'RAW', data }) });
  const first = data.find(item => item.range.endsWith('!N5'));
  const check = await call(`https://sheets.googleapis.com/v4/spreadsheets/${file.id}/values/${encodeURIComponent(first.range)}`);
  if (String(check.values?.[0]?.[0]) !== String(first.values[0][0])) throw new Error('日報の保存結果を確認できませんでした。もう一度実行してください。');
  return { id: file.id, url: spreadsheet.spreadsheetUrl, count: report.entries.length, name: file.name };
}
