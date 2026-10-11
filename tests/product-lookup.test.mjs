import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/product-lookup.js';

const jan = '4549980715123';
async function lookup({ title = 'LED電球 商品情報', code = jan, finalUrl = 'https://panasonic.jp/product/example' } = {}) {
  const original = globalThis.fetch;
  globalThis.fetch = async url => String(url).includes('bing.com')
    ? new Response('<rss><item><title>商品情報</title><link>https://panasonic.jp/product/example</link></item></rss>')
    : { ok: true, url: finalUrl, headers: new Headers({ 'content-type': 'text/html' }), text: async () => `<title>${title}</title><p>${code}</p>` };
  let body;
  const response = { setHeader() {}, status() { return this; }, json(value) { body = value; } };
  try { await handler({ method: 'GET', query: { jan } }, response); return body; }
  finally { globalThis.fetch = original; }
}
test('Japanese official page with exact JAN is a candidate', async () => {
  assert.equal((await lookup()).candidates.length, 1);
});
test('a longer numeric code is not an exact JAN match', async () => {
  assert.equal((await lookup({ code: jan + '0' })).candidates.length, 0);
});
test('English-only titles are excluded', async () => {
  assert.equal((await lookup({ title: 'LED light bulb' })).candidates.length, 0);
});
test('redirect to a nonofficial site cannot inherit official status', async () => {
  assert.equal((await lookup({ finalUrl: 'https://example.com/product' })).candidates.length, 0);
});
