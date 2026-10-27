import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import { configuration,cookies,unseal,verifyRequest,privateStore,oauth,fault } from './_lib/report-auth.js';
import { isReadOnlyUser } from '../src/viewerPermission.mjs';
import { validateTaskFileContent,taskFileUrl,TASK_FILE_LIMIT,taskFileVisibleTo,taskFilePreview } from '../src/taskFiles.mjs';
import { MEDIA_FOLDER_ID } from '../src/dailyReport.mjs';
export function createTaskFileHandler({configure=configuration,makeStore=privateStore,makeClient=oauth,fetcher=fetch,now=Date.now}={}){
 return async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  try{
   if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'GETまたはPOSTを使用してください。'});
   if(req.method==='POST')verifyRequest(req,false);
   const config=configure();if(!config.ready)throw fault(503,'Google Driveの保存設定を確認してください。');let member;
   try{member=unseal(cookies(req)['__Host-teamshift_line_member'],config.secret);}catch{ /* Session required. */ }
   if(!member||member.purpose!=='line-member'||member.expires<=now())throw fault(401,'アプリにログインし直してから添付ファイルを操作してください。');
   const store=makeStore(config),source=await store.source(),user=source.users?.[member.uid];
   if(!user||String(user.email||'').trim().toLowerCase()!==member.email)throw fault(403,'登録メンバーのみ添付ファイルを利用できます。');
   if(req.method==='POST'&&(member.uid!==req.body?.appUid||isReadOnlyUser(user,source.roles||{})))throw fault(403,'添付ファイルを保存する権限がありません。');
   const connection=await store.get();if(!connection?.refreshToken||connection.needsReconnect)throw fault(503,'管理者が日報のGoogle Drive連携を確認してください。');
   const client=makeClient(config);client.setCredentials({refresh_token:connection.refreshToken});const access=(await client.getAccessToken()).token;
   const call=async(url,options={})=>{const r=await fetcher(url,{...options,headers:{Authorization:'Bearer '+access,...options.headers},signal:AbortSignal.timeout(25000)});if(!r.ok)throw fault(r.status===404?404:503,'添付ファイルの保存先にアクセスできません。');return r;};
   if(req.method==='GET'){
    const id=new URL(req.url,'https://team-shift-app.vercel.app').searchParams.get('id');if(!taskFileUrl(id))throw fault(400,'添付ファイルを確認してください。');
    const meta=await(await call(`https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,size,parents,appProperties&supportsAllDrives=true`)).json();
    if(!meta.parents?.includes(MEDIA_FOLDER_ID)||meta.appProperties?.teamShiftTaskFile!=='1'||Number(meta.size)>TASK_FILE_LIMIT)throw fault(403,'アプリの添付ファイルではありません。');
    if(!taskFileVisibleTo(source,member.uid,id,meta.appProperties.teamShiftTaskFileOwner))throw fault(403,'このタスクの添付ファイルを開く権限がありません。');
    if(new URL(req.url,'https://team-shift-app.vercel.app').searchParams.get('mode')==='preview'){let preview;try{preview=taskFilePreview(meta.name,id);}catch(e){throw fault(400,e.message);}return res.status(200).json({...preview,name:meta.name});}
    const data=Buffer.from(await(await call(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`)).arrayBuffer());if(data.length>TASK_FILE_LIMIT)throw fault(413,'添付ファイルが大きすぎます。');
    res.setHeader('Content-Type','application/octet-stream');res.setHeader('Content-Disposition',"attachment; filename=attachment; filename*=UTF-8''"+encodeURIComponent(String(meta.name||'attachment').replace(/[\r\n]/g,'')));return res.status(200).send(data);
   }
   const name=Array.from(String(req.body?.name||'')).map(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127||c==='/'||c==='\\'?'_':c).join('').slice(0,200),base64=req.body?.base64;
   if(typeof base64!=='string'||base64.length>4*1024*1024||(base64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)))throw fault(400,'添付ファイルのデータを確認してください。');
   const bytes=Buffer.from(base64,'base64');let mime;try{mime=validateTaskFileContent(name,bytes);}catch(e){throw fault(400,e.message);}
   const boundary='teamshift_'+randomBytes(16).toString('hex'),metadata={name,parents:[MEDIA_FOLDER_ID],appProperties:{teamShiftTaskFile:'1',teamShiftTaskFileOwner:member.uid}};
   const body=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`),bytes,Buffer.from(`\r\n--${boundary}--`)]);
   const file=await(await call('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,size',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body})).json();
   const url=taskFileUrl(file.id);if(!url)throw fault(503,'添付ファイルの保存結果を確認できません。');
   return res.status(200).json({attachment:{mediaType:'file',fileId:file.id,imageUrl:url,imageName:file.name||name,imageBytes:bytes.length}});
  }catch(e){return res.status(e.status||500).json({error:e.status?e.message:'添付ファイルの操作に失敗しました。入力を残したまま再実行してください。'});}
 };
}
export default createTaskFileHandler();
