import { taskBody, latestTaskHandoff } from '../taskReadContent.mjs';
import { japanDateTime } from '../japanTime.mjs';
export function TaskContent({ item }) {
  const body = taskBody(item);
  return <section className="space-y-1 min-w-0"><h3 className="text-sm font-bold text-blue-800">内容</h3><p className="whitespace-pre-wrap break-words rounded-lg bg-gray-50 p-3 text-sm text-gray-700">{body || '内容は登録されていません。'}</p></section>;
}
export default function TaskReadPreview({ item }) {
  const note = latestTaskHandoff(item);
  return <div className="mt-3 space-y-3"><TaskContent item={item}/><section className="space-y-1"><h3 className="text-sm font-bold text-blue-800">最新の申し送り</h3>{note ? <div className="rounded-lg bg-blue-50 p-3 text-sm text-gray-700"><div className="text-xs text-gray-500">{note.authorName || '投稿者不明'}{note.createdAt ? ' ・ ' + japanDateTime(note.createdAt) : ''}</div><p className="mt-1 whitespace-pre-wrap break-words">{note.text || '添付あり'}</p></div> : <p className="text-sm text-gray-500">申し送りはまだありません。</p>}</section></div>;
}
