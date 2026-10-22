import { taskOnDay } from './periodTask.mjs';
import { partnerAssigneeIds } from './partnerAssignees.mjs';
export function calendarDayData(date, teamData = {}, partnerItems = [], users = [], shiftTypes = []) {
  const userById = new Map(users.map(user => [user.id, user]));
  const tasks = Object.entries(teamData.tasks || {}).flatMap(([sourceDate, owners]) => Object.entries(owners || {}).flatMap(([ownerUid, items]) =>
    (items || []).filter(task => task && task.visibility !== 'private' && taskOnDay(task, sourceDate, date)).map(task => ({
      ...task, ownerUid, member: userById.get(ownerUid) || { id: ownerUid, name: '登録者不明' }, taskDate: sourceDate,
      assigneeIds: Array.isArray(task.assigneeIds) && task.assigneeIds.length ? task.assigneeIds : [ownerUid]
    }))
  )).sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id).localeCompare(String(b.id)));
  const partners = partnerItems.filter(item => taskOnDay(item, item.date, date)).map(item => ({ ...item, assigneeIds: partnerAssigneeIds(item) }))
    .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')) || String(a.id).localeCompare(String(b.id)));
  const absent = new Set(['none', 'off', 'summer', 'paid', 'winter', 'course']);
  const staff = users.filter(user => {
    const id = teamData.shifts?.[date]?.[user.id];
    const shift = shiftTypes.find(type => type.id === id);
    return id && !absent.has(id) && (id === 'work' || shift) && !/休|有給|有休|欠勤|講習|未定/.test(shift?.label || '');
  });
  return { tasks, partners, staff };
}
