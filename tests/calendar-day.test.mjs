import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarDayData } from '../src/calendarDay.mjs';
test('day view includes only selected-date tasks and partners, including completed records but excluding private memos', () => {
  const users = [{ id: 'a', name: '竹添' }, { id: 'b', name: '高橋' }];
  const data = { tasks: { '2026-10-17': { a: [{ id: 'done', completed: true, assigneeIds: ['b'] }, { id: 'pending' }, { id: 'private', visibility: 'private' }] }, '2026-10-18': { a: [{ id: 'another-day' }] } } };
  const result = calendarDayData('2026-10-17', data, [{ id: 'late', date: '2026-10-17', time: '15:00', completed: true, assigneeIds: ['a', 'b'] }, { id: 'early', date: '2026-10-17', time: '09:00', assigneeUid: 'b' }, { id: 'other', date: '2026-10-18' }], users);
  assert.deepEqual(result.tasks.map(item => item.id), ['done', 'pending']);
  assert.equal(result.tasks[0].completed, true);
  assert.deepEqual(result.tasks[0].assigneeIds, ['b']);
  assert.deepEqual(result.tasks[1].assigneeIds, ['a']);
  assert.equal(result.tasks[0].ownerUid, 'a'); assert.equal(result.tasks[0].taskDate, '2026-10-17');
  assert.equal(result.tasks[0].member.name, '竹添');
  assert.deepEqual(result.partners.map(item => item.id), ['early', 'late']);
  assert.deepEqual(result.partners[0].assigneeIds, ['b']); assert.equal(result.partners[1].completed, true);
});
test('day staff excludes leave, courses, unset and unknown shifts; empty day stays empty', () => {
  const users = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => ({ id }));
  const result = calendarDayData('2026-10-18', { shifts: { '2026-10-18': { a: 'work', b: 'off', c: 'paid', d: 'custom', e: 'unknown', f: 'training' } } }, [], users, [{ id: 'custom', label: '遅番' }, { id: 'training', label: '講習' }]);
  assert.deepEqual(result.staff.map(user => user.id), ['a', 'd']);
  assert.deepEqual(result.tasks, []); assert.deepEqual(result.partners, []);
  assert.deepEqual(calendarDayData('2026-10-19'), { tasks: [], partners: [], staff: [] });
});
