import { useRef, useState } from 'react';
import { useEditGuard } from '../editGuard';

export default function QuickEntry({ title, steps, summary, onSave, onClose }) {
  const [page, setPage] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const heading = useRef(null);
  useEditGuard(true, saving);
  const review = page === steps.length;
  const move = next => { setError(''); setPage(next); requestAnimationFrame(() => heading.current?.focus()); };
  const save = async () => {
    if (lock.current) return;
    lock.current = true; setSaving(true); setError('');
    try {
      if (await onSave()) onClose();
      else setError('登録できませんでした。入力内容を確認して、もう一度お試しください。');
    } catch { setError('登録できませんでした。入力内容は残っています。もう一度お試しください。'); }
    finally { lock.current = false; setSaving(false); }
  };
  return <div className="fixed inset-x-0 top-0 bottom-[68px] z-[100] bg-white overflow-y-auto" role="region" aria-label={title} onKeyDown={event => { if (event.key === 'Escape' && !saving) onClose(); }}>
    <div className="max-w-xl mx-auto p-5 pb-12 text-base">
      <button autoFocus type="button" disabled={saving} onClick={onClose} className="min-h-12 px-4 rounded-xl border border-gray-300 mb-5">通常入力に切り替える</button>
      <p className="text-blue-700 font-bold">{title} ・ {page + 1} / {steps.length + 1}</p>
      <h2 ref={heading} tabIndex={-1} className="text-2xl font-bold mt-3 mb-3">{review ? 'この内容で登録しますか？' : steps[page].title}</h2>
      <p className="text-gray-600 mb-6">{review ? '間違いがあれば「戻る」で直せます。' : '空欄を埋めたら、下の「次へ」を押してください。'}</p>
      <fieldset disabled={saving} className="space-y-6 min-w-0">
        {review ? <dl className="space-y-4 bg-blue-50 p-4 rounded-xl">{summary.map(([label, value]) => <div key={label}><dt className="font-bold text-gray-600">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{value || 'なし'}</dd></div>)}</dl> : steps[page].content}
      </fieldset>
      {error && <p role="alert" className="my-4 text-red-700 font-bold">{error}</p>}
      <div className="flex gap-3 mt-8">
        {page > 0 && <button type="button" disabled={saving} onClick={() => move(page - 1)} className="min-h-14 px-6 border border-gray-300 rounded-xl font-bold">戻る</button>}
        <button type="button" disabled={saving} onClick={() => { if (review) { save(); return; } const message = steps[page].validate?.(); if (message) setError(message); else move(page + 1); }} className="flex-1 min-h-14 px-4 bg-blue-600 text-white rounded-xl text-lg font-bold disabled:opacity-50">{saving ? '登録しています…' : review ? 'この内容で登録する' : '次へ'}</button>
      </div>
      <p className="mt-5 text-gray-500">通常入力に切り替えても、入力した内容は残ります。</p>
    </div>
  </div>;
}
