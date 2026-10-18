export function canCompleteTask(task, ownerUid, userUid, isAdmin = false) {
  if (!task || !userUid) return false;
  if (task.visibility === 'private') return ownerUid === userUid;
  const assignees = Array.isArray(task.assigneeIds) && task.assigneeIds.length ? task.assigneeIds : [ownerUid];
  return isAdmin || assignees.includes(userUid);
}
