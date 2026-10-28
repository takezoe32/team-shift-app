import test from 'node:test';
import assert from 'node:assert/strict';
import { canManageTask, assertTaskManage } from '../src/taskManagePermission.mjs';
import { planTaskEdit } from '../src/taskEdit.mjs';
import { changeHandoff } from '../src/handoffEdit.mjs';
const task = { id:'t', assigneeIds:['owner','second'], text:'old', updates:[{id:'note',authorUid:'owner',text:'note'}] };
test('all assignees and owner/admin can manage, unrelated users cannot',()=>{
 for(const uid of ['owner','second']) assert.equal(canManageTask(task,'owner',uid),true);
 assert.equal(canManageTask(task,'owner','other'),false);
 assert.equal(canManageTask(task,'owner','admin',true),true);
 assert.equal(canManageTask({id:'legacy'},'owner','owner'),true);
 assert.throws(()=>assertTaskManage(task,'owner',{id:'other'}),/編集・削除/);
 assert.throws(()=>assertTaskManage(task,'owner',{id:'second',role:'viewer'}),/編集・削除/);
 assert.throws(()=>assertTaskManage(task,'owner',{id:'second',role:'custom'},{custom:{readOnly:true}}),/編集・削除/);
 assert.throws(()=>assertTaskManage({...task,assigneeIds:['owner']},'owner',{id:'second'}),/編集・削除/);
});
test('private tasks stay limited to their owner',()=>{
 assert.equal(canManageTask({...task,visibility:'private'},'owner','second'),false);
 assert.equal(canManageTask({...task,visibility:'private'},'owner','admin',true),false);
});
test('second assignee edits original task, but cannot edit another authors handoff',()=>{
 const actor={id:'second'};
 assertTaskManage(task,'owner',actor);
 const result=planTaskEdit({tasks:{'2026-10-28':{owner:[task]}}},'2026-10-28','owner','t',{text:'new'},actor);
 assert.equal(result.teamData.tasks['2026-10-28'].owner[0].text,'new');
 assert.deepEqual(result.teamData.tasks['2026-10-28'].owner[0].updates,task.updates);
 assert.throws(()=>changeHandoff(task,{id:'note',action:'edit',text:'change',expectedText:'note',expectedUpdatedAt:''},'text',actor),/本人のみ/);
});
