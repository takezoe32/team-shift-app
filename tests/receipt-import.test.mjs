import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReceiptText, receiptAmount, receiptSummary, receiptValidation, receiptTsv, receiptCell } from '../src/receiptImport.mjs';
const form={buyer:'竹添',date:'2026-10-23',shop:'ナフコ',department:'管理',account:'消耗品費',month:'10月',total:'1500',totalMode:'none'};
const rows=[{name:'丁番 40mm ×2',amount:'1200',unit:'@600',note:'客室'},{name:'手袋',amount:'300',unit:'',note:'作業用'}];
test('Japanese receipt candidates extract full-width dates, items and totals while excluding taxes, quantities and payments',()=>{
 const parsed=parseReceiptText('ナフコ\n２０２６年１０月２３日\n丁番 40mm ×2 １,２００\n数量 2\n単価 600\n消費税 136\n手袋 300\n合計 1,500\n現金 2,000\nお釣り 500');
 assert.equal(parsed.shop,'ナフコ');assert.equal(parsed.date,'2026-10-23');assert.equal(parsed.total,'1500');
 assert.deepEqual(parsed.rows.map(row=>[row.name,row.amount]),[['丁番 40mm ×2','1200'],['手袋','300']]);
 assert.equal(parseReceiptText('2026/02/30\n商品 100').date,'');
});
test('TSV maps exactly nine columns with purchaser/date only on the first item and unit prices in G without exporting receipt totals',()=>{
 const cells=receiptTsv(form,rows).split('\n').map(line=>line.split('\t'));
 assert.equal(cells.length,2);assert.ok(cells.every(row=>row.length===9));
 assert.deepEqual(cells[0],['竹添','10/23','管理','消耗品費','丁番 40mm ×2','1200',"'@600",'客室','10月']);
 assert.deepEqual(cells[1],['','','管理','消耗品費','手袋','300','','作業用','10月']);
});
test('G always preserves unit prices even on the final item with a receipt total',()=>{const items=rows.map(row=>({...row,unit:'600'}));const result=receiptTsv(form,items).split('\n').map(line=>line.split('\t'));assert.equal(result.length,2);assert.equal(result[1][6],'600');assert.ok(result.every(row=>row.length===9));});

test('copy requires confirmation, valid dates and integer amounts, and rejects mismatched totals while preserving G prices',()=>{
 assert.equal(receiptValidation(form,rows,true),'');
 assert.match(receiptValidation(form,rows,false),/確認済み/);
 assert.match(receiptValidation({...form,total:'1501'},rows,true),/一致していません/);
 assert.match(receiptValidation({...form,date:'2026-02-30'},rows,true),/購入日/);
 assert.match(receiptValidation(form,[{name:'品',amount:''}],true),/税込金額/);
 assert.match(receiptValidation({...form,total:''},[{name:'品',amount:'1.5'}],true),/整数/);
 assert.equal(receiptValidation({...form,total:''},rows,true),'');
});
test('negative discount lines can be reviewed without automatic tax allocation',()=>{
 assert.equal(receiptAmount('￥１,０００円'),1000);assert.equal(receiptAmount('NaN'),null);assert.equal(receiptAmount(''),null);
 const discounted=[...rows,{name:'値引き',amount:'-100',unit:'',note:''}];
 assert.deepEqual(receiptSummary(discounted,'1400'),{sum:1400,total:1400,difference:0});assert.equal(receiptValidation({...form,total:'1400'},discounted,true),'');
 assert.equal(receiptTsv({...form,total:'1400'},discounted).split('\n')[2].split('\t')[5],'-100');
});
test('spreadsheet formula markers are neutralized in every user-entered text column and cell boundaries stay intact',()=>{
 for(const text of ['=HYPERLINK("evil")',' +cmd','@SUM(A1)','-formula','\t=1+1','\uFEFF=1+1'])assert.equal(receiptCell(text).startsWith("'"),true);
 const unsafe={...form,buyer:'=1+1',department:'@SUM(A1)',account:'+A1',month:'-formula',totalMode:'none'};
 const values=receiptTsv(unsafe,[{name:' =IMPORTXML("x")\nnext',amount:'100',unit:'@1',note:'\t=1'}]).split('\t');
 assert.equal(values.length,9);for(const index of [0,2,3,4,6,7,8])assert.equal(values[index].startsWith("'"),true);assert.equal(values[5],'100');
});

test('multiline store receipts attach SKU, quantity and unit price without treating codes as amounts',()=>{
 const parsed=parseReceiptText('ナフコ\n2026年9月10日\n01 作業用品 A型\n12345678 ￥500\n! 01 工具\n87654321 単価 120\n3点 ￥360\n合計 ￥860\n10%内消費税額 ￥78\nポイント残高 12345');
 assert.equal(parsed.rows.length,2);assert.equal(parsed.rows[0].amount,'500');assert.equal(parsed.rows[1].amount,'360');assert.equal(parsed.rows[1].unit,'120');assert.equal(parsed.rows[1].quantity,'3');assert.equal(parsed.total,'860');
 const cells=receiptTsv({...form,total:'860'},parsed.rows).split('\n').map(line=>line.split('\t'));assert.match(cells[1][4],/数量：3/);assert.equal(cells[1][6],'120');
});
test('JAN receipts link standalone item amounts, normalize thousands separators and stop before payment details',()=>{
 const parsed=parseReceiptText('コーナン\n2026/09/10\n#002 JAN4900000000001\n工具 A-50\n1.200内\n§ #002 JAN4900000000002\n補修用品\n300内\n小計金額 ￥1,500\n内税小計 2 ￥1,500\nクレジット\nカード番号 12345678');
 assert.equal(parsed.rows.length,2);assert.deepEqual(parsed.rows.map(r=>r.amount),['1200','300']);assert.equal(parsed.total,'1500');assert.equal(parsed.rows[0].name,'工具 A-50');assert.equal(parsed.warnings.length,1);
});
test('unreadable item prices stay blank and do not disappear or get filled from totals',()=>{
 const parsed=parseReceiptText('ナフコ\n2026/09/10\n01 商品\n12345678 ￥o98\n01 別商品\n87654321 ￥200\n合計 ￥798');
 assert.equal(parsed.rows.length,2);assert.equal(parsed.rows[0].amount,'');assert.equal(parsed.rows[1].amount,'200');assert.match(receiptValidation({...form,total:'798'},parsed.rows,true),/税込金額/);
});
