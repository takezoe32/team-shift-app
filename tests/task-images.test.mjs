import {test} from 'node:test';import assert from 'node:assert/strict';
import {getTaskImages,mergeTaskImages,mergePartnerImageChanges,validateTaskImageFiles} from '../src/taskImages.mjs';
import {planTaskEdit} from '../src/taskEdit.mjs';
import fs from 'node:fs';import vm from 'node:vm';
const a={imageUrl:'https://example.com/a.jpg',imageName:'a',imagePublicId:'a',imageBytes:123};
const b={...a,imageUrl:'https://example.com/b.jpg',imageName:'b'};
test('legacy image and collections coexist without duplicates',()=>{
 assert.deepEqual(getTaskImages(a),[a]);assert.deepEqual(getTaskImages({...a,images:[a,b]}),[a,b]);
 assert.deepEqual(mergeTaskImages(a,[a,b]),[a,b]);assert.deepEqual(getTaskImages({}),[]);
});
test('image limits reject video, oversized files and more than five images',()=>{
 const f={type:'image/jpeg',size:10*1024*1024};validateTaskImageFiles(Array(5).fill(f));
 assert.throws(()=>validateTaskImageFiles(Array(6).fill(f)),/5枚/);assert.throws(()=>validateTaskImageFiles([{...f,size:f.size+1}]),/10MB/);
 assert.throws(()=>validateTaskImageFiles([{type:'video/mp4',size:10}]),/動画/);
});
test('task editing appends to latest images and keeps date/inventory and legacy image',()=>{
 const data={tasks:{'2026-10-14':{u:[{id:'t',...a,images:[a,b],productId:'p',inventoryDeducted:true}]}}};
 const c={...a,imageUrl:'https://example.com/c.jpg'};
 const p=planTaskEdit(data,'2026-10-14','u','t',{newImages:[c],text:'追記'});
 const task=p.teamData.tasks['2026-10-14'].u[0];assert.equal(task.images.length,3);assert.equal(task.inventoryDeducted,true);assert.equal(task.imageUrl,a.imageUrl);assert.ok(!('newImages'in task));
});
test('partial upload retry reuses uploaded images and keeps original order',async()=>{
 const source=fs.readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');const a=source.indexOf('const taskImageUploadCache =');const b=source.indexOf('const INITIAL_ROLES =',a);
 let calls=0,fail=true;const context={validateTaskImageFiles,prepareInventoryImage:async x=>x,uploadTaskImageToCloudinary:async file=>{calls++;if(file.name==='b'&&fail)throw new Error('network');return {secure_url:'https://example.com/'+file.name,public_id:file.name,bytes:3}}};vm.createContext(context);vm.runInContext(source.slice(a,b)+';globalThis.upload=uploadTaskImages',context);
 const files=[{name:'a',type:'image/jpeg',size:3},{name:'b',type:'image/jpeg',size:3}];
 await assert.rejects(context.upload(files),/network/);fail=false;const images=await context.upload(files);assert.equal(calls,3);assert.equal(images[0].imageName,'a');assert.equal(images[1].imageName,'b');
});

test('partner handoff merge retains concurrent images and notes',()=>{
 const current={...a,images:[a,b],updates:[{id:'old'},{id:'concurrent'}],completed:true};
 const c={...a,imageUrl:'https://example.com/c.jpg'};
 const next=mergePartnerImageChanges(current,{images:[a,c],updates:[{id:'old'},{id:'new',images:[c]}]});
 assert.equal(next.images.length,3);assert.deepEqual(next.updates.map(x=>x.id),['old','concurrent','new']);assert.equal(next.completed,true);
});
