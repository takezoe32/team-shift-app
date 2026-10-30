import { isPeriodTask } from './periodTask.mjs';
export function calendarPeriods(teamData = {}, partnerItems = []) {
  const members = Object.entries(teamData.tasks || {}).flatMap(([date, owners]) => Object.entries(owners || {}).flatMap(([owner, tasks]) => (tasks || []).filter(Boolean).map(task => ({ ...task, key: `member:${owner}:${task.id}`, sourceDate: date, ownerUid: owner, kind: 'member' }))));
  return [...members, ...partnerItems.filter(Boolean).map(task => ({ ...task, key: `partner:${task.id}`, kind: 'partner' }))]
    .filter(task => !task.completed && task.visibility !== 'private' && isPeriodTask(task))
    .sort((a,b) => a.periodStartDate.localeCompare(b.periodStartDate) || a.key.localeCompare(b.key));
}
export function periodWeekRows(periods, day) {
  const date = new Date(day + 'T12:00:00Z');
  const start = new Date(date); start.setUTCDate(date.getUTCDate() - date.getUTCDay());
  const end = new Date(start); end.setUTCDate(start.getUTCDate() + 6);
  const first = start.toISOString().slice(0,10), last = end.toISOString().slice(0,10);
  return periods.filter(task => task.periodStartDate <= last && task.periodEndDate >= first).map(task => ({
    ...task, active: task.periodStartDate <= day && day <= task.periodEndDate,
    fromBefore: task.periodStartDate < day, continues: day < task.periodEndDate,
  }));
}
