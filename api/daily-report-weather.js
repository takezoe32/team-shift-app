import { selectFukuokaForecast } from '../src/dailyReportWeather.mjs';
import { validateReportDate } from '../src/dailyReport.mjs';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GETのみ対応しています。' });
  const date = String(req.query?.date || '');
  try { validateReportDate(date); } catch { return res.status(400).json({ error: '有効な日付を指定してください。' }); }
  try {
    const response = await fetch('https://www.jma.go.jp/bosai/forecast/data/forecast/400000.json', { signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error('forecast unavailable');
    const forecast = selectFukuokaForecast(await response.json(), date);
    if (!forecast) return res.status(404).json({ error: '対象日の予報が現在の配信にありません。保存済みの天候は保持します。必要なら手入力してください。' });
    return res.status(200).json(forecast);
  } catch { return res.status(503).json({ error: '天気予報を取得できません。保存済みの天候は保持します。必要なら手入力してください。' }); }
}
