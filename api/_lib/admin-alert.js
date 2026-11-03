import nodemailer from 'nodemailer';
import { randomUUID } from 'node:crypto';
import { fieldsOf, makeBackupStore } from './daily-backup.js';
import { decodeFields, fault } from './report-auth.js';
import { tokyoDate } from '../../src/dailyReport.mjs';
export const ALERT_TO='mitsutake.takezoe@plandosee.co.jp', ALERT_FROM='tlf.operations.crew@gmail.com';
const names={backup_failed:'毎日のバックアップに失敗しました',report_failed:'日報の自動保存に失敗しました',data_read_failed:'アプリの保存データを読み込めませんでした',app_error:'アプリで処理エラーを検知しました',test:'通知メールの送信テスト'};
const prefix='projects/team-shift-app/databases/(default)/documents/';
const fallback=new Map();
export const mailReady=env=>!!env.ALERT_SMTP_PASSWORD;
export function makeMailer(env){
 if(!mailReady(env))throw fault(503,'VercelにALERT_SMTP_PASSWORDの設定が必要です。');
 const transport=nodemailer.createTransport({host:'smtp.gmail.com',port:465,secure:true,auth:{user:ALERT_FROM,pass:env.ALERT_SMTP_PASSWORD.replace(/\s/g,'')},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000});
 return message=>transport.sendMail(message);
}
export async function sendAdminAlert({code,config,env=globalThis.process.env,store,send,now=Date.now,scheduled=false}){
 store=store||(config?.service?makeBackupStore(config):null);
 if(!Object.hasOwn(names,code))throw fault(400,'通知の種類が不正です。');
 if(!mailReady(env)&&!send)return {configured:false,sent:false};
 const instant=now(),day=tokyoDate(instant),id=day+'-'+code,path='_server_alerts/'+id,claim=randomUUID();
 let claimed=false,storageUnavailable=false;
 if(code!=='test'){
  try{
   for(let retry=0;retry<3;retry++){
    const doc=await store.get(path),value=doc&&decodeFields(doc.fields);
    if(value?.status==='sent'||(value?.status==='sending'&&value.leaseUntil>instant))return {configured:true,sent:false,skipped:true};
    try{await store.commit([{update:{name:prefix+path,fields:fieldsOf({code,day,status:'sending',claim,leaseUntil:instant+600000})},currentDocument:doc?{updateTime:doc.updateTime}:{exists:false}}]);claimed=true;break;}catch(error){if(error.status!==409)throw error;}
   }
   if(!claimed)return {configured:true,sent:false,skipped:true};
  }catch{
   // Only the authenticated scheduled job can fall back during a storage outage.
   if(!scheduled)return {configured:true,sent:false,storageUnavailable:true};
   if((fallback.get(id)||0)>instant)return {configured:true,sent:false,skipped:true};
   fallback.set(id,instant+86400000);storageUnavailable=true;
  }
 }
 try{
  await (send||makeMailer(env))({from:ALERT_FROM,to:ALERT_TO,subject:'【管理課アプリ】'+names[code],text:names[code]+'。\n\n検知日時：'+new Date(instant).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})+'（日本時間）\n確認先：https://team-shift-app.vercel.app/\nVercelの実行ログと、設定内の「データ保護」を確認してください。\n\nこのメールに業務データ・画像・認証情報は含みません。\nデータが削除されたことを示す通知ではありません。'});
 }catch{throw fault(503,'管理者への通知メールを送信できませんでした。','ALERT_SEND_FAILED');}
 if(claimed&&!storageUnavailable){
  const doc=await store.get(path);
  if(doc&&decodeFields(doc.fields).claim===claim)await store.commit([{update:{name:prefix+path,fields:fieldsOf({code,day,status:'sent',sentAt:new Date(instant).toISOString()})},currentDocument:{updateTime:doc.updateTime}}]);
 }
 return {configured:true,sent:true};
}
