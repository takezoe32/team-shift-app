import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CALENDAR_BLOCKS, normalizeCalendarBlocks, moveCalendarBlock } from '../src/calendarBlocks.mjs';
test('stored layouts recover safely without losing blocks or accepting unknown/duplicate blocks', () => {
  assert.deepEqual(normalizeCalendarBlocks(null), DEFAULT_CALENDAR_BLOCKS);
  assert.deepEqual(normalizeCalendarBlocks(['member', 'member', 'unknown']), ['member', 'memo', 'calendar', 'partner']);
});
test('blocks move in both directions without mutating the current layout', () => {
  const original = [...DEFAULT_CALENDAR_BLOCKS];
  assert.deepEqual(moveCalendarBlock(original, 'memo', 3), ['calendar', 'partner', 'member', 'memo']);
  assert.deepEqual(moveCalendarBlock(original, 'member', 0), ['member', 'memo', 'calendar', 'partner']);
  assert.deepEqual(original, DEFAULT_CALENDAR_BLOCKS);
  assert.deepEqual(moveCalendarBlock(original, 'calendar', 1), original);
});
test('invalid and outside drop positions leave the order intact', () => {
  for (const [id, index] of [['memo', -1], ['memo', 4], ['unknown', 1], ['memo', 1.5]]) assert.deepEqual(moveCalendarBlock(DEFAULT_CALENDAR_BLOCKS, id, index), DEFAULT_CALENDAR_BLOCKS);
});
