import { handoffUpdates, initialPartnerText } from './handoffHistory.mjs';
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
