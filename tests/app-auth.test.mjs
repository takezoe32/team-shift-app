import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { registeredMember, firebaseCustomToken, createAppAuthHandler } from '../api/app-auth.js';
import { sharedDataError, appAuthError } from '../src/appAuth.mjs';
const identity={sub:'google123',email:'MEMBER@example.com',email_verified:true};
const state={users:{u_registered:{id:'wrong',email:'member@example.com',name:'App Name',role:'staff'},view:{email:'viewer@example.com',role:'viewer'}},userOrder:['u_registered']};
function fixture({data=state,verify=async()=>identity,mint=()=> 'signed',ready=true}={}) {
 const handler=createAppAuthHandler({env:{},configure:()=>({ready,service:{}}),makeStore:()=>({read:async()=>data}),verify,mint});
 return async ({method='POST',body={credential:'valid'},origin='https://team-shift-app.vercel.app'}={})=>{
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(value){this.body=value;return this;},end(){return this;}};
  await handler({method,headers:{origin,'content-type':'application/json'},body},res);return res;
 };
}
test('only server verified registered members receive their stored id and name',async()=>{
 const call=fixture({mint:(_service,member)=>{assert.equal(member.id,'u_registered');assert.equal(member.name,'App Name');return 'signed';}});
 const res=await call({body:{credential:'valid',id:'attacker',role:'admin',email:'other@example.com'}});
 assert.equal(res.code,200);assert.equal(res.body.customToken,'signed');assert.equal(res.body.user.role,'staff');assert.equal(res.headers['Cache-Control'],'no-store');
});
test('invalid, unverified and unregistered identities are rejected',async()=>{
 for(const candidate of [{...identity,email_verified:false},{...identity,sub:''},{...identity,email:'outsider@plandosee.co.jp'}]) {
  const res=await fixture({verify:async()=>candidate})();assert.ok([401,403].includes(res.code));assert.equal(res.body.customToken,undefined);
 }
 assert.equal((await fixture({verify:async()=>{throw Error('forged');}})()).code,401);
});
test('missing database never creates a first administrator or writes data',async()=>{
 for(const data of [null,{}, {users:{}}]) assert.equal((await fixture({data})()).code,503);
});
test('viewer may authenticate for read access and duplicate ids choose canonical member',()=>{
 assert.equal(registeredMember(state,{...identity,email:'viewer@example.com'}).id,'view');
 assert.equal(registeredMember({...state,users:{...state.users,duplicate:{email:'member@example.com'}}},identity).id,'u_registered');
});
test('removed members cannot get another token',async()=>{
 assert.equal((await fixture({data:{users:{view:state.users.view}}})()).code,403);
});
test('reject cross origin, wrong method and oversized credentials before identity lookup',async()=>{
 const call=fixture({verify:async()=>{throw Error('must not verify');}});
 assert.equal((await call({origin:'https://evil.example'})).code,403);
 assert.equal((await call({method:'GET'})).code,405);
 for(const credential of ['',null,'x'.repeat(10001)])assert.equal((await call({body:{credential}})).code,400);
 assert.equal((await fixture({ready:false})()).code,503);
});
test('minted token is signed for Firebase, short lived, and binds stored member id and email',()=>{
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
 const service={client_email:'service@example.iam.gserviceaccount.com',private_key:privateKey};
 const token=firebaseCustomToken(service,{id:'u_123',email:'Member@example.com'},1700000000000);
 const [h,b,s]=token.split('.'),payload=JSON.parse(Buffer.from(b,'base64url'));
 assert.equal(payload.uid,'u_123');assert.deepEqual(payload.claims,{appMember:true,appEmail:'member@example.com'});assert.equal(payload.exp-payload.iat,3600);
 assert.equal(payload.iss,service.client_email);assert.match(payload.aud,/identitytoolkit/);
 assert.ok(createVerify('RSA-SHA256').update(h+'.'+b).verify(publicKey,Buffer.from(s,'base64url')));
});
test('database refusal and missing database produce explicit recovery errors',()=>{
 assert.match(sharedDataError({code:'permission-denied'}),/アクセスが拒否/);assert.match(sharedDataError({code:'not-found'}),/新しいデータは作成せず/);
 assert.match(appAuthError({code:'auth/configuration-not-found'}),/初期設定/);
});
