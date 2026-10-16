import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportCompletionTime, reportWorkText, reportWorkHeight, reportWorkLayoutRequests } from '../src/dailyReportWork.mjs';
import { collectDailyReport, reportValueRanges } from '../src/dailyReport.mjs';

test('report time rounds the actual Japan completion time to the nearest quarter hour', () => {
  assert.equal(reportCompletionTime('2026-10-16T14:38:00+09:00'), '14:45');
  assert.equal(reportCompletionTime('2026-10-16T14:32:00+09:00'), '14:30');
  assert.equal(reportCompletionTime('2026-10-16T14:37:30+09:00'), '14:45');
  assert.equal(reportCompletionTime('2026-10-16T05:30:00Z'), '14:30');
  assert.equal(reportCompletionTime('2026-10-16T23:59:00+09:00'), '24:00');
  assert.equal(reportCompletionTime('2026-10-16T00:02:00+09:00'), '00:00');
  assert.equal(reportCompletionTime('invalid'), '');
});
test('completion date and exact stored timestamp stay unchanged across midnight rounding', () => {
  const task = { id: 't', subject: '電球交換', completed: true, completedAt: '2026-10-16T23:59:00+09:00', endTime: '10:00' };
  const report = collectDailyReport({ users: { u: { name: '竹添 三剛' } }, teamData: { tasks: { '2026-10-16': { u: [task] } } } }, '2026-10-16');
  const values = Object.fromEntries(reportValueRanges(report, {}, '16').map(item => [item.range.split('!')[1], item.values[0][0]]));
  assert.equal(values.C14, '24:00'); assert.equal(values.E14, '電球交換　竹添');
  assert.equal(values.AD14, undefined); assert.equal(report.entries[0].completedAt, task.completedAt);
});
test('combined text has readable surnames and one height calculation without narrow assignee cells', () => {
  assert.equal(reportWorkText({ text: '点検', names: '竹添・平川・井上' }), '点検　竹添・平川・井上');
  assert.equal(reportWorkText(), '');
  assert.ok(reportWorkHeight({ text: '長い題名'.repeat(30), names: '竹添・平川' }) > 24);
  const requests = reportWorkLayoutRequests(7, [{ text: '点検', names: '竹添・平川', completedAt: '2026-10-16T14:38:00+09:00' }]);
  assert.ok(requests.every(request => (Object.values(request)[0].range.startRowIndex === 13 && Object.values(request)[0].range.endRowIndex === 35)));
  assert.equal(requests.filter(item => item.mergeCells).length, 2);
  assert.ok(requests.some(item => item.updateBorders?.innerVertical?.style === 'NONE'));
  assert.ok(requests.some(item => item.mergeCells?.range.startColumnIndex === 4 && item.mergeCells.range.endColumnIndex === 31));
  const written = requests.find(item => item.updateCells).updateCells;
  assert.equal(written.rows[0].values[0].userEnteredValue.stringValue, '14:45');
  assert.equal(written.rows[0].values[2].userEnteredValue.stringValue, '点検　竹添・平川');
  assert.equal(written.rows.length, 22);
});
