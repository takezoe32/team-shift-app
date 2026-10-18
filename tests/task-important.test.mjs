import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTaskEdit } from '../src/taskEdit.mjs';
import { planPartnerSchedule } from '../src/partnerSchedule.mjs';
import { planPartnerTaskAction } from '../src/partnerTaskActions.mjs';
import { calendarDayData } from '../src/calendarDay.mjs';
test('important can be enabled and disabled on existing member tasks and survives moving the task', () => {
  const team = { tasks: { '2026-10-18': { u: [{ id: 't', subject: '点検', completed: false, assigneeIds: ['u', 'v'] }] } } };
  const flagged = planTaskEdit(team, '2026-10-18', 'u', 't', { important: true }).teamData;
  const moved = planTaskEdit(flagged, '2026-10-18', 'u', 't', { targetDate: '2026-10-19', text: '追記' }).teamData;
  const task = calendarDayData('2026-10-19', moved).tasks[0];
  assert.equal(task.important, true); assert.deepEqual(task.assigneeIds, ['u', 'v']); assert.equal(task.subject, '点検');
  const cleared = planTaskEdit(moved, '2026-10-19', 'u', 't', { important: false }).teamData;
  assert.equal(cleared.tasks['2026-10-19'].u[0].important, false);
});
test('important partner task keeps its flag when rescheduled and completed and appears in the calendar day data', () => {
  const items = [{ id: 'p', date: '2026-10-18', time: '09:00', partnerName: '設備会社', important: true, assigneeIds: ['u'] }];
  const moved = planPartnerSchedule(items, 'p', { date: '2026-10-19', time: '09:15' });
  assert.equal(moved[0].important, true);
  const completed = planPartnerTaskAction(items, 'p', 'complete', '2026-10-18T10:00:00+09:00');
  assert.equal(calendarDayData('2026-10-18', {}, completed).partners[0].important, true);
  const legacy = calendarDayData('2026-10-18', { tasks: { '2026-10-18': { u: [{ id: 'old' }] } } }).tasks[0];
  assert.equal(legacy.important, undefined);
});
