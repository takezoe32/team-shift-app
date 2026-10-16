import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectDailyReport, reportValueRanges } from '../src/dailyReport.mjs';

test('visitor cells contain only partner, subject and main assignee surname; notes and attachments remain in source', () => {
  const source = { users: { u: { name: '竹添 三剛' } }, partnerItems: [{
    id: 'p', partnerName: '設備会社', subject: '空調点検', assigneeUid: 'u',
    content: '本文は日報欄に出さない', updates: [{ id: 'note', text: '申し送りは日報欄に出さない' }],
    images: [{ imageUrl: 'https://res.cloudinary.com/demo/image/upload/photo.jpg' }],
    completed: true, completedAt: '2026-10-15T14:59:59Z', date: '2026-10-14'
  }, { id: 'today', partnerName: '翌日終了', subject: '対象外', completed: true, completedAt: '2026-10-15T15:00:00Z', date: '2026-10-15' }] };
  const before = structuredClone(source);
  const report = collectDailyReport(source, '2026-10-15');
  assert.equal(report.visitors.length, 1);
  assert.equal(report.visitors[0].text, '【設備会社】空調点検（竹添）');
  const cell = reportValueRanges(report, {}, '15').find(row => row.range.endsWith('!C36'));
  assert.equal(cell.values[0][0], '【設備会社】空調点検（竹添）');
  assert.equal(report.media.length, 1);
  assert.deepEqual(source, before);
});

test('a legacy partner without a subject never falls back to body or handoff text', () => {
  const report = collectDailyReport({ partnerItems: [{ id: 'p', partnerName: '設備会社', content: '本文を件名に流用しない', completed: true, completedAt: '2026-10-15T01:00:00Z' }] }, '2026-10-15');
  assert.equal(report.visitors[0].text, '【設備会社】件名未設定（未割り当て）');
});
