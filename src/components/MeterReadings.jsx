import { useEffect,useRef,useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import DateInput from './DateInput';
import { useEditGuard,confirmEditDiscard } from '../editGuard';
import { japanToday } from '../japanTime.mjs';
import { METER_FIELDS,canAccessMeters,meterChanges,meterDifference } from '../meterReadings.mjs';
import { meterFrameBox } from '../meterFrame.mjs';
import { meterUsageLimits } from '../meterUsageLimits.mjs';
import { meterDraftKey,storeMeterDraft,restoreMeterDraft,clearMeterDraft,pruneMeterDrafts,browserStorage } from '../meterDraft.mjs';
import { MONTHLY_INPUT_FIELDS,monthlyChanges,monthlyTransfers,monthlySourceText,previousMonth } from '../meterMonthly.mjs';
const control='min-h-11 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-800 disabled:opacity-50';
const primary=control+' bg-blue-600! text-white! border-blue-600!';
const monthName=month=>Number(month.slice(5,7))+'月度';
const MONTHS=Array.from({length:12},(_,i)=>'2026-'+String(i+1).padStart(2,'0'));
// The monthly items on the map: only the meters that the daily book does not have (the rest is transferred on save).
const MONTHLY_MAP_FIELDS=MONTHLY_INPUT_FIELDS.map(f=>({id:f.id,group:f.group,label:f.label,unit:f.unit}));
const USAGE_LIMITS=meterUsageLimits();
const showNumber=(value,unit='')=>value===null||value===undefined?'未記録':Number(value).toLocaleString('ja-JP',{maximumFractionDigits:8})+(unit?' '+unit:'');
// kind="monthly" is the 毎月検針 (monthly book); the default is the 毎朝検針.
export default function MeterReadings({currentUser,kind='daily'}){
 return canAccessMeters(currentUser)?<MeterReadingsForm currentUser={currentUser} kind={kind}/>:<p role="alert" className="p-6 text-sm text-gray-600">検針はplandosee.co.jpのアカウントのみ利用できます。</p>;
}
function MeterReadingsForm({currentUser,kind}){
 const monthly=kind==='monthly',fields=monthly?MONTHLY_INPUT_FIELDS:METER_FIELDS,today=()=>monthly?japanToday().slice(0,7):japanToday();
 const [date,setDate]=useState(today),[snapshot,setSnapshot]=useState(null),[values,setValues]=useState({}),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[verify,setVerify]=useState(false),[refresh,setRefresh]=useState(0),[review,setReview]=useState(false);
 const mapFrame=useRef(null),workspace=useRef(null);
 const [frameBox,setFrameBox]=useState({top:64,height:'calc(100dvh - 140px)'});
 useEffect(()=>{
  const root=workspace.current,header=root?.previousElementSibling,nav=document.querySelector('nav[aria-label="メインメニュー"]');
  window.scrollTo(0,0);
  // While the keyboard is open the workspace fits above it; the map page keeps its own size and scrolls inside itself.
  let sizing={};
  const fit=()=>{const vv=window.visualViewport,navRect=nav?.getBoundingClientRect();sizing=meterFrameBox(sizing,{width:vv?.width||window.innerWidth,height:vv?.height||window.innerHeight,offsetTop:vv?.offsetTop||0,headerBottom:header?.getBoundingClientRect().bottom||0,navHeight:navRect?.height||0,navTop:navRect?navRect.top:Infinity});const {top,height,contentHeight}=sizing.box;setFrameBox(v=>v.top===top&&v.height===height&&v.contentHeight===contentHeight?v:{top,height,contentHeight});};
  const observer=new ResizeObserver(fit);if(header)observer.observe(header);if(nav)observer.observe(nav);window.addEventListener('resize',fit);window.visualViewport?.addEventListener('resize',fit);window.visualViewport?.addEventListener('scroll',fit);fit();
  return()=>{observer.disconnect();window.removeEventListener('resize',fit);window.visualViewport?.removeEventListener('resize',fit);window.visualViewport?.removeEventListener('scroll',fit);};
 },[]);
 const dialog=useRef(null),lock=useRef(false),latest=useRef(0);
 // Unsaved values are also kept on this device for the loaded day/month, so closing the screen does not lose them.
 const draftKey=useRef('');
 const dirty=fields.some(f=>Object.hasOwn(values,f.id)&&String(values[f.id])!==String(snapshot?.current[f.id]??''));
 useEditGuard(dirty||review,saving);
 useEffect(()=>{
  const controller=new AbortController(),request=++latest.current;
  fetch('/api/meter-readings?'+new URLSearchParams(monthly?{kind,month:date,appUid:currentUser.id}:{date,appUid:currentUser.id}),{signal:controller.signal}).then(async r=>{const data=await r.json();if(!r.ok)throw Object.assign(new Error(data.error),{status:r.status});return data;}).then(data=>{if(controller.signal.aborted||request!==latest.current)return;const storage=browserStorage(),key=meterDraftKey(currentUser.id,kind,date);pruneMeterDrafts(storage);const restored=restoreMeterDraft(storage,key,data,fields),count=Object.keys(restored).length;draftKey.current=key;setSnapshot(data);setValues({...Object.fromEntries(fields.map(f=>[f.id,String(data.current[f.id]??'')])),...restored});if(count)setMessage('保存していない入力（'+count+'項目）をこの端末から戻しました。確認して原本に保存してください。');}).catch(e=>{if(controller.signal.aborted)return;setError(e.message||'原本を読み込めませんでした。');setVerify(e.status===401);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[date,currentUser.id,refresh,kind,monthly,fields]);
 useEffect(()=>{if(review&&!dialog.current?.open)dialog.current?.showModal();},[review]);
 useEffect(()=>{if(snapshot&&draftKey.current)storeMeterDraft(browserStorage(),draftKey.current,values,snapshot,fields);},[values,snapshot,fields]);
 // Only an explicit 「破棄」 (date switch / reload confirmed) drops the device draft; closing or reloading the page keeps it.
 const discardDraft=()=>{if(dirty)clearMeterDraft(browserStorage(),draftKey.current);draftKey.current='';};
 const login=async response=>{
  if(lock.current)return;lock.current=true;setLoading(true);setError('');
  try{const r=await fetch('/api/line-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'session',appUid:currentUser.id,credential:response.credential})});const data=await r.json();if(!r.ok)throw new Error(data.error||'本人確認に失敗しました。');setSnapshot(null);setVerify(false);setMessage('');setRefresh(v=>v+1);}
  catch(e){setError(e.message);setLoading(false);}finally{lock.current=false;}
 };
 const close=()=>{dialog.current?.close();setReview(false);};
 const save=async()=>{
  if(lock.current)return;lock.current=true;setSaving(true);setError('');
  try{
   const r=await fetch('/api/meter-readings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save',appUid:currentUser.id,...(monthly?{kind,month:date}:{date}),values,revision:snapshot.revision})});const data=await r.json();if(!r.ok)throw new Error(data.error||'保存できませんでした。');
   setSnapshot(data);setValues(Object.fromEntries(fields.map(f=>[f.id,String(data.current[f.id]??'')])));setMessage(monthly?monthName(date)+'の検針値を毎月検針の原本に保存しました。':date.replaceAll('-','/')+' の検針値を原本に保存しました。');close();
  }catch(e){close();setError(e.message);}finally{lock.current=false;setSaving(false);}
 };
 const switchDate=next=>{if(next&&next!==date&&confirmEditDiscard(dirty,saving)){discardDraft();setValues({});setSnapshot(null);setLoading(true);setError('');setMessage('');setVerify(false);setDate(next);}};
 const reload=()=>{if(confirmEditDiscard(dirty,saving)){discardDraft();setValues({});setSnapshot(null);setLoading(true);setError('');setMessage('');setVerify(false);setRefresh(v=>v+1);}};
 // The map page keys values by a date: the monthly screen uses the 1st of the month and of the previous month.
 const sendMapSnapshot=()=>mapFrame.current?.contentWindow?.postMessage({type:'meter-map-snapshot',...(monthly?{date:date+'-01',previousDate:previousMonth(date)+'-01',previousLabel:'前月',previousText:monthName(previousMonth(date)),fields:MONTHLY_MAP_FIELDS}:{date,previousDate:snapshot?.previousDate,usageLimits:USAGE_LIMITS}),previous:snapshot?.previous,current:snapshot?.current,values,formulas:snapshot?.formulas,saving,meterMap:snapshot?.meterMap,canManageMap:snapshot?.canManageMap},window.location.origin);
 useEffect(()=>{
  const listener=e=>{if(e.origin!==window.location.origin||e.source!==mapFrame.current?.contentWindow||!snapshot)return;
   if(e.data?.type==='meter-map-ready'){sendMapSnapshot();return;}
   if(e.data?.type==='meter-map-save-layout'){
    if(!snapshot.canManageMap)return;
    fetch('/api/meter-readings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save-map',appUid:currentUser.id,...(monthly?{kind}:{}),version:e.data.version,points:e.data.points})}).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error||'配置を保存できませんでした。');setSnapshot(s=>({...s,...data}));mapFrame.current?.contentWindow?.postMessage({type:'meter-map-layout-result',...data},window.location.origin);}).catch(err=>{mapFrame.current?.contentWindow?.postMessage({type:'meter-map-layout-result',error:err.message},window.location.origin);});return;
   }
   if(e.data?.type==='meter-map-draft'&&!saving&&e.data.edits&&typeof e.data.edits==='object'){
    const edits=Object.fromEntries(Object.entries(e.data.edits).filter(([id,value])=>fields.some(f=>f.id===id)&&!snapshot.formulas[id]&&typeof value==='string'));
    if(Object.keys(edits).length){setValues(v=>({...v,...edits}));setMessage('');}return;
   }
   if(e.data?.type!=='meter-map-review'||saving||!e.data.edits||typeof e.data.edits!=='object')return;
   try{const next={...values};for(const [id,value] of Object.entries(e.data.edits)){if(!fields.some(f=>f.id===id)||snapshot.formulas[id]||typeof value!=='string')throw new Error('検針項目を確認してください。');next[id]=value;}const changes=monthly?monthlyChanges(next,snapshot):meterChanges(next,snapshot.current);if(!Object.keys(changes).length)throw new Error('変更した検針値がありません。');setValues(next);setError('');setReview(true);}catch(err){setError(err.message);}
  };window.addEventListener('message',listener);sendMapSnapshot();return()=>window.removeEventListener('message',listener);
 });
 const changed=fields.filter(f=>Object.hasOwn(values,f.id)&&String(values[f.id])!==String(snapshot?.current[f.id]??''));
 const keyboard=frameBox.contentHeight>frameBox.height;
 // Tell the map page how tall it was before the keyboard opened (0 = keyboard closed) so it keeps that size and scrolls.
 const lockedFrameHeight=useRef(0);
 const sendKeyboard=()=>{const frame=mapFrame.current;if(!frame)return;if(keyboard&&!lockedFrameHeight.current)lockedFrameHeight.current=frame.offsetHeight+frameBox.contentHeight-frameBox.height;if(!keyboard)lockedFrameHeight.current=0;frame.contentWindow?.postMessage({type:'meter-map-keyboard',height:lockedFrameHeight.current},window.location.origin);};
 useEffect(sendKeyboard);
 return <div ref={workspace} style={{position:'fixed',top:frameBox.top,height:frameBox.height,left:0,right:0,zIndex:10}} className="mx-auto flex w-full max-w-[1800px] min-h-0 flex-col overflow-hidden bg-white px-2 pb-1">
  <section className="flex shrink-0 items-center gap-2 border-b border-gray-100 py-1"><h1 className="mr-auto text-sm font-black text-gray-800">{monthly?'毎月検針':'毎朝検針'}</h1>{monthly?<><label htmlFor="meter-month" className="sr-only">検針月</label><select id="meter-month" aria-label="検針月" value={date} disabled={loading||saving} onChange={e=>switchDate(e.target.value)} className="h-10 w-28 rounded-lg border border-gray-300 bg-white px-2">{MONTHS.includes(date)?null:<option value={date}>{date}</option>}{MONTHS.map(m=><option key={m} value={m}>{monthName(m)}</option>)}</select></>:<><label htmlFor="meter-date" className="sr-only">検針日</label><DateInput id="meter-date" aria-label="検針日" required min="2026-01-01" max="2026-12-31" value={date} disabled={loading||saving} onChange={e=>switchDate(e.target.value)} className="h-10 w-36 rounded-lg border border-gray-300 px-2"/></>}<button type="button" className="h-10 rounded-lg border border-blue-200 px-3 text-sm font-bold text-blue-800 disabled:opacity-50" disabled={loading||saving} onClick={()=>switchDate(today())}>{monthly?'今月':'今日'}</button></section>
  {loading&&<p role="status" className="shrink-0 p-2 text-sm text-blue-800">検針値を読み込んでいます…</p>}
  {error&&<div className="max-h-24 shrink-0 overflow-auto rounded-lg bg-red-50 p-2 text-xs text-red-800"><p role="alert">{error}</p><button type="button" className="mt-1 underline" disabled={loading||saving} onClick={reload}>再試行</button></div>}
  {message&&<p role="status" className="shrink-0 px-2 py-1 text-xs font-bold text-green-800">{message}</p>}
  {verify&&<section className="shrink-0 space-y-2 rounded-xl bg-blue-50 p-3"><p className="text-sm">{currentUser.name}さんのGoogleアカウントで本人確認してください。</p><GoogleLogin onSuccess={login} onError={()=>setError('Googleの本人確認をやり直してください。')}/></section>}
  {snapshot&&<iframe ref={mapFrame} title={monthly?'ホテル1階 毎月検針マップ':'ホテル1階 検針マップ'} src="/meter-map.html" onLoad={()=>{sendMapSnapshot();sendKeyboard();}} className="block min-h-0 w-full flex-1 border-0"/>}
  {review&&<dialog ref={dialog} aria-labelledby="meter-review-heading" onCancel={e=>{e.preventDefault();if(!saving)close();}} onClose={()=>setReview(false)} className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-xl overflow-auto rounded-2xl border border-gray-200 bg-white p-5 shadow-xl backdrop:bg-black/40">{monthly?<MonthlyReview month={date} snapshot={snapshot} changed={changed} values={values}/>:<><h2 id="meter-review-heading" className="text-lg font-bold">検針値の保存確認</h2><p className="mt-2 text-sm">{date.replaceAll('-','/')}：変更した{changed.length}項目を原本に保存します。</p><div className="my-4 divide-y divide-gray-200">{changed.map(f=>{const diff=meterDifference(values[f.id],snapshot.previous[f.id],f.unit);return <div key={f.id} className="py-3 text-sm"><p className="font-bold">{f.section==='main'?'':'H-'}{Number(date.slice(5,7))}・{f.group}／{f.label}</p><p className="mt-1">当日：{showNumber(snapshot.current[f.id],f.unit)} → <strong>{values[f.id]} {f.unit}</strong></p><p className="mt-1 text-xs text-gray-500">前日：{showNumber(snapshot.previous[f.id],f.unit)} ／ 前日比 {diff?.text||'未計算'}</p></div>;})}</div></>}<div className="flex justify-end gap-2"><button type="button" className={control} disabled={saving} onClick={close}>入力に戻る</button><button type="button" className={primary} disabled={saving} onClick={save}>{saving?'保存中…':'原本に保存する'}</button></div></dialog>}
 </div>;
}
// Confirmation for the monthly book: the meters entered in the app, then the values transferred from the daily book.
function MonthlyReview({month,snapshot,changed,values}){
 const transfers=monthlyTransfers(snapshot),writes=transfers.filter(t=>t.state==='write');
 return <><h2 id="meter-review-heading" className="text-lg font-bold">毎月検針の保存確認</h2><p className="mt-2 text-sm">{monthName(month)}：入力した{changed.length}項目と、毎朝検針から転記する{writes.length}項目を毎月検針の原本に保存します。</p>
  <div className="my-4 divide-y divide-gray-200">{changed.map(f=>{const diff=meterDifference(values[f.id],snapshot.previous[f.id],f.unit);return <div key={f.id} className="py-3 text-sm"><p className="font-bold">{f.group}／{f.label}</p><p className="mt-1">当月：{showNumber(snapshot.current[f.id],f.unit)} → <strong>{values[f.id]} {f.unit}</strong></p><p className="mt-1 text-xs text-gray-500">前月：{showNumber(snapshot.previous[f.id],f.unit)} ／ 前月比 {diff?.text||'未計算'}</p></div>;})}</div>
  <h3 className="text-sm font-bold">毎朝検針から転記</h3><div className="mb-4 divide-y divide-gray-200">{transfers.map(t=><div key={t.id} className="py-2 text-sm"><p className="font-bold">{t.field.group}／{t.field.label}<span className="ml-2 text-xs font-normal text-gray-500">{monthlySourceText(t.field,month)}</span></p><p className={'mt-1 '+(t.state==='write'?'':'text-xs text-gray-500')}>{t.state==='write'?<>原本：{showNumber(t.current)} → <strong>{showNumber(t.value)}</strong></>:t.state==='same'?'転記済み（'+showNumber(t.value)+'）':t.state==='missing'?'毎朝検針に値がないため転記しません':'数式のセルのため転記しません'}</p>{t.decreased&&<p className="mt-1 text-xs font-bold text-amber-800">前月（{showNumber(t.previous)}）より小さい値です。メーターが一周していないか確認してください。</p>}</div>)}</div>
  {transfers.some(t=>t.state==='missing')&&<p className="mb-4 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">毎朝検針に値が入ったあとで、もう一度保存すると転記されます。</p>}</>;
}
