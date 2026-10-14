const collator = new Intl.Collator('ja', { numeric: true, sensitivity: 'base' });
const nameCollator = new Intl.Collator('ja');
const text = value => String(value ?? '').normalize('NFKC').trim();
export function sortInventoryItems(items, order = 'name') {
  return [...items].sort((a, b) => {
    if (order === 'shelf-asc' || order === 'shelf-desc') {
      const left = text(a.shelfNumber), right = text(b.shelfNumber);
      if (!left && right) return 1;
      if (left && !right) return -1;
      const shelf = collator.compare(left, right);
      if (shelf) return order === 'shelf-desc' ? -shelf : shelf;
    }
    return nameCollator.compare(text(a.kind), text(b.kind)) || nameCollator.compare(text(a.name), text(b.name));
  });
}
