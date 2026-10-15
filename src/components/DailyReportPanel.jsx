import { useEffect, useRef, useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { collectDailyReport, tokyoDate, REPORT_FOLDER_ID } from '../dailyReport.mjs';
import { WEATHER_SOURCE_URL, forecastWeatherText } from '../dailyReportWeather.mjs';
import { saveDailyReportToDrive } from '../dailyReportDrive.mjs';
import { useEditGuard, confirmEditDiscard } from '../editGuard';

export default function DailyReportPanel({ getSource }) {
  const [date, setDate] = useState(() => tokyoDate(Date.now() - 86400000));
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState(null);
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
  const requestRef = useRef(null);
  const locked = useRef(false);
  useEditGuard(Object.keys(fields).length > 0, busy);
  const clearBusy = () => { locked.current = false; setBusy(false); requestRef.current = null; };
  const login = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/drive',
    onSuccess: async response => {
      const request = requestRef.current;
      if (!request) { clearBusy(); return; }
      try {
        setMessage('シフト・タスク・添付ファイルを確認しています…');
        const source = await getSource();
        const report = collectDailyReport(source, request.date);
        setMessage(`${report.entries.length}件の日報をGoogle Driveに保存しています…`);
        const saved = await saveDailyReportToDrive(response.access_token, report, request.fields);
        setResult(saved);
        setFields({});
        setMessage(`${request.date}の業務${saved.count}件・来館業者${report.visitors.length}件・引き継ぎ${report.handoff.length}件・添付${report.media.length}件を保存しました。${report.unknownDates ? `終了日時不明の${report.unknownDates}件は集計に含めていません。` : ''}`);
      } catch (error) { setMessage(error.message || '日報を保存できませんでした。'); }
      finally { clearBusy(); }
    },
    onError: () => { setMessage('Google Driveの認証が許可されませんでした。'); clearBusy(); },
    onNonOAuthError: () => { setMessage('認証画面が閉じられたか、ポップアップが開けませんでした。もう一度実行してください。'); clearBusy(); }
  });
  const create = () => {
    if (locked.current) return;
    if (!date) { setMessage('日報の日付を選んでください。'); return; }
    locked.current = true; setBusy(true); setResult(null); setMessage('Google Driveの保存用アカウントを選んでください。');
    requestRef.current = { date, fields: { ...(forecast?.date === date ? { weather: forecastWeatherText(forecast) } : {}), ...fields } };
    try { login({ prompt: 'select_account' }); }
    catch { setMessage('Googleの認証画面を開けませんでした。再読み込みしてお試しください。'); clearBusy(); }
  };
  const field = (key, label, multiline = false) => <label key={key} className="block text-xs font-bold text-gray-700">{label}{multiline ? <textarea rows={2} disabled={busy} value={fields[key] ?? (key === 'weather' && forecast?.date === date ? forecastWeatherText(forecast) : '')} onChange={e => setFields(v => ({ ...v, [key]: e.target.value }))} className="mt-1 w-full rounded-lg border p-2 text-sm"/> : <input disabled={busy} value={fields[key] ?? (key === 'weather' && forecast?.date === date ? forecastWeatherText(forecast) : '')} onChange={e => setFields(v => ({ ...v, [key]: e.target.value }))} className="mt-1 min-h-10 w-full rounded-lg border px-2 text-sm"/>}</label>;
  return <section className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-3">
    <button type="button" onClick={() => setOpen(v => !v)} className="min-h-10 text-sm font-bold text-blue-800" aria-expanded={open}>日報作成（テスト） {open ? '▲' : '▼'}</button>
    {open && <>
      <label className="block text-xs font-bold">対象日（実際の終了日・日本時間）<input type="date" disabled={busy} value={date} onChange={e => { if (!confirmEditDiscard(Object.keys(fields).length > 0, busy)) return; setDate(e.target.value); setFields({}); setResult(null); setMessage(''); }} className="mt-1 block min-h-11 w-full rounded-lg border px-2 text-sm"/></label>
      <p className="text-xs text-gray-600">月ごとのファイルに、日別シートで保存します。出勤者は当日のシフトから苗字、来館業者は当日に終了したパートナータスク、連絡引継事項は対象日までの未完了タスクの題名を自動入力します。営繕作業・業務も題名のみを記載し、題名未設定の旧タスクは本文の先頭1行を使います。画像・動画は専用の月別フォルダにまとめ、同じシートの右側から開けるようにします。再作成時も自動入力欄を更新します。天候は気象庁の福岡地方の予報を自動入力し、手入力で修正できます。予報がない日や取得できない場合は保存済みの天候を残します。塩素投入数・備考は入力した項目だけ更新します。個人メモは含めません。</p>
      <div className="grid gap-2 sm:grid-cols-2">{field('weather', '天候')}{field('chlorine', '塩素投入数')}{field('remarks', '備考', true)}</div>
      <p className="text-xs text-gray-600">{weatherMessage?.date === date ? weatherMessage.text : '天気予報を取得中…'} <a href={WEATHER_SOURCE_URL} target="_blank" rel="noopener noreferrer" className="text-blue-800 underline">出典：気象庁</a></p>
      <button type="button" disabled={busy || weatherMessage?.date !== date} onClick={create} className="min-h-11 w-full rounded-lg bg-blue-600 px-3 text-sm font-bold text-white disabled:opacity-50">{busy ? '日報を作成中…' : '日報作成・Google Driveへ保存'}</button>
      <a href={`https://drive.google.com/drive/folders/${REPORT_FOLDER_ID}`} target="_blank" rel="noopener noreferrer" className="block text-xs text-blue-800 underline">指定の保存先フォルダを開く</a>
      <p className="text-xs text-gray-600">テスト中はボタンで実行します。0時の自動作成はまだ有効にしていません。</p>
    </>}
    {message && <p role="status" className="text-xs text-gray-700 whitespace-pre-wrap">{message}</p>}
    {result?.url && <a href={result.url} target="_blank" rel="noopener noreferrer" className="block min-h-10 text-sm font-bold text-blue-800 underline">保存した日報を開く</a>}
  </section>;
}
