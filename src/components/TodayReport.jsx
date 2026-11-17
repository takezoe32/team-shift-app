import { useEffect, useMemo, useState } from 'react';
import DailyReportSheet from './DailyReportSheet';
import { collectDailyReport, reportPageCount, tokyoDate } from '../dailyReport.mjs';
import { forecastWeatherText } from '../dailyReportWeather.mjs';
import { japanTime } from '../japanTime.mjs';

// 本日の日報（途中経過）: today's report as it stands now, built on this device from the data the app already shows
// (the same collectDailyReport the nightly save uses). Nothing is saved; it follows the tasks as they are finished.
export default function TodayReport({ source, onClose }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  const date = tokyoDate(now);
  const report = useMemo(() => collectDailyReport(source, date), [source, date]);
  const [forecast, setForecast] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/daily-report-weather?date=' + encodeURIComponent(date), { signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data; })
      .then(data => { if (!controller.signal.aborted) setForecast(data); })
      .catch(() => { /* The weather stays empty; the report itself does not depend on it. */ });
    return () => controller.abort();
  }, [date]);
  const fields = forecast?.date === date ? { weather: forecastWeatherText(forecast) } : {};
  const pages = reportPageCount(report);
  return <main className="flex-1 overflow-y-auto bg-slate-100 px-3 py-4 pb-24"><div className="mx-auto max-w-4xl space-y-4">
    <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold text-blue-900">本日の日報（途中経過）</h2><button type="button" onClick={onClose} className="min-h-11 rounded-lg border bg-white px-3 text-sm font-bold">カレンダーへ戻る</button></div>
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-bold">{Number(date.slice(5, 7))}月{Number(date.slice(8))}日 {japanTime(now)} 時点・まだ保存されていません</p>
      <p className="mt-1">今日これまでに終了したタスクで作った日報です。タスクを終了すると自動で反映されます。正式な日報は、日付が変わったあと（午前0時台）に自動で保存されます。</p>
    </div>
    <p role="status" className="text-sm font-bold">業務 {report.entries.length}件 ／ 来館業者 {report.visitors.length}件 ／ 終了していないタスク {report.handoff.length}件</p>
    <p className="text-xs text-gray-600">保存される日報と同じ項目配置です。横にスクロールして全体を確認できます。塩素投入数・備考は保存時に入力した内容が入るため、ここでは空欄です。個人メモ・私用タスクは含みません。</p>
    {Array.from({ length: pages }, (_, page) => <div key={page}><p className="mb-2 text-sm">{page + 1} / {pages} ページ</p><DailyReportSheet report={report} fields={fields} page={page}/></div>)}
    <section className="rounded-xl border bg-white p-4"><h3 className="font-bold">終了していないタスクの一覧（{report.handoff.length}件）</h3>{report.handoff.length ? <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{report.handoff.map(item => <li key={item.key}>{item.text}（{item.names}）</li>)}</ul> : <p className="mt-2 text-sm text-gray-500">ありません。</p>}</section>
    <section className="rounded-xl border bg-white p-4"><h3 className="font-bold">画像・動画・ファイル（{report.media.length}件）</h3><p className="mt-1 text-xs text-gray-600">保存後は、日報のシート右側の一覧から開けます。</p><ul className="mt-2 list-disc pl-5 text-sm">{report.media.map((item, index) => <li key={index}>{item.task}：{item.imageName || (item.mediaType === 'video' ? '動画' : item.mediaType === 'file' ? 'ファイル' : '画像')}</li>)}</ul></section>
    {report.unknownDates > 0 && <p className="text-sm text-amber-800">終了日時が不明の{report.unknownDates}件は含めていません。</p>}
  </div></main>;
}
