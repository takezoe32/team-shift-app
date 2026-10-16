const japanDay = value => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
export function reportCompletionTime(value) {
  if (!value) return '';
  const exact = new Date(value);
  if (!Number.isFinite(exact.getTime())) return '';
  const rounded = new Date(Math.round(exact.getTime() / 900000) * 900000);
  if (japanDay(rounded) > japanDay(exact)) return '24:00';
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(rounded);
}
export function reportWorkText(entry) {
  if (!entry) return '';
  const model = String(entry.productModelNumber || '').trim();
  return [String(entry.text || '').trim(), model ? `（${model}）` : '', String(entry.names || '').trim()].filter(Boolean).join('　');
}
export function reportWorkHeight(entry) {
  return Math.max(24, Math.max(1, ...reportWorkText(entry).split('\n').map(line => Math.ceil([...line].length / 42))) * 19 + 6);
}
export function reportWorkLayoutRequests(sheetId, entries = []) {
  const range = { sheetId, startRowIndex: 13, endRowIndex: 35, startColumnIndex: 2, endColumnIndex: 31 };
  const time = { ...range, endColumnIndex: 4 };
  const text = { ...range, startColumnIndex: 4 };
  return [
    { unmergeCells: { range } },
    { updateCells: { range, rows: Array.from({ length: 22 }, (_, index) => ({ values: [{ userEnteredValue: { stringValue: reportCompletionTime(entries[index]?.completedAt) } }, {}, { userEnteredValue: { stringValue: reportWorkText(entries[index]) } }] })), fields: 'userEnteredValue' } },
    { mergeCells: { range: time, mergeType: 'MERGE_ROWS' } },
    { mergeCells: { range: text, mergeType: 'MERGE_ROWS' } },
    { updateBorders: { range, innerVertical: { style: 'NONE' } } },
    { updateBorders: { range: time, right: { style: 'SOLID', color: { red: 0, green: 0, blue: 0 } } } },
    { repeatCell: { range: time, cell: { userEnteredFormat: { horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', numberFormat: { type: 'TEXT' }, textFormat: { fontSize: 9 }, wrapStrategy: 'CLIP' } }, fields: 'userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment,userEnteredFormat.numberFormat,userEnteredFormat.textFormat.fontSize,userEnteredFormat.wrapStrategy' } },
    { repeatCell: { range: text, cell: { userEnteredFormat: { horizontalAlignment: 'LEFT', verticalAlignment: 'MIDDLE', textFormat: { fontSize: 10 }, wrapStrategy: 'WRAP' } }, fields: 'userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment,userEnteredFormat.textFormat.fontSize,userEnteredFormat.wrapStrategy' } }
  ];
}
