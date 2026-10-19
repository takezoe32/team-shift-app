import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateLabel, monthDays } from '../src/dateInput.mjs';
test('dates always display Gregorian year/month/day without locale reordering', () => {
  assert.equal(dateLabel('2026-10-19'), '2026/10/19');
  assert.equal(dateLabel('2027-01-02'), '2027/01/02');
  assert.equal(dateLabel(''), '');
});
test('Japanese Sunday-first calendars handle leap years and month boundaries', () => {
  const leap = monthDays(2028, 2);
  assert.equal(leap[0], null);
  assert.equal(leap[2], '2028-02-01');
  assert.equal(leap.filter(Boolean).length, 29);
  assert.equal(monthDays(2027, 2).filter(Boolean).length, 28);
  assert.equal(monthDays(2026, 11)[0], '2026-11-01');
  assert.equal(monthDays(2026, 12).filter(Boolean).at(-1), '2026-12-31');
});
