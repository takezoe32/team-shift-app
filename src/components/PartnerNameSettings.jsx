import { useState } from 'react';
import ActionIconButton from './ActionIconButton';
import { useEditGuard } from '../editGuard';

// 設定 > パートナー名の登録: the list of partner (company) names offered when a partner task is entered.
// Names are added, renamed and removed here; renaming also renames the tasks already registered under the old name.
export default function PartnerNameSettings({ names = [], onAdd, onRename, onDelete }) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  useEditGuard(!!draft.trim() || editing !== null || busy, busy);
  const run = async work => { if (busy) return; setBusy(true); try { await work(); } catch (error) { alert(error.message || '保存できませんでした。'); } finally { setBusy(false); } };
  const add = () => run(async () => { const name = draft.trim(); if (name && await onAdd(name)) setDraft(''); });
  const rename = () => run(async () => {
    const next = value.trim();
    if (!next) return;
    if (next !== editing) {
      if (next.toLowerCase() !== editing.toLowerCase() && names.some(name => name.toLowerCase() === next.toLowerCase())) { alert('同じパートナー名がすでに登録されています。'); return; }
      await onRename(editing, next);
    }
    setEditing(null); setValue('');
  });
  const remove = name => run(async () => {
    if (!window.confirm(`「${name}」をパートナー名の登録一覧から削除してもよろしいですか？\n登録済みのタスクは消えません。`)) return;
    await onDelete(name);
  });
  return <section aria-label="パートナー名の登録" className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
    <div className="border-b pb-2 mb-4"><h3 className="font-bold text-gray-700 text-sm">パートナー名の登録</h3><p className="text-[11px] text-gray-500 mt-0.5">パートナータスクの入力で選ぶ会社名の一覧です。</p></div>
    <div className="flex gap-2">
      <input type="text" aria-label="追加するパートナー名" value={draft} disabled={busy} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void add(); } }} placeholder="例：○○会社" className="min-w-0 flex-1 min-h-11 border border-gray-300 rounded-xl px-3 text-base bg-white"/>
      <button type="button" disabled={busy || !draft.trim()} onClick={() => void add()} className="shrink-0 min-h-11 px-4 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-40">追加</button>
    </div>
    {names.length ? <ul className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200">{names.map(name => <li key={name} className="flex items-center gap-2 p-2">
      {editing === name ? <div className="flex min-w-0 flex-1 flex-col gap-2">
        <input autoFocus type="text" aria-label="パートナー名を編集" value={value} disabled={busy} onChange={event => setValue(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void rename(); } if (event.key === 'Escape') { setEditing(null); setValue(''); } }} className="w-full min-h-11 border border-blue-300 rounded-lg px-3 text-base"/>
        <div className="flex gap-2"><button type="button" disabled={busy || !value.trim()} onClick={() => void rename()} className="flex-1 min-h-11 rounded-lg bg-blue-600 text-sm font-bold text-white disabled:opacity-50">保存</button><button type="button" disabled={busy} onClick={() => { setEditing(null); setValue(''); }} className="flex-1 min-h-11 rounded-lg bg-gray-100 text-sm text-gray-700">取消</button></div>
      </div> : <>
        <span className="min-w-0 flex-1 break-words px-1 text-base text-gray-800">{name}</span>
        <ActionIconButton action="edit" disabled={busy} onClick={() => { setEditing(name); setValue(name); }} aria-label={`パートナー名「${name}」を編集`} title="パートナー名を編集"/>
        <ActionIconButton action="delete" disabled={busy} onClick={() => void remove(name)} aria-label={`パートナー名「${name}」を削除`} title="パートナー名を削除"/>
      </>}
    </li>)}</ul> : <p className="mt-4 text-sm text-gray-500">まだ登録がありません。上の欄から追加してください。</p>}
  </section>;
}
