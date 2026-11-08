// Next year's folder and files in the shared drive (TLF), made from this year's files:
//   002 積算メーター / 2027年度（令和9年） / 積算メーター2027年（毎朝検針）.xlsx, 部門メーター 2027年（毎月検針）.xlsx
//   001 シフト表 / 勤務表-2027年（令和9年）.xlsm
// Run by the nightly job from December 1 (and again in January if anything is still missing). Every step is
// idempotent: an item already registered, or already present under the same name, is used as it is, never
// overwritten. The file IDs of each year are kept in Firestore (YEAR_FILES_PATH) so the meter screens find them.
import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { METER_FILE_ID } from '../../src/meterReadings.mjs';
import { MONTHLY_FILE_ID } from '../../src/meterMonthly.mjs';
import { meterDailyPlan,meterMonthlyPlan,shiftPlan,meterFolderName,meterDailyName,meterMonthlyName,shiftFileName } from '../../src/yearRollover.mjs';
import { xlsxCells } from './xlsx-cells.js';
import { xlsxRewrite } from './xlsx-rewrite.js';

export const YEAR_FILES_PATH='_server_integrations/year_files';
export const METER_ROOT_FOLDER='1mFsnm6_yNVwDOM8tutpBXS2X5CfCD-g2';
export const SHIFT_FOLDER='1icgQw7iJvz0xu64d5QLmFu6o1ePFjB8G';
// 2026: 002 積算メーター / 2026年分 令和8年（全角スペース）, and 001 シフト表 / 勤務表-2026年 (令和８年） 00000000.xlsm.
export const BASE_YEAR_FILES={2026:{folder:'1KnEKmh3c7GUSxMMVEy1tsVJ2ANzUEMsG',daily:METER_FILE_ID,monthly:MONTHLY_FILE_ID,shift:'1eqiM-qpcSmPla_MX287_xYA_sM03OEwH'}};
const XLSX='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',XLSM='application/vnd.ms-excel.sheet.macroEnabled.12',FOLDER='application/vnd.google-apps.folder';
const LIMIT=5*1024*1024;

export function yearFilesFrom(value){
 const years={};
 for(const [year,files] of Object.entries(BASE_YEAR_FILES))years[year]={...files};
 for(const [year,files] of Object.entries(value?.years||{}))if(/^\d{4}$/.test(year)&&files&&typeof files==='object')years[year]={...years[year],...files};
 return years;
}
export const readYearFiles=async store=>yearFilesFrom(await store.read(YEAR_FILES_PATH));

