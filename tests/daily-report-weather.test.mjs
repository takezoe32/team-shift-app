import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectFukuokaForecast, forecastTemperatures, forecastWeatherText } from '../src/dailyReportWeather.mjs';

test('only the requested Japan date and Fukuoka district forecast are used', () => {
  const data = [{ reportDatetime: '2026-10-15T11:00:00+09:00', timeSeries: [{ timeDefines: ['2026-10-15T02:00:00Z', '2026-10-15T15:00:00Z'], areas: [{ area: { code: '400020' }, weathers: ['雨', '雨'] }, { area: { code: '400010' }, weathers: ['晴れ', '晴れ　時々　くもり'] }] }] }];
  assert.equal(selectFukuokaForecast(data, '2026-10-15').weather, '晴れ');
  assert.equal(selectFukuokaForecast(data, '2026-10-16').weather, '晴れ 時々 くもり');
  assert.equal(selectFukuokaForecast(data, '2026-10-14'), null);
  assert.equal(selectFukuokaForecast({}, '2026-10-15'), null);
  assert.throws(() => selectFukuokaForecast(data, '2026-02-30'));
});


test('daily forecast duplicates must not become a fabricated minimum; tomorrow uses min and max slots', () => {
  const data = [{ reportDatetime: '2026-10-15T11:00:00+09:00', timeSeries: [{ timeDefines: ['2026-10-15T09:00:00+09:00', '2026-10-15T00:00:00+09:00', '2026-10-16T00:00:00+09:00', '2026-10-16T09:00:00+09:00'], areas: [{ area: { code: '82182' }, temps: ['24', '24', '15', '26'] }] }] }];
  assert.deepEqual(forecastTemperatures(data, '2026-10-15'), { high: 24, low: null });
  assert.deepEqual(forecastTemperatures(data, '2026-10-16'), { high: 26, low: 15 });
  assert.equal(forecastWeatherText({ weather: '晴れ', high: 26, low: 22 }), '晴れ 26/22℃');
  assert.equal(forecastWeatherText({ weather: '晴れ', high: 24, low: null }), '晴れ 24/—℃');
});
