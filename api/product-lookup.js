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
        const description = xmlValue(item, 'description');
        if (!url || !title || searchItems.some(entry => entry.url === url)) continue;
        searchItems.push({ title, url, description });
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
          exactCodeMatch = html.includes(jan);
        }
      } catch {
        // Search snippets are still useful when a manufacturer blocks automated page reads.
      }

      const title = (pageTitle || item.title).replace(/\s*[|｜-]\s*(公式|製品情報|商品情報|メーカー公式).*$/i, '').trim();
      if (!title) continue;
      candidates.push({
        title: title.slice(0, 180),
        searchTitle: item.title.slice(0, 180),
        url: canonicalUrl,
        description: description.slice(0, 360),
        exactCodeMatch,
        likelyCommerce: isLikelyCommerce(canonicalUrl)
      });
    }

    candidates.sort((a, b) => Number(b.exactCodeMatch && !b.likelyCommerce) - Number(a.exactCodeMatch && !a.likelyCommerce));
    return res.status(200).json({
      jan,
      candidates: candidates.slice(0, 6),
      message: candidates.length
        ? '検索候補を取得しました。メーカー公式ページとJANコードを確認してください。'
        : '商品情報が見つかりませんでした。JANコードを使ってGoogle検索するか、商品名を手入力してください。'
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
