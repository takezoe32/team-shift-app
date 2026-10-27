import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccessMeters,METER_FIELDS,meterChanges,meterDifference,meterSheet,meterDate,previousMeterDate,meterRow } from '../src/meterReadings.mjs';
import { meterSheets } from '../api/_lib/meter-sheets.js';
import { createMeterHandler } from '../api/meter-readings.js';
import { seal } from '../api/_lib/report-auth.js';

test('20項目、全半角のタブ名、月初、年境界、検針日の妥当性',()=>{
 assert.equal(METER_FIELDS.length,20);assert.equal(meterSheet(['01','H-01','10','Ｈ-10'],'h',10),'Ｈ-10');assert.equal(meterSheet(['01','H-01'],'main',1),'01');assert.throws(()=>meterSheet(['10','１０'],'main',10));assert.equal(previousMeterDate('2026-10-01'),'2026-09-30');assert.equal(previousMeterDate('2026-01-01'),'2025-12-31');assert.throws(()=>meterDate('2026-02-30'));assert.throws(()=>meterDate('2027-01-01'));assert.equal(meterRow('main',27),35);assert.equal(meterRow('h',27),37);
});
test('前日比は増加、減少、ゼロ、小数、未記録を区別',()=>{
 assert.equal(meterDifference('123.5',120).text,'＋3.5');assert.equal(meterDifference('38.2',40,'℃').text,'−1.8 ℃');assert.equal(meterDifference('0',0).text,'±0');assert.equal(meterDifference('0.3',0.2).text,'＋0.1');assert.equal(meterDifference('20',null),null);assert.equal(meterDifference('',12),null);
});
test('数式・任意項目・空欄による消去は受け付けず、変更した数値だけ保存候補',()=>{
 assert.deepEqual(meterChanges({'gas-main':'０'}, {'gas-main':10}),{'gas-main':0});assert.throws(()=>meterChanges({'gas-main':'=1+1'},{}));assert.throws(()=>meterChanges({previous:42},{}));assert.throws(()=>meterChanges({'gas-main':''},{'gas-main':20}));assert.deepEqual(meterChanges({'gas-main':'10','gas-boiler':''},{'gas-main':10,'gas-boiler':null}),{});
});
function grid(title,month,{formula=false,year=2026}={}){
 const h=title.normalize('NFKC').startsWith('H'),rows=Array.from({length:45},()=>({values:Array.from({length:19},()=>({}))}));
 const cell=(row,col,value)=>{rows[row-1].values[col-2]=value;};
 cell(h?7:5,7,{effectiveValue:{stringValue:'（'+year+'年）'}});
 for(let day=1;day<=31;day++)cell(meterRow(h?'h':'main',day),2,{effectiveValue:{numberValue:day}});
 for(const f of METER_FIELDS.filter(f=>f.section===(h?'h':'main'))){const header=!h?(f.id==='electric-demand'?'デマンド':'検針値'):['h-light','h-power','h-water'].includes(f.id)?'検針値':f.label;cell(h?10:8,f.column.charCodeAt(0)-64,{effectiveValue:{stringValue:header}});for(let day=1;day<=31;day++)cell(meterRow(f.section,day),f.column.charCodeAt(0)-64,{effectiveValue:{numberValue:month*100+day},userEnteredValue:{numberValue:month*100+day}});}
 if(formula)cell(35,4,{effectiveValue:{numberValue:1027},userEnteredValue:{formulaValue:'=1+1026'}});
 return {properties:{title,sheetId:month+(h?20:0)},data:[{startRow:0,startColumn:1,rowData:rows}]};
}
function sheetFetcher(opts={}){const calls=[];const fetcher=async(url,options={})=>{calls.push({url,options});const parsed=new URL(url);if(options.method==='POST')return {ok:true,json:async()=>({})};if(!parsed.searchParams.has('ranges'))return {ok:true,json:async()=>({sheets:['09','Ｈ-09','10','Ｈ-10','01','H-01'].map(title=>({properties:{title}}))})};return {ok:true,json:async()=>({sheets:[grid('09',9),grid('Ｈ-09',9),grid('10',10,opts),grid('Ｈ-10',10,opts),grid('01',1),grid('H-01',1)]})};};return {calls,fetcher};}
test('原本の当日・前日を読み、指定した日の入力セルだけ更新する',async()=>{
 const {calls,fetcher}=sheetFetcher(),sheets=meterSheets('test',fetcher),s=await sheets.read('2026-10-27');assert.equal(s.current['gas-main'],1027);assert.equal(s.previous['gas-main'],1026);
 await sheets.write(s,{'electric-reading':123.4,'tank-1':61});const body=JSON.parse(calls.at(-1).options.body);assert.equal(body.valueInputOption,'RAW');assert.deepEqual(body.data,[{range:"'10'!D35",values:[[123.4]]},{range:"'Ｈ-10'!J37",values:[[61]]}]);
 const month=await sheets.read('2026-10-01');assert.equal(month.previous['gas-main'],930);const jan=await sheets.read('2026-01-01');assert.equal(jan.previous['h-light'],null);
});
test('式の保護と年度違いを検出する',async()=>{
 const s=meterSheets('x',sheetFetcher({formula:true}).fetcher),snap=await s.read('2026-10-27');await assert.rejects(()=>s.write(snap,{'electric-reading':1}));await assert.rejects(()=>meterSheets('x',sheetFetcher({year:2025}).fetcher).read('2026-10-27'),/年度/);
});
const secret=Buffer.alloc(32,8).toString('base64'),now=()=>1800000000000,uid='u1',email='member@plandosee.co.jp';
const baseline={date:'2026-10-27',previousDate:'2026-10-26',current:{'gas-main':10},previous:{'gas-main':8},formulas:{'gas-main':false},sheets:{main:'10',h:'Ｈ-10'}};
function handlerFixture({role='member',fresh=baseline,accountEmail=email}={}){
 const writes=[],records={};let reads=0;const h=createMeterHandler({now,configure:()=>({ready:true,secret}),makeStore:()=>({source:async()=>({users:{[uid]:{email:accountEmail,role,name:'担当者'}}}),get:async()=>({refreshToken:'private-token'})}),makeClient:()=>({setCredentials(){},getAccessToken:async()=>({token:'private-access'})}),makeSheets:()=>({read:async()=>{reads++;return reads>1?{...baseline,current:{'gas-main':11}}:fresh;},write:async(s,c)=>writes.push(c)}),makeLocks:()=>({transact:async(paths,plan)=>{const out=plan(records);for(const w of out.writes||[])records[w.path]=w.value;return out.result;}})});return {h,writes};
}
function request(method,extra={}){return {method,url:'/api/meter-readings?appUid=u1&date=2026-10-27',headers:{origin:'https://team-shift-app.vercel.app','content-type':'application/json',cookie:'__Host-teamshift_line_member='+seal({purpose:'line-member',uid,email,expires:now()+60000},secret)},body:{action:'save',appUid:uid,date:'2026-10-27',values:{'gas-main':'11'},revision:seal({purpose:'meter-snapshot',uid,date:'2026-10-27',expires:now()+60000,snapshot:baseline},secret)},...extra};}
async function invoke(h,req){const res={setHeader(){},status(n){this.code=n;return this;},json(data){this.data=data;return this;}};await h(req,res);return res;}
test('認証済みメンバーが確認済みデータを保存し、保存後に再読込で確認',async()=>{const {h,writes}=handlerFixture(),res=await invoke(h,request('POST'));assert.equal(res.code,200);assert.deepEqual(writes,[{'gas-main':11}]);assert.equal(res.data.savedBy,'担当者');assert(!JSON.stringify(res.data).includes('private-token'));});
test('未ログイン・閲覧ユーザー・他サイトからの書込を拒否',async()=>{const {h,writes}=handlerFixture();assert.equal((await invoke(h,request('POST',{headers:{origin:'https://team-shift-app.vercel.app','content-type':'application/json'}}))).code,401);assert.equal((await invoke(handlerFixture({role:'viewer'}).h,request('GET'))).code,403);assert.equal((await invoke(h,request('POST',{headers:{origin:'https://evil.example','content-type':'application/json'}}))).code,403);assert.equal(writes.length,0);});
test('原本の変更・別日付の確認トークンでは上書きしない',async()=>{const changed=handlerFixture({fresh:{...baseline,previous:{'gas-main':9}}});assert.equal((await invoke(changed.h,request('POST'))).code,409);assert.equal(changed.writes.length,0);const {h,writes}=handlerFixture(),req=request('POST');req.body.date='2026-10-28';assert.equal((await invoke(h,req)).code,409);assert.equal(writes.length,0);});


test('検針は正確な社内ドメインだけ許可し、外部・類似・サブドメインを拒否',async()=>{
 for(const email of ['staff@plandosee.co.jp',' Staff@PLANDOSEE.CO.JP '])assert.equal(canAccessMeters({email}),true);
 for(const email of ['staff@gmail.com','staff@plandosee.co.jp.evil.com','staff@sub.plandosee.co.jp','@plandosee.co.jp','staff@@plandosee.co.jp','staff@notplandosee.co.jp',''])assert.equal(canAccessMeters({email}),false);
 assert.equal(canAccessMeters(null),false);
 const external='member@gmail.com', {h,writes}=handlerFixture({accountEmail:external});
 for(const method of ['GET','POST']){const req=request(method);req.headers.cookie='__Host-teamshift_line_member='+seal({purpose:'line-member',uid,email:external,expires:now()+60000},secret);assert.equal((await invoke(h,req)).code,403);}
 assert.equal(writes.length,0);
});
