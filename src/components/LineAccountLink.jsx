import { useEffect, useRef, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';

export default function LineAccountLink({ currentUser }) {
  const [ready, setReady] = useState(null), [verify, setVerify] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    fetch('/api/line-login').then(result => result.json()).then(value => { if (active) setReady(value.ready === true); }).catch(() => { if (active) setMessage('連携設定を確認できませんでした。画面を再読み込みしてください。'); });
    return () => { active = false; };
  }, []);
  if (!currentUser?.id || currentUser.role === 'viewer') return null;
  const outcome = new URLSearchParams(window.location.search).get('line_link');
  const outcomes = { success: 'LINEと連携しました。個別トークに「タスク」または「追記」と送ってください。', cancelled: 'LINEとの連携をキャンセルしました。', failed: '連携できませんでした。「LINEと連携する」からやり直してください。', friend_required: '公式アカウントを友だち追加してから、もう一度「LINEと連携する」を押してください。' };
  const start = async credential => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try {
      if (credential) {
        const response = await fetch('/api/line-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'session', appUid: currentUser.id, credential }) });
        const value = await response.json();
        if (!response.ok) throw new Error(value.error || '本人確認に失敗しました。');
      }
      const response = await fetch('/api/line-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'start', appUid: currentUser.id }) });
      const value = await response.json();
      if (response.status === 401) { setVerify(true); setMessage('アプリと同じGoogleアカウントを選んで、LINE連携へ進んでください。'); return; }
      if (!response.ok) throw new Error(value.error || 'LINEとの連携を開始できませんでした。');
      const url = new URL(value.url);
      if (url.origin !== 'https://access.line.me') throw new Error('LINEの接続先を確認できませんでした。');
      window.location.assign(url.toString());
    } catch (error) { setMessage(error.message); }
    finally { lock.current = false; setBusy(false); }
  };
  return <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-3">
    <p className="text-sm">{currentUser.name}さんの登録メール（{currentUser.email}）とLINEを結び付けます。LINEの名前が違っていても大丈夫です。コード入力は不要です。</p>
    <button type="button" disabled={!ready || busy} onClick={() => start()} className="min-h-11 rounded-lg bg-green-700 px-4 text-sm font-bold text-white disabled:opacity-50">{busy ? 'LINEへ接続中…' : 'LINEと連携する'}</button>
    {ready === false && <p className="text-sm text-gray-700">LINEログインの初回設定を準備中です。設定完了後にこのボタンから連携できます。</p>}
    {verify && !busy && <GoogleLogin onSuccess={response => start(response.credential)} onError={() => setMessage('Googleの本人確認をやり直してください。')}/>}
    <p className="text-sm">LINEの画面で許可し、まだ友だちでない場合は友だち追加してください。連携済みの方はそのまま個別トークを使えます。</p>
    <a href="https://line.me/R/ti/p/%40158kfhei" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg border border-green-700 bg-white px-4 text-sm font-bold text-green-800">公式LINEを友だち追加・トークを開く</a>
    {(message || outcomes[outcome]) && <p role="status" className="text-sm text-gray-700">{message || outcomes[outcome]}</p>}
  </div>;
}
