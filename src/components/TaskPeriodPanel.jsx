import { useRef, useState } from 'react';
import DateInput from './DateInput';
import { useEditGuard, confirmEditDiscard } from '../editGuard';
import { japanToday, japanDateTime } from '../japanTime.mjs';
import { isPeriodTask } from '../periodTask.mjs';
export default function TaskPeriodPanel({ item, startDate, onChange, canEdit = false, canWork = false }) {
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  useEditGuard(editing || !!note || busy, busy);
  const period = isPeriodTask(item), today = japanToday(), record = item.dailyWork?.[today];
  const save = async operation => {
    if (!onChange || lock.current) return;
    if (operation.action === 'daily' && !window.confirm('本日の作業を終了し、申し送りと日報用の記録を保存しますか？\n期間全体のタスクは継続します。')) return;
    lock.current = true; setBusy(true); setMessage('');
    try { await onChange({ periodOperation: operation }); setEditing(false); setNote(''); setMessage(operation.action === 'daily' ? '本日の作業終了を記録しました。日報の作成・更新時に反映されます。' : '作業期間を設定しました。'); }
    catch (error) { setMessage(error.message || '保存できませんでした。'); }
    finally { lock.current = false; setBusy(false); }
  };
  if (!period && !canEdit) return null;
  return <section className="my-3 space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-3" onClick={event => event.stopPropagation()}>
    <div className="text-sm font-bold">{period ? `作業期間：${item.periodStartDate.replaceAll('-', '/')} 〜 ${item.periodEndDate.replaceAll('-', '/')}` : '複数日にわたる作業'}</div>
    {canEdit && !item.completed && !editing && <button type="button" disabled={busy} onClick={() => { setStart(item.periodStartDate || startDate); setEnd(item.periodEndDate || startDate); setEditing(true); }} className="min-h-11 rounded-lg border bg-white px-3 text-sm font-bold">{period ? '作業期間を変更' : '作業期間を設定'}</button>}
    {editing && <div className="space-y-2"><label className="block text-sm font-bold">開始日<DateInput required value={start} disabled={busy} onChange={e => setStart(e.target.value)} className="block min-h-11 w-full rounded-lg border bg-white p-2"/></label><label className="block text-sm font-bold">終了日<DateInput required min={start} value={end} disabled={busy} onChange={e => setEnd(e.target.value)} className="block min-h-11 w-full rounded-lg border bg-white p-2"/></label><div className="flex gap-2"><button type="button" disabled={busy} onClick={() => { if (confirmEditDiscard(true,busy)) setEditing(false); }} className="min-h-11 rounded-lg border bg-white px-3">キャンセル</button><button type="button" disabled={busy || !start || !end} onClick={() => void save({ action:'set', startDate:start, endDate:end })} className="min-h-11 rounded-lg bg-blue-600 px-3 font-bold text-white">期間を保存</button></div></div>}
    {period && !item.completed && <>{record ? <p className="text-sm font-bold text-green-700">本日の作業終了済み：{record.actorName}（{japanDateTime(record.completedAt)}）</p> : canWork && today >= item.periodStartDate && today <= item.periodEndDate ? <><label className="block text-sm font-bold">本日の申し送り（任意）<textarea value={note} disabled={busy} onChange={e => setNote(e.target.value)} rows={3} className="mt-1 w-full rounded-lg border bg-white p-2 text-base" placeholder="本日の作業内容、明日の引き継ぎなど"/></label><button type="button" disabled={busy} onClick={() => void save({ action:'daily', note })} className="min-h-12 w-full rounded-xl bg-green-600 px-3 font-bold text-white">{busy ? '保存中…' : '本日の作業終了'}</button></> : <p className="text-xs text-gray-600">本日の作業終了は、作業期間内の当日に登録できます。</p>}<p className="text-xs text-gray-600">毎日の作業終了を記録してもタスクは継続します。すべて完了したら「期間全体を終了」を押してください。</p></>}
    {Object.entries(item.dailyWork || {}).sort(([a],[b])=>b.localeCompare(a)).map(([day,work])=><div key={day} className="rounded-lg bg-white p-2 text-xs"><div className="font-bold">{day.replaceAll('-','/')} 作業終了 ・ {work.actorName}</div>{work.note && <p className="mt-1 whitespace-pre-wrap">{work.note}</p>}</div>)}
    {message && <p role="status" className="text-sm text-blue-800">{message}</p>}
  </section>;
}
