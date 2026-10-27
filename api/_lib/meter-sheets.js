import { Buffer } from 'node:buffer';
import { METER_FILE_ID,METER_FIELDS,meterDate,previousMeterDate,meterSheet,meterRow } from '../../src/meterReadings.mjs';
import { fault } from './report-auth.js';
import { xlsxCells } from './xlsx-cells.js';
const quote=title=>"'"+title.replaceAll("'","''")+"'";
const XLSX='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
function snapshotFrom(date,titles,get){
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
 return {date,previousDate,current,previous,formulas,sheets};
}
const updatesFor=(snapshot,changes)=>Object.entries(changes).map(([id,value])=>{const f=METER_FIELDS.find(f=>f.id===id);if(!f||snapshot.formulas[id]||typeof value!=='number'||!Number.isFinite(value))throw fault(409,'数式や入力対象外のセルは変更できません。');return {title:snapshot.sheets[f.section],address:f.column+meterRow(f.section,meterDate(snapshot.date).day),value};});
const upstreamError=status=>{if([409,412].includes(status))throw fault(409,'原本が他の人によって変更されました。原本を再読込してから確認してください。');if([403,404].includes(status))throw fault(403,'検針原本にアクセスできません。日報のGoogle Drive連携アカウントに原本の編集権限があるか確認してください。');throw fault(503,'検針原本との通信に失敗しました。入力を残したまま再実行してください。');};
export function nativeMeterSheets(token,fetcher=fetch){
 const root=`https://sheets.googleapis.com/v4/spreadsheets/${METER_FILE_ID}`;
 const call=async(url,options={})=>{const r=await fetcher(url,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(20000)});if(!r.ok)upstreamError(r.status);return r.json();};
 return {async read(date){const d=meterDate(date),prev=previousMeterDate(date),meta=await call(root+'?fields=sheets.properties'),titles=meta.sheets.map(s=>s.properties.title),targets=[];for(const section of ['main','h']){targets.push(meterSheet(titles,section,d.month));if(prev.startsWith(String(d.year)))targets.push(meterSheet(titles,section,Number(prev.slice(5,7))));}
  const params=new URLSearchParams({includeGridData:'true',fields:'sheets(properties(title,sheetId),data(startRow,startColumn,rowData(values(userEnteredValue,effectiveValue,formattedValue))))'});for(const title of new Set(targets))params.append('ranges',quote(title)+'!B1:T45');const result=await call(root+'?'+params),byTitle=Object.fromEntries(result.sheets.map(s=>[s.properties.title,s]));
  return snapshotFrom(date,titles,(title,address)=>{const [,column,row]=address.match(/^([A-Z]+)(\d+)$/),ci=column.charCodeAt(0)-65;for(const grid of byTitle[title]?.data||[]){const cell=grid.rowData?.[Number(row)-1-(grid.startRow||0)]?.values?.[ci-(grid.startColumn||0)];if(cell)return {value:cell.effectiveValue?.numberValue??cell.effectiveValue?.stringValue??null,formula:!!cell.userEnteredValue?.formulaValue,blocked:!!(cell.userEnteredValue&&!Object.hasOwn(cell.userEnteredValue,'numberValue'))};}return {value:null};});
 },async write(snapshot,changes){const data=updatesFor(snapshot,changes).map(u=>({range:quote(u.title)+'!'+u.address,values:[[u.value]]}));if(data.length)await call(root+'/values:batchUpdate',{method:'POST',body:JSON.stringify({valueInputOption:'RAW',data})});}};
}
export function meterSheets(token,fetcher=fetch){
 const url=`https://www.googleapis.com/drive/v2/files/${METER_FILE_ID}`;let cached=null;
 const request=async(target,options={})=>{const r=await fetcher(target,{...options,headers:{Authorization:`Bearer ${token}`,...options.headers},signal:AbortSignal.timeout(25000)});if(!r.ok)upstreamError(r.status);return r;};
 const metadata=async()=>{const r=await request(url+'?supportsAllDrives=true&fields=id,mimeType,fileSize,etag,capabilities(canEdit)');return r.json();};
 return {async read(date){const meta=await metadata();if(meta.mimeType==='application/vnd.google-apps.spreadsheet')return nativeMeterSheets(token,fetcher).read(date);if(meta.mimeType!==XLSX)throw fault(409,'検針原本はXLSXまたはGoogleスプレッドシート形式である必要があります。');if(!meta.etag||Number(meta.fileSize)>5*1024*1024)throw fault(409,'原本の更新状態またはサイズを安全に確認できません。');
  const r=await request(url+'?alt=media&supportsAllDrives=true'),bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>5*1024*1024)throw fault(409,'原本のサイズが対応上限を超えています。');let book;try{book=xlsxCells(bytes);}catch{throw fault(409,'このExcelの内部形式を安全に読み込めません。原本は変更していません。');}const after=await metadata();if(after.etag!==meta.etag)upstreamError(412);
  const snapshot={...snapshotFrom(date,book.titles,book.get),format:'xlsx',fileVersion:meta.etag,contentHash:book.hash};cached={book,snapshot,editable:meta.capabilities?.canEdit??meta.editable};return snapshot;
 },async write(snapshot,changes){if(snapshot.format!=='xlsx')return nativeMeterSheets(token,fetcher).write(snapshot,changes);if(!cached||JSON.stringify(cached.snapshot)!==JSON.stringify(snapshot))throw fault(409,'原本を読み込み直してから保存してください。');if(cached.editable===false)throw fault(403,'検針原本の編集権限がありません。');let body;try{body=cached.book.patch(updatesFor(snapshot,changes));}catch{throw fault(409,'このExcelの指定セルを安全に更新できません。原本は変更していません。');}const latest=await metadata();if(latest.etag!==snapshot.fileVersion)upstreamError(412);
  await request(`https://www.googleapis.com/upload/drive/v2/files/${METER_FILE_ID}?uploadType=media&newRevision=true&supportsAllDrives=true&fields=id,etag`,{method:'PUT',headers:{'Content-Type':XLSX,'If-Match':snapshot.fileVersion},body});cached=null;
 }};
}
