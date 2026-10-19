import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { japanDateTime, japanTime, japanToday } from '../src/japanTime.mjs';
test('Japan midnight uses Gregorian dates and 00:00 rather than 24:00', () => {
  assert.equal(japanDateTime('2026-10-19T15:00:00Z'), '2026/10/20 00:00:00');
  assert.equal(japanTime('2026-10-19T01:05:09Z'), '10:05');
  assert.equal(japanDateTime('2026-10-19T10:05:09'), '2026/10/19 10:05:09');
  assert.equal(japanToday('invalid'), '');
  assert.equal(japanDateTime('invalid'), '--');
});
test('today, displayed timestamps and previous-day navigation agree in Japan, America and Europe', () => {
  for (const timezone of ['Asia/Tokyo', 'America/Los_Angeles', 'Europe/London']) {
    const script = `import { japanToday, japanDateTime, calendarDate } from './src/japanTime.mjs';
      const day = calendarDate('2026-01-01'); day.setDate(day.getDate() - 1);
      console.log(JSON.stringify([japanToday('2025-12-31T15:30:00Z'), japanDateTime('2025-12-31T15:30:00Z'), [day.getFullYear(), day.getMonth()+1, day.getDate()]]));`;
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], { cwd: new URL('..', import.meta.url), env: { ...process.env, TZ: timezone }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), ['2026-01-01', '2026/01/01 00:30:00', [2025, 12, 31]], timezone);
  }
});
