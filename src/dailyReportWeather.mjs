import { tokyoDate, validateReportDate } from './dailyReport.mjs';

export const WEATHER_SOURCE_URL = 'https://www.jma.go.jp/bosai/forecast/#area_type=offices&area_code=400000';
export function selectFukuokaForecast(data, date) {
  validateReportDate(date);
  for (const forecast of Array.isArray(data) ? data : []) {
    for (const series of forecast.timeSeries || []) {
      const area = series.areas?.find(item => item.area?.code === '400010');
      if (!area?.weathers) continue;
      const index = series.timeDefines?.findIndex(time => tokyoDate(time) === date);
      const weather = index >= 0 ? area.weathers[index] : null;
      if (typeof weather === 'string' && weather.trim()) return { date, ...forecastTemperatures(data, date), weather: weather.replace(/[\s　]+/g, ' ').trim(), area: '福岡地方（福岡市東区を含む）', issuedAt: forecast.reportDatetime, sourceUrl: WEATHER_SOURCE_URL };
    }
  }
  return null;
}


export function forecastTemperatures(data, date) {
  let high = null, low = null;
  const numeric = value => /^-?\d+$/.test(String(value ?? '')) ? Number(value) : null;
  for (const forecast of Array.isArray(data) ? data : []) for (const series of forecast.timeSeries || []) {
    const area = series.areas?.find(item => item.area?.code === '82182');
    if (!area) continue;
    for (let i = 0; i < (series.timeDefines || []).length; i++) {
      const time = series.timeDefines[i];
      if (tokyoDate(time) !== date) continue;
      high ??= numeric(area.tempsMax?.[i]);
      low ??= numeric(area.tempsMin?.[i]);
      if (area.temps) {
        const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', hourCycle: 'h23' }).format(new Date(time)));
        if (hour === 9) high ??= numeric(area.temps[i]);
        // Today's daily forecast repeats its high in both slots; it does not provide a low.
        if (hour === 0 && date > tokyoDate(forecast.reportDatetime)) low ??= numeric(area.temps[i]);
      }
    }
  }
  return { high, low };
}

export function forecastWeatherText(forecast) {
  return forecast.weather + (forecast.high != null || forecast.low != null ? ` ${forecast.high ?? '—'}/${forecast.low ?? '—'}℃` : '');
}
