import {test} from 'node:test';import assert from 'node:assert/strict';
import {getTaskImages,mergeTaskImages,mergePartnerImageChanges,validateTaskImageFiles,isTaskVideo,taskVideoPlaybackUrl,validateTaskVideo} from '../src/taskImages.mjs';
import {planTaskEdit} from '../src/taskEdit.mjs';
import fs from 'node:fs';import vm from 'node:vm';
const a={imageUrl:'https://example.com/a.jpg',imageName:'a',imagePublicId:'a',imageBytes:123};
const b={...a,imageUrl:'https://example.com/b.jpg',imageName:'b'};
test('legacy image and collections coexist without duplicates',()=>{
 assert.deepEqual(getTaskImages(a),[a]);assert.deepEqual(getTaskImages({...a,images:[a,b]}),[a,b]);
 assert.deepEqual(mergeTaskImages(a,[a,b]),[a,b]);assert.deepEqual(getTaskImages({}),[]);
});
test('attachment limits allow one video and reject oversize or excess images',()=>{
 const f={type:'image/jpeg',size:10*1024*1024};validateTaskImageFiles(Array(5).fill(f));
 assert.throws(()=>validateTaskImageFiles(Array(6).fill(f)),/5枚/);assert.throws(()=>validateTaskImageFiles([{...f,size:f.size+1}]),/10MB/);
 validateTaskImageFiles([{type:'video/mp4',size:20*1024*1024},...Array(5).fill(f)]);
 validateTaskImageFiles([{type:'video/mp4',size:200*1024*1024}]);
 assert.throws(()=>validateTaskImageFiles(Array(2).fill({type:'video/mp4',size:10})),/1本/);
 assert.throws(()=>validateTaskImageFiles([{type:'application/pdf',size:10}]),/画像または動画/);
});
test('task editing appends to latest images and keeps date/inventory and legacy image',()=>{
 const data={tasks:{'2026-10-14':{u:[{id:'t',...a,images:[a,b],productId:'p',inventoryDeducted:true}]}}};
 const c={...a,imageUrl:'https://example.com/c.jpg'};
 const p=planTaskEdit(data,'2026-10-14','u','t',{newImages:[c],text:'追記'});
 const task=p.teamData.tasks['2026-10-14'].u[0];assert.equal(task.images.length,3);assert.equal(task.inventoryDeducted,true);assert.equal(task.imageUrl,a.imageUrl);assert.ok(!('newImages'in task));
});
test('partial upload retry reuses uploaded images and keeps original order',async()=>{
 const source=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');const a=source.indexOf('const taskImageUploadCache =');const b=source.indexOf('const INITIAL_ROLES =',a);
 let calls=0,fail=true;const context={prepareTaskVideo:async f=>f,validateTaskImageFiles,isTaskVideo,validateTaskVideo,taskVideoPlaybackUrl,prepareInventoryImage:async x=>x,uploadTaskImageToCloudinary:async file=>{calls++;if(file.name==='b'&&fail)throw new Error('network');return {secure_url:'https://example.com/'+file.name,public_id:file.name,bytes:3}}};vm.createContext(context);vm.runInContext(source.slice(a,b)+';globalThis.upload=uploadTaskImages',context);
 const files=[{name:'a',type:'image/jpeg',size:3},{name:'b',type:'image/jpeg',size:3}];
 await assert.rejects(context.upload(files),/network/);fail=false;const images=await context.upload(files);assert.equal(calls,3);assert.equal(images[0].imageName,'a');assert.equal(images[1].imageName,'b');
});

test('partner handoff merge retains concurrent images and notes',()=>{
 const current={...a,images:[a,b],updates:[{id:'old'},{id:'concurrent'}],completed:true};
 const c={...a,imageUrl:'https://example.com/c.jpg'};
 const next=mergePartnerImageChanges(current,{images:[a,c],updates:[{id:'old'},{id:'new',images:[c]}]});
 assert.equal(next.images.length,3);assert.deepEqual(next.updates.map(x=>x.id),['old','concurrent','new']);assert.equal(next.completed,true);
});

