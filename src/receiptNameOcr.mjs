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
  const left=Math.max(0,Math.min(...words.map(w=>w.left))-3),right=Math.min(width,Math.max(...words.map(w=>w.right))+3);
  const top=Math.max(0,Math.min(...words.map(w=>w.top))-3),bottom=Math.min(height,Math.max(...words.map(w=>w.bottom))+3);
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
