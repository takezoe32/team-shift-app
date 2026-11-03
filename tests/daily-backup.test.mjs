import { Buffer } from 'node:buffer';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runDailyBackup, loadBackup, backupAction, makeBackupStore, SOURCE, COLLECTION } from '../api/_lib/daily-backup.js';
import { sendAdminAlert, ALERT_TO } from '../api/_lib/admin-alert.js';
import { createCronHandler } from '../api/daily-report-cron.js';
import { createAppAuthHandler } from '../api/app-auth.js';
const prefix='projects/team-shift-app/databases/(default)/documents/';
const instant=Date.parse('2026-11-03T15:20:00Z'), now=()=>instant;
const sourceFields=()=>({users:{mapValue:{fields:{admin:{mapValue:{fields:{email:{stringValue:'admin@example.com'}}}}}}},teamData:{mapValue:{fields:{tasks:{mapValue:{fields:{}}}}}},partnerItems:{arrayValue:{values:[]}},inventoryItems:{arrayValue:{values:[]}},preciseInteger:{integerValue:'9007199254740993'},stamp:{timestampValue:'2026-11-01T00:00:00Z'},blob:{bytesValue:'YWJj'}});
function fixture(){
 const records=new Map(),writes=[];let version=0,fail=false;
 function put(path,fields){records.set(path,{name:prefix+path,fields:structuredClone(fields),updateTime:new Date(1700000000000+version++).toISOString()});}
 put(SOURCE,sourceFields());
 const store={async get(path){return structuredClone(records.get(path)||null);},async list(collection=COLLECTION){return [...records.entries()].filter(([path])=>path.startsWith(collection+'/')&&path.split('/').length===2).map(([,v])=>structuredClone(v));},async commit(batch){
  if(fail)throw Error('storage-down');
  for(const w of batch){const path=(w.update?.name||w.delete||w.verify).slice(prefix.length),old=records.get(path),p=w.currentDocument;if(p&&((p.exists===false&&old)||(p.updateTime&&p.updateTime!==old?.updateTime)))throw Object.assign(Error('conflict'),{status:409});}
  for(const w of batch){const path=(w.update?.name||w.delete||w.verify).slice(prefix.length);if(w.update)put(path,w.update.fields);else if(w.delete)records.delete(path);}writes.push(structuredClone(batch));return {};
 }};
 return {store,records,writes,put,fail:()=>{fail=true;}};
}
test('daily raw-field backup round-trips native types and same day retry cannot overwrite it',async()=>{
 const f=fixture(),original=structuredClone(sourceFields());
 const result=await runDailyBackup({store:f.store,now});assert.equal(result.id,'2026-11-04');assert.equal(result.skipped,false);
 assert.deepEqual((await loadBackup(f.store,result.id)).fields,original);
 f.put(SOURCE,{...sourceFields(),newValue:{stringValue:'later'}});
 assert.equal((await runDailyBackup({store:f.store,now})).skipped,true);
 assert.deepEqual((await loadBackup(f.store,result.id)).fields,original);
});
test('a missing or empty source cannot replace backups or trigger retention deletion',async()=>{
 const f=fixture();await runDailyBackup({store:f.store,now});const before=f.writes.length;f.records.delete(SOURCE);
 await assert.rejects(runDailyBackup({store:f.store,now:()=>instant+86400000}));assert.equal(f.writes.length,before);
 f.put(SOURCE,{users:{mapValue:{fields:{}}}});await assert.rejects(runDailyBackup({store:f.store,now:()=>instant+86400000}));
});
test('payload corruption fails verification and leaves older backup generations intact',async()=>{
 const f=fixture();await runDailyBackup({store:f.store,now});const path=COLLECTION+'/2026-11-04/parts/000';f.records.get(path).fields.payload.stringValue='corrupt';
 await assert.rejects(loadBackup(f.store,'2026-11-04'));await assert.rejects(runDailyBackup({store:f.store,now}));
});
test('retention preserves the latest 30 days and only prunes after a verified current backup',async()=>{
 const f=fixture();for(let i=0;i<32;i++)await runDailyBackup({store:f.store,now:()=>instant+i*86400000});
 const rows=await f.store.list();assert.equal(rows.length,30);assert.equal(f.records.has(COLLECTION+'/2026-11-04'),false);assert.equal(f.records.has(COLLECTION+'/2026-11-06'),true);
 for(const path of f.records.keys())assert.ok(!path.startsWith(COLLECTION+'/2026-11-04/'));
});
test('restore previews counts and backs up the current state before an exact restore',async()=>{
 const f=fixture();await runDailyBackup({store:f.store,now});const original=structuredClone(sourceFields());f.put(SOURCE,{...sourceFields(),newValue:{stringValue:'current'}});
 const preview=await backupAction({store:f.store,now,body:{action:'backup-preview',backupId:'2026-11-04'}});assert.equal(preview.counts.members,1);
 const result=await backupAction({store:f.store,now,body:{action:'backup-restore',backupId:preview.id,expectedUpdateTime:preview.expectedUpdateTime,checksum:preview.checksum,confirm:'RESTORE '+preview.id}});
 assert.deepEqual((await f.store.get(SOURCE)).fields,original);assert.equal((await loadBackup(f.store,result.safetyId)).fields.newValue.stringValue,'current');
});
test('restore rejects a changed current document or a stale preview, never overwrites concurrent edits',async()=>{
 const f=fixture();await runDailyBackup({store:f.store,now});const preview=await backupAction({store:f.store,now,body:{action:'backup-preview',backupId:'2026-11-04'}});f.put(SOURCE,{...sourceFields(),newValue:{stringValue:'concurrent'}});
 await assert.rejects(backupAction({store:f.store,now,body:{action:'backup-restore',backupId:preview.id,expectedUpdateTime:preview.expectedUpdateTime,checksum:preview.checksum,confirm:'RESTORE '+preview.id}}));assert.equal((await f.store.get(SOURCE)).fields.newValue.stringValue,'concurrent');
});
test('restore can recover a deleted source, and refuses invalid identifiers',async()=>{
 const f=fixture();await runDailyBackup({store:f.store,now});f.records.delete(SOURCE);const p=await backupAction({store:f.store,now,body:{action:'backup-preview',backupId:'2026-11-04'}});
 await backupAction({store:f.store,now,body:{action:'backup-restore',backupId:p.id,expectedUpdateTime:null,checksum:p.checksum,confirm:'RESTORE '+p.id}});assert.deepEqual((await f.store.get(SOURCE)).fields,sourceFields());
 for(const id of ['../shared_state','_server_integrations/x','2026-11-04/parts/000'])await assert.rejects(loadBackup(f.store,id));
});
test('backup store handles pagination, missing data and compare-and-swap conflicts',async()=>{
 const seen=[];const response=(status,data)=>({status,ok:status<300,json:async()=>data});
 const store=makeBackupStore({service:{}},async(url,options)=>{seen.push({url,options});if(url.endsWith('/missing'))return response(404,{});if(url.endsWith(':commit'))return response(409,{});if(url.includes('pageToken='))return response(200,{documents:[{name:'second'}]});return response(200,{documents:[{name:'first'}],nextPageToken:'two'});},()=>({getAccessToken:async()=>'test-token'}));
 assert.equal((await store.list()).length,2);assert.equal(await store.get('missing'),null);await assert.rejects(store.commit([]),e=>e.status===409);assert.ok(seen.every(x=>x.options.headers.Authorization==='Bearer test-token'));
});
test('same alert sends only once per day and contains no business records or exception details',async()=>{
 const f=fixture(),mail=[];const args={code:'backup_failed',store:f.store,env:{},send:async m=>mail.push(m),now};
 assert.equal((await sendAdminAlert(args)).sent,true);assert.equal((await sendAdminAlert(args)).skipped,true);assert.equal(mail.length,1);assert.equal(mail[0].to,ALERT_TO);assert.doesNotMatch(mail[0].text,/9007199254740993|admin@example.com/);
});
test('failed mail stays retryable after its lease; no SMTP configuration is reported explicitly',async()=>{
 const f=fixture();const args={code:'backup_failed',store:f.store,env:{},send:async()=>{throw Error('private-password');},now};
 await assert.rejects(sendAdminAlert(args),e=>e.code==='ALERT_SEND_FAILED'&&!e.message.includes('private-password'));
 assert.equal((await sendAdminAlert({...args,send:async()=>{}})).skipped,true);
 assert.equal((await sendAdminAlert({...args,now:()=>instant+600001,send:async()=>{}})).sent,true);
 assert.equal((await sendAdminAlert({code:'test',env:{},store:f.store,now})).configured,false);
});
test('storage outage alert fallback is limited to scheduled jobs, arbitrary incidents cannot spam',async()=>{
 const store={get:async()=>{throw Error();}},send=async()=>{};
 assert.equal((await sendAdminAlert({code:'report_failed',store,send,now})).sent,false);
 assert.equal((await sendAdminAlert({code:'report_failed',store,send,now,scheduled:true})).sent,true);
 assert.equal((await sendAdminAlert({code:'report_failed',store,send,now,scheduled:true})).skipped,true);
});
const res=()=>({setHeader(){},status(n){this.code=n;return this;},json(v){this.body=v;return this;},end(){return this;}});
test('scheduled backup and report are independent and each failure notifies the administrator',async()=>{
 for(const [backupFails,reportFails] of [[true,false],[false,true],[true,true]]){
  const seen=[],handler=createCronHandler({env:{CRON_SECRET:'secret',VERCEL_ENV:'production'},configure:()=>({ready:true}),makeStore:()=>({}),makeClient:()=>({}),backup:async()=>{seen.push('backup');if(backupFails)throw Error();return {id:'today'};},run:async()=>{seen.push('report');if(reportFails)throw Error();return {};},notify:async({code})=>{seen.push(code);return {sent:true};},log:()=>{},now});
  const r=res();await handler({method:'GET',headers:{authorization:'Bearer secret'}},r);assert.ok(seen.includes('backup')&&seen.includes('report'));assert.equal(seen.includes('backup_failed'),backupFails);assert.equal(seen.includes('report_failed'),reportFails);assert.notEqual(r.code,200);
 }
});
test('management requires verified configured administrator even when source is missing; incidents require signed Firebase identity',async()=>{
 const identity={sub:'x',email:'admin@example.com',email_verified:true};let verified=identity,calls=0;
 const handler=createAppAuthHandler({env:{},configure:()=>({ready:true,admins:['admin@example.com']}),verify:async()=>verified,makeStore:()=>{throw Error('source unavailable');},manageBackup:async()=>{calls++;return {backups:[]};},verifyIncident:async token=>{if(token!=='signed')throw Object.assign(Error(),{status:401});},notify:async()=>({configured:true})});
 async function call(body,auth=''){const r=res();await handler({method:'POST',headers:{origin:'https://team-shift-app.vercel.app','content-type':'application/json',authorization:auth},body},r);return r;}
 assert.equal((await call({action:'backup-status',credential:'valid'})).code,200);verified={...identity,email:'staff@example.com'};assert.equal((await call({action:'backup-restore',credential:'valid'})).code,403);assert.equal(calls,1);
 assert.equal((await call({action:'incident',code:'app_error'},'Bearer bad')).code,401);assert.equal((await call({action:'incident',code:'app_error'},'Bearer signed')).code,200);assert.equal((await call({action:'incident',code:'test'},'Bearer signed')).code,400);
});
import { generateKeyPairSync, createSign, randomBytes } from 'node:crypto';
import { verifyIncidentToken } from '../api/_lib/incident-auth.js';
test('large backup is split into bounded immutable parts and all parts are required',async()=>{
 const f=fixture();const fields={...sourceFields(),large:{stringValue:randomBytes(350000).toString('hex')}};f.put(SOURCE,fields);await runDailyBackup({store:f.store,now});
 const result=await loadBackup(f.store,'2026-11-04');assert.ok(result.meta.partCount>1);assert.deepEqual(result.fields,fields);
 for(const [path,doc] of f.records)if(path.includes('/parts/'))assert.ok(doc.fields.payload.stringValue.length<=400000);
 f.records.delete(COLLECTION+'/2026-11-04/parts/001');await assert.rejects(loadBackup(f.store,'2026-11-04'));
});
test('simultaneous schedules keep one immutable daily generation',async()=>{
 const f=fixture();const results=await Promise.all([runDailyBackup({store:f.store,now}),runDailyBackup({store:f.store,now})]);assert.equal(results.filter(r=>!r.skipped).length,1);assert.equal((await f.store.list()).length,1);
});
test('a write racing with restore is rejected after the safety snapshot without losing the new write',async()=>{
 const f=fixture();await runDailyBackup({store:f.store,now});const p=await backupAction({store:f.store,now,body:{action:'backup-preview',backupId:'2026-11-04'}});
 const store={...f.store,commit:async batch=>{if(batch.some(w=>w.update?.name===prefix+SOURCE))f.put(SOURCE,{...sourceFields(),race:{stringValue:'kept'}});return f.store.commit(batch);}};
 await assert.rejects(backupAction({store,now,body:{action:'backup-restore',backupId:p.id,expectedUpdateTime:p.expectedUpdateTime,checksum:p.checksum,confirm:'RESTORE '+p.id}}));assert.equal((await f.store.get(SOURCE)).fields.race.stringValue,'kept');
});
test('signed incident identity rejects forged, expired, wrong audience and nonmember claims',async()=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});let fetches=0;
 const fetcher=async()=>{fetches++;return {ok:true,json:async()=>({test:publicKey.export({type:'spki',format:'pem'})})};};
 const payload={iss:'https://securetoken.google.com/team-shift-app',aud:'team-shift-app',sub:'member',iat:Math.floor(Date.now()/1000)-1,exp:Math.floor(Date.now()/1000)+3590,appMember:true};
 const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
 const token=p=>{const text=encode({alg:'RS256',typ:'JWT',kid:'test'})+'.'+encode(p);return text+'.'+createSign('RSA-SHA256').update(text).sign(privateKey,'base64url');};
 assert.equal((await verifyIncidentToken(token(payload),fetcher)).sub,'member');
 for(const p of [{...payload,appMember:false},{...payload,aud:'other'},{...payload,iss:'https://evil.test'},{...payload,iat:payload.iat-10000,exp:payload.iat-3600}])await assert.rejects(verifyIncidentToken(token(p),fetcher));
 await assert.rejects(verifyIncidentToken(token(payload).slice(0,-20)+'forged',fetcher));assert.equal(fetches,1);
});
