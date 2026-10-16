import { reportPageCount } from '../dailyReport.mjs';

export default function DailyReportPreview({ report, fields, busy, message, onBack, onSave }) {
  return <div className="fixed inset-x-0 top-0 bottom-[68px] z-[100] overflow-y-auto bg-slate-100" role="region" aria-label="日報プレビュー">
    <div className="max-w-4xl mx-auto p-3 sm:p-6 space-y-4">
      <h2 className="text-xl font-bold">日報のプレビュー</h2>
      <p className="text-sm">まだGoogle Driveには保存していません。内容を確認してから保存してください。</p>
      <p className="text-xs text-gray-600">保存内容の確認用です。実際のシートでは罫線・列幅が異なります。未入力の天候・塩素投入数・備考は保存済みの値を保持します。保存時には最新のタスクを再取得します。</p>
      {Array.from({ length: reportPageCount(report) }, (_, page) => <article key={page} className="bg-white border border-gray-400 shadow-sm p-3 sm:p-6 space-y-4 break-words">
        <h3 className="text-center text-xl font-bold tracking-widest">施設業務日誌</h3>
        <div className="flex flex-wrap justify-between gap-2 text-sm"><strong>{report.date.replaceAll('-', '/')}</strong><span>天候：{fields.weather ?? '保存済みの値を保持'}</span><span>{page + 1} / {reportPageCount(report)} ページ</span></div>
        <p className="text-sm border p-2">出勤者：{report.staff.join('・') || 'なし'}</p>
        <section className="border p-3"><h4 className="font-bold">連絡・引継事項</h4><p>終了していないタスク（{report.handoff.length}件）</p></section>
        <table className="w-full border-collapse text-sm"><caption className="font-bold text-left mb-2">営繕作業・業務</caption><thead><tr><th className="border p-2 text-left">作業内容</th><th className="border p-2 text-left w-24">担当者</th></tr></thead><tbody>{Array.from({ length: 22 }, (_, index) => { const item = report.entries[page * 22 + index]; return <tr key={index}><td className="border px-2 py-1 h-7 whitespace-pre-wrap">{item?.text || '\u00a0'}</td><td className="border px-2 py-1">{item?.names || ''}</td></tr>; })}</tbody></table>
        <section className="border p-3"><h4 className="font-bold">来館業者</h4>{report.visitors.slice(page * 4, (page + 1) * 4).map(item => <p key={item.key} className="text-sm whitespace-pre-wrap mt-1">{item.text}</p>)}{!report.visitors.length && <p className="text-sm">なし</p>}</section>
        {page === 0 && <><p className="border p-3 text-sm">塩素投入数：{fields.chlorine ?? '保存済みの値を保持'}</p><section className="border p-3"><h4 className="font-bold">備考</h4><p className="text-sm whitespace-pre-wrap">{fields.remarks ?? '保存済みの値を保持'}</p></section></>}
      </article>)}
      <section className="bg-white border rounded-xl p-4"><h3 className="font-bold">未終了タスクの一覧（{report.handoff.length}件）</h3><ul className="list-disc pl-5 text-sm space-y-1 mt-2">{report.handoff.map(item => <li key={item.key}>{item.text}（{item.names}）</li>)}</ul></section>
      <section className="bg-white border rounded-xl p-4"><h3 className="font-bold">画像・動画（{report.media.length}件）</h3><p className="text-xs mt-1">保存後はシート右側の一覧から開けます。</p><ul className="list-disc pl-5 text-sm mt-2">{report.media.map((item, index) => <li key={index}>{item.task}：{item.imageName || (item.mediaType === 'video' ? '動画' : '画像')}</li>)}</ul></section>
      {report.unknownDates > 0 && <p className="text-sm text-amber-800">終了日時不明の{report.unknownDates}件は含めていません。</p>}
      {message && <p role="status" className="text-sm whitespace-pre-wrap">{message}</p>}
      <div className="sticky bottom-0 bg-slate-100 py-3 grid grid-cols-2 gap-3"><button autoFocus type="button" disabled={busy} onClick={onBack} className="min-h-12 bg-white border rounded-xl font-bold">入力に戻る</button><button type="button" disabled={busy} onClick={onSave} className="min-h-12 bg-blue-600 text-white rounded-xl font-bold disabled:opacity-50">{busy ? '保存しています…' : 'Google Driveへ保存'}</button></div>
    </div>
  </div>;
}
