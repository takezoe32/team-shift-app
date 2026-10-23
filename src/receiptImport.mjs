const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0,10) === value;
export function receiptAmount(value) {
  const text = String(value ?? '').trim().normalize('NFKC').replace(/[,円￥¥\s]/g,'');
  return /^-?\d+$/.test(text) && Number.isSafeInteger(Number(text)) ? Number(text) : null;
}
// Only normalize numeric fragments, never silently repair product names.
const money = fragment => {
  const value=String(fragment).normalize('NFKC').replace(/[|｜]+$/,'').trim().replace(/^[¥￥\\yY]\s*/, '').replace(/[円内外※*軽)）]+$/,'').replace(/\s/g,'').replace(/(\d)[.。](?=\d{3}(?:\D|$))/g,'$1,');
  return receiptAmount(value);
};
const endMoney = line => {
  const marker=line.search(/[¥￥\\]/);if(marker>=0)return money(line.slice(marker));
  const match=line.match(/(?:[¥￥\\yY]\s*)?(-?\d[\d,，.。 ]*)(?:円|内|外|※|\*)?\s*[)）]?$/);
  return match ? money(match[0]) : null;
};
const metadata = /電話|TEL|登録番号|担当者|^担[:：]|レシートNo|レートNo|ポイント|カード|会社|会員|承認|支払|回数|クレジット|ご利用|有効期限|消費税|税額|税対象|対象消費税|内税小計|お預|預り|お釣|釣銭|現金/i;
export function parseReceiptText(raw) {
  const text=String(raw || '').normalize('NFKC');
  const match=text.match(/(20\d{2})\s*[年/.-]\s*(\d{1,2})\s*[月/.-]\s*(\d{1,2})/);
  const date=match ? `${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}` : '';
  const shop=/ナフコ|NAFCO/i.test(text)?'ナフコ':/コー?ニ?ナン/.test(text)?'コーナン':'その他';
  const lines=text.split(/\r?\n/).map(s=>s.replace(/^[|_「]+\s*/,'').trim()).filter(Boolean);
  const structured=/\bJAN\s*[0-9O]{8}/i.test(text) || (shop==='ナフコ' && /^\s*[^\p{L}\d]*\d{2}\s+\p{L}/mu.test(text));
  const rows=[],warnings=[];let pending=null,total='',subtotal='',stopped=false;
  const finish=()=>{
    if(!pending)return;
    const name=pending.name.trim();
    if(name)rows.push({name,amount:pending.amount ?? '',unit:pending.unit || '',note:'',quantity:pending.quantity || '',code:pending.code || ''});
    pending=null;
  };
  for(const line of lines){
    const compact=line.replace(/\s/g,'');
    // A printed total is read independently; never infer it from item sum.
    if(/^(?:税込)?合計/.test(compact) && !/ポイント|残高/.test(compact)){
      const value=endMoney(line);if(value!==null)total=String(value);finish();stopped=true;continue;
    }
    if(/^小計金額/.test(compact)){const value=endMoney(line);if(value!==null)subtotal=String(value);finish();stopped=true;continue;}
    if(stopped)continue;
    if(metadata.test(line) || /^20\d{2}[年/.-]/.test(line) || /対象お買上額|%対象/.test(compact))continue;
    const jan=line.match(/\bJAN\s*([\dOolI ]{8,18})/i);
    const department=line.match(/^[^\p{L}\d]*[0-9][0-9lI](?:[0-9]{0,3})[\s_]*([^\d\s].*)$/u);
    if(jan){finish();pending={name:'',code:jan[1].replace(/\s/g,''),style:'jan'};continue;}
    if(department && shop==='ナフコ'){
      finish();pending={name:department[1],style:'nafco'};
      const onLine=pending.name.match(/^(.+?)\s+[¥￥\\]\s*([\d, .]+)\s*$/);
      if(onLine){pending.name=onLine[1];const amount=money(onLine[2]);if(amount!==null)pending.amount=String(amount);finish();}
      continue;
    }
    if(metadata.test(line) || /^20\d{2}[年/.-]/.test(line) || /対象お買上額|%対象/.test(compact))continue;
    if(pending){
      const code=line.match(/^(\d{6,14})(?:\s+|$)(.*)$/);
      if(code){pending.code=code[1];const rest=code[2].replace(/[|｜]+$/,'').trim();
        if(/単価/.test(rest)){const value=endMoney(rest);if(value!==null)pending.unit=String(value);}
        else if(/[¥￥\\yY]/.test(rest)){const value=endMoney(rest);if(value!==null)pending.amount=String(value);}
        if(pending.amount!==undefined)finish();continue;
      }
      if(/単価/.test(line)){const value=endMoney(line);if(value!==null)pending.unit=String(value);continue;}
      const quantity=line.match(/^(\d+)\s*(?:点|個|枚|本|袋|組)(?:\s+|$)/);
      if(quantity){pending.quantity=quantity[1];const rest=line.slice(quantity[0].length);const value=endMoney(rest);if(value!==null)pending.amount=String(value);if(pending.amount!==undefined)finish();continue;}
      if(/^[¥￥\\yY]?\s*-?\d[\d, .。]*\s*(?:内|外|円|※|\*)?$/.test(line)){
        const value=endMoney(line);if(value!==null){pending.amount=String(value);finish();}continue;
      }
      if(!/^[-ー=―\s]+$/.test(line))pending.name+=(pending.name?' ':'')+line;
      continue;
    }
    // Generic same-line receipts remain supported.
    if(structured)continue;
    const item=line.match(/^(.+?)\s+[¥￥\\]?\s*(-?[\d,]+)(?:円)?\s*[*※軽外内]?\s*$/);
    if(!item || /合計|小計|数量|点数|単価|領収/.test(item[1]) || /^[\d\s\-/:.]+$/.test(item[1]))continue;
    const amount=receiptAmount(item[2]);if(amount!==null)rows.push({name:item[1].trim(),amount:String(amount),unit:'',note:''});
  }
  finish();
  if(!total && subtotal && /内税/.test(text)){total=subtotal;warnings.push('合計欄が読めなかったため、印字された内税の小計金額を照合用に表示しています。合計を原本で確認してください。');}
  if(rows.some(row=>row.amount===''))warnings.push('金額が読めなかった商品があります。空欄を原本で確認してください。');
  if(rows.some(row=>row.quantity && row.unit && Number(row.quantity)*Number(row.unit)!==Number(row.amount)))warnings.push('数量×単価と金額が異なる商品があります。値引き・税区分も原本で確認してください。');
  return {rows,date:validDate(date)?date:'',shop,total,warnings};
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
  if (rows.some(row=>row.code) && totals.total===null) return '原本のレシート合計を入力して、明細合計と照合してください。';
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
    receiptCell(form.department),receiptCell(form.account),receiptCell(row.quantity ? row.name+'（数量：'+row.quantity+'）' : row.name),String(receiptAmount(row.amount) ?? ''),
    receiptCell(row.unit),receiptCell(row.note),receiptCell(form.month)
  ]);
  return lines.map(line=>line.join('\t')).join('\n');
}
