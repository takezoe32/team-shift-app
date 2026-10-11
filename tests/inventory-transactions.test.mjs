import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';

// Exercise the actual InventoryView persistence callbacks with Firestore's
// latest snapshot, while the UI has a deliberately stale inventory array.
const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
function setup(initialItems) {
  let data = { inventoryItems: structuredClone(initialItems), inventoryMovements: [] };
  const context = {
    crypto: { randomUUID }, db: {}, currentUser: { id: 'tester', name: 'テスト担当' },
    inventoryItems: [{ id: 'lamp', name: '電球', stock: 1 }],
    normalizeInventoryName: value => String(value || '').normalize('NFKC').trim(),
    doc: () => ({}), arrayUnion: movement => ({ movement }),
    setInventoryItems() {}, setInventoryMovements() {},
    runTransaction: async (_db, callback) => {
      let pending;
      const result = await callback({
        get: async () => ({ exists: () => true, data: () => structuredClone(data) }),
        update: (_ref, update) => { pending = update; },
      });
      if (pending) data = { ...data, inventoryItems: pending.inventoryItems, inventoryMovements: [...data.inventoryMovements, pending.inventoryMovements.movement] };
      return result;
    },
  };
  const callback = name => {
    const start = source.indexOf(`${name}={async`, source.indexOf("activeTab === 'inventory'"));
    assert.ok(start >= 0);
    const body = source.slice(start + name.length + 2, source.indexOf('\n                }}', start)) + '}';
    return vm.runInNewContext(`(${body})`, context);
  };
  return { register: callback('addInventoryItem'), adjust: callback('adjustInventoryStock'), data: () => data };
}
test('stock changes use the latest stored quantity and record the actor', async () => {
  const env = setup([{ id: 'lamp', name: '電球', stock: 10 }]);
  await env.adjust('lamp', 2);
  await env.adjust('lamp', -3);
  assert.equal(env.data().inventoryItems[0].stock, 9);
  assert.deepEqual(env.data().inventoryMovements.map(x => [x.stockBefore, x.delta, x.stockAfter]), [[10, 2, 12], [12, -3, 9]]);
  assert.equal(env.data().inventoryMovements[0].actorUid, 'tester');
});
test('insufficient stock and deleted products fail without a write', async () => {
  const env = setup([{ id: 'lamp', name: '電球', stock: 2 }]);
  await assert.rejects(env.adjust('lamp', -3), /在庫数が不足/);
  await assert.rejects(env.adjust('missing', 1), /見つかりません/);
  assert.equal(env.data().inventoryItems[0].stock, 2);
  assert.equal(env.data().inventoryMovements.length, 0);
});
test('stocktake logs the actual difference; fractional input is rejected', async () => {
  const env = setup([{ id: 'lamp', name: '電球', stock: 10 }]);
  await env.adjust('lamp', 4, true);
  assert.equal(env.data().inventoryMovements[0].delta, -6);
  await assert.rejects(env.adjust('lamp', 1.5), /数量が不正/);
});
test('registration checks the stored JAN and name, not stale UI data', async () => {
  const env = setup([{ id: 'new', name: 'LED電球', barcode: '4549980715123', stock: 3 }]);
  await assert.rejects(env.register({ id: 'duplicate', name: '別の名前', barcode: '4549980715123', stock: 0 }), /すでに登録/);
  await assert.rejects(env.register({ id: 'duplicate', name: 'LED電球', barcode: '', stock: 0 }), /すでに登録/);
  assert.equal(env.data().inventoryItems.length, 1);
  assert.equal(env.data().inventoryMovements.length, 0);
});
