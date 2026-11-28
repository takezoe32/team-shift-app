// 担当者の「全員を選ぶ」: everyone who can be given a task, i.e. every member except the read-only (閲覧のみ) accounts.
import { isReadOnlyUser } from './viewerPermission.mjs';

export const memberAssigneeIds = (users, roles = {}) => (Array.isArray(users) ? users : []).filter(user => user?.id && !isReadOnlyUser(user, roles)).map(user => user.id);
// Checked only while every such member is selected (never when there is nobody to select).
export function allMembersSelected(value, users, roles = {}) {
  const ids = memberAssigneeIds(users, roles), chosen = new Set(value || []);
  return ids.length > 0 && ids.every(id => chosen.has(id));
}
// Checking adds the missing members after those already chosen; unchecking removes the members and leaves a
// read-only account that was chosen by hand as it is.
export function toggleAllMembers(value, users, roles = {}, checked) {
  const current = Array.isArray(value) ? value : [], ids = memberAssigneeIds(users, roles);
  return checked ? [...current, ...ids.filter(id => !current.includes(id))] : current.filter(id => !ids.includes(id));
}
