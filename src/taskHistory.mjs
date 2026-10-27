import { japanToday } from './japanTime.mjs';

// Preserve source date/id for complete-task deletion.
export function taskHistoryEntries(base, task) {
  const entries = [];
  if (task.completed) entries.push({
    ...base,
    historyKind: 'complete',
    historyDate: base.completedAt ? japanToday(base.completedAt) || base.date : base.date,
    historyLabel: task.periodStartDate && task.periodEndDate ? '全期間終了' : 'タスク終了',
  });
  for (const [day, record] of Object.entries(task.dailyWork || {})) {
    if (!record || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    entries.push({
      ...base,
      historyKind: 'daily',
      historyDate: day,
      historyLabel: '本日分終了',
      completedAt: record.completedAt || null,
      completedByName: record.actorName || '記録なし',
      content: record.note || '',
      imageUrl: '',
      images: [],
    });
  }
  return entries;
}
