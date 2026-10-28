export function canManageTask(task, ownerUid, userUid, isAdmin = false) {
  if (!task || !userUid) return false;
  if (task.visibility === 'private') return ownerUid === userUid;
  return isAdmin || ownerUid === userUid || (Array.isArray(task.assigneeIds) && task.assigneeIds.includes(userUid));
}
export function assertTaskManage(task, ownerUid, actor, roles = {}) {
  const readOnly = actor?.role === 'viewer' || roles[actor?.role]?.readOnly === true;
  const isAdmin = actor?.role === 'admin' || (roles[actor?.role]?.level || 0) >= 40;
  if (readOnly || !canManageTask(task, ownerUid, actor?.id, isAdmin)) throw new Error('担当者・登録者・管理者のみタスクを編集・削除できます。');
}
