import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MEDIA_FOLDER_ID } from '../src/dailyReport.mjs';
import { archiveReportMedia, mediaSheetRequests } from '../src/dailyReportMedia.mjs';

test('archives original binary in the specified Drive folder without forwarding the Google token to Cloudinary', async () => {
  const calls = [];
  const report = { date: '2026-10-14', media: [{ imageUrl: 'https://res.cloudinary.com/demo/video/upload/test.mp4', imageName: '動画.mp4', mediaType: 'video' }] };
  const call = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/files/' + MEDIA_FOLDER_ID)) return { mimeType: 'application/vnd.google-apps.folder', capabilities: { canAddChildren: true } };
    if (options?.method === 'POST' && !url.includes('/upload/')) return { id: 'month-folder' };
    return url.includes('/upload/') ? { id: 'saved' } : { files: [] };
  };
  const files = await archiveReportMedia(report, call, async (url, options) => { assert.equal(url, report.media[0].imageUrl); assert.equal(options, undefined); return { ok: true, blob: async () => new Blob(['original-video'], { type: 'video/mp4' }) }; });
  const body = await calls.find(call => call.url.includes('/upload/')).options.body.text();
  assert.ok(body.includes('original-video')); assert.ok(body.includes('"parents":["month-folder"]')); assert.ok(!body.includes('secret'));
  assert.equal(files[0].savedUrl, 'https://drive.google.com/file/d/saved/view');
});

test('repeat report reuses its archived file and invalid sources cannot trigger downloads', async () => {
  const report = { date: '2026-10-14', media: [{ imageUrl: 'https://res.cloudinary.com/demo/image/upload/a.jpg' }] };
  const saved = await archiveReportMedia(report, async url => url.includes('/files/' + MEDIA_FOLDER_ID) ? { mimeType: 'application/vnd.google-apps.folder', capabilities: { canAddChildren: true } } : { files: [{ id: 'existing', mimeType: 'application/vnd.google-apps.folder' }] }, () => assert.fail('must not reupload'));
  assert.ok(saved[0].savedUrl.includes('existing'));
  await assert.rejects(() => archiveReportMedia({ ...report, media: [{ imageUrl: 'https://untrusted.example/file' }] }, async url => url.includes('/files/' + MEDIA_FOLDER_ID) ? { mimeType: 'application/vnd.google-apps.folder', capabilities: { canAddChildren: true } } : { files: [{ id: 'month', mimeType: 'application/vnd.google-apps.folder' }] }, () => assert.fail()), /保存元/);
});

test('right-hand same-sheet sections use literal text, explicit media formulas, grow grids and clear stale rows', () => {
  const media = [{ imageUrl: 'https://res.cloudinary.com/demo/image/upload/a.jpg', savedUrl: 'https://drive.google.com/file/d/a/view', task: '=dangerous', names: '担当', imageName: '画像.jpg' }, { imageUrl: 'https://res.cloudinary.com/demo/video/upload/a.mp4', savedUrl: 'https://drive.google.com/file/d/b/view', mediaType: 'video' }];
  const requests = mediaSheetRequests(7, media, 43, 32);
  assert.equal(requests[0].updateSheetProperties.properties.gridProperties.columnCount, 42);
  const tables = requests.filter(item => item.updateCells).map(item => item.updateCells);
  assert.ok(tables.every(item => item.range.sheetId === 7));
  assert.deepEqual(tables.map(item => item.range.startColumnIndex), [32, 38]);
  assert.equal(tables[0].rows[2].values[0].userEnteredValue.stringValue, '=dangerous');
  assert.ok(tables[0].rows[2].values[4].userEnteredValue.formulaValue.startsWith('=IMAGE('));
  assert.ok(tables[1].rows[2].values[3].userEnteredValue.formulaValue.includes('HYPERLINK'));
  assert.equal(mediaSheetRequests(7, [], 100, 42).find(item => item.updateCells).updateCells.range.endRowIndex, 100);
});


test('moves an existing report attachment into the monthly media folder without downloading or copying it', async () => {
  const calls = [];
  const call = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/files/' + MEDIA_FOLDER_ID)) return { mimeType: 'application/vnd.google-apps.folder', capabilities: { canAddChildren: true } };
    if (options?.method === 'PATCH') return { id: 'legacy' };
    const query = decodeURIComponent(url);
    if (query.includes("name='2026-10'")) return { files: [{ id: 'month', mimeType: 'application/vnd.google-apps.folder' }] };
    return { files: query.includes('teamShiftMediaDate') ? [{ id: 'legacy' }] : [] };
  };
  const saved = await archiveReportMedia({ date: '2026-10-14', media: [{ imageUrl: 'https://res.cloudinary.com/demo/image/upload/a.jpg' }] }, call, () => assert.fail('must reuse the original Drive file'));
  assert.equal(saved[0].savedUrl, 'https://drive.google.com/file/d/legacy/view');
  assert.ok(calls.find(call => call.options?.method === 'PATCH').url.includes('addParents=month&removeParents=1WeUCx0SPcPLXLEzqyNhaMAod22TBjoBO'));
  assert.equal(calls.filter(call => call.options?.method === 'POST').length, 0);
});

test('a media folder without write access stops before creating any monthly folders or files', async () => {
  let calls = 0;
  await assert.rejects(() => archiveReportMedia({ date: '2026-10-14', media: [{}] }, async () => { calls++; return { mimeType: 'application/vnd.google-apps.folder', capabilities: { canAddChildren: false } }; }, () => assert.fail()), /権限/);
  assert.equal(calls, 1);
});
