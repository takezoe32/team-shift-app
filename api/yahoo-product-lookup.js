export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GETのみ対応しています。' });
  const jan = String(req.query?.jan || '').trim();
  if (!/^\d{8,14}$/.test(jan)) return res.status(400).json({ error: 'JANコードは8〜14桁の数字で指定してください。' });
  const clientId = globalThis.process?.env?.YAHOO_CLIENT_ID;
  if (!clientId) return res.status(503).json({ error: 'Yahoo検索の設定がありません。Google検索または手入力をご利用ください。' });
  try {
    const url = new URL('https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch');
    url.searchParams.set('appid', clientId);
    url.searchParams.set('jan_code', jan);
    url.searchParams.set('results', '20');
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return res.status(503).json({ error: 'Yahoo検索を利用できません。時間をおいて再検索するか、Google検索・手入力をご利用ください。' });
    const data = await response.json();
    if (!Array.isArray(data.hits)) throw new Error('Invalid response');
    const candidates = [];
    for (const hit of data.hits) {
      if (String(hit.janCode || '').trim() !== jan || typeof hit.name !== 'string' || !/[ぁ-んァ-ヶ一-龠]/.test(hit.name)) continue;
      let productUrl;
      try { productUrl = new URL(hit.url); } catch { continue; }
      if (productUrl.protocol !== 'https:' || !['store.shopping.yahoo.co.jp', 'shopping.yahoo.co.jp', 'lohaco.yahoo.co.jp'].includes(productUrl.hostname)) continue;
      if (candidates.some(candidate => candidate.url === productUrl.href)) continue;
      candidates.push({ title: hit.name.trim().slice(0, 180), url: productUrl.href, jan, exactCodeMatch: true, officialSource: false, likelyCommerce: true, sourceType: 'Yahoo!ショッピング', description: '販売店の商品情報（メーカー公式未確認）。型番・単品／セット数量を確認してください。' });
    }
    return res.status(200).json({ jan, candidates: candidates.slice(0, 6), message: candidates.length ? 'JANコードが一致する販売店の候補です。メーカー公式未確認です。型番・単品／セット数量を確認して選択してください。' : 'JANコードが一致する日本語の商品候補が見つかりませんでした。Google検索または手入力で登録できます。' });
  } catch {
    // Never log the upstream URL or error: it can contain the Client ID.
    return res.status(503).json({ error: 'Yahoo検索に失敗しました。Google検索または手入力をご利用ください。' });
  }
}
