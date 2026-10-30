import { periodWeekRows } from '../calendarPeriods.mjs';
export function CalendarPeriodSpace({ periods, day }) {
  const rows = periodWeekRows(periods, day);
  return rows.length ? <span aria-hidden="true" className="mt-1 block" style={{ height: rows.length * 22 + 10 }}/> : null;
}
export default function CalendarPeriodBars({ periods, weekStart, month }) {
  const rows = periodWeekRows(periods, weekStart);
  if (!rows.length) return null;
  const start = new Date(weekStart + 'T12:00:00Z');
  const dates = Array.from({length:7}, (_,index) => {
    const date = new Date(start); date.setUTCDate(start.getUTCDate() + index);
    return date.toISOString().slice(0,10);
  });
  return <div className="pointer-events-none absolute inset-x-0 top-9 z-10 grid grid-cols-7 gap-y-0.5" style={{gridAutoRows:'20px'}} aria-label="期間タスク">
    {rows.map((task,index) => {
      const columns = dates.map((day,col) => day.startsWith(month) && task.periodStartDate <= day && day <= task.periodEndDate ? col : -1).filter(col => col >= 0);
      if (!columns.length) return null;
      const name = task.subject || task.text || task.partnerName || '期間タスク';
      const label = `${name}：${task.periodStartDate.replaceAll('-', '/')}〜${task.periodEndDate.replaceAll('-', '/')}`;
      return <div key={task.key} title={label} aria-label={label} style={{gridColumn:`${columns[0]+1} / ${columns.at(-1)+2}`,gridRow:index+1}} className={`mx-1 flex min-w-0 items-center gap-1 rounded-md px-1 text-[10px] font-bold ${task.kind === 'partner' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
        <span aria-hidden="true">←</span><span aria-hidden="true" className="min-w-1 flex-1 border-t border-current"/>
        <span className="min-w-0 max-w-[80%] truncate">{name}</span>
        <span aria-hidden="true" className="min-w-1 flex-1 border-t border-current"/><span aria-hidden="true">→</span>
      </div>;
    })}
  </div>;
}
