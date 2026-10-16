export function canCompleteTask(task, ownerUid, userUid, isAdmin = false) {
  if (!task || !userUid) return false;
  if (task.visibility === 'private') return ownerUid === userUid;
  return isAdmin || ownerUid === userUid || (task.assigneeIds || []).includes(userUid);
}
