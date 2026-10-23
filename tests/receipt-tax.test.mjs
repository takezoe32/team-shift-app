import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseReceiptText,receiptTsv} from '../src/receiptImport.mjs';
import {allocateReceiptTax,receiptTaxAllocationError,printedReceiptYen} from '../src/receiptTax.mjs';
const text=`建デポ テスト店
2026年1月2日
4900000000009
0016◎試験シート
#2000 2.0×4.0
単1,000× __ 2個 ¥2,000
4900000000016
02
¥500
小計 ¥2,500
外税対象額 10.00% ¥2,500
消費税等外税 10.00% ¥250
合計 ¥2,750
会員番号
4900000000023`;
test('exclusive receipt keeps net amounts separate and never imports membership or department digits as items',()=>{const p=parseReceiptText(text);assert.equal(p.shop,'建デポ');assert.equal(p.rows.length,2);assert.equal(p.rows[0].name,'試験シート #2000 2.0×4.0');assert.equal(p.rows[0].quantity,'2');assert.equal(p.rows[0].unit,'1000');assert.deepEqual(p.rows.map(r=>r.netAmount),['2000','500']);assert.deepEqual(p.rows.map(r=>r.amount),['','']);assert.equal(p.total,'2750');assert.equal(receiptTaxAllocationError(p.rows,p.taxInfo,p.total),'');});
test('printed tax is proportionally allocated and G retains printed net unit',()=>{const p=parseReceiptText(text);const result=allocateReceiptTax(p.rows,p.taxInfo,p.total);assert.deepEqual(result.rows.map(r=>r.amount),['2200','550']);assert.equal(result.rows[0].unit,'1000');const tsv=receiptTsv({buyer:'テスト',date:'2026-01-02',department:'管理',account:'消耗品',month:''},result.rows);assert.equal(tsv.split('\n')[0].split('\t')[6],'1000');});
test('largest remainders preserve the printed tax total without creating a balancing item',()=>{const rows=[{netAmount:'125',unit:'',quantity:''},{netAmount:'125',unit:'',quantity:''},{netAmount:'125',unit:'',quantity:''}];const result=allocateReceiptTax(rows,{mode:'exclusive',subtotal:'375',tax:'37',rate:'10'},'412');assert.deepEqual(result.rows.map(r=>r.amount),['138','137','137']);assert.equal(result.rows.reduce((sum,r)=>sum+Number(r.amount),0),412);});
test('missing metadata, inconsistent amounts, mixed taxes and quantity errors block automatic allocation',()=>{const p=parseReceiptText(text);for(const info of [{...p.taxInfo,tax:''},{...p.taxInfo,subtotal:'2400'},{...p.taxInfo,tax:'251'},{...p.taxInfo,mixedRates:true},{...p.taxInfo,rate:''}])assert.ok(allocateReceiptTax(p.rows,info,p.total).error);assert.ok(allocateReceiptTax([{...p.rows[0],quantity:'3'},p.rows[1]],p.taxInfo,p.total).error);assert.ok(allocateReceiptTax([{netAmount:'-1'}],p.taxInfo,p.total).error);});
test('printed dot thousands and fallback taxable/payment lines remain verifiable',()=>{assert.equal(printedReceiptYen('¥8.000'),8000);const p=parseReceiptText(text.replace('小計 ¥2,500','の 計 OCR').replace('合計 ¥2,750','他社クレ ¥2,750'));assert.equal(receiptTaxAllocationError(p.rows,p.taxInfo,p.total),'');assert.equal(p.warnings.length,3);});

import {selectReceiptReading} from '../src/receiptOcr.mjs';
import {receiptNameKey} from '../src/receiptNameMemory.mjs';
test('chooses a financially verified rereading over a misread item price',()=>{const bad={text:text.replace('2個 ¥2,000','2個 ¥8,000')},good={text};assert.equal(selectReceiptReading([bad,good]),good);});
test('store internal product codes can remember corrected names without being treated as JAN',()=>{assert.equal(receiptNameKey('建デポ','2000000000000'),'建デポ:2000000000000');assert.equal(receiptNameKey('コーナン','2000000000000'),'');});
