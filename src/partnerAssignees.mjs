export function partnerAssigneeIds(item) {
  const ids = Array.isArray(item?.assigneeIds) && item.assigneeIds.length ? item.assigneeIds : [item?.assigneeUid];
  return [...new Set(ids.filter(id => typeof id === 'string' && id))];
}
