import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewDailyReport } from '../api/_lib/preview-daily-report.js';
import { previewCells } from '../src/dailyReportPreview.mjs';

test('preview reads retained manual cells using the actual day sheet and explicit fields win', async () => {
  const calls = [];
  const result = await previewDailyReport({
    store: { source: async () => ({}), get: async () => ({ refreshToken: 'private' }) },
    client: { setCredentials() {}, getAccessToken: async () => ({ token: 'private-access' }) },
    date: '2026-10-06', fields: { chlorine: '0' },
    fetcher: async (url, options) => {
      assert.equal(options.method, undefined); calls.push(url);
      return { ok: true, json: async () => url.includes('drive/v3') ? { files: [{ id: 'month' }] } : url.includes('batchGet') ? { valueRanges: [{ values: [['天候：晴れ']] }, { values: [[3]] }, { values: [['一行目'], [], ['三行目']] }] } : { sheets: [{ properties: { title: '6' } }] } };
    }
  });
  assert.equal(calls.length, 3);
  assert.ok(decodeURIComponent(calls[2]).includes("'6'!AA5"));
  assert.deepEqual(result.fields, { weather: '晴れ', chlorine: '0', remarks: '一行目\n\n三行目' });
});
test('template preview uses the Drive writer cell positions and overflow pages', () => {
  const report = { date: '2026-10-16', staff: ['竹添'], entries: Array.from({ length: 23 }, (_, i) => ({ text: '作業' + i, names: '竹添' })), visitors: Array.from({ length: 5 }, (_, i) => ({ text: '業者' + i })), handoff: [{ text: '未終了' }] };
  const first = previewCells(report, { weather: '晴れ', chlorine: '2', remarks: '備考' }, 0);
  assert.equal(first.T3, '竹添'); assert.equal(first.D14, '作業0'); assert.equal(first.AD14, '竹添'); assert.equal(first.C36, '業者0'); assert.equal(first.AF8, '2'); assert.equal(first.C40, '備考');
  const second = previewCells(report, {}, 1);
  assert.equal(second.D14, '作業22'); assert.equal(second.C36, '業者4'); assert.equal(second.D15, '');
});
