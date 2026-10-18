import { changeHandoff } from './handoffEdit.mjs';
import { mergeTaskImages } from './taskImages.mjs';
export function planTaskEdit(teamData, sourceDate, ownerUid, taskId, input) {
  const changes = typeof input === 'object' && input ? { ...input } : { text: input };
  const targetDate = Object.hasOwn(changes, 'targetDate') ? changes.targetDate : sourceDate;
  delete changes.targetDate;
  const date = new Date(targetDate + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== targetDate) throw new Error('有効な日付を選択してください。');
  const tasks = teamData.tasks || {};
  const source = tasks[sourceDate]?.[ownerUid] || [];
  const task = source.find(item => item.id === taskId);
  if (!task) throw new Error('タスクが削除または移動されています。画面を更新してください。');
  const destination = tasks[targetDate]?.[ownerUid] || [];
  if (targetDate !== sourceDate && destination.some(item => item.id === taskId)) throw new Error('変更先に同じタスクがあります。画面を更新してください。');
  if (changes.handoffOperation) Object.assign(changes, changeHandoff(task, changes.handoffOperation));
  const editingHandoff = !!changes.handoffOperation;
  delete changes.handoffOperation;
  if (!editingHandoff && Array.isArray(changes.updates)) changes.updates = [...(task.updates || []), ...changes.updates.slice(-1)];
  if (Array.isArray(changes.newImages)) changes.images = mergeTaskImages(task, changes.newImages);
  delete changes.newImages;
  const edited = { ...task, ...changes };
  const updates = targetDate === sourceDate
    ? { [`teamData.tasks.${sourceDate}.${ownerUid}`]: source.map(item => item.id === taskId ? edited : item) }
    : { [`teamData.tasks.${sourceDate}.${ownerUid}`]: source.filter(item => item.id !== taskId), [`teamData.tasks.${targetDate}.${ownerUid}`]: [...destination, edited] };
  const nextTasks = { ...tasks, [sourceDate]: { ...tasks[sourceDate], [ownerUid]: updates[`teamData.tasks.${sourceDate}.${ownerUid}`] } };
  if (targetDate !== sourceDate) nextTasks[targetDate] = { ...tasks[targetDate], [ownerUid]: [...destination, edited] };
  return { updates, teamData: { ...teamData, tasks: nextTasks } };
}
