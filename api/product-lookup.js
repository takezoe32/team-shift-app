const decodeHtml = (value = '') => value
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
  .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));

const stripTags = (value = '') => decodeHtml(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

const xmlValue = (item, tag) => {
  const match = item.match(new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + tag + '>', 'i'));
  return match ? stripTags(match[1]) : '';
};

const htmlMeta = (html, property) => {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attrs = {};
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/gi)) {
      attrs[match[1].toLowerCase()] = decodeHtml(match[2]);
    }
    if ((attrs.property || attrs.name || '').toLowerCase() === property.toLowerCase()) {
      return stripTags(attrs.content || '');
    }
  }
  return '';
};

const getPageTitle = (html) => htmlMeta(html, 'og:title') ||
  htmlMeta(html, 'twitter:title') ||
  stripTags((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');

const safeHttpUrl = (value) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
};

const isLikelyCommerce = (url) => /amazon\.|rakuten\.|yodobashi\.|biccamera\.|monotaro\.|shopping\.yahoo\.|lohaco\.|askul\.|misumi-ec\./i.test(url);

const OFFICIAL_DOMAINS = [
  { domain: 'panasonic.jp', name: 'パナソニック' },
  { domain: 'panasonic.com', name: 'パナソニック' },
  { domain: 'jpn.faq.panasonic.com', name: 'パナソニック' },
  { domain: 'lighting-daiko.co.jp', name: '大光電機' },
  { domain: 'odelic.co.jp', name: 'オーデリック' },
  { domain: 'koizumi-lt.co.jp', name: 'コイズミ照明' },
  { domain: 'endo-lighting.co.jp', name: '遠藤照明' },
  { domain: 'iwasaki.co.jp', name: '岩崎電気' },
  { domain: 'mitsubishielectric.co.jp', name: '三菱電機' },
  { domain: 'irisohyama.co.jp', name: 'アイリスオーヤマ' },
  { domain: 'toshiba-lifestyle.com', name: '東芝ライフスタイル' },
  { domain: 'lighting.toshiba.co.jp', name: '東芝ライテック' },
  { domain: 'maxell.co.jp', name: 'マクセル' },
  { domain: 'yamagiwa.co.jp', name: 'YAMAGIWA' },
  { domain: 'ushio.co.jp', name: 'ウシオ電機' },
  { domain: 'sharp.co.jp', name: 'シャープ' },
  { domain: 'hitachi-gls.co.jp', name: '日立グローバルライフソリューションズ' }
];
const getOfficialManufacturer = (url) => {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return OFFICIAL_DOMAINS.find(entry => hostname === entry.domain || hostname.endsWith('.' + entry.domain)) || null;
  } catch { return null; }
};
const containsJapanese = (value = '') => /[ぁ-んァ-ヶ一-龠]/.test(value);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GETのみ対応しています。' });

  const jan = String(req.query?.jan || '').replace(/\s+/g, '');
  if (!/^\d{8,14}$/.test(jan)) {
    return res.status(400).json({ error: 'JANコードは8〜14桁の数字で指定してください。' });
  }

  try {
    const queries = [
      '"' + jan + '" 商品 メーカー',
      '"' + jan + '" 照明 OR 電球 OR 建築設備'
    ];
    const searchItems = [];
    for (const query of queries) {
      const rssUrl = 'https://www.bing.com/search?format=rss&q=' + encodeURIComponent(query);
      const response = await fetch(rssUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TeamShiftInventory/1.0)' },
        signal: AbortSignal.timeout(7000)
      });
      if (!response.ok) continue;
      const xml = await response.text();
      const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(match => match[1]);
      for (const item of items) {
        const title = xmlValue(item, 'title');
        const url = safeHttpUrl(xmlValue(item, 'link'));
        const manufacturer = getOfficialManufacturer(url);
        const description = xmlValue(item, 'description');
        if (!url || !title || !manufacturer || searchItems.some(entry => entry.url === url)) continue;
        searchItems.push({ title, url, description, manufacturer });
      }
      if (searchItems.length >= 12) break;
    }

    const candidates = [];
    for (const item of searchItems.slice(0, 8)) {
      let pageTitle = '';
      let description = item.description;
      let exactCodeMatch = false;
      let canonicalUrl = item.url;
      try {
        const pageResponse = await fetch(item.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TeamShiftInventory/1.0)', 'Accept': 'text/html,application/xhtml+xml' },
          redirect: 'follow',
          signal: AbortSignal.timeout(4500)
        });
        const finalUrl = safeHttpUrl(pageResponse.url);
        if (finalUrl) canonicalUrl = finalUrl;
        const contentType = pageResponse.headers.get('content-type') || '';
        if (pageResponse.ok && /text\/html|application\/xhtml/i.test(contentType)) {
          const html = (await pageResponse.text()).slice(0, 1_000_000);
          pageTitle = getPageTitle(html);
          description = htmlMeta(html, 'description') || htmlMeta(html, 'og:description') || description;
          exactCodeMatch = html.replace(/<[^>]*>/g, ' ').split(/\D+/).includes(jan);
        }
      } catch {
        // Search snippets are still useful when a manufacturer blocks automated page reads.
      }

      const title = (pageTitle || item.title).replace(/\s*[|｜-]\s*(公式|製品情報|商品情報|メーカー公式).*$/i, '').trim();
      const manufacturer = getOfficialManufacturer(canonicalUrl) || item.manufacturer;
      if (!title || !manufacturer || !exactCodeMatch || !containsJapanese(title)) continue;
      candidates.push({
        title: title.slice(0, 180),
        searchTitle: item.title.slice(0, 180),
        url: canonicalUrl,
        description: description.slice(0, 360),
        exactCodeMatch,
        manufacturer: manufacturer.name,
        sourceType: 'メーカー公式サイト',
        officialSource: true,
        likelyCommerce: false
      });
    }

    candidates.sort((a, b) => Number(b.exactCodeMatch && !b.likelyCommerce) - Number(a.exactCodeMatch && !a.likelyCommerce));
    return res.status(200).json({
      jan,
      candidates: candidates.slice(0, 6),
      message: candidates.length
        ? 'メーカー公式サイト上でJANコードと日本語の商品名を確認できた候補です。登録前に内容を確認してください。'
        : 'メーカー公式サイト上でJANコードと日本語の商品名を確認できませんでした。誤った商品名を自動入力せず、Google検索または手入力で確認してください。'
    });
  } catch (error) {
    console.error('Product lookup failed:', error);
    return res.status(200).json({
      jan,
      candidates: [],
      message: '商品情報の自動取得に失敗しました。Google検索または手入力をお試しください。'
    });
  }
}
