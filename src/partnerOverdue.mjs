import { isPeriodTask, isTaskPast } from './periodTask.mjs';
import { japanToday } from './japanTime.mjs';
export function isPartnerOverdue(item, now = Date.now()) {
  if (!item || item.completed || !/^\d{4}-\d{2}-\d{2}$/.test(item.date || '')) return false;
  if (isPeriodTask(item)) return isTaskPast(item, item.date, japanToday(now));
  const time = item.endTime || item.time || '23:59:59';
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)) return false;
  const deadline = Date.parse(`${item.periodEndDate || item.date}T${time}+09:00`);
  return Number.isFinite(deadline) && deadline < now;
}
