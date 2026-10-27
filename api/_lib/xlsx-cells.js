import { Buffer } from 'node:buffer';
import { inflateRawSync,deflateRawSync } from 'node:zlib';
import { posix } from 'node:path';
import { createHash } from 'node:crypto';
const fail=()=>{throw new Error('このExcelの内部形式を安全に処理できません。原本は変更していません。');};
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
const crc32=b=>{let c=0xffffffff;for(const n of b)c=crcTable[(c^n)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
export function zipPackage(input){
 const bytes=Buffer.from(input);if(bytes.length<22||bytes.length>5*1024*1024)fail();
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50&&i+22+bytes.readUInt16LE(i+20)===bytes.length){end=i;break;}
 if(end<0||bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6))fail();
 const count=bytes.readUInt16LE(end+10),cdOffset=bytes.readUInt32LE(end+16),cdSize=bytes.readUInt32LE(end+12);
 if(count===65535||count>3000||cdOffset+cdSize!==end)fail();
 let offset=cdOffset,total=0;const entries=[],byName=new Map();
 for(let i=0;i<count;i++){
  if(offset+46>end||bytes.readUInt32LE(offset)!==0x02014b50)fail();
  const length=46+bytes.readUInt16LE(offset+28)+bytes.readUInt16LE(offset+30)+bytes.readUInt16LE(offset+32);if(offset+length>end)fail();
  const central=bytes.subarray(offset,offset+length),name=central.subarray(46,46+central.readUInt16LE(28)).toString('utf8'),start=central.readUInt32LE(42),compressed=central.readUInt32LE(20),size=central.readUInt32LE(24),method=central.readUInt16LE(10);
  if(byName.has(name)||start+30>cdOffset||bytes.readUInt32LE(start)!==0x04034b50||(central.readUInt16LE(8)&1)||![0,8].includes(method)||size===0xffffffff||compressed===0xffffffff)fail();
  const dataStart=start+30+bytes.readUInt16LE(start+26)+bytes.readUInt16LE(start+28);if(dataStart+compressed>cdOffset||size>16*1024*1024)fail();total+=size;if(total>64*1024*1024)fail();
  const entry={name,start,dataStart,compressed,size,method,central};entries.push(entry);byName.set(name,entry);offset+=length;
 }
 if(offset!==end)fail();const sorted=[...entries].sort((a,b)=>a.start-b.start);
 for(let i=0;i<sorted.length;i++){const e=sorted[i],next=sorted[i+1]?.start??cdOffset;if(e.dataStart+e.compressed>next)fail();e.local=bytes.subarray(e.start,next);}
 const get=name=>{const e=byName.get(name);if(!e)fail();const raw=bytes.subarray(e.dataStart,e.dataStart+e.compressed),content=e.method===8?inflateRawSync(raw,{maxOutputLength:16*1024*1024}):raw;if(content.length!==e.size||crc32(content)!==e.central.readUInt32LE(16))fail();return content;};
 return {names:entries.map(e=>e.name),get,
  replace(changes){for(const name of changes.keys())if(!byName.has(name))fail();const locals=[],centrals=[];let cursor=0;
   for(const e of sorted){const central=Buffer.from(e.central);central.writeUInt32LE(cursor,42);let local=e.local;
    if(changes.has(e.name)){const data=Buffer.from(changes.get(e.name)),packed=e.method===8?deflateRawSync(data):data,header=Buffer.from(e.local.subarray(0,e.dataStart-e.start));const crc=crc32(data);header.writeUInt16LE(header.readUInt16LE(6)&~8,6);header.writeUInt32LE(crc,14);header.writeUInt32LE(packed.length,18);header.writeUInt32LE(data.length,22);central.writeUInt16LE(central.readUInt16LE(8)&~8,8);central.writeUInt32LE(crc,16);central.writeUInt32LE(packed.length,20);central.writeUInt32LE(data.length,24);local=Buffer.concat([header,packed]);}
    locals.push(local);centrals.push(central);cursor+=local.length;
   }
   const directory=Buffer.concat(centrals),tail=Buffer.from(bytes.subarray(end));tail.writeUInt32LE(directory.length,12);tail.writeUInt32LE(cursor,16);return Buffer.concat([...locals,directory,tail]);
  }
 };
}
const decode=value=>String(value).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,s)=>s[0]==='#'?String.fromCodePoint(s[1].toLowerCase()==='x'?parseInt(s.slice(2),16):Number(s.slice(1))):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[s.toLowerCase()]);
const xml=buffer=>{const s=buffer.toString('utf8');if(/<!DOCTYPE|<!ENTITY/i.test(s))fail();return s;};
const attrs=s=>Object.fromEntries([...s.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m=>[m[1],decode(m[2]??m[3])]));
const texts=s=>[...s.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map(m=>decode(m[1])).join('');
const cells=s=>[...s.matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)];
export function xlsxCells(buffer){
 const zip=zipPackage(buffer),workbook=xml(zip.get('xl/workbook.xml')),rels=xml(zip.get('xl/_rels/workbook.xml.rels'));
 const relationships=new Map([...rels.matchAll(/<(?:\w+:)?Relationship\b([^>]*?)\/?\s*>/g)].map(m=>{const a=attrs(m[1]);if(a.TargetMode==='External')return [a.Id,null];const path=a.Target?.startsWith('/')?a.Target.slice(1):posix.normalize(posix.join('xl',a.Target||''));if(!path.startsWith('xl/')||path.includes('..'))fail();return [a.Id,path];}));
 const sheets=[...workbook.matchAll(/<(?:\w+:)?sheet\b([^>]*?)\/?\s*>/g)].map(m=>{const a=attrs(m[1]),path=relationships.get(a['r:id']);if(!path)fail();return {title:a.name,path};});
 const shared=zip.names.includes('xl/sharedStrings.xml')?[...xml(zip.get('xl/sharedStrings.xml')).matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)].map(m=>texts(m[1])):[];
 const caches=new Map();
 const load=title=>{const sheet=sheets.find(s=>s.title===title);if(!sheet)fail();if(!caches.has(title)){const source=xml(zip.get(sheet.path)),map=new Map();for(const m of cells(source)){const a=attrs(m[1]);if(!/^[A-Z]+[1-9]\d*$/.test(a.r)||map.has(a.r))fail();const body=m[2]||'',v=body.match(/<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/)?.[1],formula=/<(?:\w+:)?f\b/.test(body);let value=null;if(a.t==='s')value=shared[Number(v)]??null;else if(a.t==='inlineStr')value=texts(body);else if(a.t==='str')value=decode(v??'');else if(!a.t||a.t==='n'){if(v!==undefined&&v.trim()!==''&&Number.isFinite(Number(v)))value=Number(v);}map.set(a.r,{value,formula,attributes:a,match:m});}caches.set(title,{sheet,source,map});}return caches.get(title);};
 return {titles:sheets.map(s=>s.title),hash:createHash('sha256').update(buffer).digest('hex'),get:(title,address)=>load(title).map.get(address)||{value:null,formula:false},
  patch(updates){const changes=new Map();for(const title of [...new Set(updates.map(u=>u.title))]){const {sheet,source,map}=load(title),wanted=new Map(updates.filter(u=>u.title===title).map(u=>[u.address,u.value]));let replaced=0;const patched=source.replace(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g,(whole,attributes,body='')=>{const a=attrs(attributes);if(!wanted.has(a.r))return whole;const cell=map.get(a.r),n=wanted.get(a.r);if(cell.formula||typeof n!=='number'||!Number.isFinite(n)||(cell.value!==null&&typeof cell.value!=='number')||(a.t&&a.t!=='n'))fail();if(/<(?:\w+:)?is\b/.test(body))fail();replaced++;const prefix=whole.match(/^<(\w+:)?c\b/)[1]||'',clean=body.replace(/<(?:\w+:)?v\b[^>]*>[\s\S]*?<\/(?:\w+:)?v>/g,'');return `<${prefix}c${attributes}><${prefix}v>${n}</${prefix}v>${clean}</${prefix}c>`;});if(replaced!==wanted.size)fail();changes.set(sheet.path,Buffer.from(patched));}
   // Keep every formula and all styles; ask the spreadsheet engine to recalculate on open.
   const calc=/<(?:\w+:)?calcPr\b[^>]*\/>/;const match=workbook.match(calc);if(match){const tag=match[0].replace(/\s(?:fullCalcOnLoad|forceFullCalc|calcMode)\s*=\s*(?:"[^"]*"|'[^']*')/g,'').replace(/\/>$/,' calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>');changes.set('xl/workbook.xml',Buffer.from(workbook.replace(calc,tag)));}else fail();
   const result=zip.replace(changes),check=xlsxCells(result);for(const u of updates)if(check.get(u.title,u.address).value!==u.value)fail();return result;
  }
 };
}
