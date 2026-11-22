import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planCompletedTaskReopen } from '../src/completedTaskReopen.mjs';
import { taskHistoryEntries } from '../src/taskHistory.mjs';

const actor = { id: 'u1', name: '竹添 三剛' };
const done = { id: 't1', subject: '電球交換', completed: true, completedAt: '2026-11-20T03:00:00Z', completedByUid: 'u2', completedByName: '高橋', assigneeIds: ['u1', 'u2'], images: [{ imageUrl: 'photo' }], updates: [{ id: 'h', text: '申し送り' }], dailyWork: { '2026-11-19': { note: '初日' } } };
const data = () => ({ teamData: { shifts: { x: 1 }, tasks: { '2026-11-19': { u2: [done, { id: 't2', completed: true }] }, '2026-11-20': { u2: [{ id: 't3' }] } } }, partnerItems: [{ id: 'p1', partnerName: '〇〇設備', completed: true, completedAt: '2026-11-20T04:00:00Z', updates: [{ id: 'a' }] }, { id: 'p2', completed: true }] });
const member = { type: 'member', id: 't1', date: '2026-11-19', ownerUid: 'u2' };

test('終了した個人タスクを未終了に戻し、申し送り・添付・作業記録と他のタスクは変えない', () => {
  const plan = planCompletedTaskReopen(data(), member, actor);
  const tasks = plan.teamData.tasks['2026-11-19'].u2;
  assert.equal(tasks[0].completed, false); assert.equal(tasks[0].completedAt, null);
  assert.deepEqual([tasks[0].images, tasks[0].updates, tasks[0].dailyWork], [done.images, done.updates, done.dailyWork]);
  assert.equal(tasks[1].completed, true);
  assert.deepEqual(Object.keys(plan.updates), ['teamData.tasks.2026-11-19.u2']);
  assert.equal(plan.updates['teamData.tasks.2026-11-19.u2'], tasks);
  assert.deepEqual(plan.teamData.tasks['2026-11-20'], data().teamData.tasks['2026-11-20']); assert.deepEqual(plan.teamData.shifts, { x: 1 });
  // It leaves the 終了履歴 (the day records of a period stay).
  assert.deepEqual(taskHistoryEntries({ date: '2026-11-19' }, tasks[0]).map(entry => entry.historyKind), ['daily']);
});
test('担当者か管理者だけが個人タスクを戻せる', () => {
  assert.throws(() => planCompletedTaskReopen(data(), member, { id: 'u9', name: '他の人' }), /担当者または管理者/);
  assert.equal(planCompletedTaskReopen(data(), member, { id: 'u9', name: '管理者' }, true).teamData.tasks['2026-11-19'].u2[0].completed, false);
  assert.throws(() => planCompletedTaskReopen(data(), member, null), /変更できません/);
});
test('終了したパートナータスクを未終了に戻す', () => {
  const plan = planCompletedTaskReopen(data(), { type: 'partner', id: 'p1' }, actor);
  assert.deepEqual([plan.partnerItems[0].completed, plan.partnerItems[0].completedAt, plan.partnerItems[0].updates, plan.partnerItems[1].completed], [false, null, [{ id: 'a' }], true]);
  assert.equal(plan.updates.partnerItems, plan.partnerItems); assert.equal(plan.teamData, undefined);
});
test('すでに未終了なら何もしない。削除済みならエラーにする', () => {
  const state = data(); state.partnerItems[0].completed = false; state.teamData.tasks['2026-11-19'].u2[0] = { ...done, completed: false };
  assert.equal(planCompletedTaskReopen(state, { type: 'partner', id: 'p1' }, actor), null);
  assert.equal(planCompletedTaskReopen(state, member, actor), null);
  assert.throws(() => planCompletedTaskReopen(data(), { type: 'partner', id: 'gone' }, actor), /削除されています/);
  assert.throws(() => planCompletedTaskReopen(data(), { ...member, id: 'gone' }, actor), /移動または削除/);
  assert.throws(() => planCompletedTaskReopen(data(), { type: 'other', id: 'x' }, actor), /種類が不正/);
});
