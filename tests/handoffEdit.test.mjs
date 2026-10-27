import test from 'node:test';
import assert from 'node:assert/strict';
import { changeHandoff, findLiveTask, canChangeHandoff } from '../src/handoffEdit.mjs';
import { planTaskEdit } from '../src/taskEdit.mjs';
import { mergePartnerImageChanges } from '../src/taskImages.mjs';
const actor = { id: 'u', role: 'member' };
const note = { id: 'a', text: 'old', authorUid: 'u', createdAt: '2026-10-18T00:00:00Z', images: [{ imageUrl: 'photo' }] };
const operation = { id: 'a', action: 'edit', expectedText: 'old', expectedUpdatedAt: '', text: 'corrected', updatedAt: '2026-10-18T01:00:00Z' };
test('edit preserves author, creation date, attachments and concurrent other notes', () => {
  const next = changeHandoff({ text: 'old', updates: [note, { id: 'b', text: 'another' }] }, operation, 'text', actor);
  assert.equal(next.text, 'corrected');
  assert.equal(next.updates.length, 2);
  assert.equal(next.updates[0].authorUid, 'u');
  assert.equal(next.updates[0].createdAt, note.createdAt);
  assert.deepEqual(next.updates[0].images, note.images);
  assert.equal(next.updates[0].updatedAt, operation.updatedAt);
});
test('stale changes and missing notes are rejected', () => {
  assert.throws(() => changeHandoff({ updates: [{ ...note, text: 'newer' }] }, operation, 'text', actor), /別の端末/);
  assert.throws(() => changeHandoff({ updates: [{ ...note, updatedAt: 'later' }] }, operation, 'text', actor), /別の端末/);
  assert.throws(() => changeHandoff({ updates: [] }, operation, 'text', actor), /削除/);
  assert.throws(() => changeHandoff({ updates: [note] }, { ...operation, text: ' ' }, 'text', actor), /入力/);
});
test('daily task transaction replaces or deletes exactly the selected handoff', () => {
  const data = { tasks: { '2026-10-18': { u: [{ id: 'task', text: 'old', updates: [note, { id: 'b', text: 'other' }] }] } } };
  const plan = planTaskEdit(data, '2026-10-18', 'u', 'task', { handoffOperation: operation }, actor);
  const edited = plan.teamData.tasks['2026-10-18'].u[0];
  assert.equal(edited.updates.length, 2);
  assert.equal(edited.updates[0].text, 'corrected');
  assert.equal('handoffOperation' in edited, false);
  const removed = planTaskEdit(data, '2026-10-18', 'u', 'task', { handoffOperation: { ...operation, action: 'delete' } }, actor).teamData.tasks['2026-10-18'].u[0];
  assert.deepEqual(removed.updates.map(item => item.id), ['b']);
  assert.equal(removed.text, 'other');
});
test('partner changes do not append deleted or edited notes back', () => {
  const edited = mergePartnerImageChanges({ content: 'old', updates: [note] }, { handoffOperation: operation }, actor);
  assert.equal(edited.content, 'corrected');
  assert.equal(edited.updates.length, 1);
  const removed = mergePartnerImageChanges({ content: 'old', updates: [note] }, { handoffOperation: { ...operation, action: 'delete' } }, actor);
  assert.deepEqual(removed.updates, []);
  assert.equal(removed.content, '');
});
test('legacy partner note can be edited and deleted', () => {
  const item = { id: 'p', content: 'old', createdByUid: 'u' };
  assert.equal(mergePartnerImageChanges(item, { handoffOperation: { ...operation, id: 'legacy_p' } }, actor).updates[0].text, 'corrected');
  assert.equal(mergePartnerImageChanges(item, { handoffOperation: { ...operation, id: 'legacy_p', action: 'delete' } }, actor).content, '');
});
test('open task detail uses live notes and follows moved tasks', () => {
  const selected = { id: 't', ownerUid: 'u', taskDate: '2026-10-17', updates: [] };
  const live = findLiveTask({ tasks: { '2026-10-18': { u: [{ id: 't', updates: [note] }] } } }, selected);
  assert.equal(live.taskDate, '2026-10-18');
  assert.equal(live.updates[0].text, 'old');
  assert.equal(findLiveTask({ tasks: {} }, selected), null);
});


test('only the original author may edit or delete, including when another actor is administrator or task owner',()=>{
 const item={id:'t',text:'old',updates:[note]};
 for(const other of [{id:'other',isAdmin:true},{id:'owner'},{id:'u',readOnly:true},{id:'u',role:'viewer'},undefined]){
  assert.equal(canChangeHandoff(note,other),false);
  for(const action of ['edit','delete']){
   const op={...operation,action};
   assert.throws(()=>changeHandoff(item,op,'text',other),/本人/);
   assert.throws(()=>mergePartnerImageChanges(item,{handoffOperation:op},other),/本人/);
   assert.throws(()=>planTaskEdit({tasks:{'2026-10-18':{owner:[item]}}},'2026-10-18','owner','t',{handoffOperation:op},other),/本人/);
  }
 }
 assert.equal(canChangeHandoff(note,actor),true);
 assert.equal(canChangeHandoff({...note,authorUid:''},actor),false);
 assert.throws(()=>mergePartnerImageChanges({id:'p',content:'old'},{handoffOperation:{...operation,id:'legacy_p'}},actor),/本人/);
 assert.equal(item.updates[0].text,'old');
});
