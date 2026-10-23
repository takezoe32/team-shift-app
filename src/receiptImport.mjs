const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0,10) === value;
export function receiptAmount(value) {
  const text = String(value ?? '').trim().normalize('NFKC').replace(/[,円￥¥\s]/g,'');
  return /^-?\d+$/.test(text) && Number.isSafeInteger(Number(text)) ? Number(text) : null;
}
export function parseReceiptText(raw) {
  const text = String(raw || '').normalize('NFKC');
  const match = text.match(/(20\d{2})\s*[年/.-]\s*(\d{1,2})\s*[月/.-]\s*(\d{1,2})/);
  const date = match ? `${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}` : '';
  const rows = []; let total = '';
  for (const original of text.split(/\r?\n/)) {
    const line = original.trim();
    const item = line.match(/^(.+?)\s+[¥￥]?\s*(-?[\d,]+)(?:円)?\s*[*※軽外内]?\s*$/);
    if (!item) continue;
    const name = item[1].trim(), amount = receiptAmount(item[2]);
    if (amount === null) continue;
    if (/(?:税込\s*合計|合\s*計|総額|お買上(?:げ)?金額|領収(?:金額|額))/.test(name) && !/(小計|税額|対象|内税|外税)/.test(name)) { total = String(amount); continue; }
    if (/合計|小計|消費税|税額|税対象|税率|お預|預り|お釣|釣銭|ポイント|クレジット|現金|電話|TEL|登録番号|領収|点数|数量|単価/i.test(name) || /^[\d\s\-/:.]+$/.test(name)) continue;
    rows.push({name, amount:String(amount), unit:'', note:''});
  }
  return { rows, date:validDate(date) ? date : '', shop:/ナフコ/.test(text) ? 'ナフコ' : /コーナン/.test(text) ? 'コーナン' : 'その他', total };
}
export function receiptSummary(rows, total) {
  const amounts = rows.map(row => receiptAmount(row.amount));
  const sum = amounts.every(value => value !== null) ? amounts.reduce((a,b) => a+b,0) : null;
  const receiptTotal = String(total ?? '').trim() === '' ? null : receiptAmount(total);
  return { sum, total:receiptTotal, difference:sum !== null && receiptTotal !== null ? sum-receiptTotal : null };
}
export function receiptValidation(form, rows, confirmed) {
  if (!rows.length) return '明細を追加してください。';
  if (!String(form.buyer || '').trim() || !validDate(form.date)) return '購入者と有効な購入日を入力してください。';
  if (rows.some(row => !String(row.name || '').trim() || receiptAmount(row.amount) === null)) return '各商品の商品名と税込金額（整数）を確認してください。';
  const totals = receiptSummary(rows,form.total);
  if (!Number.isSafeInteger(totals.sum)) return '明細合計を確認してください。';
  if (String(form.total ?? '').trim() !== '' && (totals.total === null || totals.total < 0)) return 'レシート合計を0円以上の整数で入力してください。';
  if (totals.difference !== null && totals.difference !== 0) return '明細合計とレシート合計が一致していません。金額・税額・値引きを確認してください。';
  if (!confirmed) return '各商品の税込金額を原本で確認し、確認済みにチェックしてください。';
  return '';
}
export function receiptCell(value) {
  const text=String(value ?? '').replace(/[\t\r\n\u0000-\u001f\u007f]+/g,' ');
  return /^[\s\uFEFF]*[=+@-]/.test(text) ? "'"+text : text;
}
export function receiptTsv(form, rows) {
  const [ ,month,day]=String(form.date || '').split('-');
  const lines=rows.map((row,index)=>[
    receiptCell(index ? '' : form.buyer), receiptCell(index ? '' : `${Number(month)}/${Number(day)}`),
    receiptCell(form.department),receiptCell(form.account),receiptCell(row.name),String(receiptAmount(row.amount) ?? ''),
    receiptCell(row.unit),receiptCell(row.note),receiptCell(form.month)
  ]);
  return lines.map(line=>line.join('\t')).join('\n');
}
