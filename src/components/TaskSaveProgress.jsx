export default function TaskSaveProgress({ progress }) {
  if (!progress) return null;
  const remaining = progress.remainingSeconds;
  const time = Number.isFinite(remaining) ? remaining >= 60 ? `約${Math.ceil(remaining / 60)}分` : `約${Math.max(1, remaining)}秒` : '計算中…';
  const labels = { checking: '動画の長さを確認中…', preparing: '添付ファイルを準備中…', uploading: '添付ファイルを送信中', processing: '保存先でファイルを処理中…', saving: 'タスク保存中…', done: '保存完了', error: '保存できませんでした' };
  return <div role="status" aria-live="polite" className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900 space-y-1"><div className="font-bold">{labels[progress.stage] || '保存中…'}{progress.count ? `（${progress.index}/${progress.count}件）` : ''}{progress.stage === 'uploading' && progress.percent !== null ? `：${progress.percent}％` : ''}</div>{progress.stage === 'uploading' && <><progress max="100" value={progress.percent ?? undefined} className="w-full"/><div>残り送信時間：{time}</div><p className="text-[10px]">実際の送信速度から推定。回線状況で変動します。送信後の処理・タスク保存時間は含みません。</p></>}{progress.stage === 'processing' && <p>ファイル送信後の処理を待っています。残り時間は計算できません。</p>}{progress.stage === 'error' && <p>{progress.message || '入力内容は残っています。回線を確認して再試行してください。'}</p>}</div>;
}
