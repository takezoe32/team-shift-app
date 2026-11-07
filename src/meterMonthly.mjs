// 毎月検針（部門メーター 2026年）: the monthly book's rows, its 21 meters, and which ones are copied from the daily book.
// Only the 11 meters that the daily book does not have are entered in the app; the other 10 are transferred
// from the daily book on save (the value of the 1st of the month, and for the demand the previous month's maximum).
import { METER_FIELDS,METER_YEAR,meterSheet,meterRow,meterNumber } from './meterReadings.mjs';
export const MONTHLY_FILE_ID = '1KtqHPMkyLzYUlqoLkXsu7xR4viL59pvP';
export const MONTHLY_URL = `https://docs.google.com/spreadsheets/d/${MONTHLY_FILE_ID}/edit?gid=615530499#gid=615530499`;
const SHEET = '2026年度(令和8年)';
// Each block has a header row with the meter names; the row of month m is top + 2m (the row after it holds the usage formulas).
const BLOCKS = [
 ['electric','電気',6,5,[['m-electric','①','全日電力','C','全日電力','electric-reading'],['m-demand','d','デマンド','D','デマンド','demand'],['m-training','②','研修棟','E','研修棟'],['m-garden','③','ガーデン受電盤','F','ガーデン受電盤'],['m-tennis','④','テニスコート','G','テニスコート'],['m-marine','⑤','マリン主メーター','H','マリン主メーター']]],
 ['gas','ガス',41,40,[['m-gas-main','⑥','本館系統','C','本館系統','gas-main'],['m-gas-banquet','⑦','バンケット系統（パントリー）','D','バンケット系統','gas-banquet'],['m-gas-banquet-kitchen','⑧','バンケット主厨房','E','バンケット主厨房'],['m-gas-pool','⑨','プール×3','F','プール'],['m-gas-staff','⑩','従食','G','従食'],['m-gas-8f','⑪','8F 厨房','H','8F厨房'],['m-gas-bath','⑫','大浴場給湯器','I','大浴場給湯器'],['m-gas-boiler','⑬','ボイラー','J','機械室','gas-boiler'],['m-gas-kitchen','⑭','新厨房','K','機械室','gas-kitchen']]],
 ['water','水道',75,74,[['m-water-hotel','⑮','ホテル系統','C','ホテル系統','water-hotel'],['m-water-banquet','⑯','バンケット系統','D','バンケット系統','water-banquet'],['m-water-pool','⑰','プール','E','プール'],['m-water-rf','⑱','RF 中水','F','RF中水'],['m-water-hibiya','⑲','日比谷花壇','G','日比谷花壇','h-water'],['m-hot-water','⑳','給湯','H','給湯','hot-water']]]
];
export const MONTHLY_FIELDS = BLOCKS.flatMap(([block,group,header,top,fields])=>fields.map(([id,mark,label,column,head,from])=>({id,block,group,mark,label:mark==='d'?label:mark+' '+label,column,head,header,top,from:from||null,unit:''})));
// Entered in the app (and placed on the monthly map).
export const MONTHLY_INPUT_FIELDS = MONTHLY_FIELDS.filter(f=>!f.from);
// Copied from the daily book on save.
export const MONTHLY_SHARED_FIELDS = MONTHLY_FIELDS.filter(f=>f.from);
const text = v => String(v??'').normalize('NFKC').replace(/\s/g,'');
export function monthlyMonth(month){
 if(!/^\d{4}-\d{2}$/.test(month||''))throw new Error('有効な検針月を選んでください。');
 const [year,m]=month.split('-').map(Number);
 if(year!==METER_YEAR||m<1||m>12)throw new Error('この原本の対象は2026年です。2026年の月を選んでください。');
 return {year,month:m};
}
export const previousMonth = month => { const {year,month:m}=monthlyMonth(month); return m===1?`${year-1}-12`:`${year}-${String(m-1).padStart(2,'0')}`; };
export const monthlyRow = (field,m) => field.top+2*m;
export function monthlySheet(titles){
 const matches=titles.filter(t=>text(t)===SHEET);
 if(matches.length!==1)throw new Error('毎月検針の原本に「2026年度（令和8年）」シートを一意に確認できません。');
 return matches[0];
}
// Pieces of the daily book the transfer reads: the month's daily sheets (1st of the month) and the previous month's main sheet (demand).
export function monthlyDailySheets(titles,month){
 const {month:m}=monthlyMonth(month);
 return [...new Set([meterSheet(titles,'main',m),meterSheet(titles,'h',m),...(m>1?[meterSheet(titles,'main',m-1)]:[])])];
}
const num = v => typeof v==='number'&&Number.isFinite(v)?v:null;
// daily/monthly: {titles, get(title,address) -> {value, formula, blocked}}
export function monthlySnapshot(month,daily,monthly){
 const {year,month:m}=monthlyMonth(month),title=monthlySheet(monthly.titles),current={},previous={},formulas={},sources={};
 const yearOk=(sheet,section)=>{if(!text(daily.get(sheet,'G'+(section==='main'?5:7)).value).includes(String(year)))throw new Error('毎朝検針の原本の年度が検針月と一致しません。');};
 for(const f of MONTHLY_FIELDS){
  if(text(monthly.get(title,'B'+monthlyRow(f,m)).value)!==m+'月度')throw new Error('毎月検針の原本の月の行が想定と異なります。保存せず原本を確認してください。');
  if(!text(monthly.get(title,f.column+f.header).value).startsWith(text(f.head)))throw new Error('毎月検針の原本の項目の並びが想定と異なります。保存せず原本を確認してください。');
  const cell=monthly.get(title,f.column+monthlyRow(f,m));
  current[f.id]=num(cell.value);formulas[f.id]=!!cell.formula||!!cell.blocked||(cell.value!==null&&cell.value!==''&&typeof cell.value!=='number');
  previous[f.id]=m>1&&text(monthly.get(title,'B'+monthlyRow(f,m-1)).value)===(m-1)+'月度'?num(monthly.get(title,f.column+monthlyRow(f,m-1)).value):null;
  if(!f.from)continue;
  if(f.from==='demand'){
   // The monthly demand is the previous month's maximum (January has no previous month in this book).
   if(m===1){sources[f.id]=null;continue;}
   const sheet=meterSheet(daily.titles,'main',m-1);yearOk(sheet,'main');let max=null;
   for(let day=1;day<=31;day++){const row=meterRow('main',day);if(daily.get(sheet,'B'+row).value!==day)continue;const v=num(daily.get(sheet,'F'+row).value);if(v!==null&&(max===null||v>max))max=v;}
   sources[f.id]=max;continue;
  }
  const d=METER_FIELDS.find(x=>x.id===f.from),sheet=meterSheet(daily.titles,d.section,m),row=meterRow(d.section,1);yearOk(sheet,d.section);
  if(daily.get(sheet,'B'+row).value!==1)throw new Error('毎朝検針の原本の1日の行が想定と異なります。');
  sources[f.id]=num(daily.get(sheet,d.column+row).value);
 }
 return {month,previousMonth:previousMonth(month),current,previous,formulas,sources,sheet:title};
}
// What a save writes: the changed meters entered in the app, plus every transfer that differs from the monthly book.
export function monthlyChanges(values,snapshot){
 if(!values||typeof values!=='object'||Array.isArray(values))throw new Error('入力内容を確認してください。');
 if(Object.keys(values).some(id=>!MONTHLY_INPUT_FIELDS.some(f=>f.id===id)))throw new Error('更新できない項目が含まれています。');
 const changes={},current=snapshot.current||{};
 for(const f of MONTHLY_INPUT_FIELDS){const raw=values[f.id];if(raw===undefined||String(raw)===String(current[f.id]??''))continue;if(String(raw).trim()===''&&current[f.id]==null)continue;const n=meterNumber(raw);if(n===null)throw new Error(`${f.group}／${f.label}は数値を入力してください。登録済みの値は空欄にできません。`);if(n!==current[f.id])changes[f.id]=n;}
 for(const t of monthlyTransfers(snapshot))if(t.state==='write')changes[t.id]=t.value;
 return changes;
}
// For each shared meter: write (differs), same (already in the book), missing (not in the daily book yet) or formula (protected cell).
export function monthlyTransfers(snapshot){
 return MONTHLY_SHARED_FIELDS.map(f=>{const value=snapshot.sources?.[f.id]??null,now=snapshot.current?.[f.id]??null;return {id:f.id,field:f,value,current:now,state:snapshot.formulas?.[f.id]?'formula':value===null?'missing':value===now?'same':'write'};});
}
export const monthlyUpdates = (snapshot,changes) => Object.entries(changes).map(([id,value])=>{
 const f=MONTHLY_FIELDS.find(f=>f.id===id);
 if(!f||snapshot.formulas[id]||typeof value!=='number'||!Number.isFinite(value))throw new Error('数式や入力対象外のセルは変更できません。');
 return {title:snapshot.sheet,address:f.column+monthlyRow(f,monthlyMonth(snapshot.month).month),value};
});
// Where the transfer comes from, for the confirmation screen.
export function monthlySourceText(field,month){
 const {month:m}=monthlyMonth(month);
 if(field.from==='demand')return m===1?'前月の毎朝検針がありません':`毎朝検針 ${m-1}月の最大値`;
 return `毎朝検針 ${m}/1`;
}