test('video metadata and MP4 playback URL survive merge and task date changes',()=>{
 const video={imageUrl:'https://res.cloudinary.com/demo/video/upload/v1/folder/clip.mov',imageName:'clip.mov',imagePublicId:'folder/clip',imageBytes:1000,mediaType:'video',duration:12};
 const media=getTaskImages({images:[video]})[0];assert.equal(media.mediaType,'video');assert.equal(media.duration,12);assert.match(media.playbackUrl,/f_mp4,vc_h264,ac_aac/);assert.match(media.playbackUrl,/clip.mp4$/);
 const data={tasks:{'2026-10-14':{u:[{id:'t',images:[video],productId:'p',inventoryDeducted:true}]}}};
 const p=planTaskEdit(data,'2026-10-14','u','t',{targetDate:'2026-10-15',newImages:[]});
 assert.equal(p.teamData.tasks['2026-10-15'].u[0].images[0].duration,12);
 assert.equal(isTaskVideo({name:'iPhone.MOV',type:''}),true);
 assert.equal(taskVideoPlaybackUrl('https://example.com/clip.mov'),'https://example.com/clip.mov');
});
test('video uploader uses video endpoint, skips image compression and keeps audio-compatible playback metadata',async()=>{
 const source=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');const start=source.indexOf('const taskImageUploadCache =');const end=source.indexOf('const INITIAL_ROLES =',start);
 let compressed=0,calls=0;const context={prepareTaskVideo:async f=>f,validateTaskImageFiles,isTaskVideo,taskVideoPlaybackUrl,validateTaskVideo:async()=>1,prepareInventoryImage:async f=>{compressed++;return f},uploadTaskImageToCloudinary:async(file,type)=>{calls++;assert.equal(type,'video');return {secure_url:'https://res.cloudinary.com/demo/video/upload/v1/clip.mov',public_id:'clip',bytes:100,duration:1}}};vm.createContext(context);vm.runInContext(source.slice(start,end)+';globalThis.upload=uploadTaskImages',context);
 const file={name:'clip.mov',type:'video/quicktime',size:100};const media=(await context.upload([file]))[0];assert.equal(compressed,0);assert.equal(media.mediaType,'video');assert.equal(media.duration,1);assert.match(media.playbackUrl,/ac_aac/);await context.upload([file]);assert.equal(calls,1);
 context.validateTaskVideo=async()=>{throw new Error('30秒以内')};await assert.rejects(context.upload([{...file}]),/30秒/);assert.equal(calls,1);
});

test('large video is compressed before upload; upload size and ETA use the prepared file',async()=>{
 const source=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');const start=source.indexOf('const taskImageUploadCache =');const end=source.indexOf('const INITIAL_ROLES =',start);
 const original={name:'large.mov',type:'video/quicktime',size:60*1024*1024};const compressed={name:'large.mp4',type:'video/mp4',size:2*1024*1024};let calls=0;
 const context={validateTaskImageFiles,isTaskVideo,taskVideoPlaybackUrl,validateTaskVideo:async()=>30,prepareInventoryImage:async()=>{throw new Error('not image')},prepareTaskVideo:async(file,duration,progress)=>{assert.equal(file,original);assert.equal(duration,30);progress({stage:'compressing',percent:50});return compressed},uploadTaskImageToCloudinary:async(file,type,progress)=>{calls++;assert.equal(file,compressed);assert.equal(type,'video');progress({stage:'uploading',loaded:100,total:200,bytesPerSecond:100});return {secure_url:'https://example.com/large.mp4',duration:30.02,bytes:compressed.size}}};
 vm.createContext(context);vm.runInContext(source.slice(start,end)+';globalThis.upload=uploadTaskImages',context);
 const events=[];const result=await context.upload([original],e=>events.push(e));assert.equal(result[0].imageBytes,compressed.size);assert.equal(result[0].imageName,'large.mp4');assert.equal(events.find(e=>e.stage==='uploading'&&e.remainingSeconds!==null).percent,50);assert.ok(events.some(e=>e.stage==='compressing'));
 await context.upload([original]);assert.equal(calls,1);
 context.prepareTaskVideo=async()=>{throw new Error('圧縮できません')};await assert.rejects(context.upload([{...original}]),/圧縮/);assert.equal(calls,1);
});
