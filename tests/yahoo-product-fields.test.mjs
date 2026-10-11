import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yahooProductFields } from '../api/_lib/yahoo-product-fields.js';
test('separates Panasonic manufacturer and punctuated model while keeping specifications and set quantity', () => {
 const f = yahooProductFields('LDA3LHE17S2A1K パナソニック LED電球 小形電球タイプ 25W形相当 電球色 口金E17 10個セット LDA3L-H-E17/S/2A/1K', 'パルック');
 assert.equal(f.manufacturer,'パナソニック');
 assert.equal(f.modelNumber,'LDA3L-H-E17/S/2A/1K');
 assert.equal(f.productName,'LED電球 小形電球タイプ 25W形相当 電球色 口金E17 10個セット');
 assert.equal(f.brand,'パルック');
});
test('unknown brand, wattage, JAN and socket are not guessed to be manufacturer or model', () => {
 const f=yahooProductFields('LED電球 25W E17 4549980715123','パルック');
 assert.equal(f.manufacturer,''); assert.equal(f.modelNumber,'');
});
test('different models stay unparsed and punctuation remains intact', () => {
 const f=yahooProductFields('パナソニック LED電球 LDA3L-H-E17/S/2A/1K LDA5N-G/40W');
 assert.equal(f.modelNumber,''); assert.match(f.productName,/LDA5N-G\/40W/);
});
test('English manufacturer aliases and known brand evidence can be mapped', () => {
 assert.equal(yahooProductFields('Panasonic LED電球 LDA3L-H-E17/S/2A/1K').manufacturer,'パナソニック');
 assert.equal(yahooProductFields('LED電球','TOSHIBA').manufacturer,'東芝');
});
