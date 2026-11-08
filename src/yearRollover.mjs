// What changes when next year's files are made from this year's (on December 1, by the nightly job):
// - 毎朝検針 (積算メーター): year labels +1, the day/weekday columns for the new calendar, every reading cleared.
// - 毎月検針 (部門メーター): sheet names and year labels +1, the readings of each month cleared.
// - 勤務表 (shift workbook): year cells +1, weekdays for the new calendar, names from this December's sheet,
//   shift marks and notes cleared, the leave tallies and the closed days (休館日) cleared.
// Formulas, styles, macros and the sheet layout are kept. Each plan returns {updates, renames, dropFormulaResults, warnings}
// for xlsxRewrite; book is an xlsxCells reader ({titles, get, addresses}).
import { meterSheet,meterRow } from './meterReadings.mjs';
import { MONTHLY_FIELDS } from './meterMonthly.mjs';

export const reiwa = year => year-2018;
export const meterFolderName = year => `${year}年度（令和${reiwa(year)}年）`;
export const meterDailyName = year => `積算メーター${year}年（毎朝検針）.xlsx`;
export const meterMonthlyName = year => `部門メーター ${year}年（毎月検針）.xlsx`;
export const shiftFileName = (year,extension='xlsm') => `勤務表-${year}年（令和${reiwa(year)}年）.${extension}`;

