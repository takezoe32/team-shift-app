// The three kinds of entry on the task screen (下の「タスク」): a member task, a partner task or a private memo.
// The same row is shown on the member and the partner form, so choosing a kind switches between them.
const TASK_KINDS = [
  { id: 'member', label: '個人タスク', icon: '👥', on: 'bg-blue-600 border-blue-600 text-white', note: 'メンバーが担当するタスクです。みんなに公開されます。' },
  { id: 'partner', label: 'パートナータスク', parts: ['パートナー', 'タスク'], icon: '🏢', on: 'bg-teal-600 border-teal-600 text-white', note: 'パートナー会社（業者）の予定です。みんなに公開されます。' },
  { id: 'memo', label: '個人メモ', icon: '🔒', on: 'bg-purple-600 border-purple-600 text-white', note: '自分だけに表示されます。日報には含まれません。' },
];
// only: the kind ids to offer (the read-only screen has no memo).
export default function TaskKindTabs({ value, onChange, disabled = false, memoDisabled = false, only = null }) {
  const kinds = only ? TASK_KINDS.filter(kind => only.includes(kind.id)) : TASK_KINDS;
  const current = kinds.find(kind => kind.id === value);
  return <div role="group" aria-label="登録する種類" className="mb-3">
    <div className={'grid gap-2 ' + (kinds.length === 2 ? 'grid-cols-2' : 'grid-cols-3')}>{kinds.map(kind => {
      const off = disabled || (kind.id === 'memo' && memoDisabled);
      return <button type="button" key={kind.id} aria-pressed={kind.id === value} disabled={off} title={kind.id === 'memo' && memoDisabled ? '個人メモは、自分の名前を選んでいるときだけ登録できます。' : undefined} onClick={() => { if (kind.id !== value) onChange(kind.id); }} className={'min-h-14 rounded-xl border-2 px-0.5 text-xs sm:text-sm font-bold leading-tight break-keep disabled:opacity-40 ' + (kind.id === value ? kind.on : 'bg-white border-gray-200 text-gray-700')}><span aria-hidden="true" className="block text-base">{kind.icon}</span>{kind.parts ? kind.parts.map((part, index) => <span key={part}>{index > 0 && <wbr/>}{part}</span>) : kind.label}</button>;
    })}</div>
    {current && <p className="mt-1 text-xs text-gray-600">{current.note}{memoDisabled && value !== 'memo' && kinds.some(kind => kind.id === 'memo') ? ' 個人メモは、自分の名前を選んでいるときだけ選べます。' : ''}</p>}
  </div>;
}
