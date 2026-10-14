// Delete only a still-completed record from the latest transaction snapshot.
// Historical consumption remains in inventory and its movement ledger.
export function planCompletedTaskDelete(data, entry) {
  if (entry.type === 'partner') {
    const items = data.partnerItems || [];
    const target = items.find(item => item.id === entry.id);
    if (!target) return null;
    if (!target.completed) throw new Error('このタスクは未完了に戻されています。画面を確認してください。');
    const partnerItems = items.filter(item => item.id !== entry.id);
    return { partnerItems, updates: { partnerItems } };
  }
  if (entry.type !== 'member') throw new Error('履歴の種類が不正です。');
  const team = data.teamData || {};
  const day = team.tasks?.[entry.date] || {};
  const tasks = day[entry.ownerUid] || [];
  const target = tasks.find(task => task.id === entry.id);
  if (!target) return null;
  if (!target.completed) throw new Error('このタスクは未完了に戻されています。画面を確認してください。');
  const nextTasks = tasks.filter(task => task.id !== entry.id);
  return {
    teamData: { ...team, tasks: { ...team.tasks, [entry.date]: { ...day, [entry.ownerUid]: nextTasks } } },
    updates: { [`teamData.tasks.${entry.date}.${entry.ownerUid}`]: nextTasks }
  };
}
