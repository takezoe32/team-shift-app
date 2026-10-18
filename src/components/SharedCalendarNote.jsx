import { useRef, useState } from 'react';
import { Save } from 'lucide-react';
import { useEditGuard } from '../editGuard';

const emptyNote = { text: '', version: 0 };
export default function SharedCalendarNote({ note, onSave }) {
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
    if (saveLock.current || !dirty) return;
    saveLock.current = true;
    setSaving(true); setMessage('');
    try {
      await onSave(draft, Number(base.version) || 0);
      setEdit(null); setMessage('全員に共有しました。');
    } catch (error) { setMessage(error.message || '保存できませんでした。入力内容は残っています。'); }
    finally { saveLock.current = false; setSaving(false); }
  };
  return <section className="m-3 rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2" aria-label="みんなの連絡メモ">
    <div className="flex flex-wrap items-center justify-between gap-2"><label htmlFor="calendar-shared-note" className="text-sm font-bold text-gray-800">みんなの連絡メモ</label><span className="text-xs text-gray-600">誰でも書けます。保存すると全員に表示されます。</span></div>
    <textarea id="calendar-shared-note" rows={3} maxLength={4000} value={draft} disabled={saving} onChange={event => { setEdit({ base, text: event.target.value }); setMessage(''); }} placeholder="連絡したいことや、気づいたことを自由に書いてください。" className="w-full rounded-lg border border-amber-200 bg-white p-3 text-base text-gray-800 resize-y focus:outline-none focus:ring-2 focus:ring-amber-400"/>
    {changed && dirty && <div className="rounded-lg border border-orange-200 bg-white p-3 space-y-2 text-sm"><p className="font-bold text-orange-800">ほかの人が更新しました。入力中の内容は残っています。</p><p className="whitespace-pre-wrap break-words text-gray-700">最新のメモ：{value.text || '（空欄）'}</p><button type="button" disabled={saving} onClick={() => { if (window.confirm('入力中の内容を破棄して、最新のメモに戻しますか？')) { setEdit(null); setMessage(''); } }} className="min-h-11 rounded-lg border border-gray-300 px-3 font-bold">最新の内容で書き直す</button></div>}
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-gray-500">{dirty ? '未保存 ' : ''}{draft.length}/4000文字{value.updatedByName ? ' ・ 更新：' + value.updatedByName : ''}</span><button type="button" onClick={save} disabled={saving || !dirty || changed} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-40"><Save size={16}/>{saving ? '保存中…' : '保存'}</button></div>
    {message && <p role="status" className="text-sm text-gray-700">{message}</p>}
  </section>;
}
