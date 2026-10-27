import { METER_FILE_ID,METER_FIELDS,meterDate,previousMeterDate,meterSheet,meterRow } from '../../src/meterReadings.mjs';
import { fault } from './report-auth.js';
const quote=title=>"'"+title.replaceAll("'","''")+"'";
export function meterSheets(token,fetcher=fetch){
 const root=`https://sheets.googleapis.com/v4/spreadsheets/${METER_FILE_ID}`;
 const call=async(url,options={})=>{
  const r=await fetcher(url,{...options,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(20000)});
  if(!r.ok){if([403,404].includes(r.status))throw fault(403,'検針原本にアクセスできません。日報のGoogle Drive連携アカウントに原本の編集権限があるか確認してください。');if(r.status===400)throw fault(409,'原本を読み込めません。Excel形式の場合はGoogleスプレッドシート形式への変換が必要です。原本の形式とシート構成を確認してください。');throw fault(503,'検針原本との通信に失敗しました。入力を残したまま再実行してください。');}return r.json();
 };
 const cellAt=(sheet,row,column)=>{for(const grid of sheet.data||[]){const r=row-1-(grid.startRow||0),c=column-1-(grid.startColumn||0);if(r>=0&&c>=0&&grid.rowData?.[r]?.values?.[c])return grid.rowData[r].values[c];}return {};};
 return {
 async read(date){
  const d=meterDate(date),previousDate=previousMeterDate(date),inBook=previousDate.startsWith(String(d.year));
  const meta=await call(root+'?fields=sheets.properties'),titles=meta.sheets.map(s=>s.properties.title),sheets={},previousSheets={};
  for(const section of ['main','h']){sheets[section]=meterSheet(titles,section,d.month);previousSheets[section]=inBook?meterSheet(titles,section,Number(previousDate.slice(5,7))):null;}
  const targets=[...new Set([...Object.values(sheets),...Object.values(previousSheets).filter(Boolean)])];
  const params=new URLSearchParams({includeGridData:'true',fields:'sheets(properties(title,sheetId),data(startRow,startColumn,rowData(values(userEnteredValue,effectiveValue,formattedValue))))'});
  for(const title of targets)params.append('ranges',quote(title)+'!B1:T45');
  const result=await call(root+'?'+params),byTitle=Object.fromEntries(result.sheets.map(s=>[s.properties.title,s])),current={},previous={},formulas={};
  for(const f of METER_FIELDS){
   const row=meterRow(f.section,d.day),column=f.column.charCodeAt(0)-64,sheet=byTitle[sheets[f.section]];
   if(!sheet)throw fault(409,'検針シートを読み込めませんでした。');
   const header=cellAt(sheet,f.section==='main'?5:7,7);
   if(!String(header.formattedValue||header.effectiveValue?.stringValue||'').normalize('NFKC').includes(String(d.year)))throw fault(409,'原本の年度が検針日と一致しません。原本を確認してください。');
   if(cellAt(sheet,row,2).effectiveValue?.numberValue!==d.day)throw fault(409,'原本の日付行が想定と異なります。保存せず原本を確認してください。');
   const normalize=value=>String(value||'').normalize('NFKC').replace(/[\s.]/g,'').toLowerCase();
   const expected=f.section==='main'?(f.id==='electric-demand'?'デマンド':'検針値'):['h-light','h-power','h-water'].includes(f.id)?'検針値':f.label;
   const fieldHeader=cellAt(sheet,f.section==='main'?8:10,column);
   if(normalize(fieldHeader.formattedValue||fieldHeader.effectiveValue?.stringValue)!==normalize(expected))throw fault(409,'原本の項目の並びが想定と異なります。保存せず原本を確認してください。');
   const cell=cellAt(sheet,row,column);current[f.id]=cell.effectiveValue?.numberValue??null;
   formulas[f.id]=!!cell.userEnteredValue?.formulaValue||!!(cell.userEnteredValue&&!Object.hasOwn(cell.userEnteredValue,'numberValue'));
   previous[f.id]=null;
   if(previousSheets[f.section]){const prevSheet=byTitle[previousSheets[f.section]],prevDay=Number(previousDate.slice(8));if(!prevSheet||cellAt(prevSheet,meterRow(f.section,prevDay),2).effectiveValue?.numberValue!==prevDay)throw fault(409,'前日の検針行を確認できませんでした。');previous[f.id]=cellAt(prevSheet,meterRow(f.section,prevDay),column).effectiveValue?.numberValue??null;}
  }
  return {date,previousDate,current,previous,formulas,sheets};
 },
 async write(snapshot,changes){
  const day=meterDate(snapshot.date).day;
  const data=Object.entries(changes).map(([id,n])=>{const f=METER_FIELDS.find(f=>f.id===id);if(!f||snapshot.formulas[id])throw fault(409,'数式や入力対象外のセルは変更できません。');return {range:`${quote(snapshot.sheets[f.section])}!${f.column}${meterRow(f.section,day)}`,values:[[n]]};});
  if(data.length)await call(root+'/values:batchUpdate',{method:'POST',body:JSON.stringify({valueInputOption:'RAW',data})});
 }
 };
}
