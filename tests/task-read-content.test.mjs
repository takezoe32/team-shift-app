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
test('一覧の1行説明は、申し送りがあれば最新の申し送り、なければ登録した内容', async () => {
 const { taskListNote } = await import('../src/taskReadContent.mjs');
 // No handoff: the content, only when it is not already the title (a task without a subject shows its text as the title).
 assert.deepEqual(taskListNote({ subject: '電球交換', text: 'LEDに変更' }), { kind: 'content', text: 'LEDに変更' });
 assert.equal(taskListNote({ text: '件名なしの作業' }), null);
 assert.equal(taskListNote({ subject: '件名だけ' }), null);
 assert.equal(taskListNote({ subject: '電球交換', text: 'LEDに変更', updates: [{ id: 'i', kind: 'initial', text: 'LEDに変更' }] }).kind, 'content');
 // With handoffs: the newest one, with who wrote it and the day (Japan time).
 const item = { subject: '電球交換', text: 'LEDに変更', updates: [{ id: 'i', kind: 'initial', text: 'LEDに変更' }, { id: 'a', kind: 'handoff', text: '部品待ち', authorName: '江藤 公二', createdAt: '2026-11-25T01:00:00.000Z' }, { id: 'b', kind: 'handoff', text: '部品が届いた\n明日交換', authorName: '竹添 三剛', createdAt: '2026-11-26T16:30:00.000Z' }] };
 assert.deepEqual(taskListNote(item), { kind: 'handoff', text: '部品が届いた\n明日交換', by: '竹添', day: '11/27' });
 // A task without a subject still shows its handoff; a handoff with attachments only says so.
 assert.equal(taskListNote({ text: '件名なしの作業', updates: [{ id: 'a', kind: 'handoff', text: '確認済み', createdAt: '2026-11-25T01:00:00.000Z' }] }).text, '確認済み');
 assert.deepEqual(taskListNote({ subject: 'A', text: 'B', updates: [{ id: 'a', kind: 'handoff', text: '', images: [{ imageUrl: 'x' }] }] }), { kind: 'handoff', text: '添付あり', by: '', day: '' });
});
