import { taskListNote } from '../taskReadContent.mjs';

// The short description with a task's title in the calendar's 「本日のタスク（全員）」 list:
// the newest 申し送り (marked as such, with the day and who wrote it) when there is one, otherwise the registered content.
// compact: the one-line row of a task from an earlier day; otherwise the two-line text of today's card.
export default function TaskListNote({ task, compact = false }) {
  const note = taskListNote(task);
  if (!note) return null;
  const label = note.kind === 'handoff' ? <span className="font-bold text-blue-800">申し送り{note.day || note.by ? '（' + [note.day, note.by].filter(Boolean).join(' ') + '）' : ''}：</span> : null;
  return compact ? <span className="ml-1 text-gray-500">{label}{note.text}</span>
    : <div className="text-sm text-gray-600 whitespace-pre-wrap break-words line-clamp-2">{label}{note.text}</div>;
}
