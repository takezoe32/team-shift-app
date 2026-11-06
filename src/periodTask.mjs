import { japanToday } from './japanTime.mjs';
import { canCompleteTask } from './taskCompletionPermission.mjs';
const validDay = day => /^\d{4}-\d{2}-\d{2}$/.test(day || '') && new Date(day + 'T12:00:00Z').toISOString().slice(0, 10) === day;
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
// Repeat rules: { type:'weekly', weekdays:[0-6] } or { type:'monthly', day:1-31 }. A repeating task has no end date.
export function normalizeRepeat(repeat) {
  if (repeat?.type === 'weekly' && Array.isArray(repeat.weekdays)) {
    const weekdays = [...new Set(repeat.weekdays)].sort((a, b) => a - b);
    return weekdays.length && weekdays.every(day => Number.isInteger(day) && day >= 0 && day <= 6) ? { type: 'weekly', weekdays } : null;
  }
  if (repeat?.type === 'monthly' && Number.isInteger(repeat.day) && repeat.day >= 1 && repeat.day <= 31) return { type: 'monthly', day: repeat.day };
  return null;
}
export function repeatMatches(repeat, day) {
  const rule = normalizeRepeat(repeat);
  if (!rule || !validDay(day)) return false;
  const date = new Date(day + 'T12:00:00Z');
  if (rule.type === 'weekly') return rule.weekdays.includes(date.getUTCDay());
  // A day the month does not have (e.g. the 31st) falls on that month's last day.
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  return date.getUTCDate() === Math.min(rule.day, last);
}
export function repeatLabel(repeat) {
  const rule = normalizeRepeat(repeat);
  if (!rule) return '';
  return rule.type === 'weekly' ? `毎週 ${rule.weekdays.map(day => WEEKDAYS[day]).join('・')}曜日` : `毎月${rule.day}日${rule.day > 28 ? '（ない月は月末）' : ''}`;
}
export const isRecurringTask = item => !!normalizeRepeat(item?.repeat) && validDay(item?.periodStartDate);
export const isPeriodTask = item => isRecurringTask(item) || !!(item?.periodStartDate && item?.periodEndDate);
export const isDailyWorkFinished = (item, day) => isPeriodTask(item) && !!item.dailyWork?.[day];
export const taskOnDay = (item, sourceDate, day) => isRecurringTask(item) ? item.periodStartDate <= day && repeatMatches(item.repeat, day) : isPeriodTask(item) ? item.periodStartDate <= day && day <= item.periodEndDate : sourceDate === day;
export function nextOccurrence(item, from) {
  if (!isRecurringTask(item)) return '';
  const date = new Date((from > item.periodStartDate ? from : item.periodStartDate) + 'T12:00:00Z');
  for (let i = 0; i < 62; i++, date.setUTCDate(date.getUTCDate() + 1)) {
    const day = date.toISOString().slice(0, 10);
    if (repeatMatches(item.repeat, day)) return day;
  }
  return '';
}
export function periodTaskChanges(item, operation, actor, sourceDate, ownerUid, now = new Date().toISOString()) {
  if (!item || !actor?.id || actor.role === 'viewer' || actor.readOnly) throw new Error('このタスクを変更できません。');
  const partner = Object.hasOwn(item, 'partnerName');
  if (!partner && operation.action !== 'set' && !canCompleteTask(item, ownerUid, actor.id, actor.isAdmin)) throw new Error('担当者または管理者が操作できます。');
  if (item.completed) throw new Error('このタスクは期間全体が終了しています。');
  if (operation.action === 'set') {
    if (!partner && actor.id !== ownerUid && !actor.isAdmin) throw new Error('期間は登録者または管理者が変更できます。');
    const start = operation.startDate || sourceDate, end = operation.endDate;
    if (operation.repeat !== undefined && operation.repeat !== null) {
      const repeat = normalizeRepeat(operation.repeat);
      if (!repeat) throw new Error('繰り返しの曜日または日にちを選んでください。');
      if (!validDay(start)) throw new Error('開始日を選んでください。');
      if (Object.keys(item.dailyWork || {}).some(day => day < start)) throw new Error('作業終了の記録がある日を期間から外すことはできません。');
      return { periodStartDate: start, periodEndDate: '', repeat };
    }
    if (!validDay(start) || !validDay(end) || end < start) throw new Error('終了日は開始日以降を選んでください。');
    if (Object.keys(item.dailyWork || {}).some(day => day < start || day > end)) throw new Error('作業終了の記録がある日を期間から外すことはできません。');
    return { periodStartDate: start, periodEndDate: end, repeat: null };
  }
  if (operation.action !== 'daily') throw new Error('操作が不正です。');
  const day = japanToday(now);
  if (isRecurringTask(item)) { if (!taskOnDay(item, sourceDate, day)) throw new Error('本日は繰り返しの対象日ではありません。'); }
  else if (!isPeriodTask(item) || day < item.periodStartDate || day > item.periodEndDate) throw new Error('本日が作業期間に含まれていません。期間を確認してください。');
  if (item.dailyWork?.[day]) throw new Error('本日の作業終了は登録済みです。追記は申し送りから行ってください。');
  const note = String(operation.note || '').trim();
  if (note.length > 10000) throw new Error('申し送りは10000文字以内で入力してください。');
  const ids = Array.isArray(item.assigneeIds) && item.assigneeIds.length ? item.assigneeIds : [item.assigneeUid || ownerUid].filter(Boolean);
  const previousUpdates = item.updates?.length ? item.updates : partner && item.content ? [{ id: 'legacy_' + item.id, kind:'initial', text:item.content, authorUid:item.createdByUid || '', authorName:item.createdByName || '登録時の内容', createdAt:item.createdAt || null }] : [];
  const record = { date: day, completedAt: now, actorUid: actor.id, actorName: actor.name || '', subject: item.subject || item.text?.split(/\r?\n/)[0] || '題名なし', partnerName: item.partnerName || '', assigneeIds: ids, note };
  return {
    dailyWork: { ...(item.dailyWork || {}), [day]: record },
    updates: [...previousUpdates, { id: `daily_${item.id}_${day}`, kind: 'handoff', text: `${Number(day.slice(5,7))}月${Number(day.slice(8))}日 作業終了${note ? '\n' + note : ''}`, authorUid: actor.id, authorName: actor.name || '', createdAt: now, workDate: day }]
  };
}
// A period remains today's active work through its final calendar day.
// A repeating task is shown on its next occurrence (today when today is one).
export function taskDisplayDay(item, sourceDate, today) {
  if (isRecurringTask(item)) return nextOccurrence(item, today) || item.periodStartDate;
  return isPeriodTask(item) && taskOnDay(item, sourceDate, today) ? today : sourceDate;
}
export function isTaskPast(item, sourceDate, today) {
  if (isRecurringTask(item)) return false;
  return !item?.completed && (isPeriodTask(item) ? item.periodEndDate < today : sourceDate < today);
}
