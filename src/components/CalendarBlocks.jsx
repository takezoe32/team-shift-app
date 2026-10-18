import { useEffect, useRef, useState } from 'react';
import { GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import { DEFAULT_CALENDAR_BLOCKS, normalizeCalendarBlocks, moveCalendarBlock } from '../calendarBlocks.mjs';
const labels = { memo: '連絡メモ', calendar: 'カレンダー', partner: 'パートナータスク', member: 'メンバータスク' };
export default function CalendarBlocks({ userKey, blocks }) {
  const storageKey = 'calendar-blocks:' + userKey;
  const [order, setOrder] = useState(() => { try { return normalizeCalendarBlocks(JSON.parse(localStorage.getItem(storageKey))); } catch { return DEFAULT_CALENDAR_BLOCKS; } });
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState(null);
  const [message, setMessage] = useState('');
  const gesture = useRef(null);
  const containerRef = useRef(null);
  const persist = next => {
    setOrder(next); try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Layout still works for this session. */ }
    setMessage('配置を保存しました。');
  };
  useEffect(() => () => { clearTimeout(gesture.current?.timer); cancelAnimationFrame(gesture.current?.frame); }, []);
  const cancel = () => { clearTimeout(gesture.current?.timer); cancelAnimationFrame(gesture.current?.frame); gesture.current = null; setDragging(null); setOver(null); };
  const down = (event, id) => {
    if (event.button !== 0 || gesture.current) return;
    const state = { id, x: event.clientX, y: event.clientY, active: false, target: id, pointer: event.pointerId };
    gesture.current = state;
    event.currentTarget.setPointerCapture(event.pointerId);
    const activate = () => {
      if (gesture.current !== state) return;
      state.active = true; setDragging(id); setOver(id); setMessage(labels[id] + 'を移動中');
      const tick = () => {
        if (gesture.current !== state || !state.active) return;
        const scroller = containerRef.current?.closest('[data-calendar-scroll]');
        if (scroller) {
          const bounds = scroller.getBoundingClientRect();
          if (state.y < bounds.top + 70) scroller.scrollBy({ top: -10 });
          else if (state.y > bounds.bottom - 70) scroller.scrollBy({ top: 10 });
        }
        const target = document.elementFromPoint(state.x, state.y)?.closest('[data-calendar-block]');
        if (target && containerRef.current?.contains(target)) { state.target = target.dataset.calendarBlock; setOver(current => current === state.target ? current : state.target); }
        state.frame = requestAnimationFrame(tick);
      };
      state.frame = requestAnimationFrame(tick);
    };
    if (event.pointerType === 'mouse') activate();
    else state.timer = setTimeout(activate, 400);
  };
  const move = event => {
    const state = gesture.current;
    if (!state || state.pointer !== event.pointerId) return;
    if (!state.active) {
      if (Math.hypot(event.clientX - state.x, event.clientY - state.y) > 12) cancel();
      return;
    }
    state.x = event.clientX; state.y = event.clientY;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-calendar-block]');
    if (target && containerRef.current?.contains(target)) { state.target = target.dataset.calendarBlock; setOver(state.target); }
    const scroller = containerRef.current?.closest('[data-calendar-scroll]');
    if (scroller) {
      const bounds = scroller.getBoundingClientRect();
      if (event.clientY < bounds.top + 70) scroller.scrollBy({ top: -24 });
      else if (event.clientY > bounds.bottom - 70) scroller.scrollBy({ top: 24 });
    }
  };
  const up = event => {
    const state = gesture.current;
    if (!state || state.pointer !== event.pointerId) return;
    if (state.active && state.target !== state.id) persist(moveCalendarBlock(order, state.id, order.indexOf(state.target)));
    cancel();
  };
  return <div ref={containerRef} className="p-2 sm:p-3">
    <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
      {editing && <><span className="mr-auto text-xs text-gray-500">持ち手を長押しして移動。矢印でも並べ替えられます。</span><button type="button" onClick={() => persist([...DEFAULT_CALENDAR_BLOCKS])} className="min-h-10 rounded-lg border px-2 text-xs text-gray-600">元の配置</button></>}
      <button type="button" onClick={() => { cancel(); setEditing(value => !value); }} aria-pressed={editing} className="min-h-10 rounded-lg border border-gray-200 bg-white px-3 text-xs font-bold text-blue-700">{editing ? '配置を確定' : '配置を変更'}</button>
    </div>
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)] md:items-start">
      {order.map((id, index) => <section key={id} data-calendar-block={id} aria-label={labels[id] + 'ブロック'} className={'min-w-0 ' + (id === 'memo' ? 'md:col-span-2 ' : id === 'calendar' ? 'md:row-span-2 ' : '') + (dragging === id ? 'opacity-60 ' : '') + (dragging && over === id ? 'rounded-xl ring-2 ring-blue-500 ' : '')}>
        {editing && <div className="flex items-center gap-1 rounded-t-lg border border-gray-200 bg-slate-50 p-1">
          <button type="button" aria-label={labels[id] + 'を長押しして移動'} onPointerDown={event => down(event, id)} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={() => { if (gesture.current) cancel(); }} onContextMenu={event => event.preventDefault()} style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }} className="flex min-h-11 min-w-11 flex-1 cursor-grab items-center gap-1 px-2 text-left text-xs font-bold text-gray-600 active:cursor-grabbing"><GripVertical size={18}/>{labels[id]}</button>
          <button type="button" aria-label={labels[id] + 'を前へ移動'} disabled={index === 0 || !!dragging} onClick={() => persist(moveCalendarBlock(order, id, index - 1))} className="min-h-11 min-w-11 rounded border bg-white disabled:opacity-30"><ChevronUp className="mx-auto" size={18}/></button>
          <button type="button" aria-label={labels[id] + 'を後ろへ移動'} disabled={index === order.length - 1 || !!dragging} onClick={() => persist(moveCalendarBlock(order, id, index + 1))} className="min-h-11 min-w-11 rounded border bg-white disabled:opacity-30"><ChevronDown className="mx-auto" size={18}/></button>
        </div>}
        {blocks[id]}
      </section>)}
    </div>
    <span className="sr-only" role="status">{message}</span>
  </div>;
}
