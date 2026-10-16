import DailyReportPreview from './DailyReportPreview';
import { useEffect, useRef, useState } from 'react';
import { GoogleLogin, useGoogleLogin } from '@react-oauth/google';
import { tokyoDate, REPORT_FOLDER_ID } from '../dailyReport.mjs';
import { WEATHER_SOURCE_URL, forecastWeatherText } from '../dailyReportWeather.mjs';
import { reportConnection, reportAction } from '../dailyReportApi.mjs';
import { useEditGuard, confirmEditDiscard } from '../editGuard';

export default function DailyReportPanel() {
  const [date, setDate] = useState(() => tokyoDate(Date.now()));
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [weatherMessage, setWeatherMessage] = useState(null);
  useEffect(() => {
    if (!open || !date) return;
    const controller = new AbortController();
    fetch('/api/daily-report-weather?date=' + encodeURIComponent(date), { signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data; })
      .then(data => { if (!controller.signal.aborted) { setForecast(data); setWeatherMessage({ date, text: data.area + 'の予報を自動入力しました。' }); } })
      .catch(error => { if (!controller.signal.aborted) setWeatherMessage({ date, text: error.message || '予報を取得できません。手入力してください。' }); });
    return () => controller.abort();
  }, [open, date]);
  const [connection, setConnection] = useState(null);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const refresh = () => reportConnection(controller.signal).then(value => { if (!controller.signal.aborted) setConnection(value); }).catch(error => { if (!controller.signal.aborted) setMessage(error.message); });
    void refresh();
    window.addEventListener('teamshift-report-session', refresh);
    return () => { controller.abort(); window.removeEventListener('teamshift-report-session', refresh); };
  }, [open]);
  const locked = useRef(false);
  useEditGuard(preview !== null || Object.keys(fields).length > 0 || busy, busy);
  const clearBusy = () => { locked.current = false; setBusy(false); };
  const refreshConnection = async () => setConnection(await reportConnection());
  const handleFailure = error => {
    setMessage(error.message || '日報を保存できませんでした。');
    if (error.code === 'RECONNECT_REQUIRED') setConnection(value => ({ ...value, connected: false }));
    if (error.code === 'SESSION_REQUIRED') setConnection(value => ({ ...value, authenticated: false }));
  };
  const connect = useGoogleLogin({
    flow: 'auth-code', scope: 'openid email https://www.googleapis.com/auth/drive',
    onSuccess: async response => {
      try {
        setMessage('Google Driveの連携を保存しています…');
        await reportAction('connect', { code: response.code }, connection.csrf);
        await refreshConnection();
        setMessage('Google Driveと連携しました。以後の日報保存は自動認証で行います。');
      } catch (error) { handleFailure(error); }
      finally { clearBusy(); }
    },
    onError: () => { setMessage('Google Driveの連携が許可されませんでした。'); clearBusy(); },
    onNonOAuthError: () => { setMessage('Googleの連携画面が閉じられました。'); clearBusy(); }
  });
  const startConnect = () => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setMessage('初回だけGoogle Driveの継続利用を許可してください。');
    try { connect(); } catch { clearBusy(); setMessage('Googleの連携画面を開けませんでした。'); }
  };
  const confirmLogin = async response => {
    if (locked.current) return;
    locked.current = true; setBusy(true);
    try { await reportAction('session', { credential: response.credential }, connection.csrf); await refreshConnection(); setMessage('日報保存用ログインを確認しました。'); }
    catch (error) { handleFailure(error); }
    finally { clearBusy(); }
  };
  const previewReport = async () => {
    if (locked.current) return;
    if (!date) { setMessage('日報の日付を選んでください。'); return; }
    locked.current = true; setBusy(true); setPreview(null); setResult(null); setMessage('最新データからプレビューを作成しています…');
    try {
      setPreview(await reportAction('preview', { date, fields: { ...(forecast?.date === date ? { weather: forecastWeatherText(forecast) } : {}), ...fields } }, connection.csrf));
      setMessage('');
    } catch (error) { handleFailure(error); }
    finally { clearBusy(); }
  };
  const create = async () => {
    if (locked.current) return;
    if (!date) { setMessage('日報の日付を選んでください。'); return; }
    locked.current = true; setBusy(true); setResult(null); setMessage('最新のシフト・タスクを読み込み、日報を保存しています…');
    try {
      const saved = await reportAction('save', { date, fields: { ...(forecast?.date === date ? { weather: forecastWeatherText(forecast) } : {}), ...fields } }, connection.csrf);
      setResult(saved); setFields({}); setPreview(null);
      setMessage(`${saved.date}の業務${saved.count}件・来館業者${saved.visitors}件・引き継ぎ${saved.handoff}件・添付${saved.media}件を保存しました。${saved.unknownDates ? `終了日時不明の${saved.unknownDates}件は集計に含めていません。` : ''}`);
    } catch (error) { handleFailure(error); }
    finally { clearBusy(); }
  };
  const field = (key, label, multiline = false) => <label key={key} className="block text-xs font-bold text-gray-700">{label}{multiline ? <textarea rows={2} disabled={busy} value={fields[key] ?? (key === 'weather' && forecast?.date === date ? forecastWeatherText(forecast) : '')} onChange={e => setFields(v => ({ ...v, [key]: e.target.value }))} className="mt-1 w-full rounded-lg border p-2 text-sm"/> : <input disabled={busy} value={fields[key] ?? (key === 'weather' && forecast?.date === date ? forecastWeatherText(forecast) : '')} onChange={e => setFields(v => ({ ...v, [key]: e.target.value }))} className="mt-1 min-h-10 w-full rounded-lg border px-2 text-sm"/>}</label>;
  return <section className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-3">
    <button type="button" onClick={() => setOpen(v => !v)} className="min-h-10 text-sm font-bold text-blue-800" aria-expanded={open}>日報作成（テスト） {open ? '▲' : '▼'}</button>
    {open && <>
      <div className="rounded-lg bg-white p-3 text-xs space-y-2">
        {!connection ? <p>Google Driveの連携状態を確認しています…</p> : !connection.ready ? <p>自動認証の初回サーバー設定が完了していません。管理者による設定が必要です。</p> : !connection.authenticated ? <><p>日報保存用のGoogleログインを一度確認してください。</p><GoogleLogin onSuccess={confirmLogin} onError={() => setMessage('Googleログインを確認できませんでした。')}/></> : connection.connected ? <p>Google Drive連携済み：保存時のGoogle承認は不要です。</p> : connection.admin ? <><p>初回のみGoogle Driveと連携してください。以後は自動で認証を更新します。</p><button type="button" disabled={busy} onClick={startConnect} className="min-h-10 rounded-lg bg-blue-700 px-3 font-bold text-white disabled:opacity-50">Google Driveを連携する（初回・再連携）</button></> : <p>管理者によるGoogle Driveの初回連携をお待ちください。</p>}
      </div>
      <label className="block text-xs font-bold">対象日（当日分もプレビューできます・日本時間）<input type="date" disabled={busy} value={date} onChange={e => { if (!confirmEditDiscard(Object.keys(fields).length > 0, busy)) return; setDate(e.target.value); setFields({}); setResult(null); setMessage(''); }} className="mt-1 block min-h-11 w-full rounded-lg border px-2 text-sm"/></label>
      <p className="text-xs text-gray-600">月ごとのファイルに、日別シートで保存します。出勤者は当日のシフトから苗字、来館業者は当日に終了したパートナータスクのパートナー名・件名・担当者の苗字、連絡引継事項は「終了していないタスク（件数）」を表示し、クリックすると同じシート下部に題名一覧を開きます。営繕作業・業務は実際の終了時刻を最も近い15分に丸め、「終了時刻｜件名 （品番） 担当者の苗字」の並びで記載し、題名未設定の旧タスクは本文の先頭1行を使います。画像・動画は専用の月別フォルダにまとめ、同じシートの右側から開けるようにします。再作成時も自動入力欄を更新します。天候は気象庁の福岡地方の予報を自動入力し、手入力で修正できます。予報がない日や取得できない場合は保存済みの天候を残します。塩素投入数・備考は入力した項目だけ更新します。個人メモは含めません。</p>
      <div className="grid gap-2 sm:grid-cols-2">{field('weather', '天候')}{field('chlorine', '塩素投入数')}{field('remarks', '備考', true)}</div>
      <p className="text-xs text-gray-600">{weatherMessage?.date === date ? weatherMessage.text : '天気予報を取得中…'} <a href={WEATHER_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="text-blue-800 underline">出典：気象庁</a></p>
      <button type="button" disabled={busy || !connection?.connected || !connection?.authenticated || weatherMessage?.date !== date} onClick={previewReport} className="min-h-11 w-full rounded-lg bg-blue-600 px-3 text-sm font-bold text-white disabled:opacity-50">{busy ? '日報を作成中…' : '日報作成・プレビューを表示'}</button>
      <a href={`https://drive.google.com/drive/folders/${REPORT_FOLDER_ID}`} target="_blank" rel="noopener noreferrer" className="block text-xs text-blue-800 underline">指定の保存先フォルダを開く</a>
      <p className="text-xs text-gray-600">初回連携と自動保存の設定後は、毎日午前0時台（日本時間）に前日分だけを自動保存します。必要な場合は上のボタンで手動再作成できます。</p>
    </>}
    {preview && <DailyReportPreview report={preview.report} fields={preview.fields} busy={busy} message={message} onBack={() => setPreview(null)} onSave={create}/>}
    {message && <p role="status" className="text-xs text-gray-700 whitespace-pre-wrap">{message}</p>}
    {result?.url && <a href={result.url} target="_blank" rel="noopener noreferrer" className="block min-h-10 text-sm font-bold text-blue-800 underline">保存した日報を開く</a>}
  </section>;
}



