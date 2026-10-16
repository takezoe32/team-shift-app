import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPartnerTaskAction } from '../src/partnerTaskActions.mjs';

test('completion preserves latest handoffs, attachments and other partner tasks', () => {
  const items = [{ id: 'target', subject: '最新の件名', updates: [{ id: 'new-note' }], images: [{ imageUrl: 'photo' }], completed: false }, { id: 'other' }];
  const next = planPartnerTaskAction(items, 'target', 'complete', '2026-10-16T01:00:00Z');
  assert.deepEqual(next[0], { ...items[0], completed: true, completedAt: '2026-10-16T01:00:00Z' });
  assert.equal(next[1], items[1]); assert.equal(items[0].completed, false);
});

test('a concurrently completed task is not reopened or re-dated', () => {
  assert.equal(planPartnerTaskAction([{ id: 'target', completed: true, completedAt: 'original' }], 'target', 'complete', 'later'), null);
});

test('deletion removes only the target from the current list and retries are harmless', () => {
  const other = { id: 'other', updates: [{ id: 'new-note' }] };
  assert.deepEqual(planPartnerTaskAction([{ id: 'target' }, other], 'target', 'delete'), [other]);
  assert.equal(planPartnerTaskAction([other], 'target', 'delete'), null);
  assert.throws(() => planPartnerTaskAction([other], 'target', 'complete', 'now'), /削除/);
});
