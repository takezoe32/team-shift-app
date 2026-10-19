import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taskCompletionActor, completionActorName } from '../src/taskCompletionActor.mjs';
import { planPartnerTaskAction } from '../src/partnerTaskActions.mjs';
test('completion records the operator rather than the task owner and reopening clears it', () => {
  assert.deepEqual(taskCompletionActor(true, { id: 'operator', name: '終了した人' }), { completedByUid: 'operator', completedByName: '終了した人' });
  assert.deepEqual(taskCompletionActor(false, { id: 'operator', name: '終了した人' }), { completedByUid: '', completedByName: '' });
  assert.equal(completionActorName({ completed: true, ownerName: '登録した人' }), '記録なし');
});
test('a second completion keeps the original operator and latest handoffs', () => {
  const items = [{ id: 'one', ownerUid: 'owner', updates: [{ text: '最新の追記' }] }];
  const next = planPartnerTaskAction(items, 'one', 'complete', 'now', { id: 'first', name: '最初の人' });
  assert.equal(next[0].completedByName, '最初の人');
  assert.equal(next[0].completedByUid, 'first');
  assert.deepEqual(next[0].updates, items[0].updates);
  assert.equal(planPartnerTaskAction(next, 'one', 'complete', 'later', { id: 'second', name: '別の人' }), null);
});
