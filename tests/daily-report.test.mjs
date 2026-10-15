import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectDailyReport, reportValueRanges, tokyoDate, REPORT_FOLDER_ID } from '../src/dailyReport.mjs';
import { saveDailyReportToDrive } from '../src/dailyReportDrive.mjs';

test('completion date in Japan is used instead of planned date; private and unfinished tasks excluded', () => {
  const source = { users: { u: { name: '担当者' }, v: { name: '共同担当' } }, teamData: { tasks: { '2026-09-01': { u: [
    { id: 'yes', completed: true, completedAt: '2026-10-14T15:00:00Z', subject: '交換', text: '電球', assigneeIds: ['u', 'v'] },
    { id: 'before', completed: true, completedAt: '2026-10-14T14:59:59Z' },
    { id: 'private', completed: true, completedAt: '2026-10-14T15:00:00Z', visibility: 'private' },
    { id: 'pending', completed: false, completedAt: '2026-10-14T15:00:00Z' },
    { id: 'unknown', completed: true }
  ] } } }, partnerItems: [{ id: 'p', completed: true, completedAt: '2026-10-15T01:00:00Z', partnerName: '業者', content: '確認', assigneeUid: 'u' }] };
  const report = collectDailyReport(source, '2026-10-15');
  assert.equal(report.entries.length, 2); assert.equal(report.unknownDates, 1);
  assert.equal(report.entries[0].names, '担当者・共同担当');
  assert.equal(tokyoDate('2026-10-14T14:59:59Z'), '2026-10-14');
  assert.throws(() => collectDailyReport({}, '2026-02-30'), /日付/);
});

test('RAW range mapping preserves manual sections when omitted and paginates without dropping entries', () => {
  const report = { date: '2026-10-15', entries: Array.from({ length: 25 }, (_, i) => ({ text: '=' + i, names: '担当' })) };
  const map = Object.fromEntries(reportValueRanges(report, {}, '15').map(r => [r.range, r.values[0][0]]));
  assert.equal(map["'15'!D14"], '=0'); assert.equal(map["'15'!D35"], '=21');
  assert.equal(map["'15'!C6"], undefined); assert.equal(map["'15'!T3"], undefined);
  const overflow = Object.fromEntries(reportValueRanges(report, {}, '15-2', 1).map(r => [r.range, r.values[0][0]]));
  assert.equal(overflow["'15-2'!D14"], '=22'); assert.equal(overflow["'15-2'!D17"], '');
});

const response = (value, status = 200) => ({ ok: status < 400, status, json: async () => value });
test('Drive save reuses monthly file, creates visible overflow sheets, writes RAW, verifies readback', async () => {
  const calls = [];
  const fetcher = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.includes('/drive/v3/files/' + REPORT_FOLDER_ID)) return response({ mimeType: 'application/vnd.google-apps.folder', capabilities: { canAddChildren: true } });
    if (url.includes('/drive/v3/files?q=')) return response({ files: [{ id: 'month', name: 'month', mimeType: 'application/vnd.google-apps.spreadsheet' }] });
    if (url.includes('?fields=spreadsheetUrl')) return response({ spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/month/edit', sheets: [{ properties: { title: '_様式', sheetId: 1, hidden: true } }, { properties: { title: '15', sheetId: 2 } }] });
    if (url.includes('/values/') && !url.endsWith('batchUpdate')) return response({ values: [['2026年']] });
    return response({});
  };
  const saved = await saveDailyReportToDrive('fake-token', { date: '2026-10-15', entries: Array.from({ length: 25 }, (_, i) => ({ text: '作業' + i, names: '担当' })) }, {}, fetcher);
  assert.equal(saved.count, 25);
  assert.equal(calls.filter(c => c.url.includes('upload/')).length, 0);
  const batches = calls.filter(c => c.url.endsWith(':batchUpdate')).map(c => JSON.parse(c.options.body));
  assert.equal(batches[0].requests[0].duplicateSheet.newSheetName, '15-2');
  assert.equal(batches[0].requests[1].updateSheetProperties.properties.hidden, false);
  const values = JSON.parse(calls.find(c => c.url.endsWith('/values:batchUpdate')).options.body);
  assert.equal(values.valueInputOption, 'RAW');
  assert.equal(values.data.find(r => r.range === "'15-2'!D14").values[0][0], '作業22');
});

test('inaccessible folder prevents any creation or data write', async () => {
  let calls = 0;
  await assert.rejects(() => saveDailyReportToDrive('fake-token', { date: '2026-10-15', entries: [] }, {}, async () => { calls++; return response({ error: {} }, 404); }), /フォルダ/);
  assert.equal(calls, 1);
});

test('first monthly save imports the clean template as a native Sheet into only the configured folder', async () => {
  let uploaded;
  const fetcher = async (url, options = {}) => {
    if (url.includes('/drive/v3/files/' + REPORT_FOLDER_ID)) return response({ mimeType: 'application/vnd.google-apps.folder', capabilities: { canAddChildren: true } });
    if (url.includes('/drive/v3/files?q=')) return response({ files: [] });
    if (url === '/templates/daily-report.xlsx') return { ok: true, blob: async () => new Blob(['template-bytes']) };
    if (url.includes('/upload/drive/')) { uploaded = await options.body.text(); return response({ id: 'created', name: '2026-10 施設管理日誌' }); }
    if (url.includes('?fields=spreadsheetUrl')) return response({ spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/created/edit', sheets: [{ properties: { title: '_様式', sheetId: 1 } }] });
    if (url.includes('/values/') && !url.endsWith('batchUpdate')) return response({ values: [['2026年']] });
    return response({});
  };
  await saveDailyReportToDrive('fake-token', { date: '2026-10-15', entries: [] }, {}, fetcher);
  assert.ok(uploaded.includes('"mimeType":"application/vnd.google-apps.spreadsheet"'));
  assert.ok(uploaded.includes(`"parents":["${REPORT_FOLDER_ID}"]`));
  assert.ok(uploaded.includes('"teamShiftReportMonth":"2026-10"'));
  assert.ok(uploaded.includes('template-bytes'));
  assert.ok(!uploaded.includes('fake-token'));
});
