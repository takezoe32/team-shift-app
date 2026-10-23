import { useEffect, useRef, useState } from 'react';
import DateInput from './DateInput';
import { confirmEditDiscard, useEditGuard } from '../editGuard';
import { parseReceiptText, receiptSummary, receiptValidation, receiptTsv } from '../receiptImport.mjs';
const initialForm = buyer => ({ buyer:buyer || '', date:'', shop:'ナフコ', department:'管理', account:'消耗品費', month:'', total:'' });
const yen = value => value === null ? '未確認' : `¥${value.toLocaleString('ja-JP')}`;
const fieldStyle = 'mt-1 block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base';
function Field({ label, children }) { return <label className="block text-sm font-bold text-gray-700">{label}{children}</label>; }
const withIds = rows => rows.map(row => ({ ...row, id:crypto.randomUUID() }));
export default function ReceiptImport({ buyer, onClose }) {
  const [form,setForm]=useState(()=>initialForm(buyer));
  const [rows,setRows]=useState([]), [raw,setRaw]=useState('');
  const [file,setFile]=useState(null), [preview,setPreview]=useState('');
  const [busy,setBusy]=useState(false), [progress,setProgress]=useState('');
  const [message,setMessage]=useState(''), [confirmed,setConfirmed]=useState(false);
  const [dirty,setDirty]=useState(false);
  const [manual,setManual]=useState(false);
  const session=useRef({ token:0, worker:null, busy:false, timer:null });
  const output=useRef(null), firstHeading=useRef(null);
  useEditGuard(dirty || busy,busy);
  useEffect(()=>{ firstHeading.current?.focus(); const current=session.current; return ()=>{++current.token;clearTimeout(current.timer);void current.worker?.terminate().catch(()=>{});}; },[]);
  useEffect(()=>()=>{if(preview)URL.revokeObjectURL(preview);},[preview]);
  const changed=()=>{setDirty(true);setConfirmed(false);setManual(false);setMessage('');};
  const changeForm=(key,value)=>{changed();setForm(current=>({...current,[key]:value}));};
  const editRow=(id,key,value)=>{changed();setRows(current=>current.map(row=>row.id===id?{...row,[key]:value}:row));};
  const cancel=()=>{const current=session.current;++current.token;clearTimeout(current.timer);void current.worker?.terminate().catch(()=>{});current.worker=null;current.busy=false;setBusy(false);setProgress('');setMessage('読み取りを中止しました。再度読み取るか、手入力できます。');};
  const selectImage=image=>{
    if(!image || session.current.busy)return;
    if(!image.type.startsWith('image/')){setMessage('写真・画像を選択してください。');return;}
    if(image.size>20*1024*1024){setMessage('画像は20MB以下にしてください。');return;}
    if((rows.length || raw) && !window.confirm('別のレシートに切り替えますか？現在の明細と認識原文を置き換えます。'))return;
    changed();setFile(image);setPreview(URL.createObjectURL(image));setRaw('');setRows([]);setForm(current=>({...current,date:'',total:''}));
  };
  const applyText=text=>{const result=parseReceiptText(text);setRows(withIds(result.rows));setForm(current=>({...current,date:result.date,shop:result.shop,total:result.total}));setConfirmed(false);setDirty(true);setManual(false);setMessage(result.rows.length?'読み取り候補です。原本と見比べて、商品名・税込金額・税額・値引きを確認してください。':'明細を抽出できませんでした。原文を修正するか明細を手入力してください。');};
  const scan=async()=>{
    if(!file || session.current.busy)return;
    if((rows.length || raw) && !window.confirm('読み取りをやり直して、現在の明細と原文を置き換えますか？'))return;
    const current=session.current, token=++current.token;current.busy=true;setBusy(true);setMessage('');setProgress('読み取り準備中…');let worker;
    current.timer=setTimeout(()=>{if(token===current.token){cancel();setMessage('読み取りに時間がかかっています。通信や写真を確認するか、手入力してください。');}},150000);
    try{
      const image=new Image();image.src=preview;await image.decode();if(token!==current.token)return;
      const scale=Math.min(1,4000/Math.max(image.naturalWidth,image.naturalHeight),Math.sqrt(8000000/(image.naturalWidth*image.naturalHeight)));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const context=canvas.getContext('2d');if(!context)throw new Error('画像を準備できません。');context.drawImage(image,0,0,canvas.width,canvas.height);
      const {createWorker,PSM}=await import('tesseract.js');if(token!==current.token)return;
      worker=await createWorker(['jpn','eng'],1,{logger:event=>{if(token===current.token)setProgress(event.status==='recognizing text'?`文字を読み取り中… ${Math.round((event.progress||0)*100)}%`:'読み取りデータを準備中…（初回は通信が必要です）');},errorHandler:()=>{}});
      if(token!==current.token)return;current.worker=worker;await worker.setParameters({tessedit_pageseg_mode:PSM.AUTO});
      const {data}=await worker.recognize(canvas);if(token!==current.token)return;const text=String(data.text||'').trim();setRaw(text);applyText(text);
    }catch{if(token===current.token)setMessage('読み取れませんでした。通信・画像形式・写真の向きを確認してください。画像が開けない場合はJPEGやPNGにして再度選ぶか、手入力できます。');}
    finally{await worker?.terminate().catch(()=>{});if(token===current.token){clearTimeout(current.timer);current.worker=null;current.busy=false;setBusy(false);setProgress('');}}
  };
  const totals=receiptSummary(rows,form.total), validation=receiptValidation(form,rows,confirmed);
  const tsv=receiptTsv(form,rows);
  const copy=async()=>{
    const error=receiptValidation(form,rows,confirmed);if(error){setMessage(error);return;}
    try{await navigator.clipboard.writeText(tsv);setDirty(false);setManual(false);setMessage(`コピーしました。仕入れ表の「${form.shop}」シートを開き、空行のA列を選んで貼り付けてください。`);}
    catch{setManual(true);setMessage('自動コピーが使えません。下のデータを選択して長押し、またはCtrl+Cでコピーしてください。');}
  };
  useEffect(()=>{if(manual){output.current?.focus();output.current?.select();}},[manual]);
  const download=()=>{const error=receiptValidation(form,rows,confirmed);if(error){setMessage(error);return;}const url=URL.createObjectURL(new Blob(['\ufeff'+tsv],{type:'text/tab-separated-values;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=`仕入れ_${form.shop}_${form.date}.tsv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setMessage('TSVファイルを出力しました。表への貼り付けには「コピー」も使えます。');};
  return <main className="flex-1 overflow-y-auto bg-gray-50 px-3 py-4 pb-24"><div className="mx-auto max-w-4xl space-y-4">
    <div className="flex items-center justify-between gap-3"><h2 ref={firstHeading} tabIndex={-1} className="text-xl font-bold text-blue-900">レシート取込</h2><button type="button" disabled={busy} onClick={()=>{if(confirmEditDiscard(dirty,busy))onClose();}} className="min-h-11 rounded-lg border bg-white px-3 text-sm font-bold">在庫管理へ戻る</button></div>
    <p className="text-sm text-gray-700">撮影 → 読み取り → 確認・修正 → コピー。既存の仕入れ表の空行・A列に貼り付けます。在庫数や仕入れ表への自動登録は行いません。</p>
    <section className="rounded-xl border bg-white p-4 space-y-3"><h3 className="font-bold">1. レシートを撮影・選択</h3><div className="flex flex-wrap gap-2">{[true,false].map(camera=><label key={String(camera)} className={`inline-flex min-h-12 cursor-pointer items-center rounded-xl border border-blue-300 px-4 text-sm font-bold ${camera?'bg-blue-600 text-white':'bg-white text-blue-800'} ${busy?'opacity-50':''}`}>{camera?'レシートを撮影':'画像を選択'}<input type="file" aria-label={camera?'レシートを撮影':'レシート画像を選択'} accept="image/*" capture={camera?'environment':undefined} disabled={busy} className="sr-only" onChange={e=>{const image=e.target.files?.[0];e.target.value='';selectImage(image);}}/></label>)}</div>
    {preview && <img src={preview} alt="取り込んだレシートの原本" className="max-h-96 w-full rounded-lg border object-contain"/>}<div className="flex gap-2"><button type="button" disabled={!file || busy} onClick={()=>void scan()} className="min-h-12 rounded-xl bg-blue-600 px-4 font-bold text-white disabled:opacity-40">文字を読み取る</button>{busy && <button type="button" onClick={cancel} className="min-h-12 rounded-xl border px-4">読み取りを中止</button>}</div><p role="status" className="text-sm text-blue-800">{progress}</p><p className="text-xs text-gray-500">文字認識は端末内で行います。画像・入力内容の保存履歴はありません。初回の認識データ取得には通信が必要です。</p></section>
    <fieldset disabled={busy} className="rounded-xl border bg-white p-4 space-y-3"><legend className="font-bold">2. 基本情報</legend><div className="grid gap-3 sm:grid-cols-2"><Field label="貼り付け先の店別シート"><select value={form.shop} onChange={e=>changeForm('shop',e.target.value)} className={fieldStyle}>{['ナフコ','コーナン','その他'].map(shop=><option key={shop}>{shop}</option>)}</select></Field><Field label="購入者（必須）"><input value={form.buyer} onChange={e=>changeForm('buyer',e.target.value)} className={fieldStyle}/></Field><Field label="購入日（必須）"><DateInput required value={form.date} onChange={e=>changeForm('date',e.target.value)} className={fieldStyle}/></Field>{[['department','部門（全明細共通）'],['account','科目（全明細共通）'],['month','計上月（任意）']].map(([key,label])=><Field key={key} label={label}><input value={form[key]} onChange={e=>changeForm(key,e.target.value)} placeholder={key==='month'?'例：10月':undefined} className={fieldStyle}/></Field>)}</div></fieldset>
    <fieldset disabled={busy} className="rounded-xl border bg-white p-4 space-y-4"><legend className="font-bold">3. 明細を確認・修正（{rows.length}件）</legend><p className="text-sm text-gray-600">数量・単価を金額と誤認する場合があります。すべて原本で確認してください。税抜から税込への変換・税額の配賦・値引きは自動計算しません。値引き明細はマイナス金額で入力できます。</p>
    {!rows.length && <p className="text-sm text-gray-500">読み取るか、明細を手入力してください。</p>}{rows.map((row,index)=><div key={row.id} className="rounded-xl border bg-gray-50 p-3 space-y-3"><div className="flex items-center justify-between"><h4 className="font-bold">明細 {index+1}</h4><button type="button" onClick={()=>{changed();setRows(current=>current.filter(item=>item.id!==row.id));}} aria-label={`明細${index+1}を削除`} className="min-h-11 rounded-lg border border-red-200 bg-white px-3 text-sm text-red-700">削除</button></div><div className="grid gap-3 sm:grid-cols-2">{[['name','内容（商品名・規格・数量）'],['amount','税込金額（円）'],['unit','単価（同じ商品を複数購入した場合など）'],['note','備考・用途（任意）']].map(([key,label])=><Field key={key} label={label}><input aria-label={`明細${index+1} ${label}`} value={row[key]} inputMode={key==='amount'?'decimal':undefined} onChange={e=>editRow(row.id,key,e.target.value)} className={fieldStyle}/></Field>)}</div></div>)}
    <button type="button" onClick={()=>{changed();setRows(current=>[...current,...withIds([{name:'',amount:'',unit:'',note:''}])]);}} className="min-h-12 rounded-xl border border-blue-300 px-4 text-sm font-bold text-blue-800">＋ 明細を追加</button>
    <Field label="レシート合計（税込・照合用）"><input value={form.total} inputMode="decimal" onChange={e=>changeForm('total',e.target.value)} placeholder="原本の合計を入力" className={fieldStyle}/></Field><div role="status" className={`rounded-xl p-3 text-sm font-bold ${totals.difference!==null && totals.difference!==0?'bg-red-50 text-red-800':'bg-blue-50 text-blue-900'}`}>明細合計：{yen(totals.sum)} ／ レシート合計：{yen(totals.total)}{totals.difference!==null && <span> ／ 差額：{yen(totals.difference)} {totals.difference===0?'（一致）':'（要修正）'}</span>}</div>
    <p className="text-xs text-gray-600">G列は単価を出力します。領収証合計は画面上の照合だけに使います。購入者・日付は最初の明細だけ、部門・科目・計上月は全明細に出力します。</p>
    <label className="flex items-start gap-3 text-sm font-bold"><input type="checkbox" checked={confirmed} onChange={e=>{setConfirmed(e.target.checked);setDirty(true);}} className="mt-1"/>各商品の税込金額・税額・値引きを原本と見比べて確認しました。</label>
    <p className="text-sm text-gray-600">{validation || 'コピーできます。'}</p><div className="flex flex-wrap gap-2"><button type="button" disabled={!!validation} onClick={()=>void copy()} className="min-h-12 rounded-xl bg-green-600 px-5 font-bold text-white disabled:opacity-40">仕入れ表用にコピー</button><button type="button" disabled={!!validation} onClick={download} className="min-h-12 rounded-xl border bg-white px-4 text-sm font-bold disabled:opacity-40">TSVを保存</button></div></fieldset>
    <p role="status" className="whitespace-pre-wrap text-sm font-bold text-blue-800">{message}</p>
    <details open={manual} className="rounded-xl border bg-white p-4"><summary className="min-h-11 cursor-pointer font-bold">貼り付けデータを確認・手動コピー</summary><p className="my-2 text-xs text-gray-600">A〜I列：購入者／日付／部門／科目／内容／税込金額／単価／備考／計上月。貼り付け先の店別シートはご自身で選んでください。</p>{validation ? <p className="text-sm text-gray-500">確認が完了するとデータを表示します。</p> : <><textarea ref={output} readOnly aria-label="仕入れ表への貼り付けデータ" value={tsv} rows={8} className="w-full rounded-lg border p-3 text-sm" onFocus={e=>e.target.select()}/>{manual && <button type="button" onClick={()=>{setDirty(false);setMessage('手動コピーの完了を確認しました。仕入れ表の空行・A列へ貼り付けてください。');}} className="min-h-11 rounded-lg border px-3 text-sm">手動でコピーできました</button>}</>}</details>
    <details className="rounded-xl border bg-white p-4"><summary className="min-h-11 cursor-pointer font-bold">認識原文を確認・修正</summary><textarea aria-label="レシートの認識原文" value={raw} disabled={busy} onChange={e=>{changed();setRaw(e.target.value);}} rows={8} className="mt-2 w-full rounded-lg border p-3 text-base"/><button type="button" disabled={busy || !raw.trim()} onClick={()=>{if(rows.length && !window.confirm('原文から明細を作り直しますか？修正済みの明細を置き換えます。'))return;applyText(raw);}} className="min-h-11 rounded-lg border px-3 text-sm">原文から明細を作り直す</button></details>
  </div></main>;
}
