import { isPeriodTask, taskDisplayDay } from './periodTask.mjs';
export function calendarTaskDay(item, sourceDate, today) {
  return taskDisplayDay(item, isPeriodTask(item) ? item.periodStartDate : sourceDate, today) || '';
}
export function compareCalendarTasks(a, b, today) {
  return calendarTaskDay(a, a.taskDate, today).localeCompare(calendarTaskDay(b, b.taskDate, today))
    || String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
    || String(a.id || '').localeCompare(String(b.id || ''));
}
