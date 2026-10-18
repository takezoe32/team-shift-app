import { Edit2, Trash2 } from 'lucide-react';
export default function ActionIconButton({ action, className = '', title, 'aria-label': label, ...props }) {
  const deleting = action === 'delete';
  const Icon = deleting ? Trash2 : Edit2;
  const name = label || title || (deleting ? '削除' : '編集');
  return <button type="button" {...props} aria-label={name} title={title || name} className={'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ' + (deleting ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100 ' : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 ') + className}><Icon size={20} aria-hidden="true"/></button>;
}
