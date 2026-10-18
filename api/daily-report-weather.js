import { loadReportWeather } from './_lib/report-weather.js';
import { validateReportDate } from '../src/dailyReport.mjs';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GETのみ対応しています。' });
  const date = String(req.query?.date || '');
  try { validateReportDate(date); } catch { return res.status(400).json({ error: '有効な日付を指定してください。' }); }
  const weather = await loadReportWeather(date);
  if (!weather) return res.status(503).json({ error: '対象日の天気・気温を取得できません。保存済みの天候は保持します。必要なら手入力してください。' });
  return res.status(200).json(weather);
}
