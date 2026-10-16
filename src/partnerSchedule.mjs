import { validateReportDate } from './dailyReport.mjs';
const quarterTime = value => /^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/.test(value);
export function planPartnerSchedule(items, id, schedule) {
  validateReportDate(schedule.date);
  if (!quarterTime(schedule.time) || (schedule.endTime && !quarterTime(schedule.endTime))) throw new Error('時間は15分刻みで選んでください。');
  const item = items.find(value => value.id === id);
  if (!item) throw new Error('対象のタスクが見つかりません。');
  if (item.completed) throw new Error('このタスクは終了済みのため日程変更できません。');
  return items.map(value => value.id === id ? { ...value, date: schedule.date, time: schedule.time, endTime: schedule.endTime || '' } : value);
}
