import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseInventoryCode, findModelProducts} from '../src/inventoryQr.mjs';
const sample='34940577HH06005SR            0001 20231107 323Y07V19110233        http://touroku.toto.jp/t.htm?gs=HH06005SR&rk=20834_231107_323Y07V19110233            0000';
test('actual photographed QR extracts stable model rather than serial or JAN',()=>{
 assert.deepEqual(parseInventoryCode(sample),{type:'model',modelNumber:'HH06005SR',manufacturer:'TOTO'});
 assert.deepEqual(parseInventoryCode(sample.replaceAll('231107','241201')),parseInventoryCode(sample));
});
test('unknown URLs and invalid product fields are not inferred',()=>{
 for(const s of ['https://example.com/?gs=HH06005SR','https://touroku.toto.jp.evil.test/t.htm?gs=HH06005SR','https://touroku.toto.jp/t.htm?gs=','https://touroku.toto.jp/t.htm?gs=hello%20world','some arbitrary payload'])assert.equal(parseInventoryCode(s).type,'unsupported');
 assert.deepEqual(parseInventoryCode('４９０１２３４５６７８９０'),{type:'barcode',barcode:'4901234567890'});
});
test('match model and known manufacturer, preserve ambiguous matches for selection',()=>{
 const items=[{id:'a',modelNumber:' hh06005sr ',manufacturer:'TOTO'},{id:'b',modelNumber:'ＨＨ０６００５ＳＲ'},{id:'c',modelNumber:'HH06005SR',manufacturer:'OTHER'},{id:'d',modelNumber:'HH06005S'}];
 assert.deepEqual(findModelProducts(items,parseInventoryCode(sample)).map(i=>i.id),['a','b']);
});
