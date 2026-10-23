import {test} from 'node:test';import assert from 'node:assert/strict';
import {receiptNameRegions,chooseReceiptName} from '../src/receiptNameOcr.mjs';
import {receiptNameKey,loadReceiptNames,rememberReceiptName,forgetReceiptName,clearReceiptNames,applyReceiptNames} from '../src/receiptNameMemory.mjs';
const storage=()=>{const map=new Map();return {getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key),map};};
const code='4900000000009';
test('remembered names are scoped by signed-in user, store, code and browser and can be removed',()=>{
 const db=storage(),otherBrowser=storage();assert.equal(receiptNameKey('コーナン',code),'コーナン:'+code);assert.equal(receiptNameKey('コーナン','4900000000000'),'');
 assert.equal(rememberReceiptName('user-a','コーナン',code,'修正した工具名',db).error,undefined);
 assert.equal(loadReceiptNames('user-b',db)[receiptNameKey('コーナン',code)],undefined);assert.deepEqual(loadReceiptNames('user-a',otherBrowser),{});
 const names=loadReceiptNames('user-a',db);assert.equal(names[receiptNameKey('コーナン',code)].name,'修正した工具名');
 assert.equal(names[receiptNameKey('その他',code)],undefined);assert.equal(rememberReceiptName('','コーナン',code,'名前',db).error.includes('確認'),true);
 forgetReceiptName('user-a','コーナン',code,db);assert.deepEqual(loadReceiptNames('user-a',db),{});
 rememberReceiptName('user-a','ナフコ','12345678','別の商品',db);db.setItem('unrelated-setting','keep');
 clearReceiptNames('user-a',db);assert.deepEqual(loadReceiptNames('user-a',db),{});assert.equal(db.getItem('unrelated-setting'),'keep');
});
test('only explicitly remembered names persist; automatic OCR suggestions and images remain in memory',()=>{
 const db=storage(),row={code,name:'OCR文字',amount:'500',unit:'250',quantity:'2'};
 const recognized=applyReceiptNames([row],'コーナン',{[code]:{chosenName:'工具 A-10',image:'data:image/jpeg;base64,PRIVATE'}},{});
 assert.equal(recognized[0].name,'工具 A-10');assert.equal(recognized[0].nameSource,'japanese');assert.equal(recognized[0].originalName,'OCR文字');assert.equal(db.map.size,0);
 rememberReceiptName('u','コーナン',code,'確認した工具名',db);
 assert.equal([...db.map.values()].some(v=>/PRIVATE|amount|quantity/.test(v)),false);
 const recalled=applyReceiptNames([row],'コーナン',{},loadReceiptNames('u',db))[0];assert.equal(recalled.name,'確認した工具名');assert.equal(recalled.amount,'500');assert.equal(recalled.unit,'250');assert.equal(recalled.nameSource,'memory');
});
test('blocked or corrupt browser storage fails safely without preventing receipt editing',()=>{
 assert.deepEqual(loadReceiptNames('u',{getItem:()=>'{broken'}),{});
 const blocked={getItem:()=>null,setItem:()=>{throw Error('QuotaExceeded');},removeItem:()=>{throw Error('blocked');}};
 assert.match(rememberReceiptName('u','コーナン',code,'工具',blocked).error,/保存できません/);
 assert.match(clearReceiptNames('u',blocked).error,/削除できません/);
});
test('Japanese rereading rejects low confidence or lost Japanese names and never changes numeric fields',()=>{
 assert.equal(chooseReceiptName('XIABC-50','工具セット A-50',80),'工具セット A-50');
 assert.equal(chooseReceiptName('工具セット A-50','XXX',90),'工具セット A-50');
 assert.equal(chooseReceiptName('元の商品名','工具セット',20),'元の商品名');
});
test('name extraction uses the line next to JAN or before store SKU and excludes numeric price lines',()=>{
 const make=(line,word,x,y,w,text)=>['5','1','1','1',line,word,x,y,w,24,90,text].join('\t');
 const tsv=[make(1,1,20,100,250,'#002 JAN'+code),make(2,1,80,140,300,'ABC工具A-50'),make(3,1,400,180,60,'500'),make(3,2,470,180,20,'内'),make(4,1,20,220,100,'12345678'),make(4,2,400,220,60,'￥200')].join('\n');
 const regions=receiptNameRegions(tsv,600,1200);assert.equal(regions.length,1);assert.equal(regions[0].code,code);assert.ok(regions[0].top<140 && regions[0].bottom>160);
});

test('readable Japanese names are not automatically replaced by a different rereading',()=>{
 assert.equal(chooseReceiptName('作業道具','作業適具',85),'作業道具');
 assert.equal(chooseReceiptName('補修テープ A-80','補修テープ A-890',95),'補修テープ A-80');
});
