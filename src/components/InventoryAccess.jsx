import { useEffect, useRef, useState } from 'react';
import { GoogleOAuthProvider, GoogleLogin, googleLogout } from '@react-oauth/google';
import InventoryProductSearch from './InventoryProductSearch';
import { inventoryProductLabel } from '../inventoryProduct.mjs';
const CLIENT_ID='147696997284-sttbu4gtchokcqqn0votaeq49s17dtbf.apps.googleusercontent.com';
async function request(body,method=body?'POST':'GET') {
  const response=await fetch('/api/inventory-access',{method,credentials:'same-origin',...(method!=='GET'?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body || {})}:{})});
  const data=await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || '通信に失敗しました。'),{status:response.status});
  return data;
}
function InventoryAccessPage() {
  const [actor,setActor]=useState(null),[items,setItems]=useState([]),[selected,setSelected]=useState(''),[quantity,setQuantity]=useState('1'),[direction,setDirection]=useState('out'),[busy,setBusy]=useState(true),[message,setMessage]=useState(''),[error,setError]=useState('');
  const saving=useRef(false),attempt=useRef(null);
  const receive=data=>{setActor(data.actor);setItems(data.items);};
  useEffect(()=>{let live=true;request().then(data=>{if(live)receive(data);}).catch(err=>{if(live&&err.status!==401)setError(err.message);}).finally(()=>{if(live)setBusy(false);});return()=>{live=false;};},[]);
  async function login(result) {setBusy(true);setError('');try{receive(await request({action:'login',credential:result.credential}));}catch(err){setError(err.message);}finally{setBusy(false);}}
  async function reload(){setBusy(true);setError('');try{receive(await request());}catch(err){setError(err.message);if(err.status===401||err.status===403)setActor(null);}finally{setBusy(false);}}
  const item=items.find(row=>row.id===selected);
  async function save(event){event.preventDefault();if(saving.current||!item)return;const number=Number(quantity);if(!Number.isSafeInteger(number)||number<1){setError('数量は1以上の整数を入力してください。');return;}const label=direction==='out'?'出庫':'入庫';if(!window.confirm(`${inventoryProductLabel(item)}を${number}個${label}しますか？`))return;saving.current=true;setBusy(true);setError('');setMessage('');const key=JSON.stringify([selected,number,direction]);if(attempt.current?.key!==key)attempt.current={key,id:crypto.randomUUID()};try{const data=await request({action:'adjust',itemId:selected,quantity:number,direction,requestId:attempt.current.id});receive(data);setMessage(`${data.movement.productName}：${number}個${label}しました。在庫 ${data.movement.stockAfter}個`);attempt.current=null;setSelected('');setQuantity('1');}catch(err){setError(err.message);if(err.status===401||err.status===403)setActor(null);}finally{saving.current=false;setBusy(false);}}
  return <main className="min-h-dvh bg-slate-50 px-4 py-6 text-slate-800"><div className="mx-auto max-w-xl space-y-4"><header><h1 className="text-xl font-bold">在庫検索・入出庫</h1><p className="mt-1 text-sm text-slate-600">商品を検索して、使用した数・補充した数を入力します。</p></header>
    {error&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}{message&&<p role="status" className="rounded-xl bg-green-50 p-3 text-sm font-bold text-green-800">{message}</p>}
    {!actor?<section className="rounded-2xl border bg-white p-5 space-y-4"><p className="text-sm">会社のGoogleアカウント（@plandosee.co.jp）、またはアプリに登録済みのアカウントでログインしてください。</p>{busy?<p role="status">確認中…</p>:<GoogleLogin onSuccess={login} onError={()=>setError('ログインできませんでした。もう一度お試しください。')}/>}</section>:<>
      <div className="flex items-center justify-between gap-2 text-sm"><span>{actor.name}</span><button disabled={busy} className="min-h-11 px-3 underline" onClick={async()=>{setBusy(true);try{await request({},'DELETE');googleLogout();setActor(null);setItems([]);setSelected('');setMessage('');}catch(err){setError(err.message);}finally{setBusy(false);}}}>ログアウト</button></div>
      <section className="rounded-2xl border bg-white p-4 space-y-3"><InventoryProductSearch items={items} disabled={busy} selectedId={selected} onSelect={row=>{setSelected(row?.id||'');setError('');setQuantity('1');}} unregistered="管理者に商品登録を依頼してください。"/><button disabled={busy} onClick={reload} className="min-h-11 rounded-xl border px-4 text-sm">再読込</button></section>
      {item&&<form onSubmit={save} className="sticky bottom-3 rounded-2xl border-2 border-blue-300 bg-white p-4 shadow-lg space-y-3"><h2 className="font-bold">{inventoryProductLabel(item)}</h2><div className="flex items-center gap-3"><label>操作<select disabled={busy} value={direction} onChange={e=>setDirection(e.target.value)} className="ml-2 min-h-12 rounded-lg border px-3"><option value="out">出庫（減らす）</option><option value="in">入庫（増やす）</option></select></label><label>数量<input disabled={busy} type="number" inputMode="numeric" min="1" max="1000000" step="1" required value={quantity} onChange={e=>setQuantity(e.target.value)} className="ml-2 min-h-12 w-24 rounded-lg border px-2 text-base"/></label></div><p className="text-sm">現在：{item.stock||0}個 → 変更後：{Number(item.stock||0)+(direction==='out'?-1:1)*Number(quantity||0)}個</p><button disabled={busy} className="min-h-12 w-full rounded-xl bg-blue-600 px-4 font-bold text-white disabled:opacity-50">{busy?'保存中…':'確認して'+(direction==='out'?'出庫':'入庫')+'する'}</button></form>}
    </>}</div></main>;
}
export default function InventoryAccess(){return <GoogleOAuthProvider clientId={CLIENT_ID}><InventoryAccessPage/></GoogleOAuthProvider>;}
