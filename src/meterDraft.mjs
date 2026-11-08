// Unsaved meter values kept on this device (localStorage) until they are saved to the original book.
// If the screen closes or reloads before 「原本に保存する」, reopening the same day (or month) brings them back.
// Each value remembers what the original showed when it was typed (base): if the original has changed since
// (someone saved from another device), that value is not restored, so it never overwrites a newer save.
export const METER_DRAFT_PREFIX = 'teamshift-meter-draft:v1:';
export const METER_DRAFT_DAYS = 14;
const DAY = 86400000;
export const meterDraftKey = (uid,kind,date) => METER_DRAFT_PREFIX+[uid,kind==='monthly'?'monthly':'daily',date].map(encodeURIComponent).join(':');
const text = v => v===null||v===undefined?'':String(v);
// The typed values that differ from the original (fields: the screen's items; formulas are never typed).
export function meterDraftEntries(values,snapshot,fields){
 const entries={};
 for(const f of fields){const v=values?.[f.id];if(typeof v!=='string'||snapshot?.formulas?.[f.id])continue;const base=text(snapshot?.current?.[f.id]);if(v.trim()===''&&base==='')continue;if(v!==base)entries[f.id]={value:v,base};}
 return entries;
}
const read = (storage,key) => {try{const d=JSON.parse(storage.getItem(key)||'null');return d&&typeof d==='object'&&d.entries&&typeof d.entries==='object'?d:null;}catch{return null;}};
// Writes the draft (or removes it when nothing is left unsaved). Storage errors (private mode, full) are ignored.
export function storeMeterDraft(storage,key,values,snapshot,fields,now=Date.now()){
 if(!storage||!key||!snapshot)return;
 const entries=meterDraftEntries(values,snapshot,fields);
 try{if(Object.keys(entries).length)storage.setItem(key,JSON.stringify({savedAt:now,entries}));else storage.removeItem(key);}catch{ /* The draft is a convenience only. */ }
}
// The values to put back on the screen: only where the original still shows what it showed when they were typed.
export function restoreMeterDraft(storage,key,snapshot,fields){
 if(!storage||!key||!snapshot)return {};
 const d=read(storage,key);if(!d)return {};
 const restored={};
 for(const f of fields){const e=d.entries[f.id];if(!e||typeof e.value!=='string'||typeof e.base!=='string'||snapshot.formulas?.[f.id])continue;const now=text(snapshot.current?.[f.id]);if(now!==e.base||e.value===now)continue;restored[f.id]=e.value;}
 return restored;
}
export function clearMeterDraft(storage,key){try{storage?.removeItem(key);}catch{ /* ignore */ }}
// Drafts older than METER_DRAFT_DAYS are dropped so old days do not pile up on the phone.
export function pruneMeterDrafts(storage,now=Date.now()){
 try{
  const old=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(!key?.startsWith(METER_DRAFT_PREFIX))continue;const d=read(storage,key);if(!d||!(now-Number(d.savedAt)<METER_DRAFT_DAYS*DAY))old.push(key);}
  for(const key of old)storage.removeItem(key);
 }catch{ /* ignore */ }
}
export const browserStorage = () => {try{return globalThis.localStorage||null;}catch{return null;}};
