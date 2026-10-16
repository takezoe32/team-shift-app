import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectDailyReport, reportValueRanges } from '../src/dailyReport.mjs';
import { reportWorkText, reportWorkLayoutRequests } from '../src/dailyReportWork.mjs';

test('used product model appears between subject and surnames in preview and saved cells', () => {
  const task = { id: 't', subject: '電球交換', completed: true, completedAt: '2026-10-16T14:38:00+09:00', productId: 'p', assigneeIds: ['u', 'v'] };
  const source = { users: { u: { name: '竹添 三剛' }, v: { name: '高橋 信次' } }, inventoryItems: [{ id: 'p', modelNumber: 'ABC-123' }], teamData: { tasks: { '2026-10-16': { u: [task] } } } };
  const report = collectDailyReport(source, '2026-10-16');
  const values = Object.fromEntries(reportValueRanges(report, {}, '16').map(item => [item.range.split('!')[1], item.values[0][0]]));
  assert.equal(values.C14, '14:45');
  assert.equal(values.E14, '電球交換　（ABC-123）　竹添・高橋');
  const written = reportWorkLayoutRequests(1, report.entries).find(item => item.updateCells).updateCells;
  assert.equal(written.rows[0].values[2].userEnteredValue.stringValue, values.E14);
  task.productModelNumber = 'OLD-456';
  assert.equal(collectDailyReport(source, '2026-10-16').entries[0].productModelNumber, 'OLD-456');
});

test('missing product models never produce empty parentheses or infer a model from the name', () => {
  assert.equal(reportWorkText({ text: '電球交換', names: '竹添', productModelNumber: ' ' }), '電球交換　竹添');
  const source = { teamData: { tasks: { '2026-10-16': { u: [{ id: 't', subject: '電球交換', completed: true, completedAt: '2026-10-16T14:38:00+09:00', productName: '型番らしい商品名' }] } } } };
  assert.equal(collectDailyReport(source, '2026-10-16').entries[0].productModelNumber, '');
});
