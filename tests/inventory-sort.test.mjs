import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sortInventoryItems } from '../src/inventorySort.mjs';
import { confirmEditDiscard } from '../src/editGuard.js';

test('shelf order compares numbers naturally, normalizes full-width text and leaves blanks last in either direction', () => {
  const items = [{ id: 'blank', shelfNumber: ' ' }, { id: 'ten', shelfNumber: 'A-10' }, { id: 'two', shelfNumber: 'Ａ-２' }, { id: 'one', shelfNumber: 'A-1' }, { id: 'missing' }];
  assert.deepEqual(sortInventoryItems(items, 'shelf-asc').map(x => x.id), ['one', 'two', 'ten', 'blank', 'missing']);
  assert.deepEqual(sortInventoryItems(items, 'shelf-desc').map(x => x.id), ['ten', 'two', 'one', 'blank', 'missing']);
  assert.equal(items[0].id, 'blank');
});
test('same shelf falls back to kind/name, while the original name order remains selectable', () => {
  const items = [{ name: '電球B', kind: '照明', shelfNumber: 'A1' }, { name: '電球A', kind: '照明', shelfNumber: 'A1' }];
  assert.deepEqual(sortInventoryItems(items, 'shelf-asc').map(x => x.name), ['電球A', '電球B']);
  assert.deepEqual(sortInventoryItems(items).map(x => x.name), ['電球A', '電球B']);
});
test('discard cancellation prevents closing, confirmation allows it, and saving blocks exit', () => {
  let calls = 0;
  const confirm = () => { calls++; return false; };
  assert.equal(confirmEditDiscard(false, false, confirm), true); assert.equal(calls, 0);
  assert.equal(confirmEditDiscard(true, false, confirm), false); assert.equal(calls, 1);
  assert.equal(confirmEditDiscard(true, false, () => true), true);
  assert.equal(confirmEditDiscard(true, true, confirm), false); assert.equal(calls, 1);
});
