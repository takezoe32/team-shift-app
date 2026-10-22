import {test} from 'node:test';import assert from 'node:assert/strict';
import {planTaskEdit} from '../src/taskEdit.mjs';
const source='2026-10-12',target='2026-10-15';
const task={id:'a',text:'交換',subject:'照明',imageUrl:'photo',assigneeIds:['u','v'],completed:true,completedAt:'done',productId:'lamp',inventoryDeducted:true,inventoryQuantity:2,updates:[{id:'latest'}]};
const data=()=>({shifts:{untouched:1},tasks:{[source]:{u:[task,{id:'other'}],v:[{id:'other-user'}]},[target]:{u:[{id:'destination'}],v:[{id:'untouched'}]}}});
test('date edit moves once, preserves image/assignees/completion/inventory and other tasks',()=>{
 const state=data();const p=planTaskEdit(state,source,'u','a',{targetDate:target,text:'交換予定変更',updates:[{id:'stale'},{id:'new'}]});
 const moved=p.teamData.tasks[target].u[1];assert.equal(p.teamData.tasks[source].u.length,1);assert.equal(moved.id,'a');
 for(const key of ['imageUrl','assigneeIds','completed','completedAt','productId','inventoryDeducted','inventoryQuantity'])assert.deepEqual(moved[key],task[key]);
 assert.deepEqual(moved.updates,[{id:'latest'},{id:'new'}]);assert.equal(p.teamData.tasks[source].v[0].id,'other-user');assert.deepEqual(p.teamData.shifts,state.shifts);
 assert.equal(Object.keys(p.updates).length,2);assert.ok(!Object.keys(p.updates).includes('inventoryItems'));assert.equal(state.tasks[source].u.length,2);
 assert.throws(()=>planTaskEdit(p.teamData,source,'u','a',{targetDate:target}),/削除または移動/);
});
test('same-day edit changes existing array without duplication',()=>{
 const p=planTaskEdit(data(),source,'u','a',{targetDate:source,text:'変更'});assert.equal(p.teamData.tasks[source].u.length,2);assert.equal(p.teamData.tasks[source].u[0].text,'変更');assert.equal(Object.keys(p.updates).length,1);
});
test('invalid dates, missing task and destination conflicts reject',()=>{
 for(const date of ['','2026-02-30','not-date'])assert.throws(()=>planTaskEdit(data(),source,'u','a',{targetDate:date}),/有効な日付/);
 assert.throws(()=>planTaskEdit(data(),source,'u','missing',{targetDate:target}),/削除または移動/);
 const state=data();state.tasks[target].u.push(task);assert.throws(()=>planTaskEdit(state,source,'u','a',{targetDate:target}),/同じタスク/);
});

test('editing task details and adding a handoff keeps their contents separate after rescheduling',()=>{
 const note={id:'handoff-new',kind:'handoff',text:'今回の追記',authorName:'投稿者'};
 const p=planTaskEdit(data(),source,'u','a',{targetDate:target,subject:'新しい件名',text:'修正した詳しい内容',endTime:'15:30',updates:[note]});
 const moved=p.teamData.tasks[target].u.find(item=>item.id==='a');
 assert.equal(moved.subject,'新しい件名');assert.equal(moved.text,'修正した詳しい内容');assert.equal(moved.endTime,'15:30');
 assert.deepEqual(moved.updates,[{id:'latest'},note]);assert.equal(moved.imageUrl,'photo');assert.deepEqual(moved.assigneeIds,['u','v']);
});
test('editing details alone does not add a handoff or replace existing history',()=>{
 const p=planTaskEdit(data(),source,'u','a',{subject:'変更した件名',text:'本文の訂正'});
 assert.deepEqual(p.teamData.tasks[source].u[0].updates,[{id:'latest'}]);
});
