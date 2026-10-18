import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planCalendarNote } from '../src/calendarNote.mjs';
test('any signed in member can save, edit and clear the shared note', () => {
  const first = planCalendarNote(null, '全員への連絡\n次の行', 0, { id: 'member', name: '竹添' }, '2026-10-18T00:00:00Z');
  assert.equal(first.text, '全員への連絡\n次の行'); assert.equal(first.version, 1); assert.equal(first.updatedByName, '竹添');
  const next = planCalendarNote(first, '別のメンバーが更新', 1, { id: 'other', name: '高橋' });
  assert.equal(next.version, 2); assert.equal(next.updatedBy, 'other');
  assert.equal(planCalendarNote(next, '', 2, { id: 'member' }).text, '');
});
test('stale drafts cannot overwrite someone else and invalid input is rejected', () => {
  const current = { text: '新しい連絡', version: 2 };
  assert.throws(() => planCalendarNote(current, '古い編集', 1, { id: 'member' }), /ほかの人/);
  assert.equal(current.text, '新しい連絡');
  assert.throws(() => planCalendarNote(null, 'text', 0, null), /ログイン/);
  assert.throws(() => planCalendarNote(null, 'x'.repeat(4001), 0, { id: 'member' }), /4000/);
});
