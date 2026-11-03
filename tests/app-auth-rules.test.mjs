import nodeTest, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, doc, getDocFromServer, updateDoc, deleteDoc, collection, getDocs, terminate } from 'firebase/firestore';
const enabled=process.env.FIRESTORE_RULES_TEST==='1';
const test=(name,fn)=>nodeTest(name,{skip:!enabled},fn);
const project='demo-teamshift-recovery', host='http://127.0.0.1:8185', path='app_data/shared_state';
const root=host+'/v1/projects/'+project+'/databases/(default)/documents/';
const initial=()=>({users:{admin:{email:'admin@example.com',role:'admin',name:'Admin'},member:{email:'member@example.com',role:'staff',name:'Member'},viewer:{email:'viewer@example.com',role:'viewer'},readonly:{email:'readonly@example.com',role:'limited'}},roles:{admin:{level:40},staff:{level:10},limited:{readOnly:true}},userOrder:['admin','member','viewer','readonly'],teamData:{tasks:{existing:'keep'}},calendarNote:{text:'before'},inventoryItems:[]});
function encode(v){if(v===null)return {nullValue:null};if(Array.isArray(v))return {arrayValue:{values:v.map(encode)}};if(typeof v==='object')return {mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]))}};if(typeof v==='string')return {stringValue:v};if(typeof v==='boolean')return {booleanValue:v};return {integerValue:String(v)};}
async function seed(data=initial()){const r=await fetch(root+path,{method:'PATCH',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify(encode(data).mapValue)});assert.equal(r.status,200,await r.text());}
const clients=[];
function client(uid,email=uid+'@example.com',claims={appMember:true,appEmail:email}) {
 const app=initializeApp({projectId:project,apiKey:'fake-key'},'test-'+clients.length);
 const db=getFirestore(app);
 connectFirestoreEmulator(db,'127.0.0.1',8185,uid?{mockUserToken:{sub:uid,...claims}}:{});
 clients.push({app,db});return db;
}
const denied=promise=>assert.rejects(promise,error=>error.code==='permission-denied');
before(async()=>{
 if(!enabled)return;
 const content=await readFile(new URL('../firestore.rules',import.meta.url),'utf8');
 const r=await fetch(host+'/emulator/v1/projects/'+project+':securityRules',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({rules:{files:[{name:'firestore.rules',content}]}})});
 assert.equal(r.status,200,await r.text());await seed();
});
after(async()=>{for(const {db,app} of clients){await terminate(db);await deleteApp(app);}});
test('anonymous, nonmember and wrong-email tokens cannot read shared state',async()=>{
 for(const db of [client(null),client('outsider'),client('member','wrong@example.com'),client('member','member@example.com',{})])await denied(getDocFromServer(doc(db,path)));
});
test('registered staff and viewers can read without a calendar expiry',async()=>{
 for(const uid of ['member','viewer','readonly'])assert.equal((await getDocFromServer(doc(client(uid),path))).data().teamData.tasks.existing,'keep');
});
test('viewer and custom readonly role cannot update, even a display name',async()=>{
 for(const uid of ['viewer','readonly'])await denied(updateDoc(doc(client(uid),path),{['users.'+uid+'.name']:'changed'}));
});
test('staff can edit ordinary data and own profile but cannot elevate permissions',async()=>{
 const ref=doc(client('member'),path);
 await updateDoc(ref,{'calendarNote.text':'after'});await updateDoc(ref,{'users.member.name':'New Name','users.member.picture':'image'});
 for(const update of [{'roles.staff.level':40},{'users.member.role':'admin'},{'users.member.canManageShift':true},{'users.member.email':'attacker@example.com'},{'users.other':{email:'x@example.com',role:'admin'}},{'users.admin.name':'other'},{userOrder:['member']},{lineLinkedMembers:{member:true}}])await denied(updateDoc(ref,update));
});
test('admin can manage members and ordinary task fields remain intact',async()=>{
 const ref=doc(client('admin'),path);await updateDoc(ref,{'users.new':{email:'new@example.com',role:'staff'},userOrder:['admin','member','new']});assert.equal((await getDocFromServer(ref)).data().teamData.tasks.existing,'keep');
});
test('no client can list, delete shared document, or read private integration documents',async()=>{
 const db=client('admin');await denied(getDocs(collection(db,'app_data')));await denied(deleteDoc(doc(db,path)));await denied(getDocFromServer(doc(db,'_server_integrations/daily_report_drive')));
});
test('member removal and demotion take effect with an existing token',async()=>{
 const db=client('member');await getDocFromServer(doc(db,path));const removed=initial();delete removed.users.member;await seed(removed);await denied(getDocFromServer(doc(db,path)));
 const demoted=initial();demoted.users.member.role='viewer';await seed(demoted);await denied(updateDoc(doc(db,path),{'calendarNote.text':'not allowed'}));await seed();
});
