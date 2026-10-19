const normalized = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\s・･.,、。()（）「」『』\-ー]/g, '').replace(/株式会社|有限会社|合同会社|㈱|㈲/g, '');
export const eligibleLineMembers = users => Object.entries(users || {}).filter(([, user]) => user.name && user.role !== 'viewer').map(([id, user]) => ({ id, name: user.name }));
export function matchingLineMember(users, displayName) {
  const matches = eligibleLineMembers(users).filter(user => normalized(user.name) === normalized(displayName));
  return matches.length === 1 ? matches[0].id : '';
}
export function partnerSuggestions(input, names) {
  const query = normalized(input);
  if (!query) return [];
  const distance = (a, b) => {
    let row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 0; i < a.length; i++) {
      const next = [i + 1];
      for (let j = 0; j < b.length; j++) next.push(Math.min(next[j] + 1, row[j + 1] + 1, row[j] + (a[i] === b[j] ? 0 : 1)));
      row = next;
    }
    return row[b.length];
  };
  return [...new Set((names || []).filter(name => typeof name === 'string' && name.trim()))].map(name => {
    const value = normalized(name);
    return { name, score: 1 - distance(query, value) / Math.max(query.length, value.length, 1) + (value.includes(query) || query.includes(value) ? 0.5 : 0) };
  }).sort((a, b) => b.score - a.score || Math.abs(a.name.length - input.length) - Math.abs(b.name.length - input.length) || a.name.localeCompare(b.name, 'ja')).slice(0, 3).map(item => item.name);
}
