import DailyReportSheet from './DailyReportSheet';
import { reportPageCount } from '../dailyReport.mjs';

export default function DailyReportPreview({ report, fields, busy, message, onBack, onSave }) {
  return <div className="fixed inset-x-0 top-0 bottom-[68px] z-[100] overflow-y-auto bg-slate-100" role="region" aria-label="日報プレビュー">
    <div className="max-w-4xl mx-auto p-3 sm:p-6 space-y-4">
      <h2 className="text-xl font-bold">日報のプレビュー</h2>
      <p className="text-sm">まだGoogle Driveには保存していません。内容を確認してから保存してください。</p>
      <p className="text-xs text-gray-600">保存用の日報テンプレートと同じ項目配置で表示しています。横にスクロールして日報全体を確認できます。保存時には最新のタスクを再取得します。</p>
      {Array.from({ length: reportPageCount(report) }, (_, page) => <div key={page}><p className="text-sm mb-2">{page + 1} / {reportPageCount(report)} ページ</p><DailyReportSheet report={report} fields={fields} page={page}/></div>)}
      <section className="bg-white border rounded-xl p-4"><h3 className="font-bold">未終了タスクの一覧（{report.handoff.length}件）</h3><ul className="list-disc pl-5 text-sm space-y-1 mt-2">{report.handoff.map(item => <li key={item.key}>{item.text}（{item.names}）</li>)}</ul></section>
      <section className="bg-white border rounded-xl p-4"><h3 className="font-bold">画像・動画（{report.media.length}件）</h3><p className="text-xs mt-1">保存後はシート右側の一覧から開けます。</p><ul className="list-disc pl-5 text-sm mt-2">{report.media.map((item, index) => <li key={index}>{item.task}：{item.imageName || (item.mediaType === 'video' ? '動画' : '画像')}</li>)}</ul></section>
      {report.unknownDates > 0 && <p className="text-sm text-amber-800">終了日時不明の{report.unknownDates}件は含めていません。</p>}
      {message && <p role="status" className="text-sm whitespace-pre-wrap">{message}</p>}
      <div className="sticky bottom-0 bg-slate-100 py-3 grid grid-cols-2 gap-3"><button autoFocus type="button" disabled={busy} onClick={onBack} className="min-h-12 bg-white border rounded-xl font-bold">入力に戻る</button><button type="button" disabled={busy} onClick={onSave} className="min-h-12 bg-blue-600 text-white rounded-xl font-bold disabled:opacity-50">{busy ? '保存しています…' : 'Google Driveへ保存'}</button></div>
    </div>
  </div>;
}

