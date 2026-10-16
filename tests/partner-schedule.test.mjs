import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPartnerSchedule } from '../src/partnerSchedule.mjs';
test('rescheduling changes only date and times while preserving current notes and other tasks', () => {
  const items = [{ id: 'a', subject: '点検', updates: [{ text: '最新の申し送り' }], assigneeUid: 'u', completed: false }, { id: 'b' }];
  const next = planPartnerSchedule(items, 'a', { date: '2026-10-17', time: '09:15', endTime: '' });
  assert.deepEqual(next[0], { ...items[0], date: '2026-10-17', time: '09:15', endTime: '' });
  assert.equal(next[1], items[1]); assert.equal(items[0].date, undefined);
});
test('invalid dates or non-quarter-hour times cannot be saved', () => {
  for (const changes of [{ date: '2026-02-30', time: '09:00' }, { date: '2026-10-17', time: '09:10' }, { date: '2026-10-17', time: '24:00' }, { date: '2026-10-17', time: '09:00', endTime: '10:01' }]) assert.throws(() => planPartnerSchedule([{ id: 'a' }], 'a', changes));
});
test('concurrent completion or deletion prevents rescheduling', () => {
  const changes = { date: '2026-10-17', time: '09:00' };
  assert.throws(() => planPartnerSchedule([{ id: 'a', completed: true }], 'a', changes), /終了済み/);
  assert.throws(() => planPartnerSchedule([], 'a', changes), /見つかりません/);
});
