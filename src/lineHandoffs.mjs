const normalized = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
export function lineTaskTargets(state) {
  const members = Object.entries(state.teamData?.tasks || {}).flatMap(([date, owners]) =>
    Object.entries(owners || {}).flatMap(([ownerUid, tasks]) => (tasks || []).filter(task => task.visibility !== 'private').map(task => ({
      kind: 'member', id: task.id, ownerUid, date, time: '', subject: task.subject || String(task.text || '').split(/\r?\n/)[0] || '件名なし', partnerName: '', completed: !!task.completed
    }))));
  const partners = (state.partnerItems || []).map(item => ({ kind: 'partner', id: item.id, date: item.date || '', time: item.time || '', subject: item.subject || String(item.content || '').split(/\r?\n/)[0] || '件名なし', partnerName: item.partnerName || '', completed: !!item.completed }));
  return [...members, ...partners];
}
export function searchLineTasks(state, query) {
  const terms = normalized(query).split(' ').filter(Boolean);
  if (!terms.length) return [];
  return lineTaskTargets(state).filter(target => {
    const haystack = normalized([target.subject, target.date, target.date.replaceAll('-', '/'), target.time, target.partnerName].join(' '));
    return terms.every(term => haystack.includes(term));
  }).sort((a, b) => Number(a.completed) - Number(b.completed) || b.date.localeCompare(a.date));
}
export function resolveLineTask(state, reference) {
  if (!reference) return null;
  return lineTaskTargets(state).find(target => target.kind === reference.kind && target.id === reference.id && (target.kind === 'partner' || target.ownerUid === reference.ownerUid)) || null;
}
export const describeLineTask = target => (target.kind === 'member' ? 'メンバー' : 'パートナー') + '／' + target.date + (target.time ? ' ' + target.time : '') + (target.completed ? '（終了済み）' : '') + '\n' + (target.partnerName ? target.partnerName + '／' : '') + target.subject;
export function appendLineHandoff(state, reference, note) {
  const target = resolveLineTask(state, reference);
  if (!target) throw new Error('タスクが削除されています。対象を探し直してください。');
  if (!note.text?.trim() || note.text.length > 5000 || note.kind !== 'handoff') throw new Error('申し送りは1〜5000文字で入力してください。');
  if (target.kind === 'member') {
    const owners = state.teamData.tasks[target.date], list = owners[target.ownerUid];
    const current = list.find(task => task.id === target.id);
    if ((current.updates || []).some(update => update.id === note.id)) return {};
    return { teamData: { ...state.teamData, tasks: { ...state.teamData.tasks, [target.date]: { ...owners, [target.ownerUid]: list.map(task => task.id === target.id ? { ...task, updates: [...(task.updates || []), note] } : task) } } } };
  }
  const current = state.partnerItems.find(item => item.id === target.id);
  if ((current.updates || []).some(update => update.id === note.id)) return {};
  const updates = current.updates?.length ? current.updates : current.content ? [{ id: 'legacy_' + current.id, kind: 'initial', text: current.content, authorUid: current.createdByUid || '', authorName: current.createdByName || '登録時の内容', createdAt: current.createdAt || null }] : [];
  return { partnerItems: state.partnerItems.map(item => item.id === target.id ? { ...item, updates: [...updates, note] } : item) };
}
