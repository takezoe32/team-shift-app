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
