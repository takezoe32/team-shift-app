import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partnerAssigneeIds } from '../src/partnerAssignees.mjs';
import { collectDailyReport } from '../src/dailyReport.mjs';
test('legacy single partner assignment is retained and multiple assignments deduplicate', () => {
  assert.deepEqual(partnerAssigneeIds({ assigneeUid: 'a' }), ['a']);
  assert.deepEqual(partnerAssigneeIds({ assigneeUid: 'a', assigneeIds: ['b', 'c', 'b'] }), ['b', 'c']);
  assert.deepEqual(partnerAssigneeIds({ assigneeUid: 'a', assigneeIds: [] }), ['a']);
});
test('partner report lists surnames of every assigned member once', () => {
  const report = collectDailyReport({ users: { a: { name: '竹添 三剛' }, b: { name: '高橋 信次' } }, partnerItems: [{ id: 'p', date: '2026-10-16', partnerName: '設備会社', subject: '点検', assigneeUid: 'a', assigneeIds: ['a', 'b'], completed: true, completedAt: '2026-10-16T10:00:00+09:00' }] }, '2026-10-16');
  assert.equal(report.visitors[0].names, '竹添・高橋');
  assert.equal(report.visitors[0].text, '【設備会社】点検（竹添・高橋）');
});
