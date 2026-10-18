import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectFukuokaObservation, loadReportWeather, reportWeatherFields, cacheCurrentForecast } from '../api/_lib/report-weather.js';
import { runDailyReport } from '../api/_lib/save-daily-report.js';
const date = '2026-10-17';
const now = () => Date.parse('2026-10-18T00:00:00+09:00');
function page(weather = '晴', high = '27.8') {
  const cells = ['17', '1023', '1025', '--', '--', '--', '21.7', high, '15.0', '58', '30', '2.1', '5.1', '北東', '9.4', '北北東', '10.2', '--', '--', weather, ''];
  return '福岡 2026年10月<table id="tablefix1"><tr>' + cells.map(v => '<td>' + v + '</td>').join('') + '</tr></table>';
}
test('official observed day and high/low are parsed without confusing adjacent dates or missing values', () => {
  const result = selectFukuokaObservation(page(), date);
  assert.equal(result.weather, '晴'); assert.equal(result.high, 27.8); assert.equal(result.low, 15);
  assert.equal(selectFukuokaObservation(page(), '2026-10-16'), null);
  assert.equal(selectFukuokaObservation(page().replace('2026年10月', '2025年10月'), date), null);
  assert.equal(selectFukuokaObservation(page('晴', '×'), date), null);
  assert.equal(selectFukuokaObservation(page(''), date).weatherPending, true);
});
test('previous day observation fetch is unauthenticated and takes priority over forecasts', async () => {
  const result = await loadReportWeather(date, async (url, options) => {
    assert.match(url, /block_no=47807/); assert.equal(options.headers, undefined);
    return new Response(page());
  }, now);
  assert.equal(result.high, 27.8); assert.equal(result.kind, 'observation');
});
test('manual entries win; missing weather preserves saved cells; unpublished descriptions use dated cached forecasts', async () => {
  assert.deepEqual(await reportWeatherFields(date, { weather: '手入力' }, null, now, async () => { throw Error('must not fetch'); }), { fields: { weather: '手入力' } });
  const unavailable = await reportWeatherFields(date, {}, null, now, async () => null);
  assert.equal(unavailable.fields.weather, undefined); assert.ok(unavailable.weatherWarning);
  const pending = selectFukuokaObservation(page(''), date);
  const resolved = await reportWeatherFields(date, {}, null, now, async () => pending, { weather: async () => ({ date, weather: '晴れ' }), putWeather: async () => {} });
  assert.equal(resolved.fields.weather, '晴れ（予報） 27.8/15℃');
  const noCache = await reportWeatherFields(date, {}, null, now, async () => pending);
  assert.equal(noCache.fields.weather, '天気未公表 27.8/15℃'); assert.ok(noCache.weatherWarning);
});
test('forecast capture persists today for the next automatic run', async () => {
  let saved;
  await cacheCurrentForecast({ putWeather: async (date, weather) => { saved = { date, weather }; } }, null, now, async date => ({ date, weather: '晴れ' }));
  assert.equal(saved.date, '2026-10-18'); assert.equal(saved.weather.date, saved.date);
});
test('automatic save actually passes weather to Drive without a browser or manual fields', async () => {
  let written, complete = false, released = false;
  await runDailyReport({
    date, automatic: true, now, loadWeather: async () => ({ date, weather: '晴', high: 27.8, low: 15 }),
    store: { lock: async () => async () => { released = true; }, automaticRun: async () => false, get: async () => ({ refreshToken: 'refresh' }), source: async () => ({}), completeAutomaticRun: async () => { complete = true; } },
    client: { setCredentials() {}, getAccessToken: async () => ({ token: 'access' }) },
    saveReport: async (_token, _report, fields) => { written = fields; return { id: 'month' }; }
  });
  assert.equal(written.weather, '晴 27.8/15℃'); assert.equal(complete, true); assert.equal(released, true);
});
