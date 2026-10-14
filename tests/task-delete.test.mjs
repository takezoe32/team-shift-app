import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTaskDelete } from '../src/taskDelete.mjs';
const movement = { id: 'm1', timestamp: '2026-10-14T00:00:00Z', actorName: '担当者' };
test('deletion uses latest stock, preserves other tasks and restores inventory exactly once', () => {
  const data = { teamData: { tasks: { '2026-10-14': { u: [{ id: 't', productId: 'p', inventoryDeducted: true, inventoryQuantity: 2 }, { id: 'new' }], other: [{ id: 'other' }] } } }, inventoryItems: [{ id: 'p', name: '電球', stock: 8 }, { id: 'q', stock: 5 }], inventoryMovements: [{ id: 'old' }] };
  const plan = planTaskDelete(data, '2026-10-14', 'u', 't', movement);
  assert.deepEqual(plan.teamData.tasks['2026-10-14'].u.map(t => t.id), ['new']);
  assert.equal(plan.teamData.tasks['2026-10-14'].other[0].id, 'other');
  assert.equal(plan.inventoryItems[0].stock, 10); assert.equal(plan.inventoryItems[1].stock, 5);
  assert.equal(plan.inventoryMovements.length, 2); assert.equal(plan.inventoryMovements[1].actorName, '担当者');
  assert.equal(plan.inventoryMovements[1].stockBefore, 8); assert.equal(plan.inventoryMovements[1].stockAfter, 10);
  assert.equal(planTaskDelete({ ...data, ...plan }, '2026-10-14', 'u', 't', movement), null);
  assert.equal(data.inventoryItems[0].stock, 8);
});
test('plain task or personal memo deletion does not change inventory; deleted products are not recreated', () => {
  for (const target of [{ id: 't', visibility: 'private' }, { id: 't', productId: 'missing', inventoryDeducted: true }]) {
    const data = { teamData: { tasks: { d: { u: [target] } } }, inventoryItems: [{ id: 'p', stock: 4 }] };
    const plan = planTaskDelete(data, 'd', 'u', 't', movement);
    assert.equal(plan.restocked, false); assert.equal(plan.updates.inventoryItems, undefined);
    assert.equal(plan.inventoryItems[0].stock, 4);
  }
});