const FULL='０１２３４５６７８９';
const half = s => s.replace(/[０-９]/g,c=>String(FULL.indexOf(c)));
// Keep each digit's width (full-width stays full-width): '２０２６' -> '２０２７', '２０25' -> '２０26'.
const likeSample = (sample,value) => {const digits=String(value);const pad=digits.padStart(sample.length,'0');return [...pad].map((d,i)=>/[０-９]/.test(sample[Math.min(i,sample.length-1)])?FULL[d]:d).join('');};
// 令和N and four-digit years (2000–2099) move by delta; other numbers are left alone.
export function bumpYearText(text,delta=1){
 return String(text)
  .replace(/令和(\s*)([0-9０-９]{1,2})(?![0-9０-９])/g,(_,space,n)=>'令和'+space+likeSample(n,Number(half(n))+delta).replace(/^[0０](?=.)/,''))
  .replace(/(?<![0-9０-９])([2２][0０][0-9０-９]{2})(?![0-9０-９])/g,y=>likeSample(y,Number(half(y))+delta));
}
const WEEKDAYS='日月火水木金土';
export const weekday = (year,month,day) => WEEKDAYS[new Date(Date.UTC(year,month-1,day)).getUTCDay()];
export const daysIn = (year,month) => new Date(Date.UTC(year,month,0)).getUTCDate();
const columnIndex = letters => [...letters].reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0);
const columnName = index => {let s='';for(let n=index;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
const cellOf = address => {const m=address.match(/^([A-Z]+)(\d+)$/);return {index:columnIndex(m[1]),row:Number(m[2])};};
const norm = v => String(v??'').normalize('NFKC').replace(/\s/g,'');

function planner(book){
 const updates=new Map(),warnings=[];
 const set=(title,address,value)=>{const now=book.get(title,address);if((now.value??null)===value&&!now.formula)return updates.delete(title+'|'+address);if(now.formula)return;updates.set(title+'|'+address,{title,address,value});};
 const clear=(title,keep)=>{for(const address of book.addresses(title)){const c=book.get(title,address);if(c.formula||c.value===null||c.value==='')continue;if(keep(cellOf(address)))continue;updates.set(title+'|'+address,{title,address,value:null});}};
 const years=title=>{for(const address of book.addresses(title)){const c=book.get(title,address);if(c.formula||typeof c.value!=='string')continue;const next=bumpYearText(c.value);if(next!==c.value)set(title,address,next);}};
 return {set,clear,years,warnings,done:extra=>({updates:[...updates.values()],warnings,renames:{},dropFormulaResults:[],...extra})};
}

// 積算メーター (毎朝検針): sheets 01–12 (data from row 9) and H-01–H-12 (from row 11); the row after day 31 is 「翌月1日」.
export function meterDailyPlan(book,fromYear){
 const to=fromYear+1,p=planner(book),monthSheets=[];
 for(const title of book.titles)p.years(title);
 for(const section of ['main','h'])for(let m=1;m<=12;m++){
  const title=meterSheet(book.titles,section,m),first=meterRow(section,1),days=daysIn(to,m);monthSheets.push(title);
  for(let d=1;d<=31;d++){
   const row=first+d-1,b=book.get(title,'B'+row).value;
   if(b!==null&&b!==d)throw new Error(`毎朝検針の「${title}」の日付の行が想定と異なります（B${row}）。`);
   p.set(title,'B'+row,d<=days?d:null);p.set(title,'C'+row,d<=days?weekday(to,m,d):null);
  }
  // Readings and everything typed in the day rows and the 翌月1日 row (columns D onward); formulas stay.
  p.clear(title,({row,index})=>row<first||row>first+31||index<4);
 }
 return p.done({dropFormulaResults:monthSheets});
}

// 部門メーター (毎月検針): the year sheet's month rows (m月度) and their usage rows, in the meter columns of each block.
export function meterMonthlyPlan(book,fromYear){
 const p=planner(book),renames={};
 for(const title of book.titles){p.years(title);const next=bumpYearText(title);if(next!==title)renames[title]=next;}
 const main=book.titles.filter(t=>norm(t)===`${fromYear}年度(令和${reiwa(fromYear)}年)`);
 if(main.length!==1)throw new Error(`毎月検針の「${fromYear}年度（令和${reiwa(fromYear)}年）」シートを一意に確認できません。`);
 const blocks=new Map();for(const f of MONTHLY_FIELDS){(blocks.get(f.top)||blocks.set(f.top,new Set()).get(f.top)).add(columnIndex(f.column));}
 const rows=new Map();
 for(const [top,columns] of blocks)for(let m=1;m<=12;m++){
  const row=top+2*m;if(norm(book.get(main[0],'B'+row).value)!==m+'月度')throw new Error(`毎月検針の${m}月度の行が想定と異なります（B${row}）。`);
  rows.set(row,columns);rows.set(row+1,columns);
 }
 p.clear(main[0],({row,index})=>!rows.get(row)?.has(index));
 return p.done({renames,dropFormulaResults:[main[0]]});
}

// 勤務表: sheets 1–12 and 000 (the month template), 休暇消化集計, 休館日 / 休館日 (2).
export function shiftPlan(book,fromYear){
 const to=fromYear+1,p=planner(book),months=book.titles.filter(t=>/^\d{1,2}$/.test(t)&&Number(t)>=1&&Number(t)<=12),template=book.titles.filter(t=>t==='000');
 if(months.length!==12)throw new Error('勤務表の1〜12月のシートを確認できません。');
 const members=title=>{const names=[];for(let row=7;row<60;row++){const v=book.get(title,'A'+row).value;if(norm(v)==='特記事項')return {names,notes:row};names.push(v);}return null;};
 const december=members('12');if(!december)throw new Error('勤務表の12月シートに「特記事項」の行が見つかりません。');
 const names=december.names.filter(n=>n!==null&&n!=='');
 for(const title of book.titles)p.years(title);
 for(const title of [...template,...months]){
  // Row 3: the year (e.g. J3 2026) and the 令和 number (e.g. U3 8, after 「（令和」).
  let year=false,era=false;const row3=book.addresses(title).filter(a=>cellOf(a).row===3).sort((a,b)=>cellOf(a).index-cellOf(b).index);
  for(const address of row3){const v=book.get(title,address).value;if(v===fromYear){p.set(title,address,to);year=true;}
   else if(v===reiwa(fromYear)&&row3.some(a=>cellOf(a).index<cellOf(address).index&&cellOf(address).index-cellOf(a).index<=3&&String(book.get(title,a).value??'').includes('令和'))){p.set(title,address,reiwa(to));era=true;}}
  if(!year||!era)p.warnings.push(`勤務表「${title}」の年（3行目）を確認できませんでした。`);
  const layout=members(title);if(!layout){p.warnings.push(`勤務表「${title}」に「特記事項」の行がありません。`);continue;}
  const slots=layout.notes-7;if(names.length>slots)p.warnings.push(`勤務表「${title}」はメンバー${slots}人分の行しかないため、12月の${names.length}人のうち${slots}人までを入れました。`);
  for(let i=0;i<slots;i++)p.set(title,'A'+(7+i),names[i]??null);
  // Shift marks (D–AH) of every member row and the notes below; the counts (COUNTIF) are formulas and stay.
  p.clear(title,({row,index})=>row<7||index<4||index>34);
  if(title==='000')continue;
  const m=Number(title),days=daysIn(to,m);let fits=true;
  for(let d=1;d<=days;d++)if(book.get(title,columnName(3+d)+'5').value!==d)fits=false;
  if(book.get(title,columnName(4+days)+'5').value===days+1)fits=false;
  if(!fits){p.warnings.push(`勤務表の${m}月は${to}年の日数（${days}日）と並びが合わないため、日付と曜日を手で直してください。`);continue;}
  for(let d=1;d<=days;d++)p.set(title,columnName(3+d)+'6',weekday(to,m,d));
 }
 for(const title of book.titles.filter(t=>norm(t).startsWith('休暇消化集計')))p.clear(title,({row,index})=>row<7||index<3);
 for(const title of book.titles.filter(t=>norm(t).startsWith('休館日')))p.clear(title,({row})=>row<3);
 return p.done({dropFormulaResults:[...months,...template,...book.titles.filter(t=>norm(t).startsWith('休暇消化集計'))]});
}
