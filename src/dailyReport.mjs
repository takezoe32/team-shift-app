import { getTaskImages } from './taskImages.mjs';
export const MEDIA_FOLDER_ID = '1ZH9lLBsZE0wtXvA_Cdq48Hl7PY3Ld-gw';
export function reportSurname(user) {
  const name = String(user?.name || '').trim();
  if (user?.surname || user?.lastName) return String(user.surname || user.lastName).trim();
  if (/\s/.test(name)) return name.split(/\s+/)[0];
  // Registered team surnames; never assume every Japanese surname has two characters.
  return ['戸田', '竹添', '高橋', '江藤', '平川', '井上'].find(surname => name.startsWith(surname)) || name || '氏名不明';
}
export const REPORT_FOLDER_ID = '1WeUCx0SPcPLXLEzqyNhaMAod22TBjoBO';
export function tokyoDate(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function validateReportDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || tokyoDate(date + 'T12:00:00+09:00') !== date) throw new Error('有効な日付を選んでください。');
}
export function collectDailyReport(source, date) {
  validateReportDate(date);
  const users = source.users || {};
  const entries = [], visitors = [], handoff = [], media = [];
  let unknownDates = 0;
  const absentIds = new Set(['off', 'summer', 'paid', 'winter', 'course', 'none']);
  const types = new Map((source.shiftTypes || []).map(type => [type.id, type]));
  const order = source.userOrder || [];
  const staff = Object.entries(source.teamData?.shifts?.[date] || {})
    .filter(([uid, id]) => users[uid] && !absentIds.has(id) && (id === 'work' || types.has(id)) && !/休|有給|有休|欠勤|講習|未定|^[/／]$/.test(types.get(id)?.label || ''))
    .sort(([a], [b]) => (order.includes(a) ? order.indexOf(a) : Infinity) - (order.includes(b) ? order.indexOf(b) : Infinity) || a.localeCompare(b))
    .map(([uid]) => reportSurname(users[uid]));
  const add = (task, type, ownerUid, key, scheduledDate) => {
    if (!task || task.visibility === 'private') return;
    const completedDate = tokyoDate(task.completedAt);
    if (task.completed && !completedDate) { unknownDates++; return; }
    const finished = task.completed && completedDate === date;
    // Recreating an older report includes tasks completed after that day's end.
    const pending = (!task.completed || completedDate > date) && scheduledDate && scheduledDate <= date && (!tokyoDate(task.createdAt) || tokyoDate(task.createdAt) <= date);
    if (!finished && !pending) return;
    const ids = type === 'partner' ? [task.assigneeUid].filter(Boolean) : (task.assigneeIds?.length ? task.assigneeIds : [ownerUid]);
    const subject = String(task.subject || (type === 'partner' ? task.partnerName : '') || '').trim();
    const body = String(task.text || task.content || '').trim();
    const updates = (Array.isArray(task.updates) ? task.updates : []).filter(update => !tokyoDate(update.createdAt) || tokyoDate(update.createdAt) <= date);
    const notes = updates.map(update => String(update.text || '').trim());
    const description = [...new Set([subject, body, ...notes, task.productName ? `${task.productName} × ${task.inventoryQuantity || 1}個` : ''].filter(Boolean))].join('／');
    const title = String(task.subject || '').trim() || body.split(/\r?\n/)[0] || (type === 'partner' ? String(task.partnerName || '').trim() : '') || '題名なし';
    const entry = { key, text: (type === 'partner' ? `【パートナー${task.partnerName ? '：' + task.partnerName : ''}】` : '') + (description || '内容なし'), names: [...new Set(ids.map(id => users[id] ? reportSurname(users[id]) : '担当者不明'))].join('・') || '未割り当て', completedAt: task.completedAt, scheduledDate };
    if (finished) (type === 'partner' ? visitors : entries).push(type === 'partner'
      ? { ...entry, text: `【${String(task.partnerName || '').trim() || 'パートナー未設定'}】${String(task.subject || '').trim() || '件名未設定'}（${entry.names}）` }
      : { ...entry, text: title });
    else handoff.push({ ...entry, text: title });
    for (const attachment of [...getTaskImages(task), ...updates.flatMap(getTaskImages)]) {
      if (!media.some(item => item.imageUrl === attachment.imageUrl && item.taskKey === key)) media.push({ ...attachment, task: title, taskKey: key, names: entry.names });
    }
  };
  for (const [taskDate, day] of Object.entries(source.teamData?.tasks || {})) for (const [uid, tasks] of Object.entries(day || {})) for (const task of tasks || []) add(task, 'member', uid, `member:${taskDate}:${uid}:${task.id}`, taskDate);
  for (const task of source.partnerItems || []) add(task, 'partner', task.assigneeUid, `partner:${task.id}`, task.date);
  const completionOrder = (a, b) => String(a.completedAt).localeCompare(String(b.completedAt)) || a.key.localeCompare(b.key);
  entries.sort(completionOrder); visitors.sort(completionOrder);
  handoff.sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.key.localeCompare(b.key));
  return { date, entries, staff, visitors, handoff, media, unknownDates };
}
export function reportPageCount(report) {
  return Math.max(1, Math.ceil(report.entries.length / 22), Math.ceil((report.visitors || []).length / 4));
}

export function reportValueRanges(report, fields, sheetTitle, page = 0) {
  const [year, month, day] = report.date.split('-');
  const quoted = `'${sheetTitle.replaceAll("'", "''")}'`;
  const cells = { B1: '施 設 業 務 日 誌', N5: year + '年', S5: Number(month) + '月', V5: Number(day) + '日', Y5: '(' + new Intl.DateTimeFormat('ja-JP', { weekday: 'short', timeZone: 'Asia/Tokyo' }).format(new Date(report.date + 'T12:00:00+09:00')) + ')' };
  const rows = report.entries.slice(page * 22, page * 22 + 22);
  for (let i = 0; i < 22; i++) { cells['D' + (14 + i)] = rows[i]?.text || ''; cells['AD' + (14 + i)] = rows[i]?.names || ''; }
  const names = report.staff || [];
  ['T3', 'W3', 'Z3', 'AC3', 'AF3'].forEach((cell, i) => { cells[cell] = i === 4 ? names.slice(4).join('・') : names[i] || ''; });
  for (const [field, start, count] of [['handoff', 6, 8], ['visitors', 36, 4]]) {
    const lines = field === 'handoff' ? [] : (report[field] || []).slice(page * count, (page + 1) * count);
    for (let i = 0; i < count; i++) cells['C' + (start + i)] = lines[i]?.text || '';
  }
  if (page === 0) cells.C6 = `終了していないタスク（${(report.handoff || []).length}件）`;
  // Omitted manual fields preserve saved edits on the first page.
  if (page === 0) {
    if (fields.weather !== undefined) cells.AA5 = '天候：' + fields.weather;
    if (fields.chlorine !== undefined) cells.AF8 = fields.chlorine;
    if (fields.remarks !== undefined) {
      const lines = fields.remarks.split(/\r?\n/);
      for (let i = 0; i < 3; i++) cells['C' + (40 + i)] = i === 2 ? lines.slice(i).join('\n') : lines[i] || '';
    }
  }
  return Object.entries(cells).map(([cell, value]) => ({ range: `${quoted}!${cell}`, values: [[value]] }));
}
