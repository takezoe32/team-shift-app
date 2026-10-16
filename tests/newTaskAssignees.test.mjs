import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newTaskAssignees } from '../src/newTaskAssignees.mjs';
test('multiple assignees retain order without duplicating or accepting removed users', () => {
  assert.deepEqual(newTaskAssignees(['b', 'a', 'b', 'removed'], 'a', 'public', ['a', 'b']), ['b', 'a']);
});
test('public tasks require an active assignee', () => {
  assert.throws(() => newTaskAssignees([], 'a', 'public', ['a']), /1人以上/);
  assert.throws(() => newTaskAssignees(['removed'], 'a', 'public', ['a']), /1人以上/);
});
test('personal memos never inherit multiple assignees', () => {
  assert.deepEqual(newTaskAssignees(['a', 'b'], 'a', 'private', ['a', 'b']), ['a']);
});
