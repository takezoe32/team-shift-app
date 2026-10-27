import { useEffect,useRef,useState } from 'react';
import { GoogleLogin } from '@react-oauth/google';
import DateInput from './DateInput';
import { useEditGuard,confirmEditDiscard } from '../editGuard';
import { japanToday } from '../japanTime.mjs';
import { METER_GROUPS,METER_FIELDS,METER_URL,canAccessMeters,meterChanges,meterDifference } from '../meterReadings.mjs';
const control='min-h-11 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-800 disabled:opacity-50';
const primary=control+' bg-blue-600! text-white! border-blue-600!';
const showNumber=(value,unit='')=>value===null||value===undefined?'未記録':Number(value).toLocaleString('ja-JP',{maximumFractionDigits:8})+(unit?' '+unit:'');
export default function MeterReadings({currentUser}){
 return canAccessMeters(currentUser)?<MeterReadingsForm currentUser={currentUser}/>:<p role="alert" className="p-6 text-sm text-gray-600">検針はplandosee.co.jpのアカウントのみ利用できます。</p>;
}
function MeterReadingsForm({currentUser}){
 const [date,setDate]=useState(japanToday),[section,setSection]=useState('main'),[snapshot,setSnapshot]=useState(null),[values,setValues]=useState({}),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[verify,setVerify]=useState(false),[refresh,setRefresh]=useState(0),[review,setReview]=useState(false);
 const dialog=useRef(null),lock=useRef(false),latest=useRef(0);
 const dirty=METER_FIELDS.some(f=>Object.hasOwn(values,f.id)&&String(values[f.id])!==String(snapshot?.current[f.id]??''));
 useEditGuard(dirty||review,saving);
 useEffect(()=>{
  const controller=new AbortController(),request=++latest.current;
  fetch('/api/meter-readings?'+new URLSearchParams({date,appUid:currentUser.id}),{signal:controller.signal}).then(async r=>{const data=await r.json();if(!r.ok)throw Object.assign(new Error(data.error),{status:r.status});return data;}).then(data=>{if(controller.signal.aborted||request!==latest.current)return;setSnapshot(data);setValues(Object.fromEntries(METER_FIELDS.map(f=>[f.id,String(data.current[f.id]??'')])));}).catch(e=>{if(controller.signal.aborted)return;setError(e.message||'原本を読み込めませんでした。');setVerify(e.status===401);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[date,currentUser.id,refresh]);
 useEffect(()=>{if(review&&!dialog.current?.open)dialog.current?.showModal();},[review]);
 const login=async response=>{
  if(lock.current)return;lock.current=true;setLoading(true);setError('');
  try{const r=await fetch('/api/line-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'session',appUid:currentUser.id,credential:response.credential})});const data=await r.json();if(!r.ok)throw new Error(data.error||'本人確認に失敗しました。');setSnapshot(null);setVerify(false);setMessage('');setRefresh(v=>v+1);}
  catch(e){setError(e.message);setLoading(false);}finally{lock.current=false;}
 };
 const close=()=>{dialog.current?.close();setReview(false);};
 const prepare=()=>{try{const changes=meterChanges(values,snapshot.current);if(!Object.keys(changes).length)throw new Error('変更した検針値がありません。');if(Object.keys(changes).some(id=>snapshot.formulas[id]))throw new Error('数式がある項目は変更できません。');setError('');setReview(true);}catch(e){setError(e.message);}};
 const save=async()=>{
  if(lock.current)return;lock.current=true;setSaving(true);setError('');
  try{
   const r=await fetch('/api/meter-readings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save',appUid:currentUser.id,date,values,revision:snapshot.revision})});const data=await r.json();if(!r.ok)throw new Error(data.error||'保存できませんでした。');
   setSnapshot(data);setValues(Object.fromEntries(METER_FIELDS.map(f=>[f.id,String(data.current[f.id]??'')])));setMessage(date.replaceAll('-','/')+' の検針値を原本に保存しました。');close();
  }catch(e){close();setError(e.message);}finally{lock.current=false;setSaving(false);}
 };
 const switchDate=next=>{if(next&&next!==date&&confirmEditDiscard(dirty,saving)){setValues({});setSnapshot(null);setLoading(true);setError('');setMessage('');setVerify(false);setDate(next);}};
 const reload=()=>{if(confirmEditDiscard(dirty,saving)){setValues({});setSnapshot(null);setLoading(true);setError('');setMessage('');setVerify(false);setRefresh(v=>v+1);}};
 const changed=METER_FIELDS.filter(f=>Object.hasOwn(values,f.id)&&String(values[f.id])!==String(snapshot?.current[f.id]??''));
 return <div className="mx-auto w-full max-w-3xl space-y-5 p-4 pb-8 sm:p-6">
  <div><h1 className="text-xl font-black text-gray-800">毎朝検針</h1><p className="mt-2 text-sm text-gray-600">前日の値を確認し、当日の検針値を入力してください。前日比は「当日 − 前日」の差です。</p></div>
  <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4"><label htmlFor="meter-date" className="text-sm font-bold">検針日</label><DateInput id="meter-date" aria-label="検針日" required min="2026-01-01" max="2026-12-31" value={date} disabled={loading||saving} onChange={e=>switchDate(e.target.value)} className="min-h-11 w-40 rounded-lg border border-gray-300 px-3"/><button type="button" className={control} disabled={loading||saving} onClick={()=>switchDate(japanToday())}>今日</button><span className="text-xs text-gray-500">2026年の原本</span></section>
  <div className="flex flex-wrap items-center justify-between gap-2"><a href={METER_URL} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-blue-700 underline">検針原本を開く ↗</a><button type="button" disabled={loading||saving} className={control} onClick={reload}>原本を再読込</button></div>
  {loading&&<p role="status" className="rounded-xl bg-blue-50 p-4 text-sm text-blue-800">原本の当日・前日の値を読み込んでいます…</p>}
  {error&&<p role="alert" className="whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
  {message&&<p role="status" className="rounded-xl bg-green-50 p-4 text-sm font-bold text-green-800">{message}</p>}
  {verify&&<section className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4"><p className="text-sm">{currentUser.name}さんの登録メールと同じGoogleアカウントを選んでください。</p><GoogleLogin onSuccess={login} onError={()=>setError('Googleの本人確認をやり直してください。')}/></section>}
  {snapshot&&<>
   {snapshot.format==='xlsx'&&<p className="text-xs font-bold text-blue-800">Excel（XLSX）の原本にそのまま保存します。形式の変換は不要です。</p>}
   <p className="rounded-xl bg-blue-50 p-3 text-xs leading-relaxed text-blue-900">前日の値（{snapshot.previousDate.replaceAll('-','/')}）は原本から自動取得した表示専用の値です。未記録の場合は前日比を計算しません。使用量の換算値ではなく、入力した数値同士の差を表示します。</p>
   <div role="tablist" aria-label="検針シート" className="grid grid-cols-2 gap-2 rounded-xl bg-gray-100 p-1">{['main','h'].map(s=><button type="button" role="tab" key={s} id={'meter-tab-'+s} aria-selected={section===s} aria-controls={'meter-panel-'+s} disabled={saving} onClick={()=>setSection(s)} className={'min-h-16 rounded-lg px-3 py-2 text-base font-bold '+(section===s?'bg-blue-600 text-white shadow':'text-gray-600')}><span>{s==='main'?'':'H-'}{Number(date.slice(5,7))}</span><small className="mt-1 block text-xs font-normal">{s==='main'?'本館・バンケットなど':'日比谷・設備の点検'}</small></button>)}</div>
   {['main','h'].map(s=><section role="tabpanel" key={s} hidden={section!==s} id={'meter-panel-'+s} aria-labelledby={'meter-tab-'+s} className="space-y-4">{METER_GROUPS[s].map(([group,fields])=><section key={group} className="overflow-hidden rounded-2xl border border-gray-200 bg-white"><h2 className="border-b border-gray-100 bg-gray-50 px-4 py-3 text-sm font-bold">{group}</h2><div className="grid grid-cols-1 gap-5 p-4 min-[380px]:grid-cols-2">{fields.map(([id,label,,unit])=>{const diff=meterDifference(values[id],snapshot.previous[id],unit);return <div key={id} className="min-w-0"><label htmlFor={'meter-'+id} className="mb-2 block text-sm font-bold text-gray-800">{label}</label><div className="mb-2 flex flex-wrap justify-between gap-1 text-xs text-gray-500"><span>前日の値</span><span className="font-bold tabular-nums text-gray-700">{showNumber(snapshot.previous[id],unit)}</span></div><div className="relative"><input id={'meter-'+id} type="text" inputMode="decimal" autoComplete="off" disabled={saving||snapshot.formulas[id]} aria-label={group+' '+label+' 当日の値'} value={values[id]??''} onChange={e=>{setValues(v=>({...v,[id]:e.target.value}));setMessage('');}} placeholder="当日の数値" className="h-12 w-full min-w-0 rounded-xl border border-gray-300 px-3 pr-8 text-lg font-bold tabular-nums disabled:bg-gray-100"/>{unit&&<span className="absolute right-3 top-4 text-xs text-gray-500">{unit}</span>}</div><output htmlFor={'meter-'+id} aria-live="polite" className={'mt-2 block rounded-lg p-2 text-xs font-bold tabular-nums '+(diff?.delta<0?'bg-orange-50 text-orange-800':'bg-blue-50 text-blue-800')}>前日比 {diff?diff.text:snapshot.previous[id]===null?'前日未記録':'当日の値を入力'}</output>{snapshot.formulas[id]&&<p className="mt-1 text-xs text-gray-500">原本の数式・文字があるため編集できません。</p>}</div>;})}</div></section>)}</section>)}
   <p className="text-xs text-gray-500">変更した項目だけを保存します。未入力の項目や計算式は変更しません。前日の値はこの画面から変更できません。</p>
   <div className="sticky bottom-20 flex flex-wrap items-center justify-end gap-3 rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-lg"><span className="mr-auto text-xs text-gray-500">変更 {changed.length} / 20 項目</span><button type="button" className={control} disabled={saving} onClick={()=>setSection(section==='main'?'h':'main')}>{section==='main'?'次へ H-'+Number(date.slice(5,7)):'← '+Number(date.slice(5,7))+' に戻る'}</button><button type="button" className={primary} disabled={saving||!dirty} onClick={prepare}>入力内容を確認</button></div>
  </>}
  {review&&<dialog ref={dialog} aria-labelledby="meter-review-heading" onCancel={e=>{e.preventDefault();if(!saving)close();}} onClose={()=>setReview(false)} className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-xl overflow-auto rounded-2xl border border-gray-200 bg-white p-5 shadow-xl backdrop:bg-black/40"><h2 id="meter-review-heading" className="text-lg font-bold">検針値の保存確認</h2><p className="mt-2 text-sm">{date.replaceAll('-','/')}：変更した{changed.length}項目を原本に保存します。</p><div className="my-4 divide-y divide-gray-200">{changed.map(f=>{const diff=meterDifference(values[f.id],snapshot.previous[f.id],f.unit);return <div key={f.id} className="py-3 text-sm"><p className="font-bold">{f.section==='main'?'':'H-'}{Number(date.slice(5,7))}・{f.group}／{f.label}</p><p className="mt-1">当日：{showNumber(snapshot.current[f.id],f.unit)} → <strong>{values[f.id]} {f.unit}</strong></p><p className="mt-1 text-xs text-gray-500">前日：{showNumber(snapshot.previous[f.id],f.unit)} ／ 前日比 {diff?.text||'未計算'}</p></div>;})}</div><div className="flex justify-end gap-2"><button type="button" className={control} disabled={saving} onClick={close}>入力に戻る</button><button type="button" className={primary} disabled={saving} onClick={save}>{saving?'保存中…':'原本に保存する'}</button></div></dialog>}
 </div>;
}
