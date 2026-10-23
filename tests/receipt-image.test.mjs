import {test} from 'node:test';
import assert from 'node:assert/strict';
import {detectReceiptBounds,enhanceReceiptPixels} from '../src/receiptImage.mjs';
import {receiptFocusRectangle} from '../src/receiptOcr.mjs';
test('white receipt is isolated from colored background without a fixed image layout',()=>{
 const width=120,height=160,data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4,inside=x>=30&&x<90&&y>=25;data.set(inside?[220,222,224,255]:[150,70,35,255],i);}
 const result=detectReceiptBounds({data,width,height});assert.ok(result.left>=30 && result.left<=35);assert.ok(result.right>=85 && result.right<=90);assert.ok(result.top>=15 && result.top<=25);assert.equal(result.bottom,160);
});
test('uncertain paper detection preserves the full image and enhancement changes pixels only',()=>{
 const width=40,height=40,data=new Uint8ClampedArray(width*height*4).fill(255);
 assert.deepEqual(detectReceiptBounds({data,width,height}),{left:0,right:40,top:0,bottom:40});
 const image={data:new Uint8ClampedArray([20,40,60,255,200,210,220,255])};
 const result=enhanceReceiptPixels(image);assert.equal(result.data[0],result.data[1]);assert.equal(result.data[4],result.data[6]);assert.equal(result.data[3],255);
});
test('second pass finds merchant to total using OCR positions, not receipt-specific coordinates',()=>{
 const tsv=['5\t1\t1\t1\t1\t1\t0\t300\t100\t50\t90\t株式会社','5\t1\t1\t1\t2\t1\t0\t1400\t100\t50\t90\t合計'].join('\n');
 const rect=receiptFocusRectangle(tsv,600,3000);assert.equal(rect.top,255);assert.equal(rect.width,600);assert.ok(rect.height>1200);
 assert.equal(receiptFocusRectangle('',600,3000),null);
});
import {receiptPriceWords,selectReceiptReading} from '../src/receiptOcr.mjs';
test('numeric refinement selects isolated right-side prices, excluding codes and quantities',()=>{
 const tsv=[
 '5\t1\t1\t1\t1\t1\t10\t200\t100\t20\t90\t4900000000001',
 '5\t1\t1\t1\t2\t1\t400\t300\t70\t20\t90\t1.200',
 '5\t1\t1\t1\t2\t2\t470\t300\t20\t20\t90\t内',
 '5\t1\t1\t1\t3\t1\t20\t400\t20\t20\t90\t3',
 '5\t1\t1\t1\t3\t2\t50\t400\t20\t20\t90\t内'
 ].join('\n');
 const prices=receiptPriceWords(tsv,600);assert.equal(prices.length,1);assert.equal(prices[0].text,'1.200');assert.equal(prices[0].right,466);
});
test('multiple OCR passes prefer complete independently balanced readings without inventing missing values',()=>{
 const incomplete={text:'ナフコ\n2026/9/10\n01 商品\n12345678 ￥o00\n合計 ￥500'};
 const complete={text:'ナフコ\n2026/9/10\n01 商品\n12345678 ￥500\n合計 ￥500'};
 assert.equal(selectReceiptReading([complete,incomplete]),complete);
});
