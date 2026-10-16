import template from '../dailyReportTemplate.json';
import { previewCells } from '../dailyReportPreview.mjs';

export default function DailyReportSheet({ report, fields, page }) {
  const values = previewCells(report, fields, page);
  const width = template.widths.reduce((sum, size) => sum + size, 0);
  return <div className="overflow-x-auto bg-white border border-gray-300 p-3" aria-label={`日報 ${page + 1}ページ`}>
    <table style={{ width, tableLayout: 'fixed', borderCollapse: 'collapse', fontFamily: '"ＭＳ Ｐゴシック", "Yu Gothic", sans-serif', color: '#111' }}>
      <colgroup>{template.widths.map((size, i) => <col key={i} style={{ width: size }}/>)}</colgroup>
      <tbody>{template.rows.map((row, index) => {
        let height = row.height;
        const number = index + 1;
        if (number >= 6 && number <= 13) height = Math.max(30, 35);
        if (number >= 14 && number <= 35) {
          const entry = report.entries[page * 22 + number - 14];
          const lines = Math.max(1, ...(entry?.text || '').split('\n').map(line => Math.ceil([...line].length / 42)));
          const names = Math.max(1, Math.ceil([...(entry?.names || '')].length / 2));
          const font = Math.max(5, Math.min(10, Math.floor((lines * 19 + 2) / names)));
          height = Math.max(24, lines * 19 + 6, names * font * 1.4 + 6);
        }
        if (number >= 36 && number <= 39) {
          const text = values['C' + number] || '';
          height = Math.max(30, Math.max(1, ...text.split('\n').map(line => Math.ceil([...line].length / 32))) * 23 + 12);
        }
        return <tr key={index} style={{ height }}>{row.cells.map(cell => {
          const value = Object.hasOwn(values, cell.address) ? values[cell.address] : cell.value;
          const style = { ...cell.style, padding: '1px 2px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.25 };
          if (cell.address === 'AA5') style.fontSize = 12;
          if (/^AD(1[4-9]|2[0-9]|3[0-5])$/.test(cell.address)) {
            const entry = report.entries[page * 22 + number - 14];
            const lines = Math.max(1, ...(entry?.text || '').split('\n').map(line => Math.ceil([...line].length / 42)));
            style.fontSize = Math.max(5, Math.min(10, Math.floor((lines * 19 + 2) / Math.max(1, Math.ceil([...(entry?.names || '')].length / 2))))) * 96 / 72;
          }
          return <td key={cell.address} data-cell={cell.address} rowSpan={cell.rowSpan} colSpan={cell.colSpan} style={style}>{value}</td>;
        })}</tr>;
      })}</tbody>
    </table>
  </div>;
}