export function driveFiles(token,fetcher=fetch){
 const call=async(url,options={})=>{
  const r=await fetcher(url,{...options,headers:{Authorization:`Bearer ${token}`,...options.headers},signal:AbortSignal.timeout(60000)});
  if(!r.ok)throw Object.assign(new Error(r.status===403||r.status===404?'共有ドライブのフォルダにファイルを追加できません。日報のGoogle Drive連携アカウントの権限を確認してください。':`Google Driveの操作に失敗しました（${r.status}）。`),{status:r.status});
  return r;
 };
 const literal=s=>String(s).replaceAll('\\','\\\\').replaceAll("'","\\'");
 return {
  async find(parent,name,mimeType){
   const params=new URLSearchParams({q:`'${literal(parent)}' in parents and name = '${literal(name)}' and trashed = false`+(mimeType?` and mimeType = '${mimeType}'`:''),supportsAllDrives:'true',includeItemsFromAllDrives:'true',fields:'files(id,name,mimeType)',pageSize:'10'});
   return (await (await call('https://www.googleapis.com/drive/v3/files?'+params)).json()).files||[];
  },
  async meta(id){return (await call(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?supportsAllDrives=true&fields=id,name,mimeType,size`)).json();},
  async download(id){
   const meta=await this.meta(id);
   if(![XLSX,XLSM].includes(meta.mimeType))throw new Error(`「${meta.name}」はExcel形式ではないため、来年のファイルを作れません。`);
   if(Number(meta.size)>LIMIT)throw new Error(`「${meta.name}」が大きすぎるため、来年のファイルを作れません。`);
   const bytes=Buffer.from(await (await call(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`)).arrayBuffer());
   if(bytes.length>LIMIT)throw new Error(`「${meta.name}」が大きすぎるため、来年のファイルを作れません。`);
   return {meta,bytes};
  },
  async folder(parent,name){
   return (await (await call('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,mimeType:FOLDER,parents:[parent]})})).json()).id;
  },
  async upload(parent,name,mimeType,bytes){
   const boundary='teamshift'+randomBytes(12).toString('hex');
   const body=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({name,parents:[parent],mimeType})}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),bytes,Buffer.from(`\r\n--${boundary}--\r\n`)]);
   return (await (await call('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body})).json()).id;
  }
 };
}

// Makes whatever is missing for `year` from year-1's files. Returns {year, created:[names], warnings, files}.
const PLANS={daily:meterDailyPlan,monthly:meterMonthlyPlan,shift:shiftPlan};
export async function ensureYearFiles({drive,store,year,now=Date.now,plans=PLANS}){
 if(!Number.isInteger(year)||year<2027||year>2100)throw new Error('作成する年を確認してください。');
 const years=await readYearFiles(store),source=years[year-1],target={...(years[year]||{})},created=[],warnings=[];
 const complete=()=>['folder','daily','monthly','shift'].every(k=>target[k]);
 if(complete())return {year,created,warnings,files:target,complete:true};
 if(!source?.daily||!source?.monthly)throw new Error(`${year-1}年の検針ファイルが登録されていないため、${year}年のファイルを作れません。`);
 const save=async patch=>{
  Object.assign(target,patch);
  await store.transact([YEAR_FILES_PATH],values=>{const v=values[YEAR_FILES_PATH]||{};return {writes:[{path:YEAR_FILES_PATH,value:{...v,years:{...(v.years||{}),[year]:{...(v.years?.[year]||{}),...patch}}}}]};});
 };
 if(!target.folder){
  const name=meterFolderName(year),found=await drive.find(METER_ROOT_FOLDER,name,FOLDER);
  if(found.length>1)warnings.push(`「${name}」フォルダが${found.length}個あります。最初のものを使います。`);
  const id=found[0]?.id||await drive.folder(METER_ROOT_FOLDER,name);if(!found[0])created.push(name);
  await save({folder:id});
 }
 const make=async(key,parent,name,sourceId,plan,mimeType)=>{
  if(target[key])return;
  const found=await drive.find(parent,name);
  if(found[0]){if(found.length>1)warnings.push(`「${name}」が${found.length}個あります。最初のものを使います。`);await save({[key]:found[0].id});return;}
  const {bytes}=await drive.download(sourceId),p=plan(xlsxCells(bytes),year-1);
  warnings.push(...p.warnings);
  const id=await drive.upload(parent,name,mimeType,xlsxRewrite(bytes,p));
  created.push(name);await save({[key]:id});
 };
 await make('daily',target.folder,meterDailyName(year),source.daily,plans.daily,XLSX);
 await make('monthly',target.folder,meterMonthlyName(year),source.monthly,plans.monthly,XLSX);
 if(source.shift){
  const meta=await drive.meta(source.shift),macro=meta.mimeType===XLSM||/\.xlsm$/i.test(meta.name||'');
  await make('shift',SHIFT_FOLDER,shiftFileName(year,macro?'xlsm':'xlsx'),source.shift,plans.shift,macro?XLSM:XLSX);
 }else warnings.push(`${year-1}年の勤務表が登録されていないため、${year}年の勤務表は作成していません。`);
 await save({updatedAt:new Date(now()).toISOString(),warnings});
 return {year,created,warnings,files:target,complete:complete()};
}

// The nightly job's step: the Drive token of the daily-report connection, then ensureYearFiles for the year to prepare.
// makeStore/makeClient are report-auth's privateStore/oauth; makeLocks is the Firestore store (line-store).
export async function runYearFiles({config,env,day,now=Date.now,makeStore,makeClient,makeLocks,fetcher=fetch}){
 const year=yearToPrepare(day);if(!year)return {skipped:true};
 const store=makeLocks(env),years=await readYearFiles(store);
 if(['folder','daily','monthly','shift'].every(k=>years[year]?.[k]))return {year,skipped:true};
 const connection=await makeStore(config).get();
 if(!connection?.refreshToken||connection.needsReconnect)throw new Error('日報のGoogle Drive連携が必要です。');
 const client=makeClient(config);client.setCredentials({refresh_token:connection.refreshToken});
 const token=(await client.getAccessToken()).token;if(!token)throw new Error('Google Driveの連携を確認してください。');
 return ensureYearFiles({drive:driveFiles(token,fetcher),store,year,now});
}
// Which year the nightly job prepares on a Tokyo date: next year from December 1, this year (catch-up) in January.
export function yearToPrepare(tokyoDay){
 const [year,month]=String(tokyoDay).split('-').map(Number);
 return month===12?year+1:month===1?year:null;
}
