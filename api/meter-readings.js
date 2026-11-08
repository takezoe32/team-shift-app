import { isReadOnlyUser } from '../src/viewerPermission.mjs';
import { configuration,cookies,unseal,seal,verifyRequest,privateStore,oauth,fault } from './_lib/report-auth.js';
import { makeLineStore } from './_lib/line-store.js';
import { meterSheets,monthlyMeterSheets } from './_lib/meter-sheets.js';
import { meterDate,meterChanges,canAccessMeters } from '../src/meterReadings.mjs';
import { canManageMeterMap,validateMeterPoints,METER_MAP_ID,METER_MAP_PATHS } from '../src/meterMap.mjs';
import { MONTHLY_INPUT_FIELDS,monthlyMonth,monthlyChanges } from '../src/meterMonthly.mjs';
import { randomBytes } from 'node:crypto';
import { readYearFiles } from './_lib/year-files.js';
export function createMeterHandler({configure=configuration,makeStore=privateStore,makeLocks=makeLineStore,makeClient=oauth,makeSheets=(token,options)=>meterSheets(token,fetch,options),makeMonthlySheets=(token,options)=>monthlyMeterSheets(token,fetch,options),env=globalThis.process.env,now=Date.now}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
   if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'GETまたはPOSTを使用してください。'});
   if(req.method==='POST')verifyRequest(req,false);
   const config=configure(env);if(!config.ready)throw fault(503,'日報のGoogle Drive連携設定が必要です。');
   let member;try{member=unseal(cookies(req)['__Host-teamshift_line_member'],config.secret);}catch{ /* No valid member session. */ }
   const query=new URL(req.url||'/','https://team-shift-app.vercel.app').searchParams;
   const uid=req.method==='GET'?query.get('appUid'):req.body?.appUid;
   if(!member||member.purpose!=='line-member'||member.expires<=now()||member.uid!==uid)throw fault(401,'アプリと同じGoogleアカウントで本人確認してください。');
   const store=makeStore(config),source=await store.source(),user=source.users?.[uid];
   if(!user||isReadOnlyUser(user,source.roles||{})||String(user.email||'').trim().toLowerCase()!==member.email)throw fault(403,'検針入力は登録メンバーのみ利用できます。');
   if(!canAccessMeters(user)||!canAccessMeters({email:member.email}))throw fault(403,'検針はplandosee.co.jpのアカウントのみ利用できます。');
   // kind=monthly is the 毎月検針 (monthly book, its own map); everything else is the 毎朝検針.
   const monthly=(req.method==='GET'?query.get('kind'):req.body?.kind)==='monthly';
   const mapStore=makeLocks(env),mapPath=METER_MAP_PATHS[monthly?'monthly':'daily'];
   const currentMap=await mapStore.read(mapPath);
   const mapData=()=>({meterMap:currentMap||{map:METER_MAP_ID,version:0,points:[]},canManageMap:canManageMeterMap(user,source.roles)});
   if(req.method==='POST'&&req.body?.action==='save-map'){
    if(!canManageMeterMap(user,source.roles))throw fault(403,'マップの登録・変更は管理者のみ行えます。');
    let points;try{points=validateMeterPoints(req.body.points,monthly?MONTHLY_INPUT_FIELDS:undefined);}catch(e){throw fault(400,e.message);}
    if(!Number.isSafeInteger(req.body.version)||req.body.version<0)throw fault(400,'配置の更新状態を確認してください。');
    const path='app_data/shared_state';
    const meterMap=await mapStore.transact([path,mapPath],records=>{
     const fresh=records[path],freshUser=fresh?.users?.[uid];
     if(!freshUser||!canManageMeterMap(freshUser,fresh.roles)||isReadOnlyUser(freshUser,fresh.roles)||String(freshUser.email||'').trim().toLowerCase()!==member.email)throw fault(403,'マップの登録・変更は管理者のみ行えます。');
     if((records[mapPath]?.version||0)!==req.body.version)throw fault(409,'他の管理者が配置を更新しました。原本を再読込して最新の配置を確認してください。');
     const layout={map:METER_MAP_ID,version:req.body.version+1,points,updatedAt:new Date(now()).toISOString(),updatedBy:uid};
     return {writes:[{path:mapPath,value:layout}],result:layout};
    });
    return res.status(200).json({meterMap,canManageMap:true});
   }
   const key=monthly?'month':'date',date=req.method==='GET'?query.get(key):req.body?.[key];try{if(monthly)monthlyMonth(date);else meterDate(date);}catch(e){throw fault(400,e.message);}
   const connection=await store.get();if(!connection?.refreshToken||connection.needsReconnect)throw fault(503,'管理者が日報のGoogle Drive連携を確認してください。');
   const client=makeClient(config);client.setCredentials({refresh_token:connection.refreshToken});
   const access=(await client.getAccessToken()).token;if(!access)throw fault(503,'Google Driveの連携を確認してください。');
   // Each year's books (made on December 1 for the next year); a year without them cannot be read yet.
   const files=await readYearFiles(mapStore),year=Number(date.slice(0,4));
   if(!files[year]?.daily||(monthly&&!files[year]?.monthly))throw fault(409,year+'年の検針原本がまだありません。前年の12月1日に自動で作成されます。');
   const sheets=(monthly?makeMonthlySheets:makeSheets)(access,{files,year}),purpose=monthly?'meter-monthly-snapshot':'meter-snapshot';
   const response=snapshot=>({...snapshot,...mapData(),revision:seal({purpose,uid,date,expires:now()+3600000,snapshot},config.secret)});
   if(req.method==='GET')return res.status(200).json(response(await sheets.read(date)));
   if(req.body?.action!=='save')throw fault(400,'操作を確認してください。');
   let baseline;try{baseline=unseal(req.body.revision,config.secret);}catch{throw fault(409,'原本を読み込み直してから確認してください。');}
   if(baseline.purpose!==purpose||baseline.uid!==uid||baseline.date!==date||baseline.expires<=now())throw fault(409,'読込から時間が経過しています。原本を読み込み直して確認してください。');
   let changes;try{changes=monthly?monthlyChanges(req.body.values,baseline.snapshot):meterChanges(req.body.values,baseline.snapshot.current);}catch(e){throw fault(400,e.message);}
   if(!Object.keys(changes).length)throw fault(400,'変更した検針値がありません。');
   const locks=makeLocks(env),path='_server_integrations/meter_'+(monthly?'monthly_':'daily_')+date,nonce=randomBytes(16).toString('hex');
   await locks.transact([path],values=>{if(values[path]?.expires>now())throw fault(409,'同じ'+(monthly?'月':'日')+'の保存が進行中です。少し待ってから再実行してください。');return {writes:[{path,value:{...values[path],nonce,expires:now()+120000}}]};});
   try{
    const fresh=await sheets.read(date);
    if(JSON.stringify(fresh)!==JSON.stringify(baseline.snapshot))throw fault(409,'原本が他の人によって変更されました。入力は残しています。「原本を再読込」で最新値と照合してから保存してください。');
    await sheets.write(fresh,changes);
    const saved=await sheets.read(date);
    if(Object.entries(changes).some(([id,value])=>saved.current[id]!==value))throw fault(409,'保存結果が一致しません。原本を再読込して確認してください。');
    return res.status(200).json({...response(saved),savedAt:new Date(now()).toISOString(),savedBy:user.name||''});
   }finally{await locks.transact([path],values=>values[path]?.nonce===nonce?{writes:[{path,value:{...values[path],expires:0}}]}:{});}
  }catch(e){return res.status(e.status||500).json({error:e.status?e.message:'検針処理に失敗しました。入力を残したまま、時間をおいて再実行してください。'});}
 };
}
export default createMeterHandler();
