import { OAuth2Client } from 'google-auth-library';
import { fault } from './report-auth.js';
let certificates=null,expires=0;
export async function verifyIncidentToken(token,fetcher=fetch,now=Date.now){
 if(typeof token!=='string'||token.length>15000)throw fault(401,'ログインを確認してください。');
 if(!certificates||expires<=now()){
  const r=await fetcher('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',{signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw fault(503,'認証情報を確認できません。');certificates=await r.json();expires=now()+300000;
 }
 try{
  const ticket=await new OAuth2Client().verifySignedJwtWithCertsAsync(token,certificates,'team-shift-app',['https://securetoken.google.com/team-shift-app'],3600);
  const payload=ticket.getPayload();if(payload.appMember!==true||!payload.sub)throw Error();return payload;
 }catch{throw fault(401,'ログインを確認してください。');}
}
