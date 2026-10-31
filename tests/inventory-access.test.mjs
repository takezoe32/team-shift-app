import test from 'node:test';
import assert from 'node:assert/strict';
import { inventoryActor, inventoryAdjustment } from '../api/_lib/inventory-access.js';
import { createInventoryAccessHandler } from '../api/inventory-access.js';
const path='app_data/shared_state', origin='https://team-shift-app.vercel.app';
function fixture(){
 let data={users:{member:{email:'member@example.com',name:'登録メンバー'},viewer:{email:'viewer@plandosee.co.jp',role:'viewer'}},teamData:{tasks:{secret:'private'}},inventoryItems:[{id:'p',name:'商品',stock:5,privateNote:'hidden'}],inventoryMovements:[]};
 let time=1000000000000;
 const store={read:async()=>structuredClone(data),transact:async(paths,plan)=>{const result=plan({[path]:structuredClone(data)});for(const write of result.writes)data={...data,...write.value};return result.result;}};
 const handler=createInventoryAccessHandler({env:{},configure:()=>({ready:true,secret:Buffer.alloc(32,1).toString('base64')}),makeStore:()=>store,verifyGoogle:async credential=>{if(credential==='bad')throw Error();return JSON.parse(credential);},now:()=>time});
 async function call(method,body,session='',requestOrigin=origin){const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;},end(){return this;}};await handler({method,headers:{origin:requestOrigin,'content-type':'application/json',cookie:session},body},res);return res;}
 const login=async identity=>{const r=await call('POST',{action:'login',credential:JSON.stringify(identity)});return {r,cookie:String(r.headers['Set-Cookie'] || '').split(';')[0]};};
 return {call,login,data:()=>data,expire:()=>{time+=9*3600000;}};
}
const company={sub:'google1',email:'staff@plandosee.co.jp',name:'会社利用者'};
const action={action:'adjust',itemId:'p',quantity:2,direction:'out',requestId:'12345678-1234-1234-1234-123456789012'};
test('verified company and external registered member can access; outsiders and viewers cannot',()=>{
 const data={users:{m:{email:'member@example.com',name:'Member'},v:{email:'viewer@plandosee.co.jp',role:'viewer'}},roles:{read:{readOnly:true}}};
 assert.equal(inventoryActor(data,company).name,'会社利用者');
 assert.equal(inventoryActor(data,{sub:'x',email:'MEMBER@example.com'}).uid,'m');
 for(const identity of [{sub:'x',email:'stranger@example.com'},{sub:'x',email:'staff@plandosee.co.jp.evil.test'},{sub:'x',email:'viewer@plandosee.co.jp'}])assert.throws(()=>inventoryActor(data,identity));
});
test('login provides secure scoped cookie and inventory whitelist only',async()=>{
 const f=fixture(),{r,cookie}=await f.login(company);assert.equal(r.code,200);assert.match(r.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Strict/);
 const result=await f.call('GET',null,cookie);assert.equal(result.code,200);assert.deepEqual(Object.keys(result.body).sort(),['actor','items']);assert.equal(result.body.items[0].privateNote,undefined);assert.equal(result.body.teamData,undefined);
});
test('unverified, forged, expired identities and cross origin mutations rejected',async()=>{
 const f=fixture();assert.equal((await f.call('GET')).code,401);assert.equal((await f.call('GET',null,'__Host-teamshift_inventory=forged')).code,401);
 assert.equal((await f.call('POST',{action:'login',credential:'bad'})).code,401);
 const {cookie}=await f.login(company);assert.equal((await f.call('POST',action,cookie,'https://evil.test')).code,403);f.expire();assert.equal((await f.call('POST',action,cookie)).code,401);
});
test('stock change records verified actor and duplicate retry is idempotent',async()=>{
 const f=fixture(),{cookie}=await f.login(company);const r=await f.call('POST',{...action,actorName:'forged'},cookie);assert.equal(r.code,200);assert.equal(f.data().inventoryItems[0].stock,3);assert.equal(r.body.movement.actorName,'会社利用者');assert.equal(r.body.movement.actorEmail,company.email);
 assert.equal((await f.call('POST',action,cookie)).code,200);assert.equal(f.data().inventoryItems[0].stock,3);assert.equal(f.data().inventoryMovements.length,1);assert.equal(f.data().teamData.tasks.secret,'private');
 assert.equal((await f.call('POST',{...action,quantity:1},cookie)).code,409);
});
test('member removal rechecks permission on next write',async()=>{
 const f=fixture(),{cookie}=await f.login({sub:'x',email:'member@example.com'});delete f.data().users.member;assert.equal((await f.call('POST',action,cookie)).code,403);
});
test('latest stock prevents overselling, invalid quantities and missing products',async()=>{
 const f=fixture(),{cookie}=await f.login(company);for(const quantity of [0,-1,1.5,'2',1000001])assert.equal((await f.call('POST',{...action,quantity},cookie)).code,400);
 assert.equal((await f.call('POST',{...action,quantity:6},cookie)).code,409);assert.equal((await f.call('POST',{...action,itemId:'missing'},cookie)).code,404);
 await f.call('POST',{...action,quantity:4},cookie);assert.equal((await f.call('POST',{...action,requestId:'22345678-1234-1234-1234-123456789012'},cookie)).code,409);assert.equal(f.data().inventoryItems[0].stock,1);
});
test('inbound stock uses current value and owner email in history',()=>{
 const p=inventoryAdjustment({inventoryItems:[{id:'p',stock:3}]},{...action,direction:'in'},inventoryActor({},company),'now');assert.equal(p.items[0].stock,5);assert.equal(p.movement.type,'stock_in');assert.equal(p.movement.stockBefore,3);
});
