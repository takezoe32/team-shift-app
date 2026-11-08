import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Buffer } from 'node:buffer';
import { xlsxCells,zipPackage } from '../api/_lib/xlsx-cells.js';
import { xlsxRewrite } from '../api/_lib/xlsx-rewrite.js';
import { ensureYearFiles,yearToPrepare,yearFilesFrom,YEAR_FILES_PATH,METER_ROOT_FOLDER,SHIFT_FOLDER } from '../api/_lib/year-files.js';
import { bumpYearText,weekday,daysIn,meterDailyPlan,meterMonthlyPlan,shiftPlan,meterFolderName,meterDailyName,meterMonthlyName,shiftFileName } from '../src/yearRollover.mjs';
import { meterSheets } from '../api/_lib/meter-sheets.js';
import { monthlySnapshot } from '../src/meterMonthly.mjs';
import { createCronHandler } from '../api/daily-report-cron.js';

// A small stored (uncompressed) zip: enough for the Excel reader and the rewrite.
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const crc32=b=>{let c=0xffffffff;for(const n of b)c=crcTable[(c^n)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
function zip(files){
 const locals=[],centrals=[];let offset=0;
 for(const [name,text] of Object.entries(files)){
  const data=Buffer.from(text),n=Buffer.from(name),crc=crc32(data),local=Buffer.alloc(30),central=Buffer.alloc(46);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(n.length,26);
  central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(n.length,28);central.writeUInt32LE(offset,42);
  locals.push(local,n,data);centrals.push(central,n);offset+=30+n.length+data.length;
 }
 const directory=Buffer.concat(centrals),end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(centrals.length/2,8);end.writeUInt16LE(centrals.length/2,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,directory,end]);
}
const tinyBook=()=>zip({
 '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
 'xl/workbook.xml':`<workbook xmlns:r="r"><sheets><sheet name="2026年度　（令和8年）" sheetId="1" r:id="rId1"/><sheet name="メモ" sheetId="2" r:id="rId2"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">'2026年度　（令和8年）'!$A$1:$C$3</definedName></definedNames><calcPr calcId="1"/></workbook>`,
 'xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
 'xl/worksheets/sheet1.xml':'<worksheet><sheetData><row r="1" spans="1:3"><c r="A1" t="inlineStr"><is><t>令和８年（２０２６年）</t></is></c><c r="C1" s="2"><v>5</v></c></row><row r="2"><c r="A2"><v>7</v></c><c r="B2" s="1"><f>A2*2</f><v>14</v></c></row></sheetData></worksheet>',
 'xl/worksheets/sheet2.xml':`<worksheet><sheetData><row r="1"><c r="A1"><f>'2026年度　（令和8年）'!A2</f><v>7</v></c></row></sheetData></worksheet>`,
 'docProps/app.xml':'<Properties><TitlesOfParts><vector><lpstr>2026年度　（令和8年）</lpstr><lpstr>メモ</lpstr></vector></TitlesOfParts></Properties>'
});

test('Excelの書き換え：文字・数値・空欄、行内への追加、シート名の変更、数式は残し結果だけ消す', () => {
 const out=xlsxRewrite(tinyBook(),{updates:[{title:'2026年度　（令和8年）',address:'A1',value:'令和９年'},{title:'2026年度　（令和8年）',address:'B1',value:'金'},{title:'2026年度　（令和8年）',address:'C1',value:null},{title:'2026年度　（令和8年）',address:'A2',value:3}],renames:{'2026年度　（令和8年）':'2027年度　（令和9年）'},dropFormulaResults:['2026年度　（令和8年）']});
 const b=xlsxCells(out),z=zipPackage(out),s1=z.get('xl/worksheets/sheet1.xml').toString();
 assert.deepEqual(b.titles,['2027年度　（令和9年）','メモ']);
 assert.equal(b.get('2027年度　（令和9年）','A1').value,'令和９年');assert.equal(b.get('2027年度　（令和9年）','B1').value,'金');
 assert.equal(b.get('2027年度　（令和9年）','C1').value,null);assert.match(s1,/<c r="C1" s="2"\/>/);
 assert.equal(b.get('2027年度　（令和9年）','A2').value,3);assert.equal(b.get('2027年度　（令和9年）','B2').formula,true);assert.match(s1,/<c r="B2" s="1"><f>A2\*2<\/f><\/c>/);
 assert.ok(s1.indexOf('r="A1"')<s1.indexOf('r="B1"')&&s1.indexOf('r="B1"')<s1.indexOf('r="C1"'));assert.doesNotMatch(s1,/spans=/);
 assert.match(z.get('xl/workbook.xml').toString(),/'2027年度　（令和9年）'!\$A\$1/);assert.match(z.get('xl/workbook.xml').toString(),/fullCalcOnLoad="1"/);
 assert.match(z.get('xl/worksheets/sheet2.xml').toString(),/'2027年度　（令和9年）'!A2/);
 assert.match(z.get('docProps/app.xml').toString(),/<lpstr>2027年度　（令和9年）<\/lpstr>/);
 assert.throws(()=>xlsxRewrite(tinyBook(),{updates:[{title:'2026年度　（令和8年）',address:'B2',value:1}]}),/数式/);
 assert.throws(()=>xlsxRewrite(tinyBook(),{updates:[{title:'2026年度　（令和8年）',address:'A9',value:1}]}),/行/);
 assert.throws(()=>xlsxRewrite(tinyBook(),{renames:{'メモ':'2026年度　（令和8年）'}}));
});

test('年の表示は令和・西暦とも+1（全角・半角を保つ、他の数字はそのまま）、曜日と日数', () => {
 assert.equal(bumpYearText('令和　８年　1１ 月度'),'令和　９年　1１ 月度');
 assert.equal(bumpYearText('（２０２６年）'),'（２０２７年）');
 assert.equal(bumpYearText('（２０25年）'),'（２０26年）');
 assert.equal(bumpYearText('令和 8年 部門別メーター検針表 2026年'),'令和 9年 部門別メーター検針表 2027年');
 assert.equal(bumpYearText('2026年度　（令和8年）'),'2027年度　（令和9年）');
 assert.equal(bumpYearText('20261-3合計 4258637 12026'),'20261-3合計 4258637 12026');
 assert.equal(bumpYearText('令和９年'),'令和１０年');
 assert.equal(weekday(2027,1,1),'金');assert.equal(weekday(2027,2,28),'日');assert.equal(daysIn(2027,2),28);assert.equal(daysIn(2028,2),29);
 assert.equal(meterFolderName(2027),'2027年度（令和9年）');assert.equal(meterDailyName(2027),'積算メーター2027年（毎朝検針）.xlsx');
 assert.equal(meterMonthlyName(2027),'部門メーター 2027年（毎月検針）.xlsx');assert.equal(shiftFileName(2027),'勤務表-2027年（令和9年）.xlsm');
});

test('夜間処理で作る年：12月は翌年、1月は今年（作り漏れの補完）、それ以外は作らない', () => {
 assert.equal(yearToPrepare('2026-12-01'),2027);assert.equal(yearToPrepare('2026-12-31'),2027);
 assert.equal(yearToPrepare('2027-01-05'),2027);assert.equal(yearToPrepare('2026-11-30'),null);
 assert.equal(yearFilesFrom(null)[2026].daily,'1Kt-cUPgl5qt5eMzCMPljymBO3YnGIv8y');
 assert.equal(yearFilesFrom({years:{2027:{daily:'d27'}}})[2027].daily,'d27');
});

function fakeDrive(existing=[]){
 const items=[...existing],calls=[];let n=0;
 const drive={
  async find(parent,name,mimeType){calls.push(['find',parent,name]);return items.filter(i=>i.parent===parent&&i.name===name&&(!mimeType||i.mimeType===mimeType));},
  async meta(id){const i=items.find(i=>i.id===id);return {id,name:i?.name,mimeType:i?.mimeType};},
  async download(id){calls.push(['download',id]);const i=items.find(i=>i.id===id);return {meta:i,bytes:i.bytes};},
  async folder(parent,name){const id='folder'+(++n);items.push({id,parent,name,mimeType:'application/vnd.google-apps.folder'});calls.push(['folder',parent,name]);return id;},
  async upload(parent,name,mimeType,bytes){const id='file'+(++n);items.push({id,parent,name,mimeType,bytes});calls.push(['upload',parent,name,mimeType]);return id;}
 };
 return {drive,items,calls};
}
const memoryStore=()=>{const data={};return {data,async read(path){return data[path]??null;},async transact(paths,plan){const r=plan(Object.fromEntries(paths.map(p=>[p,data[p]??null])));for(const w of r.writes||[])data[w.path]=structuredClone(w.value);return r.result;}};};
const XLSX='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',XLSM='application/vnd.ms-excel.sheet.macroEnabled.12';
const sources=()=>[{id:'1Kt-cUPgl5qt5eMzCMPljymBO3YnGIv8y',name:'積算メーター2026年',mimeType:XLSX,bytes:tinyBook()},{id:'1KtqHPMkyLzYUlqoLkXsu7xR4viL59pvP',name:'部門メーター 2026年',mimeType:XLSX,bytes:tinyBook()},{id:'1eqiM-qpcSmPla_MX287_xYA_sM03OEwH',name:'勤務表-2026年.xlsm',mimeType:XLSM,bytes:tinyBook()}];
const touchA1=(book,year)=>({updates:[{title:book.titles[0],address:'A1',value:'made from '+year}],renames:{},dropFormulaResults:[],warnings:[]});
const plans={daily:touchA1,monthly:touchA1,shift:(book,year)=>({...touchA1(book,year),warnings:['勤務表の確認']})};

test('来年のフォルダ・検針2ファイル・勤務表を作り、IDを記録する。2回目は何もしない', async () => {
 const {drive,items,calls}=fakeDrive(sources()),store=memoryStore();
 const r=await ensureYearFiles({drive,store,year:2027,plans,now:()=>0});
 assert.deepEqual(r.created,['2027年度（令和9年）','積算メーター2027年（毎朝検針）.xlsx','部門メーター 2027年（毎月検針）.xlsx','勤務表-2027年（令和9年）.xlsm']);
 assert.deepEqual(r.warnings,['勤務表の確認']);assert.equal(r.complete,true);
 const folder=items.find(i=>i.name==='2027年度（令和9年）');assert.equal(folder.parent,METER_ROOT_FOLDER);
 const daily=items.find(i=>i.name==='積算メーター2027年（毎朝検針）.xlsx');assert.equal(daily.parent,folder.id);assert.equal(daily.mimeType,XLSX);
 assert.equal(xlsxCells(daily.bytes).get('2026年度　（令和8年）','A1').value,'made from 2026');
 const shift=items.find(i=>i.name==='勤務表-2027年（令和9年）.xlsm');assert.equal(shift.parent,SHIFT_FOLDER);assert.equal(shift.mimeType,XLSM);
 assert.deepEqual(Object.keys(store.data[YEAR_FILES_PATH].years[2027]).sort(),['daily','folder','monthly','shift','updatedAt','warnings']);
 // The source files are only downloaded, never written.
 assert.ok(calls.filter(c=>c[0]==='upload').every(c=>!sources().some(s=>s.name===c[2])));
 const before=calls.length,again=await ensureYearFiles({drive,store,year:2027,plans});
 assert.deepEqual(again.created,[]);assert.equal(calls.length,before);
});

test('同じ名前のフォルダ・ファイルが既にあれば作らずに使い、前年が無ければ作らない', async () => {
 const {drive,calls}=fakeDrive([...sources(),{id:'f27',parent:METER_ROOT_FOLDER,name:'2027年度（令和9年）',mimeType:'application/vnd.google-apps.folder'},{id:'d27',parent:'f27',name:'積算メーター2027年（毎朝検針）.xlsx',mimeType:XLSX}]),store=memoryStore();
 const r=await ensureYearFiles({drive,store,year:2027,plans});
 assert.deepEqual(r.created,['部門メーター 2027年（毎月検針）.xlsx','勤務表-2027年（令和9年）.xlsm']);
 assert.equal(store.data[YEAR_FILES_PATH].years[2027].daily,'d27');assert.equal(store.data[YEAR_FILES_PATH].years[2027].folder,'f27');
 assert.ok(!calls.some(c=>c[0]==='download'&&c[1]==='1Kt-cUPgl5qt5eMzCMPljymBO3YnGIv8y'));
 await assert.rejects(()=>ensureYearFiles({drive,store,year:2029,plans}),/2028年の検針ファイル/);
 await assert.rejects(()=>ensureYearFiles({drive,store,year:2026,plans}));
});

test('夜間処理：12月は来年のファイル作成を実行し、作成・注意・失敗を管理者に知らせる（日報・バックアップの結果は変えない）', async () => {
 const env={CRON_SECRET:'s',VERCEL_ENV:'production'},alerts=[],seen=[];
 const make=(yearFiles)=>createCronHandler({env,configure:()=>({ready:true}),now:()=>Date.parse('2026-11-30T15:05:00Z'),log:()=>{},backup:async()=>({id:'b'}),run:async()=>({skipped:true}),notify:async a=>{alerts.push([a.code,a.detail]);return {sent:true};},makeStore:()=>({}),makeClient:()=>({}),yearFiles});
 const res=()=>({setHeader(){},status(c){this.code=c;return this;},json(b){this.body=b;return this;}});
 let r=res();await make(async a=>{seen.push(a.day);return {year:2027,created:['積算メーター2027年（毎朝検針）.xlsx'],warnings:['2月は手で直す']};})({method:'GET',headers:{authorization:'Bearer s'}},r);
 assert.equal(r.code,200);assert.deepEqual(seen,['2026-12-01']);assert.equal(alerts[0][0],'year_files_created');assert.match(alerts[0][1],/作成：積算メーター2027年/);assert.match(alerts[0][1],/確認：2月は手で直す/);
 r=res();await make(async()=>{throw new Error('権限がありません');})({method:'GET',headers:{authorization:'Bearer s'}},r);
 assert.equal(r.code,200);assert.equal(r.body.yearFiles.ok,false);assert.deepEqual(alerts.at(-1),['year_files_failed','権限がありません']);
 const count=alerts.length;r=res();await make(async()=>({skipped:true}))({method:'GET',headers:{authorization:'Bearer s'}},r);assert.equal(alerts.length,count);
});

// Real files (optional): METER_TEST_XLSX, METER_MONTHLY_TEST_XLSX, SHIFT_TEST_XLSM.
const daily=process.env.METER_TEST_XLSX,monthly=process.env.METER_MONTHLY_TEST_XLSX,shift=process.env.SHIFT_TEST_XLSM;
test('実際の毎朝検針：2027年版は年・曜日を直し、検針値を空にし、数式・書式は残す', { skip: !daily && 'METER_TEST_XLSX が未設定' }, () => {
 const src=fs.readFileSync(daily),before=xlsxCells(src),p=meterDailyPlan(before,2026),b=xlsxCells(xlsxRewrite(src,p));
 assert.deepEqual(p.warnings,[]);assert.deepEqual(b.titles,before.titles);
 assert.equal(b.get('01','C9').value,'金');assert.equal(b.get('11','C9').value,'月');assert.equal(b.get('02','C36').value,'日');
 assert.match(b.get('01','G5').value,/２０２７/);assert.match(b.get('01','B5').value,/令和\s*９年/);
 for(const [t,a] of [['01','D9'],['11','D9'],['11','F9'],['10','D40'],['Ｈ-11','D11'],['Ｈ-11','J11']])assert.equal(b.get(t,a).value,null,t+a);
 assert.equal(b.get('11','E9').formula,true);assert.equal(b.get('11','B9').value,1);assert.equal(b.get('11','B40').value,before.get('11','B40').value);
});
test('実際の毎月検針：シート名・年を+1、各月の検針値を空にする', { skip: !monthly && 'METER_MONTHLY_TEST_XLSX が未設定' }, () => {
 const src=fs.readFileSync(monthly),p=meterMonthlyPlan(xlsxCells(src),2026),b=xlsxCells(xlsxRewrite(src,p)),t=b.titles.find(t=>t.startsWith('2027年度'));
 assert.ok(t);assert.ok(b.titles.some(t=>t.startsWith('記入用')&&t.includes('2027')));
 assert.equal(b.get(t,'C7').value,null);assert.equal(b.get(t,'C8').formula,true);assert.equal(b.get(t,'B7').value,'1月度');assert.match(b.get(t,'B3').value,/令和\s*9年.*2027年/);
});
test('実際の勤務表：年・曜日・12月のメンバー、シフト欄・特記事項・休暇集計・休館日を空に、マクロは保持', { skip: !shift && 'SHIFT_TEST_XLSM が未設定' }, () => {
 const src=fs.readFileSync(shift),before=xlsxCells(src),p=shiftPlan(before,2026),out=xlsxRewrite(src,p),b=xlsxCells(out);
 assert.equal(b.get('1','J3').value,2027);assert.equal(b.get('1','U3').value,9);assert.equal(b.get('1','D6').value,'金');assert.equal(b.get('2','AE6').value,'日');
 assert.equal(b.get('1','A7').value,before.get('12','A7').value);assert.equal(b.get('1','D7').value,null);assert.equal(b.get('11','AJ7').formula,true);
 const z=zipPackage(out),o=zipPackage(src);assert.deepEqual(z.names,o.names);if(o.names.includes('xl/vbaProject.bin'))assert.ok(z.get('xl/vbaProject.bin').equals(o.get('xl/vbaProject.bin')));
});
test('実際の毎朝検針：2027年1月1日の前日比は2026年12月31日（前年のファイル）から読む', { skip: !daily && 'METER_TEST_XLSX が未設定' }, async () => {
 const src=fs.readFileSync(daily),next=xlsxRewrite(src,meterDailyPlan(xlsxCells(src),2026)),old=xlsxCells(src);
 const bytes={d26:src,d27:next},meta=id=>({id,mimeType:XLSX,fileSize:String(bytes[id].length),etag:'"'+id+'"',capabilities:{canEdit:true}});
 const fetcher=async url=>{const id=url.match(/files\/(\w+)/)[1];return url.includes('alt=media')?{ok:true,arrayBuffer:async()=>bytes[id]}:{ok:true,json:async()=>meta(id)};};
 const s=await meterSheets('t',fetcher,{files:{2026:{daily:'d26'},2027:{daily:'d27'}}}).read('2027-01-01');
 assert.equal(s.previousDate,'2026-12-31');assert.equal(s.previous['gas-main'],old.get('12','H39').value);assert.deepEqual(Object.keys(s.earlier),['2026-12-30','2026-12-29']);
 assert.equal(s.current['gas-main'],null);assert.equal(s.sheets.main,'01');
});
test('毎月検針の1月度：前月は前年の12月度、デマンドは前年12月の最大値', () => {
 const book=(titles,cells)=>({titles,get:(t,a)=>({value:cells[t+'!'+a]??null})});
 const cells={},lastCells={};
 const blocks=[[5,6,[['C','全日電力'],['D','デマンド'],['E','研修棟'],['F','ガーデン受電盤'],['G','テニスコート'],['H','マリン主メーター']]],[40,41,[['C','本館系統'],['D','バンケット系統'],['E','バンケット主厨房'],['F','プール'],['G','従食'],['H','8F厨房'],['I','大浴場給湯器'],['J','機械室'],['K','機械室']]],[74,75,[['C','ホテル系統'],['D','バンケット系統'],['E','プール'],['F','RF中水'],['G','日比谷花壇'],['H','給湯']]]];
 for(const [top,header,heads] of blocks)for(const [c,h] of heads){cells['2027年度（令和9年）!'+c+header]=h;lastCells['2026年度（令和8年）!'+c+header]=h;for(let m=1;m<=12;m++){cells['2027年度（令和9年）!B'+(top+2*m)]=m+'月度';lastCells['2026年度（令和8年）!B'+(top+2*m)]=m+'月度';}lastCells['2026年度（令和8年）!'+c+(top+24)]=500;}
 const dailyCells={'01!G5':'（２０２７年）','Ｈ-01!G7':'（２０２７年）','01!B9':1,'Ｈ-01!B11':1};
 const lastDaily={'12!B9':1,'12!F9':4.2,'12!B10':2,'12!F10':6.6};
 const s=monthlySnapshot('2027-01',book(['01','Ｈ-01'],dailyCells),book(['2027年度（令和9年）'],cells),{daily:book(['12'],lastDaily),monthly:book(['2026年度（令和8年）'],lastCells)});
 assert.equal(s.previousMonth,'2026-12');assert.equal(s.previous['m-training'],500);assert.equal(s.sources['m-demand'],6.6);
 const none=monthlySnapshot('2027-01',book(['01','Ｈ-01'],dailyCells),book(['2027年度（令和9年）'],cells));
 assert.equal(none.previous['m-training'],null);assert.equal(none.sources['m-demand'],null);
});
