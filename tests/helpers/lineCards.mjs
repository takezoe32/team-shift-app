// Read outgoing messages without coupling flow tests to a particular LINE card layout.
export function lineActions(card) {
  if (Array.isArray(card)) return card.flatMap(lineActions);
  if (!card || typeof card !== 'object') return [];
  if (card.action) return [card.action];
  if (card.template?.actions) return card.template.actions;
  return Object.values(card).flatMap(lineActions);
}
export function lineText(card) {
  if (!card || typeof card !== 'object') return '';
  if (typeof card.text === 'string') return card.text;
  return Object.entries(card).filter(([key]) => key !== 'action').map(([, value]) => lineText(value)).filter(Boolean).join('\n');
}
