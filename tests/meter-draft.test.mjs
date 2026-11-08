import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meterDraftKey,storeMeterDraft,restoreMeterDraft,clearMeterDraft,pruneMeterDrafts,METER_DRAFT_PREFIX } from '../src/meterDraft.mjs';
const memory = () => { const m = new Map(); return { get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m }; };
const fields = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'f' }];
const snapshot = { current: { a: 100, b: null, c: 5, f: 9 }, formulas: { f: true } };
const key = meterDraftKey('u1', 'daily', '2026-11-07');

test('入力した値は端末に残り、画面を開き直すと戻る（原本と同じ値・数式セルは残さない）', () => {
  const s = memory();
  storeMeterDraft(s, key, { a: '101', b: '7', c: '5', f: '1' }, snapshot, fields, 1000);
  assert.deepEqual(JSON.parse(s.getItem(key)).entries, { a: { value: '101', base: '100' }, b: { value: '7', base: '' } });
  assert.deepEqual(restoreMeterDraft(s, key, snapshot, fields), { a: '101', b: '7' });
});

test('原本がほかの端末で更新された項目は戻さない', () => {
  const s = memory();
  storeMeterDraft(s, key, { a: '101', b: '7' }, snapshot, fields);
  assert.deepEqual(restoreMeterDraft(s, key, { ...snapshot, current: { ...snapshot.current, b: 8 } }, fields), { a: '101' });
  assert.deepEqual(restoreMeterDraft(s, key, { ...snapshot, current: { ...snapshot.current, a: 101 } }, fields), { b: '7' });
});

test('保存して未保存の値がなくなると端末の下書きは消える', () => {
  const s = memory();
  storeMeterDraft(s, key, { a: '101' }, snapshot, fields);
  storeMeterDraft(s, key, { a: '101' }, { ...snapshot, current: { ...snapshot.current, a: 101 } }, fields);
  assert.equal(s.getItem(key), null);
});

test('利用者・毎朝/毎月・日付ごとに別に保存し、破棄や古い下書きは消える', () => {
  const s = memory(), monthly = meterDraftKey('u1', 'monthly', '2026-11'), other = meterDraftKey('u2', 'daily', '2026-11-07');
  assert.notEqual(key, monthly); assert.notEqual(key, other); assert.ok(key.startsWith(METER_DRAFT_PREFIX));
  storeMeterDraft(s, key, { a: '1' }, snapshot, fields, Date.UTC(2026, 10, 7));
  storeMeterDraft(s, other, { a: '2' }, snapshot, fields, Date.UTC(2026, 9, 1));
  s.setItem('unrelated', 'x'); s.setItem(METER_DRAFT_PREFIX + 'broken', '{');
  pruneMeterDrafts(s, Date.UTC(2026, 10, 8));
  assert.deepEqual([...s.m.keys()].sort(), [key, 'unrelated'].sort());
  clearMeterDraft(s, key);
  assert.equal(s.getItem(key), null);
});

test('端末に保存できない場合（プライベートモードなど）でも入力は止まらない', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); }, removeItem() { throw new Error('denied'); }, get length() { throw new Error('denied'); } };
  assert.doesNotThrow(() => storeMeterDraft(broken, key, { a: '1' }, snapshot, fields));
  assert.deepEqual(restoreMeterDraft(broken, key, snapshot, fields), {});
  assert.doesNotThrow(() => pruneMeterDrafts(broken));
  assert.doesNotThrow(() => clearMeterDraft(broken, key));
});
