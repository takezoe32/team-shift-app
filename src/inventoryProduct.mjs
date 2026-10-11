const normalize = value => String(value ?? '').normalize('NFKC').trim();

export const hasInventoryProductDetails = item =>
  ['kind', 'name', 'manufacturer', 'modelNumber'].some(field => normalize(item?.[field]));

export const inventoryProductLabel = item =>
  normalize(item?.name) ||
  [normalize(item?.manufacturer), normalize(item?.modelNumber)].filter(Boolean).join(' ') ||
  normalize(item?.kind) || '商品情報未入力';
