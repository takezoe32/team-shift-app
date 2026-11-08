import { Buffer } from 'node:buffer';
import { METER_YEAR,METER_FIELDS,meterDate,previousMeterDate,earlierMeterDates,meterSheet,meterRow } from '../../src/meterReadings.mjs';
import { yearFilesFrom } from './year-files.js';
import { monthlyMonth,monthlySheet,monthlyDailySheets,monthlySnapshot,monthlyUpdates } from '../../src/meterMonthly.mjs';
import { fault } from './report-auth.js';
import { xlsxCells } from './xlsx-cells.js';
const quote=title=>"'"+title.replaceAll("'","''")+"'";
const XLSX='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
// prev: last year's book {titles, get} for the days before January 1 (best effort: a missing sheet or row is null).
function snapshotFrom(date,titles,get,prev=null){
 const d=meterDate(date),previousDate=previousMeterDate(date),sheets={},previousSheets={},current={},previous={},formulas={};
 for(const section of ['main','h']){sheets[section]=meterSheet(titles,section,d.month);previousSheets[section]=previousDate.startsWith(String(d.year))?meterSheet(titles,section,Number(previousDate.slice(5,7))):null;}
 const normalize=v=>String(v||'').normalize('NFKC').replace(/[\s.]/g,'').toLowerCase();
 for(const f of METER_FIELDS){const title=sheets[f.section],row=meterRow(f.section,d.day);
  if(!String(get(title,'G'+(f.section==='main'?5:7)).value||'').normalize('NFKC').includes(String(d.year)))throw fault(409,'原本の年度が検針日と一致しません。原本を確認してください。');
  if(get(title,'B'+row).value!==d.day)throw fault(409,'原本の日付行が想定と異なります。保存せず原本を確認してください。');
  const expected=f.section==='main'?(f.id==='electric-demand'?'デマンド':'検針値'):['h-light','h-power','h-water'].includes(f.id)?'検針値':f.label;
  if(normalize(get(title,f.column+(f.section==='main'?8:10)).value)!==normalize(expected))throw fault(409,'原本の項目の並びが想定と異なります。保存せず原本を確認してください。');
  const cell=get(title,f.column+row);current[f.id]=typeof cell.value==='number'?cell.value:null;formulas[f.id]=!!cell.formula||!!cell.blocked||(cell.value!==null&&typeof cell.value!=='number');previous[f.id]=null;
  if(previousSheets[f.section]){const prevDay=Number(previousDate.slice(8)),prevTitle=previousSheets[f.section];if(get(prevTitle,'B'+meterRow(f.section,prevDay)).value!==prevDay)throw fault(409,'前日の検針行を確認できませんでした。');const v=get(prevTitle,f.column+meterRow(f.section,prevDay)).value;previous[f.id]=typeof v==='number'?v:null;}
 }
 // A reading on another day, from this year's book or (before January 1) last year's: null when not found.
 const readingOn=(day,f)=>{const [y,m,dd]=day.split('-').map(Number),book=y===d.year?{titles,get}:y===d.year-1?prev:null;if(!book)return null;
  try{const title=meterSheet(book.titles,f.section,m),row=meterRow(f.section,dd);if(book.get(title,'B'+row).value!==dd)return null;const x=book.get(title,f.column+row).value;return typeof x==='number'?x:null;}catch{return null;}};
 if(!previousDate.startsWith(String(d.year)))for(const f of METER_FIELDS)previous[f.id]=readingOn(previousDate,f);
 // Readings of the two days before the previous day, for the 「3日連続」 usage check only.
 const earlier={};
 for(const day of earlierMeterDates(date)){earlier[day]={};for(const f of METER_FIELDS)earlier[day][f.id]=readingOn(day,f);}
 return {date,previousDate,current,previous,formulas,sheets,earlier};
}
const updatesFor=(snapshot,changes)=>Object.entries(changes).map(([id,value])=>{const f=METER_FIELDS.find(f=>f.id===id);if(!f||snapshot.formulas[id]||typeof value!=='number'||!Number.isFinite(value))throw fault(409,'数式や入力対象外のセルは変更できません。');return {title:snapshot.sheets[f.section],address:f.column+meterRow(f.section,meterDate(snapshot.date).day),value};});
const upstreamError=status=>{if([409,412].includes(status))throw fault(409,'原本が他の人によって変更されました。原本を再読込してから確認してください。');if([403,404].includes(status))throw fault(403,'検針原本にアクセスできません。日報のGoogle Drive連携アカウントに原本の編集権限があるか確認してください。');throw fault(503,'検針原本との通信に失敗しました。入力を残したまま再実行してください。');};
const dailyRanges=date=>titles=>{const d=meterDate(date),prev=previousMeterDate(date),targets=[];for(const section of ['main','h']){targets.push(meterSheet(titles,section,d.month));if(prev.startsWith(String(d.year)))targets.push(meterSheet(titles,section,Number(prev.slice(5,7))));for(const day of earlierMeterDates(date).filter(day=>day.startsWith(String(d.year)))){try{targets.push(meterSheet(titles,section,Number(day.slice(5,7))));}catch{ /* checked in snapshotFrom */ }}}return [...new Set(targets)].map(title=>[title,'B1:T45']);};
// A Google Sheets spreadsheet read through the Sheets API (only the requested ranges).
// ranges(titles) -> [[title,'B1:T45'],...]; the result's get(title,address) returns {value,formula,blocked}.
function nativeBook(token,fileId,fetcher){
 const root=`https://sheets.googleapis.com/v4/spreadsheets/${fileId}`;
 const call=async(url,options={})=>{const r=await fetcher(url,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(20000)});if(!r.ok)upstreamError(r.status);return r.json();};
 return {async read(ranges){const meta=await call(root+'?fields=sheets.properties'),titles=meta.sheets.map(s=>s.properties.title);
  const params=new URLSearchParams({includeGridData:'true',fields:'sheets(properties(title,sheetId),data(startRow,startColumn,rowData(values(userEnteredValue,effectiveValue,formattedValue))))'});for(const [title,range] of ranges(titles))params.append('ranges',quote(title)+'!'+range);const result=await call(root+'?'+params),byTitle=Object.fromEntries(result.sheets.map(s=>[s.properties.title,s]));
  return {titles,get:(title,address)=>{const [,column,row]=address.match(/^([A-Z]+)(\d+)$/),ci=column.charCodeAt(0)-65;for(const grid of byTitle[title]?.data||[]){const cell=grid.rowData?.[Number(row)-1-(grid.startRow||0)]?.values?.[ci-(grid.startColumn||0)];if(cell)return {value:cell.effectiveValue?.numberValue??cell.effectiveValue?.stringValue??null,formula:!!cell.userEnteredValue?.formulaValue,blocked:!!(cell.userEnteredValue&&!Object.hasOwn(cell.userEnteredValue,'numberValue'))};}return {value:null};}};
 },async write(state,updates){const data=updates.map(u=>({range:quote(u.title)+'!'+u.address,values:[[u.value]]}));if(data.length)await call(root+'/values:batchUpdate',{method:'POST',body:JSON.stringify({valueInputOption:'RAW',data})});}};
}
// A spreadsheet in Google Drive: an XLSX file (downloaded whole, written back as a new revision with If-Match) or a native Google Sheets file.
// read() returns {format,titles,get} plus fileVersion/contentHash for XLSX; write(state,updates) needs the state of the latest read.
function driveBook(token,fileId,fetcher){
 const url=`https://www.googleapis.com/drive/v2/files/${fileId}`;let cached=null;
 const request=async(target,options={})=>{const r=await fetcher(target,{...options,headers:{Authorization:`Bearer ${token}`,...options.headers},signal:AbortSignal.timeout(25000)});if(!r.ok)upstreamError(r.status);return r;};
 const metadata=async()=>{const r=await request(url+'?supportsAllDrives=true&fields=id,mimeType,fileSize,etag,capabilities(canEdit)');return r.json();};
 return {async read(ranges){const meta=await metadata();if(meta.mimeType==='application/vnd.google-apps.spreadsheet')return {format:'sheets',...await nativeBook(token,fileId,fetcher).read(ranges)};if(meta.mimeType!==XLSX)throw fault(409,'検針原本はXLSXまたはGoogleスプレッドシート形式である必要があります。');if(!meta.etag||Number(meta.fileSize)>5*1024*1024)throw fault(409,'原本の更新状態またはサイズを安全に確認できません。');
  const r=await request(url+'?alt=media&supportsAllDrives=true'),bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>5*1024*1024)throw fault(409,'原本のサイズが対応上限を超えています。');let book;try{book=xlsxCells(bytes);}catch{throw fault(409,'このExcelの内部形式を安全に読み込めません。原本は変更していません。');}const after=await metadata();if(after.etag!==meta.etag)upstreamError(412);
  cached={book,fileVersion:meta.etag,contentHash:book.hash,editable:meta.capabilities?.canEdit??meta.editable};return {format:'xlsx',titles:book.titles,get:book.get,fileVersion:meta.etag,contentHash:book.hash};
 },async write(state,updates){if(state.format!=='xlsx')return nativeBook(token,fileId,fetcher).write(state,updates);if(!cached||cached.fileVersion!==state.fileVersion||cached.contentHash!==state.contentHash)throw fault(409,'原本を読み込み直してから保存してください。');if(cached.editable===false)throw fault(403,'検針原本の編集権限がありません。');let body;try{body=cached.book.patch(updates);}catch{throw fault(409,'このExcelの指定セルを安全に更新できません。原本は変更していません。');}const latest=await metadata();if(latest.etag!==state.fileVersion)upstreamError(412);
  await request(`https://www.googleapis.com/upload/drive/v2/files/${fileId}?uploadType=media&newRevision=true&supportsAllDrives=true&fields=id,etag`,{method:'PUT',headers:{'Content-Type':XLSX,'If-Match':state.fileVersion},body});cached=null;
 }};
}
const plainBook=book=>({async read(ranges){return {format:'sheets',...await book.read(ranges)};},write:(state,updates)=>book.write(state,updates)});
// 毎朝検針: the day's row and the previous day's row of the daily book. bookFor(year) -> that year's book or null;
// the same book object is used for a year's read and write (the XLSX write needs the state of its read).
function dailyAdapter(make){
 let last=null;const books=new Map(),bookFor=year=>{if(!books.has(year))books.set(year,make(year));return books.get(year);};
 return {async read(date){
   const {year}=meterDate(date),book=bookFor(year);if(!book)throw fault(409,`${year}年の毎朝検針の原本がまだありません。前年の12月1日に自動で作成されます。`);
   const b=await book.read(dailyRanges(date));
   // Early January: the previous days are in last year's book (December sheets only).
   let prev=null;
   if(!earlierMeterDates(date).every(day=>day.startsWith(String(year)))){const p=bookFor(year-1);if(p){try{const r=await p.read(titles=>[...new Set(['main','h'].map(s=>{try{return meterSheet(titles,s,12);}catch{return null;}}).filter(Boolean))].map(t=>[t,'B1:T45']));prev={titles:r.titles,get:r.get};}catch{prev=null;}}}
   const snapshot={...snapshotFrom(date,b.titles,b.get,prev),...(b.format==='xlsx'?{format:'xlsx',fileVersion:b.fileVersion,contentHash:b.contentHash}:{})};last=snapshot;return snapshot;},
  async write(snapshot,changes){if(snapshot.format==='xlsx'&&JSON.stringify(last)!==JSON.stringify(snapshot))throw fault(409,'原本を読み込み直してから保存してください。');const book=bookFor(meterDate(snapshot.date).year);if(!book)throw fault(409,'原本を読み込み直してから保存してください。');await book.write(snapshot,updatesFor(snapshot,changes));}};
}
// files: {year: {daily, monthly, ...}} (api/_lib/year-files.js); 2026 is built in.
export const nativeMeterSheets=(token,fetcher=fetch,{files=yearFilesFrom(null)}={})=>dailyAdapter(year=>files[year]?.daily?plainBook(nativeBook(token,files[year].daily,fetcher)):null);
export const meterSheets=(token,fetcher=fetch,{files=yearFilesFrom(null)}={})=>dailyAdapter(year=>files[year]?.daily?driveBook(token,files[year].daily,fetcher):null);
// 毎月検針: the month's row of the monthly book, plus the daily book's values that are transferred to it (read only).
// year: the year of the months read (files[year]); January also reads last year's books (lastDaily/lastMonthly).
export function monthlyMeterSheets(token,fetcher=fetch,{files=yearFilesFrom(null),year=METER_YEAR,daily,monthly,lastDaily,lastMonthly}={}){
 const book=(y,kind)=>files[y]?.[kind]?driveBook(token,files[y][kind],fetcher):null;
 daily??=book(year,'daily');monthly??=book(year,'monthly');lastDaily??=book(year-1,'daily');lastMonthly??=book(year-1,'monthly');
 let last=null;
 const checked=run=>{try{return run();}catch(e){throw e.status?e:fault(409,e.message);}};
 return {async read(month){const {year:y,month:m}=checked(()=>monthlyMonth(month));
   if(y!==year)throw fault(409,'検針月を選び直してください。');
   if(!daily||!monthly)throw fault(409,`${y}年の検針原本がまだありません。前年の12月1日に自動で作成されます。`);
   const d=await daily.read(titles=>checked(()=>monthlyDailySheets(titles,month)).map(title=>[title,'B1:T45'])),b=await monthly.read(titles=>[[checked(()=>monthlySheet(titles,y)),'B1:T110']]);
   const lastBooks={};
   if(m===1){
    if(lastDaily)try{lastBooks.daily=await lastDaily.read(titles=>[[meterSheet(titles,'main',12),'B1:T45']]);}catch{ /* no December demand */ }
    if(lastMonthly)try{lastBooks.monthly=await lastMonthly.read(titles=>[[monthlySheet(titles,y-1),'B1:T110']]);}catch{ /* no 前月 */ }
   }
   const snapshot={...checked(()=>monthlySnapshot(month,d,b,lastBooks)),...(b.format==='xlsx'?{format:'xlsx',fileVersion:b.fileVersion,contentHash:b.contentHash}:{format:'sheets'})};last=snapshot;return snapshot;
  },async write(snapshot,changes){if(snapshot.format==='xlsx'&&JSON.stringify(last)!==JSON.stringify(snapshot))throw fault(409,'原本を読み込み直してから保存してください。');const updates=checked(()=>monthlyUpdates(snapshot,changes));await monthly.write(snapshot,updates);}};
}
export { nativeBook,driveBook };
