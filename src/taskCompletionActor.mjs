export function taskCompletionActor(completed, user) {
  return {
    completedByUid: completed ? String(user?.id || '') : '',
    completedByName: completed ? String(user?.name || '') : ''
  };
}
export function completionActorName(task) {
  return task?.completedByName || '記録なし';
}
