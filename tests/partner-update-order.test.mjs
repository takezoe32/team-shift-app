import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newestPartnerUpdates } from '../src/partnerUpdateOrder.mjs';
test('newest update appears first without modifying the stored history', () => {
  const updates = [{ id: 'latest', createdAt: '2026-10-16T03:00:00Z' }, { id: 'initial', createdAt: '2026-10-15T03:00:00Z' }, { id: 'middle', createdAt: '2026-10-16T02:00:00Z' }];
  assert.deepEqual(newestPartnerUpdates(updates).map(item => item.id), ['latest', 'middle', 'initial']);
  assert.deepEqual(updates.map(item => item.id), ['latest', 'initial', 'middle']);
});
test('same-time or undated notes prefer the last appended note and ignore nulls', () => {
  assert.deepEqual(newestPartnerUpdates([{ id: 'old' }, null, { id: 'new' }]).map(item => item.id), ['new', 'old']);
  assert.deepEqual(newestPartnerUpdates(undefined), []);
});
