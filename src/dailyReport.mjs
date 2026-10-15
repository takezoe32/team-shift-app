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
  const entries = [];
  let unknownDates = 0;
  const add = (task, type, ownerUid, key) => {
    if (!task?.completed || task.visibility === 'private') return;
    const completedDate = tokyoDate(task.completedAt);
    if (!completedDate) { unknownDates++; return; }
    if (completedDate !== date) return;
    const ids = type === 'partner' ? [task.assigneeUid].filter(Boolean) : (task.assigneeIds?.length ? task.assigneeIds : [ownerUid]);
    const subject = String(task.subject || (type === 'partner' ? task.partnerName : '') || '').trim();
    const body = String(task.text || task.content || '').trim();
    const notes = (Array.isArray(task.updates) ? task.updates : []).map(update => String(update.text || '').trim());
    const description = [...new Set([subject, body, ...notes, task.productName ? `${task.productName} × ${task.inventoryQuantity || 1}個` : ''].filter(Boolean))].join('／');
    entries.push({ key, text: (type === 'partner' ? `【パートナー${task.partnerName ? '：' + task.partnerName : ''}】` : '') + (description || '内容なし'), names: [...new Set(ids.map(id => users[id]?.name || '担当者不明'))].join('・') || '未割り当て', completedAt: task.completedAt });
  };
  for (const [taskDate, day] of Object.entries(source.teamData?.tasks || {})) for (const [uid, tasks] of Object.entries(day || {})) for (const task of tasks || []) add(task, 'member', uid, `member:${taskDate}:${uid}:${task.id}`);
  for (const task of source.partnerItems || []) add(task, 'partner', task.assigneeUid, `partner:${task.id}`);
  entries.sort((a, b) => String(a.completedAt).localeCompare(String(b.completedAt)) || a.key.localeCompare(b.key));
  return { date, entries, unknownDates };
}
export function reportValueRanges(report, fields, sheetTitle, page = 0) {
  const [year, month, day] = report.date.split('-');
  const quoted = `'${sheetTitle.replaceAll("'", "''")}'`;
  const cells = { B1: '施 設 業 務 日 誌', N5: year + '年', S5: Number(month) + '月', V5: Number(day) + '日', Y5: '(' + new Intl.DateTimeFormat('ja-JP', { weekday: 'short', timeZone: 'Asia/Tokyo' }).format(new Date(report.date + 'T12:00:00+09:00')) + ')' };
  const rows = report.entries.slice(page * 22, page * 22 + 22);
  for (let i = 0; i < 22; i++) { cells['D' + (14 + i)] = rows[i]?.text || ''; cells['AD' + (14 + i)] = rows[i]?.names || ''; }
  // Only the first page owns manually entered sections. Omitted fields preserve saved edits.
  if (page === 0) {
    if (fields.weather !== undefined) cells.AA5 = '天候：' + fields.weather;
    if (fields.chlorine !== undefined) cells.AF8 = fields.chlorine;
    if (fields.staff !== undefined) {
      const names = fields.staff.split(/[\n、,]/).map(x => x.trim()).filter(Boolean);
      ['T3', 'W3', 'Z3', 'AC3', 'AF3'].forEach((cell, i) => { cells[cell] = i === 4 ? names.slice(4).join('・') : names[i] || ''; });
    }
    for (const [field, start, count] of [['handoff', 6, 8], ['visitors', 36, 4], ['remarks', 40, 3]]) if (fields[field] !== undefined) {
      const lines = fields[field].split(/\r?\n/);
      for (let i = 0; i < count; i++) cells['C' + (start + i)] = i === count - 1 ? lines.slice(i).join('\n') : lines[i] || '';
    }
  }
  return Object.entries(cells).map(([cell, value]) => ({ range: `${quoted}!${cell}`, values: [[value]] }));
}
