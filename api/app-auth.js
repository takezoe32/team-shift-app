import { backupAction } from './_lib/daily-backup.js';
import { sendAdminAlert, mailReady, ALERT_TO } from './_lib/admin-alert.js';
import { verifyIncidentToken } from './_lib/incident-auth.js';
import { Buffer } from 'node:buffer';
import { createSign } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { CLIENT_ID, configuration, verifyRequest, fault } from './_lib/report-auth.js';
import { makeLineStore } from './_lib/line-store.js';
export function registeredMember(data, identity) {
  if (!identity?.email_verified || !identity.sub || !identity.email) throw fault(401, 'Googleログインをやり直してください。');
  if (!data?.users || !Object.keys(data.users).length) throw fault(503, '保存済みのメンバー情報を確認できません。管理者に連絡してください。');
  const email = identity.email.trim().toLowerCase();
  const matches = Object.entries(data.users).filter(([,user]) => String(user.email || '').trim().toLowerCase() === email);
  if (!matches.length) throw fault(403, 'アプリに登録されたGoogleアカウントでログインしてください。');
  const match = matches.find(([id]) => (data.userOrder || []).includes(id)) || matches.find(([id]) => !id.startsWith('u_')) || matches[0];
  if (!match[0] || match[0].length > 128) throw fault(503, '登録メンバーのIDを確認してください。');
  return { ...match[1], id: match[0] };
}
export function firebaseCustomToken(service, member, now = Date.now()) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = encode({alg:'RS256',typ:'JWT'}) + '.' + encode({iss:service.client_email,sub:service.client_email,aud:'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit',iat:Math.floor(now/1000),exp:Math.floor(now/1000)+3600,uid:member.id,claims:{appMember:true,appEmail:member.email.trim().toLowerCase()}});
  return unsigned + '.' + createSign('RSA-SHA256').update(unsigned).sign(service.private_key,'base64url');
}
async function verifyGoogle(credential) {
  const ticket = await new OAuth2Client(CLIENT_ID).verifyIdToken({idToken:credential,audience:CLIENT_ID});
  return ticket.getPayload();
}
export function createAppAuthHandler({env=globalThis.process.env,configure=configuration,makeStore=makeLineStore,verify=verifyGoogle,mint=firebaseCustomToken,now=Date.now,manageBackup=backupAction,notify=sendAdminAlert,verifyIncident=verifyIncidentToken}={}) {
  return async (req,res) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    try {
      if (req.method!=='POST') return res.status(405).end();
      verifyRequest(req,false);
      const config=configure(env);
      if (!config.ready || (env.VERCEL_ENV && env.VERCEL_ENV!=='production')) throw fault(503,'ログインのサーバー設定を確認してください。');
      if (req.body?.action==='incident') {
        if (!['data_read_failed','app_error'].includes(req.body.code)) throw fault(400,'通知の種類が不正です。');
        await verifyIncident(String(req.headers.authorization || '').replace(/^Bearer /,''));
        const result=await notify({code:req.body.code,config,env,now});
        return res.status(200).json({received:true,configured:result.configured});
      }
      if (typeof req.body?.credential!=='string' || req.body.credential.length>10000 || !req.body.credential) throw fault(400,'Googleログインをやり直してください。');
      let identity;
      try { identity=await verify(req.body.credential); } catch { throw fault(401,'Googleログインをやり直してください。'); }
      if (!identity?.email_verified || !identity.sub || !identity.email) throw fault(401,'Googleログインをやり直してください。');
      const action=req.body.action;
      if (['backup-status','backup-now','backup-preview','backup-restore','alert-status','alert-test'].includes(action)) {
        if (!config.admins?.includes(identity.email.trim().toLowerCase())) throw fault(403,'管理者のGoogleアカウントで確認してください。');
        if (action==='alert-status') return res.status(200).json({configured:mailReady(env),to:ALERT_TO});
        if (action==='alert-test') {
          const result=await notify({code:'test',config,env,now});
          if(!result.configured)throw fault(503,'VercelにALERT_SMTP_PASSWORDの設定が必要です。');
          return res.status(200).json(result);
        }
        return res.status(200).json(await manageBackup({body:req.body,config,now}));
      }
      if (action && action!=='login') throw fault(400,'操作を確認してください。');
      const member=registeredMember(await makeStore(env).read('app_data/shared_state'),identity);
      return res.status(200).json({customToken:mint(config.service,member,now()),user:member});
    } catch(error) {
      console.error('app-auth',error.status || 500,error.code || '');
      return res.status(error.status || 503).json({error:error.status?error.message:'ログインの確認に失敗しました。時間を置いて再度お試しください。'});
    }
  };
}
export default createAppAuthHandler();
