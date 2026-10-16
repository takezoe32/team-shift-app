import { useRef, useState } from 'react';
import QuarterHourTime from './QuarterHourTime';
import { useEditGuard, confirmEditDiscard } from '../editGuard';
import { planPartnerSchedule } from '../partnerSchedule.mjs';

export default function PartnerScheduleEditor({ item, onSave, disabled }) {
  const [open, setOpen] = useState(false);
  const [schedule, setSchedule] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const changed = open && (schedule.date !== item.date || schedule.time !== item.time || schedule.endTime !== (item.endTime || ''));
  useEditGuard(changed || saving, saving);
  if (item.completed) return null;
  const change = (key, value) => setSchedule(current => ({ ...current, [key]: value }));
  const save = async () => {
    if (lock.current) return;
    try { planPartnerSchedule([item], item.id, schedule); } catch (failure) { setError(failure.message); return; }
    lock.current = true; setSaving(true); setError('');
    try { await onSave(item.id, schedule); setOpen(false); }
    catch (failure) { setError(failure.message || '日程を保存できませんでした。'); }
    finally { lock.current = false; setSaving(false); }
  };
  return <div className="w-full border-t border-gray-100 pt-3 mt-2">
    {!open ? <button type="button" disabled={disabled} onClick={() => { setSchedule({ date: item.date || '', time: item.time || '', endTime: item.endTime || '' }); setError(''); setOpen(true); }} className="min-h-12 w-full rounded-xl border border-blue-300 bg-blue-50 text-blue-700 font-bold">日程を変更する</button> : <fieldset disabled={saving || disabled} className="bg-blue-50 border border-blue-200 p-3 rounded-xl space-y-4">
      <legend className="font-bold">日程変更：{item.subject || item.partnerName}</legend>
      <label className="block font-bold">日付<input autoFocus type="date" value={schedule.date} onChange={e => change('date', e.target.value)} className="w-full min-h-12 rounded-xl border border-gray-300 p-3 bg-white mt-2"/></label>
      <QuarterHourTime label="開始時間" required value={schedule.time} onChange={value => change('time', value)}/>
      <QuarterHourTime label="終了予定" value={schedule.endTime} onChange={value => change('endTime', value)}/>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => { if (confirmEditDiscard(changed, saving)) setOpen(false); }} className="min-h-12 rounded-xl border bg-white font-bold">やめる</button><button type="button" onClick={save} className="min-h-12 rounded-xl bg-blue-600 text-white font-bold">{saving ? '保存中…' : '日程を保存'}</button></div>
    </fieldset>}
  </div>;
}
