const makers = [
  ['パナソニック', 'Panasonic', 'パナソニック'],
  ['東芝', 'TOSHIBA', '東芝'],
  ['三菱電機', 'MITSUBISHI ELECTRIC', '三菱電機'],
  ['アイリスオーヤマ', 'IRIS OHYAMA', 'アイリスオーヤマ'],
  ['オーデリック', 'ODELIC', 'オーデリック'],
  ['大光電機', 'DAIKO', '大光電機'],
  ['コイズミ照明', 'KOIZUMI', 'コイズミ照明'],
  ['遠藤照明', 'ENDO', '遠藤照明'],
  ['岩崎電気', 'IWASAKI', '岩崎電気'],
  ['オーム電機', 'OHM', 'オーム電機']
];
const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const tokenPattern = /(?<![A-Za-z0-9])([A-Za-z][A-Za-z0-9]*(?:[-/][A-Za-z0-9]+)+)(?![A-Za-z0-9])/g;
export function yahooProductFields(title, brand = '') {
  let productName = title;
  // Brands (e.g. パルック) are not necessarily manufacturers. Only recognized
  // manufacturer names are mapped; unknown brands remain separate evidence.
  const maker = makers.find(([jp, en]) => [jp, en].some(alias =>
    new RegExp('(^|[^A-Za-z])' + escaped(alias) + '($|[^A-Za-z])', 'i').test(title) || brand.toLowerCase() === alias.toLowerCase()));
  const manufacturer = maker?.[2] || '';
  const tokens = [...title.matchAll(tokenPattern)].map(match => match[1]).filter(token => /\d/.test(token) && /[A-Za-z]/.test(token) && token.length >= 6);
  const normalized = token => token.replace(/[-/]/g, '').toUpperCase();
  const groups = new Set(tokens.map(normalized));
  // Multiple distinct model numbers are ambiguous; never choose one silently.
  const modelNumber = groups.size === 1 ? tokens.sort((a, b) => b.length - a.length)[0] : '';
  if (maker) for (const alias of maker.slice(0, 2)) productName = productName.replace(new RegExp(escaped(alias), 'gi'), ' ');
  if (modelNumber) {
    const modelTokens = [modelNumber, ...tokens, normalized(modelNumber)];
    for (const token of [...new Set(modelTokens)].sort((a, b) => b.length - a.length)) {
      productName = productName.replace(new RegExp('(?<![A-Za-z0-9])' + escaped(token) + '(?![A-Za-z0-9])', 'gi'), ' ');
    }
  }
  productName = productName.replace(/\s+/g, ' ').trim();
  return { productName, manufacturer, modelNumber, brand, fieldsInferred: true };
}
