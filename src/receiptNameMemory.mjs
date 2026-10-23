const PREFIX='receipt-product-names:v1:';
const LIMIT=300;
export function receiptNameKey(shop,code) {
 const value=String(code||'').trim();
 if(!['ナフコ','コーナン','その他'].includes(shop))return '';
 if(shop==='ナフコ' && /^\d{8}$/.test(value))return shop+':'+value;
 if(!/^\d{13}$/.test(value))return '';
 const sum=[...value.slice(0,12)].reduce((n,c,index)=>n+Number(c)*(index%2?3:1),0);
 return (10-sum%10)%10===Number(value[12]) ? shop+':'+value : '';
}
function storageKey(userId) {return typeof userId==='string' && userId.length>0 && userId.length<256 ? PREFIX+encodeURIComponent(userId) : '';}
function validEntries(names) {
 return Object.fromEntries(Object.entries(names||{}).reverse().filter(([key,value])=>{
  const split=key.lastIndexOf(':');return receiptNameKey(key.slice(0,split),key.slice(split+1))===key && typeof value?.name==='string' && value.name.trim().length>0 && value.name.length<=240;
 }).sort((a,b)=>(Number(b[1].savedAt)||0)-(Number(a[1].savedAt)||0)).slice(0,LIMIT));
}
export function loadReceiptNames(userId,storage) {
 try{
  const key=storageKey(userId);if(!key)return {};
  const parsed=JSON.parse((storage||globalThis.localStorage).getItem(key)||'null');
  return parsed?.version===1 ? validEntries(parsed.names) : {};
 }catch{return {};}
}
export function rememberReceiptName(userId,shop,code,name,storage) {
 const key=receiptNameKey(shop,code),value=String(name||'').trim();
 if(!key || !value || value.length>240 || !storageKey(userId))return {error:'有効な商品コードと商品名を確認してください。'};
 try{
  const target=storage||globalThis.localStorage,names=loadReceiptNames(userId,target);
  names[key]={name:value,savedAt:Date.now()};
  const saved=validEntries(names);target.setItem(storageKey(userId),JSON.stringify({version:1,names:saved}));
  return {names:saved};
 }catch{return {error:'このブラウザーに商品名を保存できません。修正した明細はそのままコピーできます。'};}
}
export function forgetReceiptName(userId,shop,code,storage) {
 if(!storageKey(userId))return {error:'ログインユーザーを確認してください。'};
 try{
  const target=storage||globalThis.localStorage,names=loadReceiptNames(userId,target),key=receiptNameKey(shop,code);
  delete names[key];target.setItem(storageKey(userId),JSON.stringify({version:1,names}));return {names};
 }catch{return {error:'記憶した商品名を削除できませんでした。'};}
}
export function clearReceiptNames(userId,storage) {
 try{const key=storageKey(userId);if(key)(storage||globalThis.localStorage).removeItem(key);return {names:{}};}catch{return {error:'記憶した商品名を削除できませんでした。'};}
}
export function applyReceiptNames(rows,shop,readings={},memory={}) {
 return rows.map(row=>{
  const reading=readings[row.code],originalName=row.name;
  const japaneseName=reading?.chosenName || originalName;
  const remembered=memory[receiptNameKey(shop,row.code)]?.name;
  return {...row,name:remembered||japaneseName,originalName,japaneseName,nameSource:remembered?'memory':japaneseName!==originalName?'japanese':'ocr',nameImage:reading?.image || '',japaneseCandidate:reading?.candidate || '',nameConfidence:reading?.confidence || 0,nameAlternatives:reading?.alternatives || []};
 });
}
