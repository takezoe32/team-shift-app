import { reportValueRanges } from './dailyReport.mjs';

// Use the same cell values as the Drive writer, including multi-page boundaries.
export function previewCells(report, fields, page) {
  return Object.fromEntries(reportValueRanges(report, fields, 'preview', page).map(item => [item.range.split('!')[1], item.values[0][0]]));
}
