export function ImportantBadge({ important }) {
  return important === true ? <span className="shrink-0 inline-flex rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">重要</span> : null;
}
export default function ImportantToggle({ value, onChange, disabled = false }) {
  return <label className="flex min-h-11 items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-bold text-red-700"><input type="checkbox" checked={value === true} disabled={disabled} onChange={event => onChange(event.target.checked)} className="h-5 w-5 accent-red-600"/>重要</label>;
}
