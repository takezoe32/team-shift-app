import { periodWeekRows } from '../calendarPeriods.mjs';
export default function CalendarPeriodBars({ periods, day }) {
  const rows = periodWeekRows(periods, day);
  if (!rows.length) return null;
  return <div className="mt-1 w-full space-y-0.5" aria-label="期間タスク">
    {rows.map(task => {
      const name = task.subject || task.text || task.partnerName || '期間タスク';
      const label = `${name}：${task.periodStartDate.replaceAll('-', '/')}〜${task.periodEndDate.replaceAll('-', '/')}（期間中）`;
      return task.active ? <span key={task.key} title={label} aria-label={label} className={`flex min-h-5 w-full items-center gap-0.5 px-0.5 text-[9px] font-bold ${task.kind === 'partner' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'} ${!task.fromBefore ? 'rounded-l-md' : ''} ${!task.continues ? 'rounded-r-md' : ''}`}>
        <span aria-hidden="true" className="shrink-0">{task.fromBefore ? '←' : '●'}</span>
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <span aria-hidden="true" className="shrink-0">{task.continues ? '→' : '●'}</span>
      </span> : <span key={task.key} aria-hidden="true" className="block min-h-5"/>;
    })}
  </div>;
}
