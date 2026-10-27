import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { xlsxCells,zipPackage } from '../api/_lib/xlsx-cells.js';
import { meterSheets } from '../api/_lib/meter-sheets.js';
import { METER_FIELDS } from '../src/meterReadings.mjs';
const input=process.env.METER_TEST_XLSX;
const fixture=input?readFileSync(input):null;
function driveMock(){let data=fixture,version=1;const requests=[];const fetcher=async(url,options={})=>{requests.push({url,options});const metadata=()=>({id:'original',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',fileSize:String(data.length),etag:'"v'+version+'"',editable:true});
 if(options.method==='PUT'){if(options.headers['If-Match']!==metadata().etag)return {ok:false,status:412};data=Buffer.from(options.body);version++;return {ok:true,json:async()=>metadata()};}
 if(url.includes('alt=media'))return {ok:true,arrayBuffer:async()=>data};return {ok:true,json:async()=>metadata()};};return {fetcher,requests,edit:()=>{version++;},get:()=>data};}
test('実原本のメモリコピーで全20セルを更新し、書式・数式・無関係のZIP要素を保持',{skip:!fixture},async()=>{
 const mock=driveMock(),adapter=meterSheets('private',mock.fetcher),before=await adapter.read('2026-10-27'),changes=Object.fromEntries(METER_FIELDS.map((f,i)=>[f.id,100.25+i]));
 assert.equal(before.format,'xlsx');assert.equal(before.sheets.h,'Ｈ-10');assert.equal(before.current['electric-reading'],xlsxCells(fixture).get('10','D35').value);
 await adapter.write(before,changes);const after=await adapter.read('2026-10-27');for(const [id,value]of Object.entries(changes))assert.equal(after.current[id],value);
 assert.deepEqual(after.previous,before.previous);const old=zipPackage(fixture),updated=zipPackage(mock.get());assert.deepEqual(updated.names,old.names);
 const changed=old.names.filter(name=>!old.get(name).equals(updated.get(name)));assert.equal(changed.length,3);assert(changed.includes('xl/workbook.xml'));assert.equal(changed.filter(n=>n.startsWith('xl/worksheets/')).length,2);
 for(const name of changed.filter(n=>n.startsWith('xl/worksheets/'))){const a=old.get(name).toString(),b=updated.get(name).toString();assert.deepEqual([...a.matchAll(/<f\b[^>]*?(?:\/>|>[\s\S]*?<\/f>)/g)].map(m=>m[0]),[...b.matchAll(/<f\b[^>]*?(?:\/>|>[\s\S]*?<\/f>)/g)].map(m=>m[0]));assert.deepEqual([...a.matchAll(/<c\b([^>]*?)(?:\/>|>)/g)].map(m=>m[1]),[...b.matchAll(/<c\b([^>]*?)(?:\/>|>)/g)].map(m=>m[1]));}
 const upload=mock.requests.find(r=>r.options.method==='PUT');assert(upload.url.includes('/upload/drive/v2/files/'));assert.equal(upload.options.headers['If-Match'],'"v1"');assert(upload.url.includes('newRevision=true'));
});
test('実原本の月初は前月末から取得し、変更後のETagではアップロードしない',{skip:!fixture},async()=>{
 const mock=driveMock(),adapter=meterSheets('private',mock.fetcher),start=await adapter.read('2026-10-01'),book=xlsxCells(fixture);assert.equal(start.previous['electric-reading'],book.get('09','D38').value);assert.equal(start.previousDate,'2026-09-30');const snap=await adapter.read('2026-10-27');mock.edit();await assert.rejects(()=>adapter.write(snap,{'gas-main':12}),/変更/);assert(!mock.requests.some(r=>r.options.method==='PUT'));
});
test('実原本の数式・文字セルや存在しないセルには書き込まない',{skip:!fixture},()=>{
 const book=xlsxCells(fixture);assert.throws(()=>book.patch([{title:'10',address:'E35',value:1}]));assert.throws(()=>book.patch([{title:'10',address:'G5',value:1}]));assert.throws(()=>book.patch([{title:'10',address:'ZZ999',value:1}]));assert.throws(()=>zipPackage(Buffer.alloc(30)));
});
test('原本形式の誤判定、編集権限なし、HTTP412を安全に拒否',{skip:!fixture},async()=>{
 await assert.rejects(()=>meterSheets('t',async()=>({ok:true,json:async()=>({mimeType:'application/pdf'})})).read('2026-10-27'),/形式/);
 const mock=driveMock();const adapter=meterSheets('t',async(url,options)=>{if(options?.method==='PUT')return {ok:false,status:412};return mock.fetcher(url,options);});const s=await adapter.read('2026-10-27');await assert.rejects(()=>adapter.write(s,{'gas-main':12}),/変更/);
});
