import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { dateLabel, monthDays } from '../dateInput.mjs';

// Render Gregorian dates ourselves so iOS language/calendar settings cannot reorder them.
export default function DateInput({ value = '', onChange, disabled, required, min, max, ...props }) {
  const [month, setMonth] = useState(null);
  const dialog = useRef(null);
  const input = useRef(null);
  useEffect(() => {
    if (month && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [month]);
  const close = () => { dialog.current?.close(); setMonth(null); input.current?.focus(); };
  const choose = date => { onChange?.({ target: { value: date, name: props.name }, currentTarget: { value: date } }); close(); };
  const open = () => {
    if (disabled || input.current?.matches(':disabled')) return;
    const today = new Date();
    const parts = (value || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`).split('-');
    setMonth([Number(parts[0]), Number(parts[1])]);
  };
  const move = offset => { const next = new Date(month[0], month[1] - 1 + offset, 1); setMonth([next.getFullYear(), next.getMonth() + 1]); };
  return <>
    <input {...props} ref={input} type="text" readOnly disabled={disabled} required={required} value={dateLabel(value)} placeholder="西暦/月/日" aria-haspopup="dialog" onClick={open} onKeyDown={event => { if (['Enter', ' ', 'ArrowDown'].includes(event.key)) { event.preventDefault(); open(); } }}/>
    {month && createPortal(<dialog ref={dialog} aria-label="日付を選択" onClose={() => { setMonth(null); input.current?.focus(); }} onCancel={event => { event.preventDefault(); close(); }} className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-sm max-h-[90dvh] overflow-auto rounded-2xl border border-gray-200 bg-white p-4 shadow-xl backdrop:bg-black/40">
      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" aria-label="前の月" onClick={() => move(-1)} className="min-h-11 min-w-11 rounded-lg border">‹</button>
        <div className="flex items-center gap-1 text-base font-bold"><select aria-label="西暦" value={month[0]} onChange={e => setMonth([Number(e.target.value), month[1]])} className="min-h-11 rounded-lg border bg-white px-1">{Array.from({ length: Math.max(2100, month[0]) - Math.min(1900, month[0]) + 1 }, (_, index) => Math.min(1900, month[0]) + index).map(year => <option key={year} value={year}>{year}年</option>)}</select><select aria-label="月" value={month[1]} onChange={e => setMonth([month[0], Number(e.target.value)])} className="min-h-11 rounded-lg border bg-white px-1">{Array.from({ length: 12 }, (_, index) => index + 1).map(m => <option key={m} value={m}>{m}月</option>)}</select></div>
        <button type="button" aria-label="次の月" onClick={() => move(1)} className="min-h-11 min-w-11 rounded-lg border">›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-sm">{['日','月','火','水','木','金','土'].map(day => <span key={day} className="py-2 text-gray-500">{day}</span>)}{monthDays(...month).map((date, index) => date ? <button key={date} type="button" aria-label={dateLabel(date)} aria-pressed={date === value} disabled={(min && date < min) || (max && date > max)} onClick={() => choose(date)} className={'min-h-11 rounded-lg font-bold disabled:opacity-30 ' + (date === value ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-800 hover:bg-blue-100')}>{Number(date.slice(-2))}</button> : <span key={'blank' + index}/>)}</div>
      <div className="mt-4 flex gap-2">{!required && <button type="button" onClick={() => choose('')} className="min-h-11 flex-1 rounded-lg border">クリア</button>}<button type="button" onClick={close} className="min-h-11 flex-1 rounded-lg bg-gray-100 font-bold">閉じる</button></div>
    </dialog>, document.body)}
  </>;
}
