import { isPeriodTask, taskOnDay } from '../periodTask.mjs';
import { ImportantBadge } from './ImportantToggle';
import { useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { calendarDayData } from '../calendarDay.mjs';

export default function CalendarDayPanel({ date, today, teamData, partnerItems, users, shiftTypes, onClose, onDateChange, onTask, onPartner }) {
  const closeRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    const escape = event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('keydown', escape); previous?.focus?.(); };
  }, [onClose]);
  const { tasks, partners, staff } = calendarDayData(date, teamData, partnerItems, users, shiftTypes);
  const names = ids => ids.map(id => users.find(user => user.id === id)?.name || '担当者不明').join('・') || '未設定';
  const move = days => {
    const value = new Date(date + 'T12:00:00+09:00');
    value.setUTCDate(value.getUTCDate() + days);
    onDateChange(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(value));
  };
  const isOngoing = item => !item.completed && isPeriodTask(item) && taskOnDay(item, item.date || item.taskDate, today);
  const status = item => <span className={'shrink-0 rounded-full px-2 py-1 text-xs font-bold ' + (item.completed ? 'bg-green-100 text-green-800' : isOngoing(item) ? 'bg-blue-100 text-blue-800' : date <= today ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800')}>{item.completed ? '終了済み' : isOngoing(item) ? '今日・期間中' : date <= today ? '未終了' : '予定'}</span>;
  const row = (item, partner) => <button type="button" key={partner ? item.id : item.ownerUid + ':' + item.id} onClick={() => partner ? onPartner(item) : onTask(item)} className={"w-full rounded-xl border bg-white p-3 text-left active:bg-blue-50 " + (item.important === true ? "border-2 border-red-500" : "border-gray-200 hover:border-blue-400")}>
    <div className="flex items-center justify-between gap-2">{partner ? <span className="text-sm font-bold text-purple-700">{date.replaceAll('-', '/')} {item.time || '時刻未設定'} <ImportantBadge important={item.important}/> {item.partnerName || 'パートナー未設定'}</span> : <span className="text-xs text-gray-500">対象日 {date.replaceAll('-', '/')} <ImportantBadge important={item.important}/><br/>終了予定 {item.endTime || '未設定'}</span>}{status(item)}</div>
    <div className="mt-2 break-words whitespace-pre-wrap text-base font-bold text-gray-900">{item.subject || (partner ? item.content : item.text) || '件名なし'}</div>
    <div className="mt-2 text-xs text-gray-600">担当：{names(item.assigneeIds)}</div>
    <div className="mt-1 text-right text-xs font-bold text-blue-700">詳細を開く ›</div>
  </button>;
  return <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-2 pt-3 pb-[80px] sm:px-4" onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-labelledby="calendar-day-heading" className="flex w-full max-w-lg max-h-full flex-col overflow-hidden rounded-2xl bg-gray-50 shadow-xl" onClick={event => event.stopPropagation()}>
      <header className="flex shrink-0 items-center justify-between gap-1 border-b bg-white p-3">
        <button type="button" aria-label="前の日" onClick={() => move(-1)} className="min-h-11 min-w-11 rounded-lg hover:bg-gray-100"><ChevronLeft className="mx-auto" size={20}/></button>
        <h2 id="calendar-day-heading" className="text-center text-base font-bold">{date.replaceAll('-', '/')}（{new Intl.DateTimeFormat('ja-JP', { weekday: 'short', timeZone: 'Asia/Tokyo' }).format(new Date(date + 'T12:00:00+09:00'))}）</h2>
        <button type="button" aria-label="次の日" onClick={() => move(1)} className="min-h-11 min-w-11 rounded-lg hover:bg-gray-100"><ChevronRight className="mx-auto" size={20}/></button>
        <button ref={closeRef} type="button" aria-label="日付の一覧を閉じる" onClick={onClose} className="min-h-11 min-w-11 rounded-lg hover:bg-gray-100"><X className="mx-auto" size={20}/></button>
      </header>
      <div className="min-h-0 overflow-y-auto p-3 space-y-4">
        <section><h3 className="text-sm font-bold text-gray-700">出勤者</h3><p className="mt-1 rounded-xl bg-white p-3 text-sm text-gray-800">{staff.map(user => user.name).join('・') || '出勤者の登録はありません'}</p></section>
        {!tasks.length && !partners.length && <p className="rounded-xl bg-white p-4 text-center text-sm text-gray-500">この日のタスクはありません</p>}
        <section><h3 className="mb-2 text-sm font-bold text-gray-700">日別タスク（{tasks.length}件）</h3><div className="space-y-2">{tasks.length ? tasks.map(item => row(item, false)) : <p className="text-sm text-gray-500">日別タスクはありません</p>}</div></section>
        <section><h3 className="mb-2 text-sm font-bold text-purple-800">パートナータスク（{partners.length}件）</h3><div className="space-y-2">{partners.length ? partners.map(item => row(item, true)) : <p className="text-sm text-gray-500">パートナータスクはありません</p>}</div></section>
      </div>
    </section>
  </div>;
}
