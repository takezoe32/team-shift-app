import { useRef, useState } from 'react';
import ActionIconButton from './ActionIconButton';
import { ImageGallery } from './TaskImages';

export default function HandoffEntry({ update, onChange, onOpen }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [expected, setExpected] = useState(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const mutate = async (action) => {
    if (!onChange || saving.current) return;
    if (action === 'delete' && !window.confirm('この申し送りを削除しますか？')) return;
    saving.current = true;
    setBusy(true);
    try {
      await onChange({
        action, id: update.id, text: text.trim(),
        expectedText: action === 'edit' ? expected.text : update.text,
        expectedUpdatedAt: action === 'edit' ? expected.updatedAt : (update.updatedAt || ''),
        updatedAt: new Date().toISOString()
      });
      setEditing(false);
    } catch (error) { window.alert(error.message || '申し送りを保存できませんでした。'); }
    finally { saving.current = false; setBusy(false); }
  };
  return <div className="min-w-0 rounded-xl border border-gray-200 bg-white p-3" onClick={event => event.stopPropagation()}>
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 text-xs font-bold text-gray-600">{update.authorName || '不明なユーザー'}{update.createdAt ? ' ・ ' + new Date(update.createdAt).toLocaleString('ja-JP') : ''}{update.updatedAt && <span className="ml-1 text-gray-400">編集済み</span>}</div>
      {onChange && !editing && <div className="flex shrink-0 gap-1"><ActionIconButton action="edit" aria-label="申し送りを編集" disabled={busy} onClick={() => { setText(update.text || ''); setExpected({ text: update.text, updatedAt: update.updatedAt || '' }); setEditing(true); }}/><ActionIconButton action="delete" aria-label="申し送りを削除" disabled={busy} onClick={() => void mutate('delete')}/></div>}
    </div>
    {editing ? <div className="mt-2 space-y-2"><textarea aria-label="申し送りの内容" value={text} onChange={event => setText(event.target.value)} disabled={busy} rows={4} className="w-full rounded-lg border p-2 text-base"/><div className="flex gap-2"><button type="button" disabled={busy} onClick={() => setEditing(false)} className="min-h-11 flex-1 rounded-lg bg-gray-100 text-sm font-bold">キャンセル</button><button type="button" disabled={busy || !text.trim()} onClick={() => void mutate('edit')} className="min-h-11 flex-1 rounded-lg bg-blue-600 text-sm font-bold text-white disabled:opacity-50">{busy ? '保存中…' : '保存'}</button></div></div> : <div className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-800">{update.text}</div>}
    <ImageGallery item={update} onOpen={onOpen}/>
  </div>;
}
