export function newTaskAssignees(selected, ownerUid, visibility, validIds) {
  if (visibility === 'private') return [ownerUid];
  const ids = [...new Set(selected)].filter(id => validIds.includes(id));
  if (!ids.length) throw new Error('担当者を1人以上選んでください。');
  return ids;
}
