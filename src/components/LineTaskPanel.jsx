import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import { reportAction } from '../dailyReportApi.mjs';
import AssigneePicker from './AssigneePicker';
import QuarterHourTime from './QuarterHourTime';

async function lineRequest(body, csrf) {
  const response = await fetch('/api/line-settings', body ? { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-report-csrf': csrf }, body: JSON.stringify(body) } : {});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'LINE連携を確認できませんでした。');
  return data;
}
function ReviewTask({ item, users, csrf, onSaved }) {
  const [draft, setDraft] = useState(item.draft);
  const [kind, setKind] = useState(item.kind);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const locked = useRef(false);
  const update = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  const act = async action => {
    if (locked.current || (action === 'dismiss' && !window.confirm('このLINEタスクの登録を取り消しますか？'))) return;
    locked.current = true; setBusy(true);
    try { await lineRequest({ action, id: item.id, draft, kind }, csrf); await onSaved(); }
    catch (error) { setMessage(error.message); }
    finally { locked.current = false; setBusy(false); }
  };
  return <article className="space-y-3 rounded-xl border border-orange-200 bg-white p-3">
    <p className="text-xs font-bold text-orange-800">LINEからの要確認：{item.reasons.join('・')}</p>
    <p className="whitespace-pre-wrap break-words text-sm text-gray-700">{item.text}</p>
    <label className="block text-xs font-bold">種類<select value={kind} onChange={event => setKind(event.target.value)} disabled={busy} className="mt-1 block min-h-11 w-full rounded-lg border px-2"><option value="member">メンバータスク</option><option value="partner">パートナータスク</option></select></label>
    <label className="block text-xs font-bold">件名<input value={draft.subject} maxLength={120} onChange={event => update('subject', event.target.value)} disabled={busy} className="mt-1 min-h-11 w-full rounded-lg border px-2"/></label>
    <label className="block text-xs font-bold">対象日<input type="date" value={draft.date} onChange={event => update('date', event.target.value)} disabled={busy} className="mt-1 block min-h-11 w-full rounded-lg border px-2"/></label>
    {kind === 'partner' && <><label className="block text-xs font-bold">パートナー名<input value={draft.partnerName} maxLength={120} onChange={event => update('partnerName', event.target.value)} disabled={busy} className="mt-1 min-h-11 w-full rounded-lg border px-2"/></label><QuarterHourTime label="開始時刻" required value={draft.time} onChange={value => update('time', value)} disabled={busy}/></>}
    <AssigneePicker users={users.filter(user => user.role !== 'viewer')} value={draft.assigneeIds} onChange={value => update('assigneeIds', value)} disabled={busy}/>
    <div className="flex gap-2"><button type="button" disabled={busy} onClick={() => void act('dismiss')} className="min-h-11 flex-1 rounded-lg border text-sm font-bold">登録を取り消す</button><button type="button" disabled={busy} onClick={() => void act('register')} className="min-h-11 flex-1 rounded-lg bg-blue-600 text-sm font-bold text-white">{busy ? '処理中…' : '確認して登録'}</button></div>
    {message && <p role="status" className="text-sm text-red-700">{message}</p>}
  </article>;
}
export default function LineTaskPanel({ users }) {
  const [open, setOpen] = useState(false);
  const [connection, setConnection] = useState(null);
  const [command, setCommand] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const refresh = useCallback(async () => { const value = await lineRequest(); setConnection(value); }, []);
  useEffect(() => {
    if (!open) return;
    let active = true;
    const reload = () => lineRequest().then(value => { if (active) setConnection(value); }).catch(error => { if (active) setMessage(error.message); });
    void reload();
    const timer = setInterval(reload, 15000);
    window.addEventListener('focus', reload);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', reload); };
  }, [open]);
  const pair = async () => {
    if (lock.current) return;
    if (connection.connected && !window.confirm('新しい連携コードを作りますか？別のグループで使用すると連携先が切り替わります。')) return;
    lock.current = true; setBusy(true);
    try { const value = await lineRequest({ action: 'pair' }, connection.csrf); setCommand(value.command); setMessage('10分以内に、この一行を連携したいLINEグループに投稿してください。'); }
    catch (error) { setMessage(error.message); }
    finally { lock.current = false; setBusy(false); }
  };
  return <section className="rounded-xl border border-green-200 bg-green-50 p-3 space-y-3">
    <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} className="min-h-11 text-sm font-bold text-green-900">LINEタスク連携 {open ? '▲' : '▼'}</button>
    {open && <>
      <p className="text-sm">グループで「タスク」で始まる文章を投稿し、表示されたメンバー／パートナーのボタンを投稿した本人が選ぶと登録します。画像はこの連携の対象外です。</p>
      {!connection ? <p className="text-sm">連携状態を確認中…</p> : !connection.authenticated ? <><p className="text-sm">管理者のGoogleログインを確認してください（日報保存と共通）。</p><GoogleLogin onSuccess={async response => { try { await reportAction('session', { credential: response.credential }, connection.csrf); await refresh(); } catch (error) { setMessage(error.message); } }} onError={() => setMessage('ログインを確認できませんでした。')}/></> : <>
        <p className="text-sm font-bold">{connection.connected ? 'LINEグループ連携済み' : 'LINEグループは未連携です'}</p>
        {!connection.ready && <p className="text-sm text-orange-800">VercelのProductionにLINE_CHANNEL_SECRETとLINE_CHANNEL_ACCESS_TOKENをSecretで設定してください。</p>}
        <p className="text-xs">Webhook URL：<code className="break-all select-all">https://team-shift-app.vercel.app/api/line-webhook</code></p>
        <button type="button" disabled={busy || !connection.ready} onClick={pair} className="min-h-11 rounded-lg bg-green-700 px-3 text-sm font-bold text-white disabled:opacity-50">グループ連携コードを作る</button>
        {command && <p className="break-all select-all rounded-lg bg-white p-3 text-sm">{command}</p>}
        {connection.connected && <button type="button" onClick={async () => { if (!window.confirm('LINEグループとの連携を解除しますか？')) return; try { await lineRequest({ action: 'disconnect' }, connection.csrf); setCommand(''); await refresh(); } catch (error) { setMessage(error.message); } }} className="ml-2 min-h-11 rounded-lg border border-red-200 px-3 text-sm text-red-700">連携を解除</button>}
        <button type="button" onClick={() => void refresh().catch(error => setMessage(error.message))} className="ml-2 min-h-11 rounded-lg border px-3 text-sm">更新</button>
        <h3 className="text-sm font-bold">LINEからの要確認（{connection.inbox?.length || 0}件）</h3>
        {(connection.inbox || []).map(item => <ReviewTask key={item.id} item={item} users={users} csrf={connection.csrf} onSaved={refresh}/>)}
        <p className="text-xs text-gray-600">読み取り例：<br/>タスク<br/>日付：明日<br/>件名：217号室の防水調査<br/>時間：10:00<br/>パートナー：山下健装<br/>担当：竹添</p>
      </>}
    </>}
    {message && <p role="status" className="whitespace-pre-wrap text-sm text-gray-700">{message}</p>}
  </section>;
}
