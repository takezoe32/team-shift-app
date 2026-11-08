import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { METER_USAGE_STATS,meterUsageLimits,meterUsageLevel } from '../src/meterUsageLimits.mjs';
import { METER_FIELDS,meterRow } from '../src/meterReadings.mjs';
import { xlsxCells } from '../api/_lib/xlsx-cells.js';

test('前日比は中央値を超えると黄色、最大値の90%以上で赤（中央値ちょうどは色なし）', () => {
  const limits = meterUsageLimits();
  assert.deepEqual(limits['gas-main'], { warn: 40, alert: 72 });
  assert.equal(meterUsageLevel(40, limits['gas-main']), '');
  assert.equal(meterUsageLevel(41, limits['gas-main']), 'warn');
  assert.equal(meterUsageLevel(71.9, limits['gas-main']), 'warn');
  assert.equal(meterUsageLevel(72, limits['gas-main']), 'alert');
  assert.equal(meterUsageLevel(500, limits['gas-main']), 'alert');
  assert.equal(meterUsageLevel(-3, limits['gas-main']), '');
  assert.equal(limits['electric-reading'].alert, 110.61);
  assert.equal(meterUsageLevel(0.1, limits['h-water']), 'warn');
  assert.equal(meterUsageLevel(5, undefined), '');
});

test('使用量のある毎朝検針の項目だけに基準があり、中央値は最大値の90%より小さい', () => {
  for (const [id, s] of Object.entries(METER_USAGE_STATS)) {
    assert.ok(METER_FIELDS.some(f => f.id === id), id);
    assert.ok(s.median < s.max * 0.9, id);
  }
  for (const id of ['electric-demand', 'tank-1', 'bath-female', 'bubble-8f']) assert.equal(METER_USAGE_STATS[id], undefined);
});

// Optional: the numbers match the real book (METER_TEST_XLSX), 2026/1/1–11/7.
const input = process.env.METER_TEST_XLSX;
test('実際の毎朝検針の原本（1/1〜11/7）の中央値・最大値と一致する', { skip: !input && 'METER_TEST_XLSX が未設定' }, () => {
  const b = xlsxCells(fs.readFileSync(input)), norm = t => t.normalize('NFKC');
  const read = (f, d) => { const m = d.getUTCMonth() + 1, day = d.getUTCDate(), t = b.titles.find(t => norm(t) === (f.section === 'h' ? 'H-' : '') + String(m).padStart(2, '0')), row = meterRow(f.section, day); if (!t || b.get(t, 'B' + row).value !== day) return null; const v = b.get(t, f.column + row).value; return typeof v === 'number' ? v : null; };
  const median = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
  for (const [id, s] of Object.entries(METER_USAGE_STATS)) {
    const f = METER_FIELDS.find(f => f.id === id), usage = [];
    for (let d = Date.UTC(2026, 0, 1); d <= Date.UTC(2026, 10, 7); d += 864e5) {
      const a = read(f, new Date(d)), n = read(f, new Date(d + 864e5)); if (a === null || n === null) continue;
      let diff = n - a; if (id === 'electric-reading' && diff < -50000) diff += 100000; // the meter went around in October
      if (diff >= 0) usage.push(Number(diff.toFixed(6)));
    }
    assert.equal(median(usage), s.median, id + ' median'); assert.equal(Math.max(...usage), s.max, id + ' max');
  }
});
