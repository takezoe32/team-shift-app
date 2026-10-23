export function printedReceiptYen(value) {
 let text=String(value??'').normalize('NFKC').trim().replace(/^[¥￥\\yY]\s*/,'').replace(/[円)）|｜]+$/,'').replace(/\s/g,'');
 if(/^-?\d{1,3}(?:[.。]\d{3})+$/.test(text))text=text.replace(/[.。]/g,',');
 text=text.replace(/,/g,'');
 return /^-?\d+$/.test(text)&&Number.isSafeInteger(Number(text))?Number(text):null;
}
function lastPrintedYen(line) {
 const match=line.match(/[¥￥\\yY]\s*(-?\d[\d,.。 ]*)\s*[)）|｜]?$/);
 if(match)return printedReceiptYen(match[1]);
 return /^\s*-?\d[\d,.。 ]*\s*$/.test(line)?printedReceiptYen(line):null;
}
export function parseKendepoReceipt(text) {
 const lines=text.normalize('NFKC').split(/\r?\n/).map(l=>l.trim().replace(/^[|_「!]+\s*/,'')).filter(Boolean);
 const rows=[],warnings=[];let pending=null,summary=false;
 const finish=()=>{if(pending){rows.push({name:pending.name.trim(),code:pending.code,netAmount:pending.netAmount??'',amount:'',unit:pending.unit||'',quantity:pending.quantity||'',note:'',taxBasis:'exclusive'});pending=null;}};
 for(const originalLine of lines){
  const line=originalLine.replace(/_/g,' ');
  const compact=line.replace(/\s/g,'');
  if(/^(?:小計|[外分]税対象|消費税|合計|他社クレ|[=(].*税)/.test(compact)){finish();summary=true;}
  if(summary)continue;
  const code=line.match(/^[^\d]{0,3}(\d{13})\s*$/);
  if(code){finish();pending={code:code[1],name:''};continue;}
  if(!pending)continue;
  if(/^\d{1,4}$/.test(compact) && !pending.name)continue;
  const unit=line.match(/(?:単価?|[H¥￥\\])\s*(\d[\d,.。 ]*)\s*[xX×]/);
  const quantity=line.match(/[xX×]\s*(\d+)/);
  const value=lastPrintedYen(line);
  if(unit || value!==null){
   if(unit){const number=printedReceiptYen(unit[1]);if(number!==null)pending.unit=String(number);if(quantity)pending.quantity=quantity[1];}
   if(value!==null){pending.netAmount=String(value);finish();}
   continue;
  }
  const name=line.replace(/^\d{4}\s*[◎○@]?\s*/,'').trim();
  if(!/^\d{1,4}$/.test(name) && !/^[-ー=]+$/.test(name))pending.name+=(pending.name?' ':'')+name;
 }
 finish();
 let subtotal='',tax='',total='',payment='',taxable='',rate='';
 const rates=new Set();
 for(const line of lines){
  const compact=line.replace(/\s/g,''),value=lastPrintedYen(line);
  if(/^小計/.test(compact)&&value!==null)subtotal=String(value);
  if(/[外分]税対象額/.test(compact)&&value!==null)taxable=String(value);
  if(/消費税等?外税/.test(compact)&&value!==null)tax=String(value);
  if(/^合計/.test(compact)&&value!==null)total=String(value);
  if(/^他社クレ/.test(compact)&&value!==null)payment=String(value);
  if(/[外分]税対象額|消費税等?外税/.test(compact)){
   const match=compact.match(/(\d+(?:\.\d+)?)%/);if(match)rates.add(Number(match[1]));
  }
 }
 if(!subtotal && taxable){subtotal=taxable;warnings.push('小計欄の代わりに、印字された外税対象額を税抜小計として表示しています。原本で確認してください。');}
 if(!total && payment){total=payment;warnings.push('合計欄が読めなかったため、印字された支払額を照合用に表示しています。合計を原本で確認してください。');}
 if(rates.size===1)rate=String([...rates][0]);
 const taxInfo={mode:'exclusive',subtotal,tax,rate,mixedRates:rates.size>1};
 warnings.push('建デポの明細は税抜です。小計・消費税・合計を原本で確認し、税込金額へ変換してください。単価は原本の税抜単価です。');
 return {rows,total,taxInfo,warnings};
}
export function receiptTaxAllocationError(rows,info,total) {
 if(!info || info.mode!=='exclusive')return '税抜明細の情報がありません。';
 if(info.mixedRates || !['8','10'].includes(String(info.rate)))return '税率が不明、または複数の税率が混在しています。税込金額を原本に基づいて手入力してください。';
 const subtotal=printedReceiptYen(info.subtotal),tax=printedReceiptYen(info.tax),gross=printedReceiptYen(total),values=rows.map(r=>printedReceiptYen(r.netAmount));
 if(!rows.length || values.some(v=>v===null || v<0) || subtotal===null || tax===null || gross===null || subtotal<0 || tax<0 || gross<0)return '税抜明細・小計・消費税・合計を0円以上の整数で確認してください。';
 const sum=values.reduce((a,b)=>a+b,0);
 if(!Number.isSafeInteger(sum)||sum!==subtotal)return '税抜明細の合計と、原本の税抜小計が一致していません。';
 if(subtotal+tax!==gross)return '原本の税抜小計＋消費税と、領収証合計が一致していません。';
 const floor=BigInt(subtotal)*BigInt(info.rate)/100n,ceil=(BigInt(subtotal)*BigInt(info.rate)+99n)/100n;
 if(BigInt(tax)!==floor && BigInt(tax)!==ceil)return '印字された税率と消費税額が一致しません。原本を確認してください。';
 if(rows.some(row=>row.unit && row.quantity && printedReceiptYen(row.unit)!==null && /^\d+$/.test(row.quantity) && BigInt(printedReceiptYen(row.unit))*BigInt(row.quantity)!==BigInt(printedReceiptYen(row.netAmount))))return '単価×数量と税抜金額が異なる明細があります。原本を確認してください。';
 return '';
}
export function allocateReceiptTax(rows,info,total) {
 const error=receiptTaxAllocationError(rows,info,total);if(error)return {error};
 const subtotal=BigInt(printedReceiptYen(info.subtotal)),tax=BigInt(printedReceiptYen(info.tax));
 const allocated=rows.map((row,index)=>{const weighted=BigInt(printedReceiptYen(row.netAmount))*tax;return {index,tax:subtotal?weighted/subtotal:0n,remainder:subtotal?weighted%subtotal:0n};});
 let remaining=tax-allocated.reduce((sum,r)=>sum+r.tax,0n);
 for(const row of [...allocated].sort((a,b)=>a.remainder===b.remainder?a.index-b.index:a.remainder>b.remainder?-1:1)){if(remaining<=0n)break;row.tax++;remaining--;}
 return {rows:rows.map((row,index)=>({...row,amount:String(BigInt(printedReceiptYen(row.netAmount))+allocated[index].tax),allocatedTax:String(allocated[index].tax)}))};
}
