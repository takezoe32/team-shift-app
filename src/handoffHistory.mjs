// Initial registration remains in the task body, never in handoff history.
export function handoffUpdates(item) {
  return (Array.isArray(item?.updates) ? item.updates : []).filter((update, index) =>
    !(Object.hasOwn(item, 'partnerName') && index === 0 && !update?.kind) && update && update.kind !== 'initial' && !String(update.id || '').startsWith('legacy_'));
}
export function initialPartnerText(item) {
  const initial = (item?.updates || []).find((update, index) => update?.kind === 'initial' || String(update?.id || '').startsWith('legacy_') || (index === 0 && !update?.kind));
  return initial ? initial.text || '' : item?.updates?.length ? '' : item?.content || '';
}
