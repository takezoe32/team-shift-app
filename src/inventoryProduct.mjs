const normalize = value => String(value ?? '').normalize('NFKC').trim();

export const validateInventoryReplacement = (items, productId, replacementId) => {
  if (!replacementId) return;
  if (productId === replacementId) throw new Error('自分自身を代替品には設定できません。');
  const byId = new Map(items.map(item => [item.id, item]));
  const seen = new Set([productId]);
  let id = replacementId;
  while (id) {
    if (seen.has(id)) throw new Error('代替品の関係が循環しています。');
    seen.add(id);
    const item = byId.get(id);
    if (!item) throw new Error('代替品の商品が見つかりません。先に登録してください。');
    id = item.replacementProductId || '';
  }
};

export const hasInventoryProductDetails = item =>
  ['kind', 'name', 'manufacturer', 'modelNumber'].some(field => normalize(item?.[field]));

export const inventoryProductLabel = item =>
  normalize(item?.name) ||
  [normalize(item?.manufacturer), normalize(item?.modelNumber)].filter(Boolean).join(' ') ||
  normalize(item?.kind) || '商品情報未入力';
