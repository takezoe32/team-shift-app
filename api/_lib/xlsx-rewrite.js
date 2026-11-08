// Writes text, numbers or blanks into an existing Excel workbook (xlsx/xlsm) and renames sheets, for the next
// year's files. Everything else in the package (styles, formulas, macros, drawings) is kept byte for byte; formula
// cells are never written, and their cached results can be dropped so the old year's numbers are not shown before
// the spreadsheet recalculates (fullCalcOnLoad is set).
import { Buffer } from 'node:buffer';
import { posix } from 'node:path';
import { zipPackage,xlsxCells } from './xlsx-cells.js';
const fail=(message='このExcelを安全に作成できません。元のファイルは変更していません。')=>{throw new Error(message);};
const decode=value=>String(value).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,s)=>s[0]==='#'?String.fromCodePoint(s[1].toLowerCase()==='x'?parseInt(s.slice(2),16):Number(s.slice(1))):({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[s.toLowerCase()]);
const attrs=s=>Object.fromEntries([...s.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m=>[m[1],decode(m[2]??m[3])]));
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const CELL=/<((?:\w+:)?)c\b([^>]*?)(\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;
export const columnIndex=letters=>[...letters].reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0);
export const columnName=index=>{let s='';for(let n=index;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
const split=address=>{const m=String(address).match(/^([A-Z]+)([1-9]\d*)$/);if(!m)fail();return {row:Number(m[2]),index:columnIndex(m[1])};};
const withoutType=attributes=>attributes.replace(/\s+t\s*=\s*(?:"[^"]*"|'[^']*')/g,'');
function cellXml(prefix,attributes,value){
 const base=withoutType(attributes);
 if(value===null)return `<${prefix}c${base}/>`;
 if(typeof value==='number'){if(!Number.isFinite(value))fail();return `<${prefix}c${base}><${prefix}v>${value}</${prefix}v></${prefix}c>`;}
 if(typeof value!=='string')fail();
 return `<${prefix}c${base} t="inlineStr"><${prefix}is><${prefix}t xml:space="preserve">${esc(value)}</${prefix}t></${prefix}is></${prefix}c>`;
}
const quoted=title=>"'"+String(title).replaceAll("'","''")+"'!";
// updates: [{title,address,value: number|string|null}]  renames: {old title: new title}
export function xlsxRewrite(buffer,{updates=[],renames={},dropFormulaResults=[]}={}){
 const zip=zipPackage(buffer);xlsxCells(buffer);
 const workbook=zip.get('xl/workbook.xml').toString('utf8'),rels=zip.get('xl/_rels/workbook.xml.rels').toString('utf8');
 const targets=new Map([...rels.matchAll(/<(?:\w+:)?Relationship\b([^>]*?)\/?\s*>/g)].map(m=>{const a=attrs(m[1]);if(a.TargetMode==='External')return [a.Id,null];const path=a.Target?.startsWith('/')?a.Target.slice(1):posix.normalize(posix.join('xl',a.Target||''));return [a.Id,path];}));
 const sheets=[...workbook.matchAll(/<(?:\w+:)?sheet\b([^>]*?)\/?\s*>/g)].map(m=>{const a=attrs(m[1]),path=targets.get(a['r:id']);if(!path||!zip.names.includes(path))fail();return {title:a.name,path};});
 const sheetOf=title=>sheets.find(s=>s.title===title)||fail('シート「'+title+'」が見つかりません。');
 const changes=new Map(),text=path=>(changes.get(path)||zip.get(path)).toString('utf8');
 const touched=new Set([...updates.map(u=>u.title),...dropFormulaResults]);
 for(const title of touched){
  const sheet=sheetOf(title);let source=text(sheet.path);
  const wanted=new Map(updates.filter(u=>u.title===title).map(u=>[u.address,u.value])),done=new Set(),drop=dropFormulaResults.includes(title);
  source=source.replace(CELL,(whole,prefix,attributes,_end,body='')=>{
   const a=attrs(attributes),formula=/<(?:\w+:)?f\b/.test(body);
   if(wanted.has(a.r)){if(formula)fail('数式のセル（'+title+'!'+a.r+'）は書き換えません。');done.add(a.r);return cellXml(prefix,attributes,wanted.get(a.r));}
   // A formula's cached result (the old year's number) is dropped; the formula itself stays.
   if(drop&&formula&&/<(?:\w+:)?v\b/.test(body))return `<${prefix}c${withoutType(attributes)}>${body.replace(/<(?:\w+:)?v\b[^>]*>[\s\S]*?<\/(?:\w+:)?v>|<(?:\w+:)?v\b[^>]*\/>/g,'')}</${prefix}c>`;
   return whole;
  });
  // A value for a cell that does not exist yet goes into its row, in column order (the row must exist).
  for(const [address,value] of wanted){
   if(done.has(address)||value===null)continue;
   const {row,index}=split(address),rowMatch=[...source.matchAll(/<((?:\w+:)?)row\b([^>]*?)(\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g)].find(m=>attrs(m[2]).r===String(row));
   if(!rowMatch)fail('行（'+title+'!'+row+'）がありません。');
   const prefix=rowMatch[1],inner=rowMatch[4]||'';let at=inner.length;
   for(const c of inner.matchAll(CELL)){const r=attrs(c[2]).r;if(r&&split(r).index>index){at=c.index;break;}}
   const cell=cellXml(prefix,` r="${address}"`,value),open=`<${prefix}row${rowMatch[2].replace(/\s+spans\s*=\s*"[^"]*"/,'')}>`;
   source=source.slice(0,rowMatch.index)+open+inner.slice(0,at)+cell+inner.slice(at)+`</${prefix}row>`+source.slice(rowMatch.index+rowMatch[0].length);
  }
  changes.set(sheet.path,Buffer.from(source));
 }
 let book=workbook;
 for(const [from,to] of Object.entries(renames)){
  sheetOf(from);if(!to||sheets.some(s=>s.title===to)||/[\\/?*[\]:]/.test(to)||to.length>31)fail('シート名「'+to+'」にできません。');
  const tag=[...book.matchAll(/<(?:\w+:)?sheet\b[^>]*>/g)].map(m=>m[0]).filter(t=>attrs(t).name===from);if(tag.length!==1)fail();
  book=book.replace(tag[0],tag[0].replace(/\bname\s*=\s*(?:"[^"]*"|'[^']*')/,`name="${esc(to)}"`)).split(esc(quoted(from))).join(esc(quoted(to)));
  // Formulas and the document properties that name the sheet.
  for(const s of sheets){const source=text(s.path);if(source.includes(esc(quoted(from))))changes.set(s.path,Buffer.from(source.split(esc(quoted(from))).join(esc(quoted(to)))));}
  if(zip.names.includes('docProps/app.xml')){const app=text('docProps/app.xml');changes.set('docProps/app.xml',Buffer.from(app.split('>'+esc(from)+'<').join('>'+esc(to)+'<')));}
 }
 const calc=/<(?:\w+:)?calcPr\b[^>]*\/>/,match=book.match(calc);
 if(match)book=book.replace(calc,match[0].replace(/\s(?:fullCalcOnLoad|forceFullCalc|calcMode)\s*=\s*(?:"[^"]*"|'[^']*')/g,'').replace(/\/>$/,' calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/>'));
 else{
  // calcPr comes right after definedNames (or sheets) in the workbook schema.
  const after=book.match(/<\/((?:\w+:)?)definedNames>/)||book.match(/<\/((?:\w+:)?)sheets>/);if(!after)fail();
  book=book.replace(after[0],after[0]+`<${after[1]}calcPr fullCalcOnLoad="1"/>`);
 }
 changes.set('xl/workbook.xml',Buffer.from(book));
 const result=zip.replace(changes),check=xlsxCells(result);
 for(const [from,to] of Object.entries(renames))if(check.titles.includes(from)||!check.titles.includes(to))fail();
 const titleNow=title=>renames[title]||title;
 for(const u of updates)if(check.get(titleNow(u.title),u.address).value!==u.value)fail('書き込んだ値を確認できませんでした（'+u.title+'!'+u.address+'）。');
 return result;
}
