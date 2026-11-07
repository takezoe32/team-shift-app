import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MONTHLY_FIELDS,MONTHLY_INPUT_FIELDS,MONTHLY_SHARED_FIELDS,monthlyMonth,previousMonth,monthlySheet,monthlySnapshot,monthlyChanges,monthlyTransfers,monthlyUpdates,monthlyRow } from '../src/meterMonthly.mjs';
import { validateMeterPoints,METER_MAP_PATHS } from '../src/meterMap.mjs';
import { createMeterHandler } from '../api/meter-readings.js';
import { monthlyMeterSheets } from '../api/_lib/meter-sheets.js';
import { seal } from '../api/_lib/report-auth.js';
import { xlsxCells } from '../api/_lib/xlsx-cells.js';

// A daily book with the 1st of each month = month*1000 + column, and demand on day d of month m = m + d/100.
function dailyBook({missing=false}={}){
 const titles=['01','H-01','10','Ｈ-10','11','Ｈ-11'];
 const get=(title,address)=>{const h=title.normalize('NFKC').startsWith('H'),m=Number(title.normalize('NFKC').replace('H-','')),[,col,r]=address.match(/^([A-Z]+)(\d+)$/),row=Number(r),first=h?11:9;
  if(address===(h?'G7':'G5'))return {value:'（２０２６年）'};
  if(col==='B'&&row>=first&&row<first+31)return {value:row-first+1};
  if(missing&&m===11)return {value:null};
  if(!h&&col==='F'&&row>=first&&row<first+31)return {value:m+(row-first+1)/100};
  if(row===first)return {value:m*1000+col.charCodeAt(0)};
  return {value:null};};
 return {titles,get};
}
// The monthly book: header rows with the meter names, "m月度" rows, and a value in every month row up to October.
function monthlyBook({formula}={}){
 const title='2026年度　（令和8年）',cells=new Map();
 for(const f of MONTHLY_FIELDS){cells.set(f.column+f.header,{value:f.head});for(let m=1;m<=12;m++){cells.set('B'+monthlyRow(f,m),{value:m+'月度'});if(m<=10)cells.set(f.column+monthlyRow(f,m),{value:m*100+f.column.charCodeAt(0)});}}
 if(formula)cells.set(formula,{value:5,formula:true});
 return {titles:['記入用　2026年（令和8年）',title],get:(t,a)=>t===title?cells.get(a)||{value:null}:{value:null}};
}
test('毎月検針は21項目、入力は毎朝検針にない11項目、転記は10項目',()=>{
 assert.equal(MONTHLY_FIELDS.length,21);assert.equal(MONTHLY_INPUT_FIELDS.length,11);assert.equal(MONTHLY_SHARED_FIELDS.length,10);
 assert.deepEqual(MONTHLY_INPUT_FIELDS.map(f=>f.label),['② 研修棟','③ ガーデン受電盤','④ テニスコート','⑤ マリン主メーター','⑧ バンケット主厨房','⑨ プール×3','⑩ 従食','⑪ 8F 厨房','⑫ 大浴場給湯器','⑰ プール','⑱ RF 中水']);
 // 11月度: electric row 27, gas row 62, water row 96.
 assert.deepEqual(['m-electric','m-gas-main','m-water-hotel'].map(id=>monthlyRow(MONTHLY_FIELDS.find(f=>f.id===id),11)),[27,62,96]);
 assert.equal(previousMonth('2026-11'),'2026-10');assert.equal(previousMonth('2026-01'),'2025-12');assert.throws(()=>monthlyMonth('2025-11'));assert.throws(()=>monthlyMonth('2026-13'));
 assert.equal(monthlySheet(['記入用　2026年（令和8年）','2026年度　（令和8年）']),'2026年度　（令和8年）');assert.throws(()=>monthlySheet(['記入用　2026年（令和8年）']));
});
test('共通項目は毎朝検針の1日の値、デマンドは前月の最大値を転記する',()=>{
 const s=monthlySnapshot('2026-11',dailyBook(),monthlyBook());
 assert.equal(s.sources['m-electric'],11000+'D'.charCodeAt(0));assert.equal(s.sources['m-water-hibiya'],11000+'H'.charCodeAt(0));
 assert.equal(s.sources['m-demand'],10.31);assert.equal(s.previous['m-training'],1000+'E'.charCodeAt(0));assert.equal(s.current['m-training'],null);
 const changes=monthlyChanges({'m-training':'12.5','m-garden':''},s);
 assert.equal(changes['m-training'],12.5);assert.equal(changes['m-demand'],10.31);assert.equal(changes['m-gas-kitchen'],11000+'T'.charCodeAt(0));assert.equal(Object.keys(changes).length,11);
 assert.deepEqual(monthlyUpdates(s,{'m-training':12.5,'m-gas-kitchen':1}),[{title:'2026年度　（令和8年）',address:'E27',value:12.5},{title:'2026年度　（令和8年）',address:'K62',value:1}]);
 assert.throws(()=>monthlyChanges({'m-electric':'1'},s),/更新できない/);assert.throws(()=>monthlyChanges({'m-training':'abc'},s),/数値/);
});
test('毎朝検針が未入力の項目・同じ値・数式セルは転記しない',()=>{
 const s=monthlySnapshot('2026-11',dailyBook({missing:true}),monthlyBook({formula:'K62'}));
 const states=Object.fromEntries(monthlyTransfers(s).map(t=>[t.id,t.state]));
 assert.equal(states['m-electric'],'missing');assert.equal(states['m-demand'],'write');assert.equal(states['m-gas-kitchen'],'formula');
 assert.deepEqual(monthlyChanges({},s),{'m-demand':10.31});
 const done=monthlySnapshot('2026-11',dailyBook(),monthlyBook());done.current['m-electric']=done.sources['m-electric'];
 assert.equal(monthlyTransfers(done).find(t=>t.id==='m-electric').state,'same');
 assert.throws(()=>monthlyUpdates(s,{'m-gas-kitchen':1}),/数式/);
});
test('原本の行・項目の並びが違えば読み込みを止める',()=>{
 const book=monthlyBook(),moved={...book,get:(t,a)=>a==='E6'?{value:'別の項目'}:book.get(t,a)};
 assert.throws(()=>monthlySnapshot('2026-11',dailyBook(),moved),/並び/);
 const shifted={...book,get:(t,a)=>a==='B27'?{value:'10月度'}:book.get(t,a)};
 assert.throws(()=>monthlySnapshot('2026-11',dailyBook(),shifted),/月の行/);
});
test('毎月検針のマップは入力11項目だけを登録でき、毎朝検針とは別の保存先',()=>{
 assert.notEqual(METER_MAP_PATHS.monthly,METER_MAP_PATHS.daily);
 assert.equal(validateMeterPoints([{n:1,name:'研修棟',x:.5,y:.5,fields:['m-training']}],MONTHLY_INPUT_FIELDS).length,1);
 assert.throws(()=>validateMeterPoints([{n:1,name:'電気',x:.5,y:.5,fields:['m-electric']}],MONTHLY_INPUT_FIELDS));
 assert.throws(()=>validateMeterPoints([{n:1,name:'研修棟',x:.5,y:.5,fields:['m-training']}]));
});
test('読込は毎朝検針と毎月検針の両方を読み、書込は毎月検針の原本だけ',async()=>{
 const daily=dailyBook(),monthly=monthlyBook(),writes=[];
 const book=(b,name)=>({read:async ranges=>{ranges(b.titles);return {format:'sheets',...b};},write:async(state,updates)=>writes.push([name,updates])});
 const adapter=monthlyMeterSheets('t',undefined,{daily:book(daily,'daily'),monthly:book(monthly,'monthly')}),s=await adapter.read('2026-11');
 await adapter.write(s,monthlyChanges({'m-training':'7'},s));
 assert.equal(writes.length,1);assert.equal(writes[0][0],'monthly');assert(writes[0][1].some(u=>u.address==='E27'&&u.value===7));
 await assert.rejects(()=>adapter.read('2026-13'),e=>e.status===409);
});
const secret=Buffer.alloc(32,8).toString('base64'),now=()=>1800000000000,uid='u1',email='member@plandosee.co.jp';
function fixture({role='member'}={}){
 const writes=[],stored={};let snapshot=monthlySnapshot('2026-11',dailyBook(),monthlyBook());
 const h=createMeterHandler({now,configure:()=>({ready:true,secret}),makeStore:()=>({source:async()=>({users:{[uid]:{email,role,name:'担当者'}}}),get:async()=>({refreshToken:'r'})}),makeClient:()=>({setCredentials(){},getAccessToken:async()=>({token:'a'})}),
  makeSheets:()=>{throw new Error('daily book must not be used');},
  makeMonthlySheets:()=>({read:async()=>structuredClone(snapshot),write:async(s,changes)=>{writes.push(changes);snapshot={...snapshot,current:{...snapshot.current,...changes}};}}),
  makeLocks:()=>({read:async path=>stored[path]||null,transact:async(paths,run)=>{const records=Object.fromEntries(paths.map(p=>[p,stored[p]||(p==='app_data/shared_state'?{users:{[uid]:{email,role}}}:null)]));const r=await run(records);for(const w of r.writes||[])stored[w.path]=w.value;return r.result;}})});
 return {h,writes,stored};
}
const cookie='__Host-teamshift_line_member='+seal({purpose:'line-member',uid,email,expires:now()+60000},secret);
const req=(method,body)=>({method,url:'/api/meter-readings?kind=monthly&month=2026-11&appUid=u1',headers:{origin:'https://team-shift-app.vercel.app','content-type':'application/json',cookie},body});
async function invoke(h,r){const res={setHeader(){},status(n){this.code=n;return this;},json(d){this.data=d;return this;}};await h(r,res);return res;}
test('APIは毎月検針の読込・保存と専用マップの保存を行う',async()=>{
 const {h,writes,stored}=fixture(),got=await invoke(h,req('GET'));
 assert.equal(got.code,200);assert.equal(got.data.month,'2026-11');assert.deepEqual(got.data.meterMap.points,[]);
 const saved=await invoke(h,req('POST',{action:'save',kind:'monthly',month:'2026-11',appUid:uid,values:{'m-training':'5'},revision:got.data.revision}));
 assert.equal(saved.code,200);assert.equal(writes[0]['m-training'],5);assert.equal(writes[0]['m-demand'],10.31);
 // A daily revision cannot be used to save the monthly book.
 const daily=seal({purpose:'meter-snapshot',uid,date:'2026-11',expires:now()+60000,snapshot:got.data},secret);
 assert.equal((await invoke(h,req('POST',{action:'save',kind:'monthly',month:'2026-11',appUid:uid,values:{},revision:daily}))).code,409);
 const admin=fixture({role:'admin'}),map=await invoke(admin.h,req('POST',{action:'save-map',kind:'monthly',appUid:uid,version:0,points:[{n:1,name:'研修棟',x:.2,y:.3,fields:['m-training']}]}));
 assert.equal(map.code,200);assert.equal(admin.stored[METER_MAP_PATHS.monthly].points.length,1);assert.equal(admin.stored[METER_MAP_PATHS.daily],undefined);
 assert.equal((await invoke(h,req('POST',{action:'save-map',kind:'monthly',appUid:uid,version:0,points:[]}))).code,403);
 assert.equal(Object.keys(stored).filter(p=>p.includes('meter_map')).length,0);
});
// Optional check against the real books: METER_TEST_XLSX (daily) and METER_MONTHLY_TEST_XLSX (monthly).
const realDaily=process.env.METER_TEST_XLSX,realMonthly=process.env.METER_MONTHLY_TEST_XLSX;
test('実原本：毎月検針の1〜9月度の共通項目は毎朝検針の1日の値・前月の最大値と一致する',{skip:!(realDaily&&realMonthly)},()=>{
 const d=xlsxCells(readFileSync(realDaily)),m=xlsxCells(readFileSync(realMonthly));
 const s=monthlySnapshot('2026-10',d,m);assert.equal(s.sources['m-electric'],d.get('10','D9').value);
 const feb=monthlySnapshot('2026-02',d,m);for(const t of monthlyTransfers(feb))assert.equal(t.state,'same',t.id);
 const up=monthlyUpdates(s,monthlyChanges({'m-training':'1'},s));assert.doesNotThrow(()=>m.patch(up));
});
