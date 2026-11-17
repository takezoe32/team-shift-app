import test from 'node:test';
import assert from 'node:assert/strict';
import { shiftReportDate, collectDailyReport } from '../src/dailyReport.mjs';

test('日報の日付を前日・翌日へ送る（月・年をまたぐ、不正な日付は拒否）', () => {
  assert.equal(shiftReportDate('2026-11-17', -1), '2026-11-16');
  assert.equal(shiftReportDate('2026-11-01', -1), '2026-10-31');
  assert.equal(shiftReportDate('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftReportDate('2026-03-01', -1), '2026-02-28');
  assert.equal(shiftReportDate('2026-11-17', 0), '2026-11-17');
  assert.throws(() => shiftReportDate('2026-02-30', 1));
  assert.throws(() => shiftReportDate('2026-11-1', 1));
});
test('過去の日の日報は、その日に終了したタスクだけを業務に載せ、後日終了したタスクは未終了に残す', () => {
  const source = { users: { a: { name: '竹添 太郎' } }, teamData: { shifts: {}, tasks: { '2026-11-15': { a: [
    { id: '1', subject: '当日終了', completed: true, completedAt: '2026-11-15T03:00:00Z' },
    { id: '2', subject: '翌日終了', completed: true, completedAt: '2026-11-16T03:00:00Z' },
    { id: '3', subject: '私用', visibility: 'private', completed: true, completedAt: '2026-11-15T03:00:00Z' }] } } } };
  const report = collectDailyReport(source, '2026-11-15');
  assert.deepEqual(report.entries.map(e => e.text), ['当日終了']);
  assert.deepEqual(report.handoff.map(e => e.text), ['翌日終了']);
  assert.deepEqual(collectDailyReport(source, '2026-11-16').entries.map(e => e.text), ['翌日終了']);
});
