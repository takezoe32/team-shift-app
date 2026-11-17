// Required fields in the task forms, so a missing one is seen at a glance: a badge on the label (red 「必須・未入力」,
// green once filled), a red-tinted box while empty (requiredBox), and above the save button what is still missing.
export function RequiredBadge({ filled }) {
  return <span className={`ml-2 inline-block rounded px-1.5 py-1 align-middle text-[11px] font-bold leading-none ${filled ? 'bg-green-100 text-green-800' : 'bg-red-600 text-white'}`}>{filled ? '必須・入力済み' : '必須・未入力'}</span>;
}
export function RequiredSummary({ missing }) {
  return missing.length
    ? <p role="status" className="rounded-xl border-2 border-red-400 bg-red-50 p-3 text-sm font-bold text-red-800">未入力の必須項目：{missing.join('、')}</p>
    : <p role="status" className="rounded-xl border border-green-300 bg-green-50 p-3 text-sm font-bold text-green-800">✓ 必須項目はすべて入力済みです。</p>;
}
