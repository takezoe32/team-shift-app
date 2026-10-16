import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPartnerOverdue } from '../src/partnerOverdue.mjs';
test('only tasks past their scheduled time receive the overdue mark in Japan time', () => {
  const now = Date.parse('2026-10-16T09:30:00+09:00');
  assert.equal(isPartnerOverdue({ date: '2026-10-16', time: '09:15' }, now), true);
  assert.equal(isPartnerOverdue({ date: '2026-10-16', time: '09:30' }, now), false);
  assert.equal(isPartnerOverdue({ date: '2026-10-16', time: '09:45' }, now), false);
  assert.equal(isPartnerOverdue({ date: '2026-10-17', time: '09:00' }, now), false);
  assert.equal(isPartnerOverdue({ date: '2026-10-15', time: '09:00' }, now), true);
});
test('end time takes precedence; completed or undated tasks are never overdue', () => {
  const now = Date.parse('2026-10-16T09:30:00+09:00');
  assert.equal(isPartnerOverdue({ date: '2026-10-16', time: '09:00', endTime: '10:00' }, now), false);
  assert.equal(isPartnerOverdue({ date: '2026-10-15', completed: true }, now), false);
  assert.equal(isPartnerOverdue({}, now), false);
  assert.equal(isPartnerOverdue({ date: '2026-10-16' }, now), false);
  assert.equal(isPartnerOverdue({ date: '2026-10-15' }, now), true);
});
