import { japanDateTime } from '../japanTime.mjs';

// 終了履歴: the handoff notes (申し送り) of a finished task, oldest first, read-only.
// Their photos and videos are in the entry's gallery, so only who, when and the text are listed here.
export default function CompletedHandoffList({ handoffs = [] }) {
  if (!handoffs.length) return null;
  return <section aria-label="申し送り履歴" className="mt-2 space-y-1">
    <h4 className="text-xs font-bold text-blue-800">申し送り（古い順・{handoffs.length}件）</h4>
    {handoffs.map((note, index) => <div key={note.id || index} className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
      <div className="text-[10px] font-bold text-gray-500">{note.authorName || '不明なユーザー'}{note.createdAt ? ' ・ ' + japanDateTime(note.createdAt) : ''}</div>
      <div className="mt-0.5 whitespace-pre-wrap break-words text-xs text-gray-700">{note.text || '（写真・動画のみ）'}</div>
    </div>)}
  </section>;
}
