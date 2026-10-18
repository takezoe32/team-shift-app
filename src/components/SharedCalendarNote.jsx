import { useRef, useState } from 'react';
import { Save } from 'lucide-react';
import { useEditGuard } from '../editGuard';

const emptyNote = { text: '', version: 0 };
export default function SharedCalendarNote({ note, onSave, readOnly = false }) {
  const value = note || emptyNote;
  const [edit, setEdit] = useState(null);
  const activeEdit = edit && edit.text !== (edit.base.text || '') ? edit : null;
  const base = activeEdit?.base || value;
  const draft = activeEdit?.text ?? (value.text || '');
  const [saving, setSaving] = useState(false);
  const saveLock = useRef(false);
  const [message, setMessage] = useState('');
  const dirty = draft !== (base.text || '');
  const changed = (Number(value.version) || 0) !== (Number(base.version) || 0);
  useEditGuard(dirty, saving);
  const save = async () => {
    if (readOnly || saveLock.current || !dirty) return;
    saveLock.current = true;
    setSaving(true); setMessage('');
    try {
      await onSave(draft, Number(base.version) || 0);
      setEdit(null); setMessage('全員に共有しました。');
    } catch (error) { setMessage(error.message || '保存できませんでした。入力内容は残っています。'); }
    finally { saveLock.current = false; setSaving(false); }
  };
  if (readOnly) return <section className="mx-3 my-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-2"><h3 className="text-xs font-bold text-gray-700">みんなの連絡メモ</h3><p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-800">{value.text || '連絡メモはありません'}</p></section>;
  return <section className="mx-3 my-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 space-y-1" aria-label="みんなの連絡メモ">
    <div className="flex items-center justify-between gap-2"><label htmlFor="calendar-shared-note" className="text-xs font-bold text-gray-700">みんなの連絡メモ</label><span className="text-[10px] text-gray-500">{dirty ? '未保存' : '全員に共有'}</span></div>
    <div className="flex items-start gap-2"><textarea id="calendar-shared-note" rows={1} maxLength={4000} value={draft} disabled={saving} onChange={event => { setEdit({ base, text: event.target.value }); setMessage(''); }} placeholder="連絡事項を入力（全員に共有）" className="min-w-0 flex-1 min-h-10 rounded-md border border-amber-200 bg-white px-2 py-2 text-sm text-gray-800 resize-y focus:outline-none focus:ring-2 focus:ring-amber-400"/><button type="button" onClick={save} disabled={saving || !dirty || changed} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1 rounded-md bg-blue-600 px-2 text-xs font-bold text-white disabled:opacity-40"><Save size={14}/>{saving ? '保存中…' : '保存'}</button></div>
    {changed && dirty && <div className="rounded-lg border border-orange-200 bg-white p-3 space-y-2 text-sm"><p className="font-bold text-orange-800">ほかの人が更新しました。入力中の内容は残っています。</p><p className="whitespace-pre-wrap break-words text-gray-700">最新のメモ：{value.text || '（空欄）'}</p><button type="button" disabled={saving} onClick={() => { if (window.confirm('入力中の内容を破棄して、最新のメモに戻しますか？')) { setEdit(null); setMessage(''); } }} className="min-h-11 rounded-lg border border-gray-300 px-3 font-bold">最新の内容で書き直す</button></div>}
    {value.updatedByName && <p className="text-[10px] text-gray-500">更新：{value.updatedByName}</p>}
    {message && <p role="status" className="text-sm text-gray-700">{message}</p>}
  </section>;
}
