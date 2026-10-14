import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planCompletedTaskDelete } from '../src/completedTaskDelete.mjs';

test('completed member deletion preserves consumption and concurrent records', () => {
  const entry = { type: 'member', date: '2026-10-14', ownerUid: 'u', id: 't' };
  const data = { teamData: { tasks: { [entry.date]: { u: [{ id: 't', completed: true, inventoryDeducted: true }, { id: 'new' }], v: [{ id: 'other' }] } } }, inventoryItems: [{ stock: 3 }], inventoryMovements: [{ id: 'used' }] };
  const plan = planCompletedTaskDelete(data, entry);
  assert.deepEqual(Object.keys(plan.updates), ['teamData.tasks.2026-10-14.u']);
  assert.deepEqual(plan.teamData.tasks[entry.date].u, [{ id: 'new' }]);
  assert.deepEqual(plan.teamData.tasks[entry.date].v, [{ id: 'other' }]);
  assert.equal(data.inventoryItems[0].stock, 3);
  assert.equal(data.inventoryMovements.length, 1);
  assert.equal(planCompletedTaskDelete({ ...data, teamData: plan.teamData }, entry), null);
});

test('partner history deletion preserves other latest records and is idempotent', () => {
  const entry = { type: 'partner', id: 'p' };
  const plan = planCompletedTaskDelete({ partnerItems: [{ id: 'p', completed: true, updates: [{ text: 'note' }] }, { id: 'new' }] }, entry);
  assert.deepEqual(plan.updates, { partnerItems: [{ id: 'new' }] });
  assert.equal(planCompletedTaskDelete(plan, entry), null);
});

test('a concurrently reopened task cannot be deleted as history', () => {
  assert.throws(() => planCompletedTaskDelete({ partnerItems: [{ id: 'p', completed: false }] }, { type: 'partner', id: 'p' }), /未完了/);
  assert.throws(() => planCompletedTaskDelete({ teamData: { tasks: { d: { u: [{ id: 't', completed: false }] } } } }, { type: 'member', date: 'd', ownerUid: 'u', id: 't' }), /未完了/);
});
