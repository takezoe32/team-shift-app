import { periodWeekRows } from '../calendarPeriods.mjs';
export function CalendarPeriodSpace({ periods, day }) {
  const rows = periodWeekRows(periods, day);
  return rows.length ? <span aria-hidden="true" className="mt-1 block" style={{ height: rows.length * 22 + 10 }}/> : null;
}
export default function CalendarPeriodBars({ periods, weekStart, month, onTask }) {
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
      return <button type="button" key={task.key} onClick={() => onTask(task)} title={label} aria-label={label} style={{gridColumn:`${columns[0]+1} / ${columns.at(-1)+2}`,gridRow:index+1}} className={`pointer-events-auto mx-1 flex min-w-0 items-center rounded-md px-2 text-left text-[10px] font-semibold transition-colors hover:brightness-95 focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:outline-offset-1 ${task.kind === 'partner' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
        <span className="min-w-0 truncate">{name}</span>
      </button>;
    })}
  </div>;
}
