export function newestPartnerUpdates(updates) {
  return (Array.isArray(updates) ? updates : []).map((update, index) => ({ update, index, time: Date.parse(update?.createdAt) || 0 }))
    .filter(item => item.update)
    .sort((a, b) => b.time - a.time || b.index - a.index)
    .map(item => item.update);
}
