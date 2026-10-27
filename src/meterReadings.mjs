export const METER_FILE_ID = '1Kt-cUPgl5qt5eMzCMPljymBO3YnGIv8y';
export const METER_URL = `https://docs.google.com/spreadsheets/d/${METER_FILE_ID}/edit`;
export const METER_YEAR = 2026;
export const METER_GROUPS = {
 main: [
 ['電気', [['electric-reading','検針値','D'],['electric-demand','デマンド','F']]],
 ['ガス（本館・バンケット）', [['gas-main','本館系統 検針値','H'],['gas-banquet','バンケット系統 検針値','J']]],
 ['水道', [['water-hotel','ホテル系統 検針値','L'],['water-banquet','バンケット 検針値','N']]],
 ['給湯', [['hot-water','検針値','P']]],
 ['ガス（ボイラー・新厨房）', [['gas-boiler','ボイラー 検針値','R'],['gas-kitchen','新厨房 検針値','T']]]],
 h: [
 ['電気', [['h-light','電灯 検針値','D'],['h-power','動力 検針値','F']]],
 ['水道', [['h-water','検針値','H']]],
 ['貯湯槽', [['tank-1','No.1 温度','J','℃'],['tank-2','No.2 温度','K','℃']]],
 ['大浴場 塩素', [['bath-female','女性','L'],['bath-male','男性','M']]],
 ['水風呂 塩素', [['cold-female','女性','N'],['cold-male','男性','O']]],
 ['給湯配管気泡', [['bubble-8f','8F','P'],['bubble-roof','屋上弁','Q']]]]
};
export const METER_FIELDS = Object.entries(METER_GROUPS).flatMap(([section,groups])=>groups.flatMap(([group,fields])=>fields.map(([id,label,column,unit=''])=>({id,section,group,label,column,unit}))));
export function meterDate(date) {
 if (!/^\d{4}-\d{2}-\d{2}$/.test(date||'')) throw new Error('有効な検針日を選んでください。');
 const [year,month,day]=date.split('-').map(Number), d=new Date(Date.UTC(year,month-1,day));
 if(year!==METER_YEAR||d.toISOString().slice(0,10)!==date) throw new Error('この原本の対象は2026年です。2026年の日付を選んでください。');
 return {year,month,day};
}
export function previousMeterDate(date){const {year,month,day}=meterDate(date);return new Date(Date.UTC(year,month-1,day-1)).toISOString().slice(0,10);}
export function meterSheet(titles,section,month){
 const matches=titles.filter(title=>{const n=title.normalize('NFKC').trim().toUpperCase();return section==='main'?/^\d{1,2}$/.test(n)&&Number(n)===month:/^H-\d{1,2}$/.test(n)&&Number(n.slice(2))===month;});
 if(matches.length!==1)throw new Error(`${section==='h'?'H-':''}${month}のシートを一意に確認できません。原本のタブ名を確認してください。`);
 return matches[0];
}
export const meterRow=(section,day)=>day+(section==='main'?8:10);
export const meterNumber=value=>{const text=String(value??'').normalize('NFKC').trim();return /^-?\d+(?:\.\d+)?$/.test(text)&&Number.isFinite(Number(text))&&Math.abs(Number(text))<=1e12?Number(text):null;};
export function meterDifference(current,previous,unit=''){
 const a=meterNumber(current),b=meterNumber(previous);if(a===null||b===null)return null;
 const delta=Number((a-b).toFixed(8));return {delta,text:(delta>0?'＋':delta<0?'−':'±')+Math.abs(delta).toLocaleString('ja-JP',{maximumFractionDigits:8})+(unit?' '+unit:'')};
}
export function meterChanges(values,baseline){
 if(!values||typeof values!=='object'||Array.isArray(values))throw new Error('入力内容を確認してください。');
 if(Object.keys(values).some(id=>!METER_FIELDS.some(f=>f.id===id)))throw new Error('更新できない項目が含まれています。');
 const changes={};for(const f of METER_FIELDS){const raw=values[f.id];if(raw===undefined||String(raw)===String(baseline[f.id]??''))continue;if(String(raw).trim()===''&&baseline[f.id]==null)continue;const n=meterNumber(raw);if(n===null)throw new Error(`${f.group}／${f.label}は数値を入力してください。登録済みの値は空欄にできません。`);if(n!==baseline[f.id])changes[f.id]=n;}return changes;
}
