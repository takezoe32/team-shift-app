export const VIEWER_ROLE = { level: 0, name: '閲覧のみ', readOnly: true };
export function withViewerRole(roles = {}) { return { ...roles, viewer: VIEWER_ROLE }; }
export function isReadOnlyUser(user, roles = {}) { return user?.role === 'viewer' || roles[user?.role]?.readOnly === true; }
export function assertCanWrite(user, roles = {}) {
  if (isReadOnlyUser(user, roles)) throw new Error('閲覧のみのアカウントでは変更できません。');
}
export function guardWrites(resolve, operations) {
  return Object.fromEntries(Object.entries(operations).map(([name, operation]) => [name, async (...args) => {
    const { user, roles } = resolve();
    assertCanWrite(user, roles);
    return operation(...args);
  }]));
}
