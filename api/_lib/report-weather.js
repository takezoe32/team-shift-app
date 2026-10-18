import { tokyoDate } from '../../src/dailyReport.mjs';
import { selectFukuokaForecast, forecastWeatherText } from '../../src/dailyReportWeather.mjs';

export function observationUrl(date) {
  const [year, month] = date.split('-');
  return 'https://www.data.jma.go.jp/stats/etrn/view/daily_s1.php?prec_no=82&block_no=47807&year=' + year + '&month=' + Number(month) + '&day=&view=p1s';
}
const plain = html => html.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').trim();
export function selectFukuokaObservation(html, date) {
  const [year, month, day] = date.split('-').map(Number);
  if (!html.includes(year + '年' + month + '月') || !html.includes('福岡')) return null;
  const table = html.match(/<table\b[^>]*id=["']tablefix1["'][^>]*>([\s\S]*?)<\/table>/i)?.[1];
  if (!table) return null;
  for (const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => plain(cell[1]));
    if (cells.length !== 21 || cells[0] !== String(day)) continue;
    const number = text => /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : null;
    const high = number(cells[7]), low = number(cells[8]), weather = cells[19];
    if (high === null || low === null) return null;
    const weatherPublished = /[晴曇雨雪霧雷みぞれ]/.test(weather);
    return { date, weather: weatherPublished ? weather : '天気未公表', weatherPending: !weatherPublished, high, low, area: '福岡（気象庁・観測値）', kind: 'observation', sourceUrl: observationUrl(date) };
  }
  return null;
}
export async function loadReportWeather(date, fetcher = fetch, now = Date.now) {
  const get = url => fetcher(url, { signal: AbortSignal.timeout(8000) });
  if (date < tokyoDate(now())) {
    try {
      const response = await get(observationUrl(date));
      if (response.ok) {
        const observation = selectFukuokaObservation(await response.text(), date);
        if (observation) return observation;
      }
    } catch { /* A missing observation can still have a dated forecast. */ }
  }
  try {
    const response = await get('https://www.jma.go.jp/bosai/forecast/data/forecast/400000.json');
    if (response.ok) return selectFukuokaForecast(await response.json(), date);
  } catch { /* Keep saved/manual weather when the upstream is unavailable. */ }
  return null;
}
export async function reportWeatherFields(date, fields, fetcher, now, loadWeather = loadReportWeather, store) {
  if (fields.weather !== undefined) return { fields };
  let weather = await loadWeather(date, fetcher, now);
  const cached = await store?.weather?.(date);
  if (cached?.date === date && (!weather || weather.weatherPending)) weather = weather ? { ...weather, weather: cached.weather + '（予報）', weatherPending: false } : cached;
  if (weather && !weather.weatherPending) await store?.putWeather?.(date, weather);
  return weather ? { fields: { ...fields, weather: forecastWeatherText(weather) }, ...(weather.weatherPending ? { weatherWarning: '天気概況は気象庁で未公表です。最高・最低気温を入力しました。' } : {}) }
    : { fields, weatherWarning: '対象日の天気・気温を取得できませんでした。保存済みの天候は保持します。' };
}

export async function cacheCurrentForecast(store, fetcher, now, loadWeather = loadReportWeather) {
  if (!store?.putWeather) return;
  try {
    const today = tokyoDate(now());
    const forecast = await loadWeather(today, fetcher, now);
    if (forecast) await store.putWeather(today, forecast);
  } catch { /* Capturing tomorrow's fallback must not stop today's report. */ }
}
