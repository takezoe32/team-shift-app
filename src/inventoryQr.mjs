export const normalizeModelNumber = value => String(value || '').normalize('NFKC').trim().toUpperCase();

// Only interpret the verified TOTO registration format; do not guess fields in arbitrary QR data.
export function parseInventoryCode(value) {
  const text = String(value || '').normalize('NFKC').trim();
  const urls = text.match(/https?:\/\/[^\s]+/g) || [];
  for (const token of urls) {
    try {
      const url = new URL(token);
      if (url.hostname !== 'touroku.toto.jp' || url.pathname !== '/t.htm') continue;
      const modelNumber = normalizeModelNumber(url.searchParams.get('gs'));
      if (/^[A-Z0-9][A-Z0-9._/-]{0,79}$/.test(modelNumber)) return { type: 'model', modelNumber, manufacturer: 'TOTO' };
    } catch { /* Not a supported product URL. */ }
  }
  if (/^[^\s:/?&=]{1,80}$/.test(text)) return { type: 'barcode', barcode: text };
  return { type: 'unsupported' };
}

export function findModelProducts(items, code) {
  return items.filter(item => normalizeModelNumber(item.modelNumber) === code.modelNumber &&
    (!String(item.manufacturer || '').trim() || normalizeModelNumber(item.manufacturer) === code.manufacturer));
}
