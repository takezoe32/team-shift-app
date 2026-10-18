import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VIEWER_ROLE, withViewerRole, isReadOnlyUser, assertCanWrite, guardWrites } from '../src/viewerPermission.mjs';
test('viewer remains read-only even when assigned tasks, owning them or retaining shift privileges', () => {
  for (const user of [{ id: 'u', role: 'viewer' }, { id: 'u', role: 'viewer', canManageShift: true }]) {
    assert.equal(isReadOnlyUser(user, { viewer: { level: 40 } }), true);
    assert.throws(() => assertCanWrite(user), /閲覧のみ/);
  }
  assert.equal(withViewerRole({ admin: { level: 40 }, viewer: { level: 40 } }).viewer, VIEWER_ROLE);
  assert.equal(isReadOnlyUser({ role: 'staff' }, { staff: { readOnly: true } }), true);
  assert.equal(isReadOnlyUser({ role: 'admin' }), false);
});
test('all write gateways reject viewer calls before touching shared data', async () => {
  let user = { role: 'viewer' }, calls = 0;
  const wrapped = guardWrites(() => ({ user, roles: {} }), Object.fromEntries(['setDoc', 'updateDoc', 'runTransaction'].map(name => [name, async () => { calls++; return 'saved'; }])));
  for (const operation of Object.values(wrapped)) await assert.rejects(operation(), /閲覧のみ/);
  assert.equal(calls, 0);
  user = { role: 'staff' };
  for (const operation of Object.values(wrapped)) assert.equal(await operation(), 'saved');
  assert.equal(calls, 3);
  user = { role: 'viewer' };
  await assert.rejects(wrapped.updateDoc(), /閲覧のみ/);
  assert.equal(calls, 3);
});
