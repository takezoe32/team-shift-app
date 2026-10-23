import { japanToday } from './japanTime.mjs';
import { canCompleteTask } from './taskCompletionPermission.mjs';
const validDay = day => /^\d{4}-\d{2}-\d{2}$/.test(day || '') && new Date(day + 'T12:00:00Z').toISOString().slice(0, 10) === day;
export const isPeriodTask = item => !!(item?.periodStartDate && item?.periodEndDate);
export const taskOnDay = (item, sourceDate, day) => isPeriodTask(item) ? item.periodStartDate <= day && day <= item.periodEndDate : sourceDate === day;
export function periodTaskChanges(item, operation, actor, sourceDate, ownerUid, now = new Date().toISOString()) {
  if (!item || !actor?.id || actor.role === 'viewer' || actor.readOnly) throw new Error('このタスクを変更できません。');
  const partner = Object.hasOwn(item, 'partnerName');
  if (!partner && operation.action !== 'set' && !canCompleteTask(item, ownerUid, actor.id, actor.isAdmin)) throw new Error('担当者または管理者が操作できます。');
  if (item.completed) throw new Error('このタスクは期間全体が終了しています。');
  if (operation.action === 'set') {
    if (!partner && actor.id !== ownerUid && !actor.isAdmin) throw new Error('期間は登録者または管理者が変更できます。');
    const start = operation.startDate || sourceDate, end = operation.endDate;
    if (!validDay(start) || !validDay(end) || end < start) throw new Error('終了日は開始日以降を選んでください。');
    if (Object.keys(item.dailyWork || {}).some(day => day < start || day > end)) throw new Error('作業終了の記録がある日を期間から外すことはできません。');
    return { periodStartDate: start, periodEndDate: end };
  }
  if (operation.action !== 'daily') throw new Error('操作が不正です。');
  const day = japanToday(now);
  if (!isPeriodTask(item) || day < item.periodStartDate || day > item.periodEndDate) throw new Error('本日が作業期間に含まれていません。期間を確認してください。');
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
export function taskDisplayDay(item, sourceDate, today) {
  return isPeriodTask(item) && taskOnDay(item, sourceDate, today) ? today : sourceDate;
}
export function isTaskPast(item, sourceDate, today) {
  return !item?.completed && (isPeriodTask(item) ? item.periodEndDate < today : sourceDate < today);
}
