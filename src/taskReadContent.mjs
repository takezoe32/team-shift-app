import { handoffUpdates, initialPartnerText } from './handoffHistory.mjs';
import { japanToday } from './japanTime.mjs';
export function taskBody(item) {
  if (!Object.hasOwn(item || {}, 'partnerName')) return String(item?.text || '');
  const initial = initialPartnerText(item);
  if (initial) return initial;
  const content = String(item?.content || '');
  return handoffUpdates(item).some(note => note.text === content) ? '' : content;
}
export function latestTaskHandoff(item) {
  return [...handoffUpdates(item)].reverse().sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).at(0) || null;
}
// The short line shown with a task's title in a list (カレンダーの「本日のタスク」): the newest 申し送り when there is one
// (with who wrote it and the day in Japan), otherwise the registered content. A task without a subject shows its text
// as the title, so it has no content line. null = nothing to show.
export function taskListNote(task) {
  const note = latestTaskHandoff(task);
  if (note) {
    const valid = note.createdAt && !Number.isNaN(Date.parse(note.createdAt)), day = valid ? japanToday(note.createdAt) : '';
    return { kind: 'handoff', text: String(note.text || '').trim() || '添付あり', by: String(note.authorName || '').trim().split(/\s+/)[0] || '', day: day ? Number(day.slice(5, 7)) + '/' + Number(day.slice(8, 10)) : '' };
  }
  return task?.subject && task?.text ? { kind: 'content', text: task.text } : null;
}
