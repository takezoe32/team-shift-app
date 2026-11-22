import { taskCompletionActor } from './taskCompletionActor.mjs';
import { canCompleteTask } from './taskCompletionPermission.mjs';
// 終了履歴の「未終了に戻す」: reopen a still-completed task in the latest transaction snapshot.
// Everything else on the task (handoffs, attachments, daily work records) stays as it is.
export function planCompletedTaskReopen(data, entry, actor, isAdmin = false) {
  if (!actor?.id) throw new Error('このタスクを変更できません。');
  const reopen = task => ({ ...task, completed: false, completedAt: null, ...taskCompletionActor(false, actor) });
  if (entry.type === 'partner') {
    const items = data.partnerItems || [];
    const target = items.find(item => item.id === entry.id);
    if (!target) throw new Error('このタスクは削除されています。');
    if (!target.completed) return null;
    const partnerItems = items.map(item => item.id === entry.id ? reopen(item) : item);
    return { partnerItems, updates: { partnerItems } };
  }
  if (entry.type !== 'member') throw new Error('履歴の種類が不正です。');
  const team = data.teamData || {};
  const day = team.tasks?.[entry.date] || {};
  const tasks = day[entry.ownerUid] || [];
  const target = tasks.find(task => task.id === entry.id);
  if (!target) throw new Error('このタスクは移動または削除されています。');
  if (!canCompleteTask(target, entry.ownerUid, actor.id, isAdmin)) throw new Error('担当者または管理者が未終了に戻せます。');
  if (!target.completed) return null;
  const nextTasks = tasks.map(task => task.id === entry.id ? reopen(task) : task);
  return {
    teamData: { ...team, tasks: { ...team.tasks, [entry.date]: { ...day, [entry.ownerUid]: nextTasks } } },
    updates: { [`teamData.tasks.${entry.date}.${entry.ownerUid}`]: nextTasks }
  };
}
