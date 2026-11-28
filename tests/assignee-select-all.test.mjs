import test from 'node:test';
import assert from 'node:assert/strict';
import { memberAssigneeIds, allMembersSelected, toggleAllMembers } from '../src/assigneeSelectAll.mjs';
import { withViewerRole } from '../src/viewerPermission.mjs';

const roles = withViewerRole({ admin: { level: 50 }, member: { level: 10 } });
const users = [{ id: 'a', role: 'admin' }, { id: 'v', role: 'viewer' }, { id: 'b', role: 'member' }, { id: 'c', role: 'member' }];

test('「全員」は権限が閲覧のみの人を除いたメンバー', () => {
  assert.deepEqual(memberAssigneeIds(users, roles), ['a', 'b', 'c']);
  assert.deepEqual(memberAssigneeIds(users), ['a', 'b', 'c'], 'roles がなくても viewer は除く');
  assert.deepEqual(memberAssigneeIds([{ id: 'x', role: 'guest' }, { id: 'y', role: 'member' }], { guest: { readOnly: true }, member: {} }), ['y']);
  assert.deepEqual(memberAssigneeIds(undefined), []);
});
test('チェックを入れると全員を選び、すでに選んでいた人（閲覧のみを含む）と順番は残す', () => {
  assert.deepEqual(toggleAllMembers([], users, roles, true), ['a', 'b', 'c']);
  assert.deepEqual(toggleAllMembers(['c'], users, roles, true), ['c', 'a', 'b']);
  assert.deepEqual(toggleAllMembers(['v', 'b'], users, roles, true), ['v', 'b', 'a', 'c']);
});
test('チェックを外すと全員を外し、閲覧のみの人の選択は変えない', () => {
  assert.deepEqual(toggleAllMembers(['a', 'b', 'c'], users, roles, false), []);
  assert.deepEqual(toggleAllMembers(['v', 'a', 'b', 'c'], users, roles, false), ['v']);
});
test('全員が選ばれているときだけチェックが付く', () => {
  assert.equal(allMembersSelected(['a', 'b', 'c'], users, roles), true);
  assert.equal(allMembersSelected(['c', 'v', 'a', 'b'], users, roles), true);
  assert.equal(allMembersSelected(['a', 'b'], users, roles), false);
  assert.equal(allMembersSelected(['v'], users, roles), false);
  assert.equal(allMembersSelected([], [{ id: 'v', role: 'viewer' }], roles), false, '選べる人がいなければ付かない');
});
