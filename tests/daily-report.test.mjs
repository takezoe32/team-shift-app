import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectDailyReport, reportValueRanges, tokyoDate, REPORT_FOLDER_ID, reportPageCount, MEDIA_FOLDER_ID, reportSurname } from '../src/dailyReport.mjs';
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
  assert.equal(report.entries.length, 1); assert.equal(report.visitors.length, 1); assert.equal(report.unknownDates, 1);
  assert.equal(report.entries[0].names, '担当者・共同担当');
  assert.equal(tokyoDate('2026-10-14T14:59:59Z'), '2026-10-14');
  assert.throws(() => collectDailyReport({}, '2026-02-30'), /日付/);
});

test('RAW range mapping preserves manual sections when omitted and paginates without dropping entries', () => {
  const report = { date: '2026-10-15', entries: Array.from({ length: 25 }, (_, i) => ({ text: '=' + i, names: '担当' })) };
  const map = Object.fromEntries(reportValueRanges(report, {}, '15').map(r => [r.range, r.values[0][0]]));
  assert.equal(map["'15'!D14"], '=0'); assert.equal(map["'15'!D35"], '=21');
  assert.equal(map["'15'!C6"], ''); assert.equal(map["'15'!T3"], ''); assert.equal(map["'15'!C40"], undefined);
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


test('attendance follows the selected day and user order, excluding leave, courses and unknown shifts', () => {
  const users = Object.fromEntries(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(id => [id, { name: id }]));
  const report = collectDailyReport({ users, userOrder: ['b', 'a'], shiftTypes: [{ id: 'early', label: '早番' }, { id: 'leave', label: '有休' }], teamData: { shifts: { '2026-10-14': { a: 'work', b: 'early', c: 'off', d: 'course', e: 'leave', f: 'none', g: 'deleted', missing: 'work' }, '2026-10-15': { c: 'work' } } } }, '2026-10-14');
  assert.deepEqual(report.staff, ['b', 'a']);
});

test('handoff includes overdue and same-day unfinished work and partners; future, private and later-created work excluded', () => {
  const source = { users: { u: { name: '担当' } }, teamData: { tasks: {
    '2026-10-13': { u: [{ id: 'overdue', text: '持越し' }, { id: 'nextday', text: '翌日完了', completed: true, completedAt: '2026-10-15T00:09:00Z' }, { id: 'private', text: '個人', visibility: 'private' }, { id: 'later', text: '翌日登録', createdAt: '2026-10-15T00:00:00Z' }] },
    '2026-10-14': { u: [{ id: 'today', text: '当日未完了' }, { id: 'finished', text: '当日完了', completed: true, completedAt: '2026-10-14T02:00:00Z' }] },
    '2026-10-15': { u: [{ id: 'future', text: '未来' }] }
  } }, partnerItems: [{ id: 'pending', date: '2026-10-14', partnerName: '未完業者' }, { id: 'done', date: '2026-10-13', partnerName: '終了業者', completed: true, completedAt: '2026-10-14T04:00:00Z' }] };
  const report = collectDailyReport(source, '2026-10-14');
  assert.equal(report.handoff.length, 4); assert.equal(report.entries.length, 1); assert.equal(report.visitors.length, 1);
  assert.ok(report.handoff.some(entry => entry.text.includes('翌日完了')));
  assert.ok(report.visitors[0].text.includes('終了業者')); assert.ok(report.handoff.every(item => !item.text.includes('担当：')));
});

test('all automatic sections paginate independently and regeneration clears stale values', () => {
  const report = { date: '2026-10-14', entries: [], staff: ['甲', '乙'], handoff: Array.from({ length: 10 }, (_, i) => ({ text: '引継' + i })), visitors: Array.from({ length: 9 }, (_, i) => ({ text: '業者' + i })) };
  assert.equal(reportPageCount(report), 3);
  const map = Object.fromEntries(reportValueRanges(report, {}, '14-3', 2).map(item => [item.range, item.values[0][0]]));
  assert.equal(map["'14-3'!C36"], '業者8'); assert.equal(map["'14-3'!C37"], ''); assert.equal(map["'14-3'!C6"], ''); assert.equal(map["'14-3'!T3"], '甲');
});

test('attachments include legacy and update files once, exclude personal and future tasks', () => {
  const image = { imageUrl: 'https://res.cloudinary.com/demo/image/upload/a.jpg', imageName: '画像.jpg' };
  const video = { imageUrl: 'https://res.cloudinary.com/demo/video/upload/a.mp4', imageName: '動画.mp4', mediaType: 'video' };
  const report = collectDailyReport({ teamData: { tasks: { '2026-10-14': { u: [{ id: 'one', completed: true, completedAt: '2026-10-14T01:00:00Z', ...image, images: [image], updates: [{ images: [video], createdAt: '2026-10-14T01:00:00Z' }] }, { id: 'private', visibility: 'private', images: [{ imageUrl: 'secret' }] }] } } } }, '2026-10-14');
  assert.deepEqual(report.media.map(item => item.imageName), ['画像.jpg', '動画.mp4']);
});

test('visitor overflow creates continuation sheets and the original video is archived and linked on the first sheet', async () => {
  const calls = [];
  const fetcher = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.startsWith('https://res.cloudinary.com/')) { assert.equal(options.headers, undefined); return { ok: true, blob: async () => new Blob(['video'], { type: 'video/mp4' }) }; }
    if (url.includes('/drive/v3/files/' + REPORT_FOLDER_ID)) return response({ mimeType: 'application/vnd.google-apps.folder', capabilities: { canAddChildren: true } });
    if (url.includes('/drive/v3/files/' + MEDIA_FOLDER_ID)) return response({ mimeType: 'application/vnd.google-apps.folder', capabilities: { canAddChildren: true } });
    if (url.includes('/drive/v3/files?q=')) {
      const query = decodeURIComponent(url);
      return response({ files: query.includes('teamShiftMediaKey') ? [] : query.includes("name='2026-10'") ? [{ id: 'media-month', mimeType: 'application/vnd.google-apps.folder' }] : [{ id: 'month', mimeType: 'application/vnd.google-apps.spreadsheet' }] });
    }
    if (url.includes('/upload/drive/')) return response({ id: 'archived-video' });
    if (url.includes('?fields=spreadsheetUrl')) return response({ spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/month/edit', sheets: [{ properties: { title: '_様式', sheetId: 1, hidden: true, gridProperties: { columnCount: 32, rowCount: 43 } } }, { properties: { title: '14', sheetId: 2, gridProperties: { columnCount: 32, rowCount: 43 } } }, { properties: { title: '14-3', sheetId: 3 } }] });
    if (url.includes('/values/') && !url.endsWith('batchUpdate')) return response({ values: [['2026年']] });
    return response({});
  };
  await saveDailyReportToDrive('fake-token', { date: '2026-10-14', entries: [], visitors: Array.from({ length: 5 }, (_, i) => ({ text: '業者' + i })), handoff: [], media: [{ imageUrl: 'https://res.cloudinary.com/demo/video/upload/test.mp4', mediaType: 'video', imageName: '動画.mp4' }] }, {}, fetcher);
  const batches = calls.filter(call => call.url.endsWith(':batchUpdate')).map(call => JSON.parse(call.options.body));
  assert.equal(batches[0].requests[0].duplicateSheet.newSheetName, '14-2');
  const tables = batches[1].requests.filter(item => item.updateCells).map(item => item.updateCells);
  assert.ok(tables.find(item => item.range.sheetId === 2 && item.range.startColumnIndex === 32).rows[2].values[2].userEnteredValue.formulaValue.includes('archived-video'));
  assert.equal(tables.find(item => item.range.sheetId === 3).rows.length, 2);
  const values = JSON.parse(calls.find(call => call.url.endsWith('/values:batchUpdate')).options.body).data;
  assert.equal(values.find(item => item.range === "'14-2'!C36").values[0][0], '業者4');
  assert.equal(values.find(item => item.range === "'14-3'!C36").values[0][0], '');
});


test('staff surname supports registered names, spaces and explicit surname without blind two-character slicing', () => {
  assert.equal(reportSurname({ name: '竹添三剛' }), '竹添');
  assert.equal(reportSurname({ name: '井上珠生' }), '井上');
  assert.equal(reportSurname({ name: '長谷川 太郎' }), '長谷川');
  assert.equal(reportSurname({ name: '小笠原太郎', surname: '小笠原' }), '小笠原');
  assert.equal(reportSurname({ name: '未知の氏名' }), '未知の氏名');
});

test('work and handoff show only titles, with first-line fallback for legacy tasks; attachments use the same title', () => {
  const source = { users: { u: { name: '竹添三剛' } }, teamData: { shifts: { '2026-10-14': { u: 'work' } }, tasks: { '2026-10-14': { u: [
    { id: 'done', subject: '交換', text: '詳しい本文', completed: true, completedAt: '2026-10-14T01:00:00Z', updates: [{ text: '追記' }], images: [{ imageUrl: 'https://res.cloudinary.com/demo/image/upload/a.jpg' }] },
    { id: 'todo', subject: '修理', text: '担当への説明' },
    { id: 'legacy', text: '旧タスクの題名\n詳しい説明' }
  ] } } }, partnerItems: [{ id: 'p', date: '2026-10-14', partnerName: '業者', subject: '点検', content: '詳細' }] };
  const report = collectDailyReport(source, '2026-10-14');
  assert.deepEqual(report.staff, ['竹添']);
  assert.deepEqual(report.entries.map(item => item.text), ['交換']);
  assert.deepEqual(new Set(report.handoff.map(item => item.text)), new Set(['修理', '旧タスクの題名', '点検']));
  assert.equal(report.media[0].task, '交換');
});


test('every registered co-assignee is included by surname, with attachment task identity preserved', () => {
  const report = collectDailyReport({ users: { a: { name: '竹添三剛' }, b: { name: '平川千尋' }, c: { name: '井上珠生' } }, teamData: { tasks: { '2026-10-15': { a: [{ id: 'multi', completed: true, completedAt: '2026-10-15T01:00:00Z', subject: '修理', assigneeIds: ['a', 'b', 'c', 'a'], images: [{ imageUrl: 'https://res.cloudinary.com/demo/a.jpg' }] }] } } } }, '2026-10-15');
  assert.equal(report.entries[0].names, '竹添・平川・井上');
  assert.equal(report.media[0].names, '竹添・平川・井上');
  assert.equal(report.media[0].taskKey, report.entries[0].key);
});

test('date tabs sort numerically with continuations after their day', async () => {
  const { reportSheetOrderRequests } = await import('../src/dailyReportDrive.mjs');
  const requests = reportSheetOrderRequests({ '15-2': 4, '15': 3, '_様式': 9, '2': 2, '1': 1, '14': 5, '14-2': 6 });
  assert.deepEqual(requests.map(r => r.updateSheetProperties.properties.sheetId), [1, 2, 5, 6, 3, 4]);
  assert.deepEqual(requests.map(r => r.updateSheetProperties.properties.index), [0, 1, 2, 3, 4, 5]);
});
