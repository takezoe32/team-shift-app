export function receiptNameRegions(tsv,width,height) {
 const map=new Map();
 for(const row of String(tsv||'').split(/\r?\n/)){
  const c=row.split('\t');if(c[0]!=='5'||!c[11]?.trim())continue;
  const key=c.slice(1,5).join('-');if(!map.has(key))map.set(key,[]);
  map.get(key).push({text:c[11],left:+c[6],top:+c[7],right:+c[6]+ +c[8],bottom:+c[7]+ +c[9]});
 }
 const lines=[...map.values()].map(words=>({words,text:words.map(w=>w.text).join('')})).sort((a,b)=>Math.min(...a.words.map(w=>w.top))-Math.min(...b.words.map(w=>w.top)));
 const regions=[];
 for(let i=0;i<lines.length;i++){
  const jan=lines[i].text.match(/JAN(\d{13})(?!\d)/i),sku=lines[i].text.match(/^(\d{8})(?:[¥￥\\]|単価|$)/);
  if(!jan&&!sku)continue;
  const line=lines[i+(jan?1:-1)];if(!line || /JAN|単価|合計|^\d[\d,.]*内/.test(line.text))continue;
  const words=line.words.filter(w=>w.left>width*.035 && /[\p{L}\p{N}]/u.test(w.text));
  if(!words.length)continue;
  const left=Math.max(sku?width*.13:0,Math.min(...words.map(w=>w.left))-3),right=Math.min(width,Math.max(...words.map(w=>w.right))+3);
  const top=Math.max(0,Math.min(...words.map(w=>w.top))-3),bottom=Math.min(height,Math.max(...words.map(w=>w.bottom))+3,sku?Math.min(...lines[i].words.map(w=>w.top))-2:height);
  if(right-left<width*.12 || bottom-top<5 || bottom-top>height*.12)continue;
  regions.push({code:(jan||sku)[1],left,right,top,bottom,stripDepartment:!jan});
 }
 return regions;
}
export function chooseReceiptName(original,candidate,confidence) {
 const value=String(candidate||'').normalize('NFKC').replace(/\s*\n\s*/g,' ').trim();
 const japanese=text=>(text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu)||[]).length;
 if(confidence<45 || value.length<3 || value.length>240 || japanese(value)<2)return original;
 const letters=(String(original).match(/\p{L}/gu)||[]).length;
 if(japanese(original)>=2 && japanese(original)/Math.max(1,letters)>=.5)return original;
 // Keep a usable previous reading if rereading loses most of its Japanese text.
 return japanese(value)>=japanese(original)*.7 ? value : original;
}
export function cleanReceiptName(text) {
 return String(text||'').normalize('NFKC').replace(/\s*\n\s*/g,' ').replace(/^[|「]+/,'').trim();
}
const nameToken=text=>cleanReceiptName(text).replace(/\s/g,'');
function nameDistance(a,b) {
 let previous=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=0;i<a.length;i++){const next=[i+1];for(let j=0;j<b.length;j++)next[j+1]=Math.min(next[j]+1,previous[j+1]+1,previous[j]+(a[i]===b[j]?0:1));previous=next;}
 return previous[b.length];
}
export function selectReceiptNameCandidates(original,readings) {
 const groups=new Map();
 for(const reading of readings){
  const text=cleanReceiptName(reading.text);if(text.length<3 || text.length>240 || reading.confidence<40)continue;
  const key=nameToken(text);if(!groups.has(key))groups.set(key,{...reading,text,modes:new Set(),confidence:0});
  const group=groups.get(key);group.modes.add(reading.mode);if(reading.confidence>group.confidence){group.confidence=reading.confidence;group.text=text;}
 }
 const candidates=[...groups.values()].map(c=>({...c,support:c.modes.size,score:c.confidence+(c.modes.size>1?20:0)+(c.mode==='13'?10:0)+(/#\s*\d/.test(c.text)?20:0)})).sort((a,b)=>b.score-a.score);
 const primary=candidates[0];if(!primary)return {chosenName:original,alternatives:[]};
 let chosenName=chooseReceiptName(original,primary.text,primary.confidence);
 const before=nameToken(original),after=nameToken(primary.text);
 const sameNumbers=JSON.stringify(before.match(/\d+/g)||[])===JSON.stringify(after.match(/\d+/g)||[]);
 // Two segmentation modes agreeing on a small spelling change can correct a
 // readable name. Never use this to change a model number or specification.
 if(primary.support>1 && primary.confidence>=60 && sameNumbers && nameDistance(before,after)<=2)chosenName=primary.text;
 if(primary.language==='eng' && primary.confidence>=50 && (original.match(/[A-Za-z]/g)||[]).length>Math.max(3,(original.match(/[\p{Script=Han}\p{Script=Katakana}]/gu)||[]).length*2))chosenName=primary.text;
 return {chosenName,candidate:primary.text,confidence:primary.confidence,alternatives:candidates.slice(0,4).map(({text,confidence})=>({text,confidence}))};
}
