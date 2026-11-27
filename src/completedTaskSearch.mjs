// 終了履歴のキーワード検索. The words of the query (split by spaces) all have to be found somewhere in the entry:
// 件名・詳しい内容・パートナー名・使用商品・担当者・終了操作した人・申し送り（本文と書いた人）.
// Full-/half-width, upper/lower case and ひらがな/カタカナ are treated as the same.
const fold = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g, kana => String.fromCharCode(kana.charCodeAt(0) - 0x60));
export const searchWords = query => fold(query).split(/\s+/).filter(Boolean);
export function historySearchText(entry) {
  return fold([entry?.title, entry?.content, entry?.partnerName, entry?.productName, entry?.ownerName, ...(entry?.assigneeNames || []), entry?.completedByName, entry?.historyLabel,
    ...(entry?.handoffs || []).flatMap(note => [note?.text, note?.authorName])].filter(Boolean).join('\n'));
}
export function filterHistory(entries, query) {
  const words = searchWords(query);
  if (!words.length) return entries;
  return entries.filter(entry => { const text = historySearchText(entry); return words.every(word => text.includes(word)); });
}
