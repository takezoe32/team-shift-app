export const canChangeHandoff = (update, actor) => !!actor?.id && !actor.readOnly && actor.role !== 'viewer' && !!update?.authorUid && update.authorUid === actor.id;
export function changeHandoff(item, operation, field = 'text', actor) {
  const existing = Array.isArray(item.updates) ? item.updates : [];
  const updates = existing.length || field !== 'content' || !item.content ? existing : [{
    id: 'legacy_' + item.id, text: item.content, authorUid: item.createdByUid || '',
    authorName: item.createdByName || '登録時の内容', createdAt: item.createdAt || null
  }];
  const target = updates.find(update => update.id === operation.id);
  if (!target) throw new Error('申し送りが削除されています。最新の内容を確認してください。');
  if (!canChangeHandoff(target, actor)) throw new Error('申し送りの編集・削除は追加した本人のみ行えます。');
  if (target.text !== operation.expectedText || (target.updatedAt || '') !== operation.expectedUpdatedAt) throw new Error('別の端末で変更されています。最新の内容を確認してください。');
  if (!['edit', 'delete'].includes(operation.action)) throw new Error('操作が無効です。');
  const text = String(operation.text || '').trim();
  if (operation.action === 'edit' && !text) throw new Error('申し送りを入力してください。');
  const next = operation.action === 'delete' ? updates.filter(update => update.id !== target.id)
    : updates.map(update => update.id === target.id ? { ...update, text, updatedAt: operation.updatedAt } : update);
  const changes = { updates: next };
  if (item[field] === target.text) changes[field] = operation.action === 'edit' ? text : (next[next.length - 1]?.text || '');
  return changes;
}
export function findLiveTask(teamData, selected) {
  if (!selected) return null;
  for (const [taskDate, owners] of Object.entries(teamData.tasks || {})) {
    const task = (owners[selected.ownerUid] || []).find(task => task.id === selected.id);
    if (task) return { ...selected, ...task, taskDate };
  }
  return null;
}

