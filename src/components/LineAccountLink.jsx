import { useRef, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';

export default function LineAccountLink({ currentUser }) {
  const [open, setOpen] = useState(false), [command, setCommand] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const lock = useRef(false);
  if (!currentUser?.id || currentUser.role === 'viewer') return null;
  const issue = async response => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try {
      const result = await fetch('/api/line-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'accountLink', appUid: currentUser.id, credential: response.credential }) });
      const value = await result.json();
      if (!result.ok) throw new Error(value.error || 'LINEとの連携コードを作成できませんでした。');
      setCommand(value.command);
      setMessage('10分以内に、公式アカウント「管理課 タスク受付」との個別トークへ送ってください。コードは本人用です。他の人へ渡さないでください。');
    } catch (error) { setMessage(error.message); }
    finally { lock.current = false; setBusy(false); }
  };
  return <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-3">
    <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} className="min-h-11 text-sm font-bold text-green-900">自分のLINEを連携する {open ? '▲' : '▼'}</button>
    {open && <><p className="text-sm">{currentUser.name}さんの登録メールアドレス（{currentUser.email}）とLINEを結び付けます。LINE名が違っても担当者はご本人になります。最初の1回だけ行ってください。</p>
      <p className="text-sm">本人確認のため、アプリと同じGoogleアカウントを選んでください。</p>
      {!busy && <GoogleLogin onSuccess={issue} onError={() => setMessage('Googleの本人確認をやり直してください。')}/>}
      {busy && <p className="text-sm">連携コードを作成中…</p>}
      {command && <><input aria-label="本人用LINE連携コード" readOnly value={command} onFocus={event => event.target.select()} className="min-h-11 w-full rounded-lg border bg-white px-2 text-sm"/><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(command); setMessage('コピーしました。自分のLINEから、公式アカウントとの個別トークに送ってください。'); } catch { setMessage('コード欄を選択してコピーしてください。'); } }} className="min-h-11 rounded-lg bg-green-700 px-4 text-sm font-bold text-white">本人用コードをコピー</button></>}
    </>}
    {message && <p role="status" className="text-sm text-gray-700">{message}</p>}
  </div>;
}
