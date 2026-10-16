import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canCompleteTask } from '../src/taskCompletionPermission.mjs';
test('all assigned members can complete a shared task, other members cannot', () => {
  const task = { assigneeIds: ['a', 'b'] };
  assert.equal(canCompleteTask(task, 'owner', 'a'), true);
  assert.equal(canCompleteTask(task, 'owner', 'b'), true);
  assert.equal(canCompleteTask(task, 'owner', 'owner'), true);
  assert.equal(canCompleteTask(task, 'owner', 'other'), false);
  assert.equal(canCompleteTask(task, 'owner', 'admin', true), true);
});
test('private memos remain owner-only and missing tasks cannot be completed', () => {
  assert.equal(canCompleteTask({ visibility: 'private', assigneeIds: ['b'] }, 'a', 'b', true), false);
  assert.equal(canCompleteTask({ visibility: 'private' }, 'a', 'a'), true);
  assert.equal(canCompleteTask(null, 'a', 'a'), false);
});
