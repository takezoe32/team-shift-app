import test from 'node:test';
import assert from 'node:assert/strict';
import { taskHistoryEntries } from '../src/taskHistory.mjs';
const base = { id: 'task1', date: '2026-10-22', ownerUid: 'a', assigneeIds: ['a', 'b'], images: [{ imageUrl: 'image' }] };
const dailyWork = { '2026-10-27': { completedAt: '2026-10-27T02:18:59Z', actorName: '担当者', note: '取付完了' } };
test('daily completion shows work date, actor and report without completing task', () => {
  const task = { completed: false, dailyWork };
  const [entry] = taskHistoryEntries(base, task);
  assert.equal(entry.historyDate, '2026-10-27');
  assert.equal(entry.historyLabel, '本日分終了');
  assert.equal(entry.completedByName, '担当者');
  assert.equal(entry.content, '取付完了');
  assert.equal(entry.date, '2026-10-22');
  assert.deepEqual(entry.assigneeIds, ['a', 'b']);
  assert.deepEqual(entry.images, []);
  assert.equal(task.completed, false);
});
test('whole completion retains daily reports and uses Japan completion day', () => {
  const entries = taskHistoryEntries({ ...base, completedAt: '2026-10-27T16:00:00Z' }, {
    completed: true, periodStartDate: '2026-10-22', periodEndDate: '2026-10-27', dailyWork,
  });
  assert.equal(entries.length, 2);
  assert.equal(entries[0].historyDate, '2026-10-28');
  assert.equal(entries[0].historyLabel, '全期間終了');
  assert.equal(entries[1].historyDate, '2026-10-27');
});
test('legacy timestamps and empty tasks', () => {
  assert.equal(taskHistoryEntries(base, { completed: true })[0].historyDate, base.date);
  assert.equal(taskHistoryEntries(base, { dailyWork: { '2026-10-23': {} } })[0].historyDate, '2026-10-23');
  assert.deepEqual(taskHistoryEntries(base, {}), []);
});
