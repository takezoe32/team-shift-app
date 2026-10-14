import {test} from 'node:test';import assert from 'node:assert/strict';
import {createUploadEstimator,uploadWithProgress} from '../src/uploadProgress.mjs';
test('ETA waits for speed samples, then reacts to measured throughput without claiming saved',()=>{
 let time=0;const estimate=createUploadEstimator(()=>time);
 time=500;assert.equal(estimate(50,1000).remainingSeconds,null);
 time=1000;const first=estimate(100,1000);assert.equal(first.percent,10);assert.equal(first.remainingSeconds,9);
 time=3000;assert.equal(estimate(600,1000).remainingSeconds,2);
 time=10000;const slowed=estimate(700,1000);assert.ok(slowed.remainingSeconds>2);
 time=11000;const done=estimate(1000,1000);assert.equal(done.percent,100);assert.equal(done.stage,'uploading');assert.equal(done.remainingSeconds,0);
 assert.equal(estimate(1000,0).percent,null);
});
function mockRequest() {
 const listeners={};const xhr={status:200,response:{secure_url:'https://example.com/video'},upload:{addEventListener:(name,callback)=>{listeners[name]=callback}},open(){},send(){},listeners};return xhr;
}
test('transport distinguishes byte progress, server processing and HTTP response',async()=>{
 const xhr=mockRequest(),events=[];const promise=uploadWithProgress('https://example.com/upload',{},e=>events.push(e),()=>xhr);
 xhr.listeners.progress({loaded:25,total:100,lengthComputable:true});assert.equal(events[0].percent,25);
 xhr.listeners.load();assert.equal(events[1].stage,'processing');
 xhr.onload();assert.equal((await promise).ok,true);assert.ok(!events.some(e=>e.stage==='done'));
});
test('network, timeout and invalid responses fail; provider errors remain available',async()=>{
 for(const event of ['onerror','ontimeout','onabort']){const xhr=mockRequest();const promise=uploadWithProgress('url',{},()=>{},()=>xhr);xhr[event]();await assert.rejects(promise);}
 const xhr=mockRequest();xhr.status=400;xhr.response={error:{message:'format not allowed'}};const promise=uploadWithProgress('url',{},()=>{},()=>xhr);xhr.onload();assert.equal((await promise).ok,false);
 const malformed=mockRequest();malformed.response=null;const invalid=uploadWithProgress('url',{},()=>{},()=>malformed);malformed.onload();await assert.rejects(invalid,/応答/);
});
