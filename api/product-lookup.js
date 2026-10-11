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
  const tags = html.match(/<meta\\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attrs = {};
    for (const match of tag.matchAll(/([\\w:-]+)\\s*=\\s*["']([^"']*)["']/gi)) attrs[match[1].toLowerCase()] = decodeHtml(match[2]);
    if ((attrs.property || attrs.name || '').toLowerCase() === property.toLowerCase()) return stripTags(attrs.content || '');
  }
  return '';
};
const getPageTitle = (html) => htmlMeta(html, 'og:title') || htmlMeta(html, 'twitter:title') || stripTags((html.match(/<title[^>]*>([\\s\\S]*?)<\\/title>/i) || [])[1] || '');
const safeHttpUrl = (value) => {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
};

// この一覧に含まれるメーカー公式ドメイン以外は候補として返さない。
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
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=1800');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GETのみ対応しています。' });
  const jan = String(req.query?.jan || '').replace(/\\s+/g, '');
  if (!/^\\d{8,14}$/.test(jan)) return res.status(400).json({ error: 'JANコードは8〜14桁の数字で指定してください。' });

  try {
    const domainQuery = OFFICIAL_DOMAINS.map(entry => 'site:' + entry.domain).join(' OR ');
    const queries = [
      '"' + jan + '" (' + domainQuery + ')',
      '"' + jan + '" site:panasonic.jp OR site:panasonic.com OR site:jpn.faq.panasonic.com'
    ];
    const seenUrls = new Set();
    const candidates = [];
    for (const query of queries) {
      let response;
      try {
        response = await fetch('https://www.bing.com/search?format=rss&q=' + encodeURIComponent(query), {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TeamShiftInventory/1.0)' },
          signal: AbortSignal.timeout(7000)
        });
      } catch { continue; }
      if (!response.ok) continue;
      const xml = await response.text();
      const items = [...xml.matchAll(/<item>([\\s\\S]*?)<\\/item>/gi)].map(match => match[1]);
      for (const item of items) {
        if (candidates.length >= 8) break;
        const searchTitle = xmlValue(item, 'title');
        const searchUrl = safeHttpUrl(xmlValue(item, 'link'));
        if (!searchTitle || !searchUrl || seenUrls.has(searchUrl)) continue;
        const manufacturer = getOfficialManufacturer(searchUrl);
        if (!manufacturer) continue;
        seenUrls.add(searchUrl);
        try {
          const pageResponse = await fetch(searchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TeamShiftInventory/1.0)', 'Accept': 'text/html,application/xhtml+xml' },
            redirect: 'follow',
            signal: AbortSignal.timeout(4500)
          });
          const finalUrl = safeHttpUrl(pageResponse.url) || searchUrl;
          const finalManufacturer = getOfficialManufacturer(finalUrl);
          if (!pageResponse.ok || !finalManufacturer || !/text\\/html|application\\/xhtml/i.test(pageResponse.headers.get('content-type') || '')) continue;
          const html = (await pageResponse.text()).slice(0, 1_500_000);
          // HTML本文にJANが完全一致で掲載されていないページは採用しない。
          const escapedJan = jan.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
          const exactCodeMatch = new RegExp('(^|[^0-9])' + escapedJan + '([^0-9]|$)').test(html.replace(/<[^>]*>/g, ' '));
          if (!exactCodeMatch) continue;
          const rawTitle = getPageTitle(html) || searchTitle;
          const title = rawTitle.replace(/\\s*[|｜-]\\s*(公式|製品情報|商品情報|メーカー公式).*$/i, '').trim();
          // 英語だけのタイトルを商品名として自動入力しない。
          if (!title || !containsJapanese(title)) continue;
          const description = htmlMeta(html, 'description') || htmlMeta(html, 'og:description') || xmlValue(item, 'description');
          if (candidates.some(candidate => candidate.url === finalUrl)) continue;
          candidates.push({
            title: title.slice(0, 180),
            url: finalUrl,
            description: description.slice(0, 360),
            manufacturer: finalManufacturer.name,
            sourceType: 'メーカー公式サイト',
            officialSource: true,
            exactCodeMatch: true,
            likelyCommerce: false
          });
        } catch {
          // 公式ページを取得・検証できない場合は誤登録防止のため候補にしない。
        }
      }
    }
    return res.status(200).json({
      jan,
      candidates,
      message: candidates.length
        ? 'メーカー公式サイト上でJANコードを確認できた候補です。商品名・型番を確認してから登録してください。'
        : 'メーカー公式サイト上でJANコードと日本語の商品名を確認できませんでした。誤った商品名を自動入力せず、Google検索または手入力で確認してください。'
    });
  } catch (error) {
    console.error('Official product lookup failed:', error);
    return res.status(200).json({
      jan,
      candidates: [],
      message: 'メーカー公式サイトの商品情報を確認できませんでした。Google検索または手入力で商品名を確認してください。'
    });
  }
}
