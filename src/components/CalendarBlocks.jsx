import { useEffect, useRef, useState } from 'react';
import { DEFAULT_CALENDAR_BLOCKS, normalizeCalendarBlocks, moveCalendarBlock } from '../calendarBlocks.mjs';
const labels = { memo: '連絡メモ', calendar: 'カレンダー', partner: 'パートナータスク', member: 'メンバータスク' };
export default function CalendarBlocks({ userKey, blocks }) {
  const storageKey = 'calendar-blocks:' + userKey;
  const [order, setOrder] = useState(() => { try { return normalizeCalendarBlocks(JSON.parse(localStorage.getItem(storageKey))); } catch { return DEFAULT_CALENDAR_BLOCKS; } });
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [message, setMessage] = useState('');
  const gesture = useRef(null);
  const suppressClick = useRef(false);
  const containerRef = useRef(null);
  const persist = next => {
    setOrder(next); try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Keep the layout for this session. */ }
    setMessage('配置を保存しました。');
  };
  useEffect(() => {
    const preventScroll = event => { if (gesture.current?.active && event.cancelable) event.preventDefault(); };
    document.addEventListener('touchmove', preventScroll, { passive: false });
    return () => { document.removeEventListener('touchmove', preventScroll); clearTimeout(gesture.current?.timer); cancelAnimationFrame(gesture.current?.frame); };
  }, []);
  const cancel = () => {
    const state = gesture.current;
    gesture.current = null;
    clearTimeout(state?.timer); cancelAnimationFrame(state?.frame);
    if (state?.element?.hasPointerCapture(state.pointer)) state.element.releasePointerCapture(state.pointer);
    setDragging(null); setOver(null); setOffset({ x: 0, y: 0 });
  };
  const down = (event, id) => {
    if (event.button !== 0 || gesture.current || event.target.closest('input, textarea, select, a, summary, img, video, [contenteditable="true"]')) return;
    if (event.pointerType === 'mouse' && !event.target.closest('button, label')) event.preventDefault();
    const element = event.currentTarget;
    const scroller = containerRef.current?.closest('[data-calendar-scroll]');
    const state = { id, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, scrollTop: scroller?.scrollTop || 0, active: false, target: id, pointer: event.pointerId, element };
    gesture.current = state;
    state.timer = setTimeout(() => {
      if (gesture.current !== state) return;
      element.setPointerCapture(state.pointer);
      state.active = true; setDragging(id); setOver(id); setMessage(labels[id] + 'が移動できる状態になりました。');
      const tick = () => {
        if (gesture.current !== state) return;
        const scroll = containerRef.current?.closest('[data-calendar-scroll]');
        if (scroll) {
          const bounds = scroll.getBoundingClientRect();
          if (state.y < bounds.top + 60) scroll.scrollBy({ top: -8 });
          else if (state.y > bounds.bottom - 60) scroll.scrollBy({ top: 8 });
        }
        const next = { x: state.x - state.startX, y: state.y - state.startY + (scroll?.scrollTop || 0) - state.scrollTop };
        setOffset(current => current.x === next.x && current.y === next.y ? current : next);
        const target = document.elementFromPoint(state.x, state.y)?.closest('[data-calendar-block]');
        if (target && containerRef.current?.contains(target)) {
          state.target = target.dataset.calendarBlock;
          setOver(current => current === state.target ? current : state.target);
        }
        state.frame = requestAnimationFrame(tick);
      };
      state.frame = requestAnimationFrame(tick);
    }, 450);
  };
  const move = event => {
    const state = gesture.current;
    if (!state || state.pointer !== event.pointerId) return;
    if (!state.active && Math.hypot(event.clientX - state.startX, event.clientY - state.startY) > 12) { cancel(); return; }
    state.x = event.clientX; state.y = event.clientY;
  };
  const up = event => {
    const state = gesture.current;
    if (!state || state.pointer !== event.pointerId) return;
    if (state.active) {
      suppressClick.current = true;
      setTimeout(() => { suppressClick.current = false; }, 350);
      if (state.target !== state.id) persist(moveCalendarBlock(order, state.id, order.indexOf(state.target)));
    }
    cancel();
  };
  return <div ref={containerRef} className="p-2 sm:p-3">
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)] md:items-start">
      {order.map((id, index) => <section key={id} data-calendar-block={id} role="group" tabIndex={0} aria-label={labels[id] + 'ブロック。枠や見出しを長押しして移動。キーボードではAltと上下矢印で移動。'} title="枠や見出しを長押しして移動" onPointerDown={event => down(event, id)} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onPointerLeave={() => { if (gesture.current && !gesture.current.active) cancel(); }} onLostPointerCapture={() => { if (gesture.current) cancel(); }} onContextMenu={event => { if (gesture.current) event.preventDefault(); }} onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); } }} onKeyDown={event => {
        if (event.key === 'Escape' && gesture.current) { event.preventDefault(); cancel(); }
        if (event.target === event.currentTarget && event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
          event.preventDefault(); persist(moveCalendarBlock(order, id, index + (event.key === 'ArrowUp' ? -1 : 1)));
        }
      }} className={'min-w-0 rounded-xl outline-offset-2 cursor-grab ' + (id === 'memo' ? 'md:col-span-2 ' : id === 'calendar' ? 'md:row-span-2 ' : '') + (dragging === id ? 'ring-2 ring-dashed ring-blue-300 bg-blue-50/50 ' : dragging && over === id ? 'ring-2 ring-blue-500 ' : '')} style={{ touchAction: 'pan-y', userSelect: dragging === id ? 'none' : undefined }}>
        <div className={dragging === id ? 'relative z-30 rounded-xl bg-white shadow-2xl ring-2 ring-blue-400 cursor-grabbing' : ''} style={dragging === id ? { transform: 'translate3d(' + offset.x + 'px,' + offset.y + 'px,0) scale(1.015)', pointerEvents: 'none', willChange: 'transform' } : undefined}>
          {blocks[id]}
        </div>
      </section>)}
    </div>
    <span className="sr-only" role="status">{message}</span>
  </div>;
}
