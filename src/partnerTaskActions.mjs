// Apply against the latest Firestore transaction snapshot, not the open modal.
export function planPartnerTaskAction(items, itemId, action, completedAt) {
  if (!['complete', 'delete'].includes(action)) throw new Error('操作が不正です。');
  const target = items.find(item => item.id === itemId);
  if (!target) {
    if (action === 'delete') return null;
    throw new Error('対象のパートナータスクは削除されています。');
  }
  if (action === 'delete') return items.filter(item => item.id !== itemId);
  // A concurrent completion must not reopen the task or change its finish date.
  if (target.completed) return null;
  return items.map(item => item.id === itemId ? { ...item, completed: true, completedAt } : item);
}
