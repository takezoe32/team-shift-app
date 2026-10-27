import { normalizeModelNumber } from './inventoryQr.mjs';
export function inventorySearchCandidates(items, query) {
  const prefix=normalizeModelNumber(query);
  if(!prefix)return [];
  return items.filter(item=>[item.modelNumber,item.barcode].some(value=>normalizeModelNumber(value).startsWith(prefix)))
    .sort((a,b)=>normalizeModelNumber(a.modelNumber||a.barcode).localeCompare(normalizeModelNumber(b.modelNumber||b.barcode)));
}
