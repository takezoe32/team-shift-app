import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import { GoogleAuth } from 'google-auth-library';
import { fault, decodeFields } from './report-auth.js';
import { tokyoDate } from '../../src/dailyReport.mjs';
export const SOURCE='app_data/shared_state', COLLECTION='_server_backups';
const prefix='projects/team-shift-app/databases/(default)/documents/';
const root='https://firestore.googleapis.com/v1/'+prefix.slice(0,-1);
const field=value=>typeof value==='number'?{integerValue:String(value)}:{stringValue:String(value)};
export const fieldsOf=object=>Object.fromEntries(Object.entries(object).map(([key,value])=>[key,field(value)]));
export function makeBackupStore(config,fetcher=fetch,makeAuth=credentials=>new GoogleAuth({credentials,scopes:['https://www.googleapis.com/auth/datastore']})) {
 const auth=makeAuth(config.service);
 async function request(path,options={}) {
  const token=await auth.getAccessToken();
  const r=await fetcher(root+(path.startsWith(':')?'':'/')+path,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},signal:AbortSignal.timeout(20000)});
  if(r.status===404&&!options.method)return null;
  if([409,412].includes(r.status))throw fault(409,'データが更新されました。再読込して確認してください。','CONFLICT');
  if(!r.ok)throw fault(503,'バックアップの保存先に接続できません。','BACKUP_STORAGE');
  return r.status===204?{}:r.json();
 }
 return {
  get:path=>request(path),
  commit:writes=>request(':commit',{method:'POST',body:JSON.stringify({writes})}),
  async list(collection=COLLECTION){let rows=[],token='';do{const r=await request(collection+'?pageSize=100'+(token?'&pageToken='+encodeURIComponent(token):''));rows.push(...(r?.documents||[]));token=r?.nextPageToken||'';}while(token);return rows;}
 };
}
const name=path=>prefix+path;
export const createWrite=(path,fields)=>({update:{name:name(path),fields},currentDocument:{exists:false}});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function validBackupId(id){return typeof id==='string'&&(/^(\d{4}-\d{2}-\d{2}|before-restore-\d{13}-[a-f0-9-]{36})$/.test(id));}
export function packSource(source,kind,now) {
 if(!source?.fields||(kind==='daily'&&!Object.keys(source.fields.users?.mapValue?.fields||{}).length))throw fault(503,'メンバーのある共有原本を確認できません。既存バックアップは保持します。','BACKUP_SOURCE');
 const bytes=Buffer.from(JSON.stringify(source.fields)),compressed=gzipSync(bytes),encoded=compressed.toString('base64');
 const parts=encoded.match(/.{1,400000}/g)||[];
 if(bytes.length>16000000||parts.length>32)throw fault(503,'バックアップの容量を確認してください。','BACKUP_SIZE');
 return {parts,manifest:{version:1,kind,createdAt:new Date(now).toISOString(),sourceUpdateTime:source.updateTime||'',checksum:sha(bytes),byteLength:bytes.length,partCount:parts.length,codec:'gzip-base64-firestore-fields'}};
}
export async function loadBackup(store,id) {
 if(!validBackupId(id))throw fault(400,'バックアップを選択してください。');
 const path=COLLECTION+'/'+id,doc=await store.get(path),meta=doc&&decodeFields(doc.fields);
 if(!meta||meta.version!==1||meta.codec!=='gzip-base64-firestore-fields'||!Number.isInteger(meta.partCount)||meta.partCount<1||meta.partCount>32||meta.byteLength>16000000)throw fault(503,'バックアップの形式を確認できません。','BACKUP_INVALID');
 const parts=await Promise.all(Array.from({length:meta.partCount},(_,i)=>store.get(path+'/parts/'+String(i).padStart(3,'0'))));
 if(parts.some(p=>typeof p?.fields?.payload?.stringValue!=='string'))throw fault(503,'バックアップの一部がありません。','BACKUP_INVALID');
 let bytes,fields;
 try{bytes=gunzipSync(Buffer.from(parts.map(p=>p.fields.payload.stringValue).join(''),'base64'),{maxOutputLength:16000000});fields=JSON.parse(bytes.toString());}catch{throw fault(503,'バックアップを読み取れません。','BACKUP_INVALID');}
 if(bytes.length!==meta.byteLength||sha(bytes)!==meta.checksum)throw fault(503,'バックアップの検証に失敗しました。','BACKUP_INVALID');
 return {id,meta,fields};
}
async function saveSnapshot(store,source,id,kind,now){
 const {parts,manifest}=packSource(source,kind,now),base=COLLECTION+'/'+id;
 const writes=parts.map((payload,i)=>createWrite(base+'/parts/'+String(i).padStart(3,'0'),{payload:field(payload)}));
 writes.push(createWrite(base,fieldsOf(manifest)));
 try{await store.commit(writes);}catch(error){if(error.status!==409)throw error;await loadBackup(store,id);return {id,skipped:true};}
 await loadBackup(store,id);return {id,skipped:false};
}
export async function pruneBackups(store,now){
 const cutoff=tokyoDate(now-29*86400000),rows=await store.list();let removed=0;
 for(const row of rows){const id=row.name.split('/').pop(),meta=decodeFields(row.fields);if(!/^\d{4}-\d{2}-\d{2}$/.test(id)||id>=cutoff||meta.kind!=='daily'||!Number.isInteger(meta.partCount)||meta.partCount<1||meta.partCount>32)continue;
  const base=COLLECTION+'/'+id,writes=Array.from({length:meta.partCount},(_,i)=>({delete:name(base+'/parts/'+String(i).padStart(3,'0'))}));
  writes.push({delete:row.name,currentDocument:{updateTime:row.updateTime}});await store.commit(writes);removed++;
 }return removed;
}
export async function runDailyBackup({config,store=makeBackupStore(config),now=Date.now}={}){
 const instant=now(),id=tokyoDate(instant),existing=await store.get(COLLECTION+'/'+id);
 let result;
 if(existing){await loadBackup(store,id);result={id,skipped:true};}
 else result=await saveSnapshot(store,await store.get(SOURCE),id,'daily',instant);
 // Retention only runs after a complete, checksum-verified copy exists for today.
 const removed=await pruneBackups(store,instant);return {...result,removed};
}
function counts(fields){const d=decodeFields(fields),days=Object.values(d.teamData?.tasks||{});return {members:Object.keys(d.users||{}).length,memberTasks:days.reduce((sum,day)=>sum+Object.values(day||{}).reduce((n,t)=>n+(Array.isArray(t)?t.length:0),0),0),partnerTasks:(d.partnerItems||[]).length,inventory:(d.inventoryItems||[]).length};}
export async function backupAction({body,config,store=makeBackupStore(config),now=Date.now}){
 if(body.action==='backup-now')return runDailyBackup({config,store,now});
 if(body.action==='backup-status')return {backups:(await store.list()).map(row=>({id:row.name.split('/').pop(),...decodeFields(row.fields)})).filter(row=>validBackupId(row.id)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(({id,createdAt,kind,byteLength})=>({id,createdAt,kind,byteLength}))};
 const backup=await loadBackup(store,body.backupId),current=await store.get(SOURCE);
 if(body.action==='backup-preview')return {id:backup.id,createdAt:backup.meta.createdAt,checksum:backup.meta.checksum,expectedUpdateTime:current?.updateTime||null,counts:counts(backup.fields)};
 if(body.action!=='backup-restore'||body.confirm!=='RESTORE '+backup.id||body.checksum!==backup.meta.checksum||body.expectedUpdateTime!==(current?.updateTime||null))throw fault(409,'復元内容を再確認してください。');
 let safetyId=null;
 if(current){safetyId='before-restore-'+now()+'-'+randomUUID();await saveSnapshot(store,current,safetyId,'before-restore',now());}
 await store.commit([{update:{name:name(SOURCE),fields:backup.fields},currentDocument:current?{updateTime:current.updateTime}:{exists:false}}]);
 return {restored:true,id:backup.id,safetyId};
}
