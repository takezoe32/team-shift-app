import { hasInventoryProductDetails, inventoryProductLabel } from '../src/inventoryProduct.mjs';
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
    hasInventoryProductDetails, inventoryProductLabel,
    crypto: { randomUUID }, db: {}, currentUser: { id: 'tester', name: 'テスト担当' },
    inventoryItems: [{ id: 'lamp', name: '電球', stock: 1 }],
    normalizeInventoryName: value => String(value || '').normalize('NFKC').trim(),
    doc: () => ({}), arrayUnion: movement => ({ movement }),
    setInventoryItems() {}, setInventoryMovements() {}, setTeamData() {},
    runTransaction: async (_db, callback) => {
      let pending;
      const result = await callback({
        get: async () => ({ exists: () => true, data: () => structuredClone(data) }),
        update: (_ref, update) => { pending = update; },
      });
      if (pending) data = { ...data, ...pending, inventoryMovements: pending.inventoryMovements ? [...data.inventoryMovements, pending.inventoryMovements.movement] : data.inventoryMovements };
      return result;
    },
  };
  const callback = name => {
    const start = source.indexOf(`${name}={async`, source.indexOf("activeTab === 'inventory'"));
    assert.ok(start >= 0);
    const body = source.slice(start + name.length + 2, source.indexOf('\n                }}', start)) + '}';
    return vm.runInNewContext(`(${body})`, context);
  };
  return { register: callback('addInventoryItem'), adjust: callback('adjustInventoryStock'), edit: callback('editInventoryItem'), data: () => data };
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
test('registration preserves manufacturer, model number and JAN for reuse', async () => {
  const env = setup([]);
  await env.register({ id: 'lamp', name: 'LED電球', manufacturer: 'パナソニック', modelNumber: 'LDA5L-G', barcode: '4549980715123', stock: 4 });
  const saved = env.data().inventoryItems[0];
  assert.equal(saved.manufacturer, 'パナソニック');
  assert.equal(saved.modelNumber, 'LDA5L-G');
  assert.equal(saved.barcode, '4549980715123');
  assert.equal(saved.stock, 4);
});

for (const field of ['kind', 'name', 'manufacturer', 'modelNumber']) {
  test(`a product can be registered with only ${field}`, async () => {
    const env = setup([]);
    await env.register({ id: 'single', [field]: '入力あり', stock: 0 });
    assert.equal(env.data().inventoryItems.length, 1);
    assert.equal(env.data().inventoryMovements[0].productName, '入力あり');
  });
}
test('empty or whitespace-only details fail even when JAN is provided', async () => {
  const env = setup([]);
  await assert.rejects(env.register({ id: 'empty', kind: '　', name: ' ', manufacturer: '\t', modelNumber: '', barcode: '4549980715123', stock: 0 }), /いずれかを入力/);
  assert.equal(env.data().inventoryItems.length, 0);
});
test('different unnamed products can be registered while duplicate JAN is rejected', async () => {
  const env = setup([]);
  await env.register({ id: 'a', modelNumber: 'A', barcode: '4900000000001', stock: 0 });
  await env.register({ id: 'b', modelNumber: 'B', barcode: '4900000000002', stock: 0 });
  await assert.rejects(env.register({ id: 'c', modelNumber: 'C', barcode: '4900000000001', stock: 0 }), /すでに登録/);
  assert.equal(env.data().inventoryItems.length, 2);
});

 test('registration keeps reusable label photo metadata with the product', async () => {
  const env = setup([]);
  await env.register({ id: 'label-photo', modelNumber: 'LDA-test', stock: 0, imageUrl: 'https://example.com/label.jpg', imageName: 'label.jpg', imagePublicId: 'inventory/label', imageBytes: 12345 });
  const saved = env.data().inventoryItems[0];
  assert.equal(saved.imageUrl, 'https://example.com/label.jpg');
  assert.equal(saved.imageName, 'label.jpg');
  assert.equal(saved.imagePublicId, 'inventory/label');
  assert.equal(saved.imageBytes, 12345);
});

test('image edit preserves latest stock, adds label photo and clears every image field on deletion', async () => {
  const env = setup([{ id: 'lamp', name: '電球', stock: 10, barcode: '123', imageUrl: 'old.jpg', imagePublicId: 'old', imageName: 'old', imageBytes: 20 }]);
  await env.edit('lamp', { name: '電球', barcode: '123', imageUrl: 'new.jpg', imagePublicId: 'new', imageName: 'label.jpg', imageBytes: 100 });
  assert.equal(env.data().inventoryItems[0].stock, 10);
  assert.equal(env.data().inventoryItems[0].imageUrl, 'new.jpg');
  await env.edit('lamp', { modelNumber: 'NEW-MODEL', barcode: '123' });
  assert.equal(env.data().inventoryItems[0].imageUrl, 'new.jpg');
  await env.edit('lamp', { modelNumber: 'NEW-MODEL', barcode: '123', imageUrl: '', imagePublicId: '', imageName: '', imageBytes: 0 });
  const item = env.data().inventoryItems[0];
  assert.equal(item.stock, 10);
  assert.equal(item.imageUrl, '');
  assert.equal(item.imagePublicId, '');
  assert.equal(item.imageName, '');
  assert.equal(item.imageBytes, 0);
  assert.equal(env.data().inventoryMovements.length, 0);
});
test('editing a deleted product or stored duplicate JAN rejects without changing inventory', async () => {
  const env = setup([{ id: 'lamp', name: '電球', stock: 10, barcode: '123' }, { id: 'other', name: '別の商品', stock: 2, barcode: '456' }]);
  await assert.rejects(env.edit('missing', { name: '画像変更', imageUrl: 'new.jpg' }), /見つかりません/);
  await assert.rejects(env.edit('lamp', { name: '電球', barcode: '456', imageUrl: '' }), /すでに登録/);
  assert.equal(env.data().inventoryItems[0].stock, 10);
  assert.equal(env.data().inventoryItems[0].barcode, '123');
});

test('shelf number can be registered, edited and cleared while stock is preserved', async () => {
  const env = setup([]);
  await env.register({ id: 'shelf-test', name: '棚テスト', shelfNumber: 'Ａ－０１', stock: 5 });
  assert.equal(env.data().inventoryItems[0].shelfNumber, 'A-01');
  await env.edit('shelf-test', { name: '棚テスト', shelfNumber: 'Ｂ－０２' });
  assert.equal(env.data().inventoryItems[0].shelfNumber, 'B-02');
  assert.equal(env.data().inventoryItems[0].stock, 5);
  await env.edit('shelf-test', { name: '棚テスト', shelfNumber: '' });
  assert.equal(env.data().inventoryItems[0].shelfNumber, '');
});
