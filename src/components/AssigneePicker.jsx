import { RequiredBadge } from './RequiredField';
import { requiredBox } from '../requiredFields.mjs';
// At least one person is required wherever this is used.
export default function AssigneePicker({ users = [], value, onChange, disabled = false }) {
  return <fieldset disabled={disabled} className={'space-y-2 rounded-xl border p-2 ' + requiredBox(value.length > 0)}><legend className="px-1 font-bold">担当者（複数選べます）<RequiredBadge filled={value.length > 0}/></legend><div className="flex flex-wrap gap-2">{users.map(user => <label key={user.id} className={`flex items-center gap-2 min-h-12 border-2 rounded-xl px-3 py-2 ${value.includes(user.id) ? 'bg-blue-50 border-blue-500 text-blue-800' : 'bg-white border-gray-200'}`}><input type="checkbox" checked={value.includes(user.id)} onChange={e => onChange(e.target.checked ? [...value, user.id] : value.filter(id => id !== user.id))}/><span>{user.name}</span></label>)}</div></fieldset>;
}
