import { normalizeModelNumber,parseInventoryCode,findModelProducts } from './inventoryQr.mjs';
export function inventorySearchCandidates(items, query) {
  const prefix=normalizeModelNumber(query);
  if(!prefix)return [];
  return items.filter(item=>[item.modelNumber,item.barcode].some(value=>normalizeModelNumber(value).startsWith(prefix)))
    .sort((a,b)=>normalizeModelNumber(a.modelNumber||a.barcode).localeCompare(normalizeModelNumber(b.modelNumber||b.barcode)));
}
// What a camera read means for the product search (the same rules as 在庫一覧): a barcode or a TOTO QR model number
// goes into the search box; matches are the registered products it identifies (query null = leave the box as it is).
export function inventoryScanResult(items, value) {
  const code=parseInventoryCode(value);
  if(code.type==='unsupported')return {query:null,matches:[],message:'このQRコードからは型番を取得できません。型番またはバーコード番号を入力してください。'};
  if(code.type==='model')return {query:code.modelNumber,matches:findModelProducts(items,code),label:'型番 '+code.modelNumber};
  const barcode=normalizeModelNumber(code.barcode);
  return {query:String(code.barcode).normalize('NFKC').trim(),matches:items.filter(item=>normalizeModelNumber(item.barcode)===barcode),label:'バーコード '+code.barcode};
}
