import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taskBody, latestTaskHandoff } from '../src/taskReadContent.mjs';
test('member body remains separate from the newest handoff, even when subject is absent',()=>{
 const item={text:'登録した作業内容',updates:[{id:'init',kind:'initial',text:'登録した作業内容'},{id:'one',text:'昨日の申し送り',createdAt:'2026-10-22T10:00:00Z'},{id:'two',text:'今日の申し送り',createdAt:'2026-10-23T10:00:00Z'}]};
 assert.equal(taskBody(item),'登録した作業内容');assert.equal(latestTaskHandoff(item).id,'two');
});
test('partner initial text and legacy body are visible without duplicating handoffs as the task body',()=>{
 assert.equal(taskBody({partnerName:'会社',content:'初期の内容',updates:[{id:'note',kind:'handoff',text:'別の追記'}]}),'初期の内容');
 assert.equal(taskBody({partnerName:'会社',content:'最新の追記',updates:[{id:'initial',kind:'initial',text:'初期の内容'},{id:'note',kind:'handoff',text:'最新の追記'}]}),'初期の内容');
 assert.equal(taskBody({partnerName:'会社',content:'最新の追記',updates:[{id:'note',kind:'handoff',text:'最新の追記'}]}),'');
 assert.equal(latestTaskHandoff({}),null);assert.equal(taskBody({}),'');
});
test('same-time handoffs prefer the last appended note and initial registration stays excluded',()=>{
 assert.equal(latestTaskHandoff({updates:[{id:'initial',kind:'initial',text:'初期'},{id:'one',createdAt:'same'},{id:'two',createdAt:'same'}]}).id,'two');
});
