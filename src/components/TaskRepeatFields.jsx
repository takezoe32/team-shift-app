import DateInput from './DateInput';
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const startParts = start => { const date = new Date((start || '') + 'T12:00:00Z'); return Number.isNaN(date.getTime()) ? { weekday: null, day: 1 } : { weekday: date.getUTCDay(), day: date.getUTCDate() }; };
// Repeat choice for member/partner tasks. A repeating task has no end date, so the period end field is shown only without a repeat.
export default function TaskRepeatFields({ repeat, onRepeat, periodEnd, onPeriodEnd, min, disabled = false, labelClassName = 'block text-sm font-bold', inputClassName = 'block min-h-12 w-full mt-1 border rounded-xl bg-white p-3 text-base' }) {
  const type = repeat?.type || '';
  const choose = value => {
    const { weekday, day } = startParts(min);
    onRepeat(value === 'weekly' ? { type: 'weekly', weekdays: weekday === null ? [] : [weekday] } : value === 'monthly' ? { type: 'monthly', day } : null);
    if (value) onPeriodEnd('');
  };
  const toggle = day => onRepeat({ type: 'weekly', weekdays: repeat.weekdays.includes(day) ? repeat.weekdays.filter(d => d !== day) : [...repeat.weekdays, day].sort((a, b) => a - b) });
  return <>
    <label className={labelClassName}>繰り返し<select aria-label="繰り返し" value={type} disabled={disabled} onChange={e => choose(e.target.value)} className={inputClassName}><option value="">しない</option><option value="weekly">毎週（曜日を選ぶ）</option><option value="monthly">毎月（日にちを選ぶ）</option></select></label>
    {type === 'weekly' && <fieldset className="space-y-1"><legend className={labelClassName}>曜日（複数選べます）</legend><div className="grid grid-cols-7 gap-1">{WEEKDAYS.map((name, day) => { const on = repeat.weekdays.includes(day); return <button type="button" key={name} aria-pressed={on} aria-label={name + '曜日'} disabled={disabled} onClick={() => toggle(day)} className={`min-h-11 rounded-lg border text-sm font-bold ${on ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700'} ${day === 0 ? 'text-red-600' : day === 6 ? 'text-blue-700' : ''} ${on ? 'text-white!' : ''}`}>{name}</button>; })}</div>{!repeat.weekdays.length && <p className="text-xs font-bold text-red-700">曜日を1つ以上選んでください。</p>}</fieldset>}
    {type === 'monthly' && <label className={labelClassName}>日にち<select aria-label="毎月の日にち" value={repeat.day} disabled={disabled} onChange={e => onRepeat({ type: 'monthly', day: Number(e.target.value) })} className={inputClassName}>{Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>毎月{i + 1}日</option>)}</select>{repeat.day > 28 && <span className="mt-1 block text-xs font-normal text-gray-600">{repeat.day}日がない月は、その月の最終日に表示します。</span>}</label>}
    {type ? <p className="text-xs text-gray-600">開始日から繰り返します。終了日はなく、「繰り返しを終了」を押すまで続きます。</p> : <label className={labelClassName}>作業期間の終了日（複数日の場合）<DateInput min={min} value={periodEnd} onChange={e => onPeriodEnd(e.target.value)} disabled={disabled} className={inputClassName}/></label>}
  </>;
}
