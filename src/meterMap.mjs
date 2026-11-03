import { METER_FIELDS } from './meterReadings.mjs';
export const METER_MAP_ID='hotel-1f-20261103';
export function canManageMeterMap(user,roles={}){return !!user&&(user.role==='admin'||Number(roles[user.role]?.level)>=40);}
export function validateMeterPoints(points){
 if(!Array.isArray(points)||points.length>100)throw new Error('配置データを確認してください。');
 const numbers=new Set(),fields=new Set();
 return points.map(p=>{
  if(!p||!Number.isInteger(p.n)||p.n<1||p.n>999||numbers.has(p.n)||typeof p.name!=='string'||!p.name.trim()||p.name.length>60||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1||!Array.isArray(p.fields)||!p.fields.length)throw new Error('番号・場所・検針項目を確認してください。');
  numbers.add(p.n);
  for(const id of p.fields){if(!METER_FIELDS.some(f=>f.id===id)||fields.has(id))throw new Error('検針項目が不正、または重複しています。');fields.add(id);}
  return {n:p.n,name:p.name.trim(),x:p.x,y:p.y,fields:[...p.fields]};
 }).sort((a,b)=>a.n-b.n);
}
