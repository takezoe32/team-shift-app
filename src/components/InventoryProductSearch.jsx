// Product search used wherever stock is picked (task form, 在庫検索・入出庫): the same as 在庫一覧 —
// 「カメラで読取」 (barcode / TOTO QR) or typing; 型番・バーコード prefixes list candidates to choose from.
import { useState } from 'react';
import { Camera } from 'lucide-react';
import BarcodeScannerModal from './BarcodeScannerModal';
import { inventoryProductLabel } from '../inventoryProduct.mjs';
import { inventorySearchCandidates,inventoryScanResult } from '../inventorySearch.mjs';
const stockOf=item=>Math.max(0,Number(item?.stock)||0);
// unavailable(item) → a reason ('' = can be chosen); unregistered → what to do when nothing matches.
export default function InventoryProductSearch({items,disabled=false,selectedId='',onSelect,unavailable=()=> '',unregistered='在庫管理で商品登録してください。'}){
  const [query,setQuery]=useState(''),[scanner,setScanner]=useState(false),[message,setMessage]=useState('');
  const selected=selectedId?items.find(item=>item.id===selectedId):null;
  const candidates=inventorySearchCandidates(items,query);
  const choose=item=>{const reason=unavailable(item);if(reason){setMessage(reason);return;}setMessage('');setQuery(item.modelNumber||item.barcode||'');onSelect(item);};
  const type=value=>{setQuery(value);setMessage('');if(selected)onSelect(null);};
  const scan=value=>{
    setScanner(false);if(disabled)return;
    const result=inventoryScanResult(items,value);
    if(result.query===null){setMessage(result.message);return;}
    setQuery(result.query);if(selected)onSelect(null);
    if(!result.matches.length){setMessage(result.label+' の商品は登録されていません。'+unregistered);return;}
    if(result.matches.length===1){const reason=unavailable(result.matches[0]);if(reason){setMessage(inventoryProductLabel(result.matches[0])+'：'+reason);return;}setMessage('');onSelect(result.matches[0]);return;}
    setMessage(result.label+' に一致する商品が'+result.matches.length+'件あります。対象の商品を選んでください。');
  };
  return <div className="space-y-2">
    <div className="flex items-end gap-2"><label className="block min-w-0 flex-1 text-xs font-bold text-gray-600">バーコード番号・型番で検索<input value={query} disabled={disabled} onChange={e=>type(e.target.value)} inputMode="text" autoComplete="off" placeholder="例：abc-12345（1文字から候補を表示）" className="mt-1 w-full min-h-11 border border-gray-300 rounded-xl px-3 py-2.5 text-base" maxLength={80}/></label>
      <button type="button" disabled={disabled} onClick={()=>setScanner(true)} className="shrink-0 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-indigo-600 px-3 text-xs font-bold text-white disabled:opacity-50"><Camera size={16}/>カメラで読取</button></div>
    {selected?<div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3"><div className="min-w-0 flex-1"><span className="block text-xs font-bold text-emerald-800">選択中</span><span className="block text-sm font-bold text-gray-900">{selected.modelNumber || selected.barcode}</span><span className="block text-xs text-gray-700">{inventoryProductLabel(selected)} ／ 在庫 {stockOf(selected)}個 ／ 棚 {selected.shelfNumber || '未設定'}</span></div><button type="button" disabled={disabled} onClick={()=>{onSelect(null);setMessage('');}} className="shrink-0 min-h-11 rounded-lg border border-emerald-300 bg-white px-3 text-xs font-bold text-emerald-800 disabled:opacity-50">選択を外す</button></div>
    :query.trim()&&<div className="space-y-2"><p role="status" className="text-xs text-gray-600">{candidates.length ? `候補 ${candidates.length}件：商品を選んでください` : '該当する型番・バーコードの商品はありません。'}</p>{candidates.length>0 && <div aria-label="商品の検索候補" className="max-h-72 overflow-y-auto space-y-2">{candidates.map(item=>{const reason=unavailable(item);return <button key={item.id} type="button" disabled={disabled||!!reason} onClick={()=>choose(item)} className="w-full min-h-14 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-left active:bg-blue-100 disabled:opacity-50"><span className="block text-sm font-bold text-blue-900">{item.modelNumber || item.barcode}{reason && <span className="ml-2 text-xs font-bold text-red-700">{reason}</span>}</span><span className="block text-xs text-gray-700">{inventoryProductLabel(item)} ／ 在庫 {stockOf(item)}個 ／ 棚 {item.shelfNumber || '未設定'}</span></button>;})}</div>}</div>}
    {message && <p role="status" className="text-xs text-blue-800">{message}</p>}
    {scanner && <BarcodeScannerModal onDetected={scan} onClose={()=>setScanner(false)}/>}
  </div>;
}
