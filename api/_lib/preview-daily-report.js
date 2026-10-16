import { collectDailyReport, REPORT_FOLDER_ID } from '../../src/dailyReport.mjs';
import { fault } from './report-auth.js';

export async function previewDailyReport({ store, client, date, fields, fetcher }) {
  const report = collectDailyReport(await store.source(), date);
  const connection = await store.get();
  if (!connection?.refreshToken || connection.needsReconnect) throw fault(409, 'Google Driveを再連携してください。', 'RECONNECT_REQUIRED');
  client.setCredentials({ refresh_token: connection.refreshToken });
  const access = (await client.getAccessToken()).token;
  const get = async url => {
    const response = await fetcher(url, { headers: { Authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw fault(503, '保存済みの日報を確認できませんでした。時間をおいて再実行してください。');
    return response.json();
  };
  const month = date.slice(0, 7);
  const query = `'${REPORT_FOLDER_ID}' in parents and trashed=false and appProperties has { key='teamShiftReportMonth' and value='${month}' }`;
  const found = await get(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`);
  const preserved = {};
  if (found.files?.length) {
    const id = found.files[0].id;
    const day = String(Number(date.slice(8)));
    const spreadsheet = await get(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties`);
    if (spreadsheet.sheets?.some(sheet => sheet.properties.title === day)) {
      const result = await get(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchGet?ranges=${encodeURIComponent(`'${day}'!AA5`)}&ranges=${encodeURIComponent(`'${day}'!AF8`)}&ranges=${encodeURIComponent(`'${day}'!C40:C42`)}`);
      const values = result.valueRanges || [];
      preserved.weather = String(values[0]?.values?.[0]?.[0] || '').replace(/^天候[：:]/, '');
      preserved.chlorine = String(values[1]?.values?.[0]?.[0] ?? '');
      preserved.remarks = (values[2]?.values || []).map(row => row[0] ?? '').join('\n');
    }
  }
  return { report, fields: { ...preserved, ...fields } };
}
