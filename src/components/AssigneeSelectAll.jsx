import { allMembersSelected, memberAssigneeIds, toggleAllMembers } from '../assigneeSelectAll.mjs';

// 「全員を選ぶ」: one checkbox above a list of assignees. It selects every member except the read-only (閲覧のみ)
// accounts; unchecking it clears them again. Hidden when there are fewer than two such members.
export default function AssigneeSelectAll({ users = [], roles = {}, value = [], onChange, disabled = false, className = '' }) {
  const count = memberAssigneeIds(users, roles).length;
  if (count < 2) return null;
  const checked = allMembersSelected(value, users, roles);
  return <label className={'flex items-center gap-2 min-h-12 w-full rounded-xl border-2 px-3 py-2 font-bold ' + (checked ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-blue-300 text-blue-800') + (disabled ? ' opacity-60' : ' cursor-pointer') + (className ? ' ' + className : '')}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(toggleAllMembers(value, users, roles, event.target.checked))}/>
    <span>全員を選ぶ（{count}人・閲覧のみの人は除く）</span>
  </label>;
}
