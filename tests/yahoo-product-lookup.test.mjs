import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/yahoo-product-lookup.js';
const jan = '4549980715123';
async function lookup(hits, options = {}) {
  const oldFetch = globalThis.fetch;
  const oldId = process.env.YAHOO_CLIENT_ID;
  process.env.YAHOO_CLIENT_ID = 'test-only-id';
  if (options.missing) delete process.env.YAHOO_CLIENT_ID;
  let body, status;
  globalThis.fetch = async url => {
    assert.equal(url.searchParams.get('jan_code'), jan);
    assert.equal(url.searchParams.get('appid'), 'test-only-id');
    if (options.fail) throw new Error('URL with test-only-id');
    return Response.json({ hits });
  };
  try {
    await handler({ method: 'GET', query: { jan } }, { setHeader() {}, status(value) { status = value; return this; }, json(value) { body = value; } });
    return { body, status };
  } finally {
    globalThis.fetch = oldFetch;
    if (oldId === undefined) delete process.env.YAHOO_CLIENT_ID; else process.env.YAHOO_CLIENT_ID = oldId;
  }
}
test('Yahoo only returns exact JAN Japanese candidates with safe merchant URLs', async () => {
  const valid = { janCode: jan, name: 'LED電球 10個セット', url: 'https://store.shopping.yahoo.co.jp/shop/bulb.html' };
  const { body } = await lookup([valid, valid, { ...valid, janCode: jan + '0' }, { ...valid, name: 'LED bulb' }, { ...valid, url: 'https://evil.example/a' }]);
  assert.equal(body.candidates.length, 1);
  assert.equal(body.candidates[0].officialSource, false);
  assert.match(body.candidates[0].title, /10個セット/);
  assert.ok(!JSON.stringify(body).includes('test-only-id'));
});
test('Yahoo unavailable and missing credentials allow manual fallback without leaking credentials', async () => {
  for (const options of [{ fail: true }, { missing: true }]) {
    const { body, status } = await lookup([], options);
    assert.equal(status, 503);
    assert.ok(!JSON.stringify(body).includes('test-only-id'));
  }
});
