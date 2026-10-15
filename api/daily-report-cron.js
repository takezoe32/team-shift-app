import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';
import { configuration, oauth, privateStore } from './_lib/report-auth.js';
import { runDailyReport } from './_lib/save-daily-report.js';
import { tokyoDate } from '../src/dailyReport.mjs';

export function previousTokyoDate(now) {
  return tokyoDate(Number(now) - 86400000);
}

export function createCronHandler({ env = globalThis.process.env, configure = configuration, makeClient = oauth, makeStore = privateStore, run = runDailyReport, now = Date.now, log = console.info } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'GETのみ対応しています。' }); }
    const supplied = Buffer.from(String(req.headers?.authorization || ''));
    const expected = Buffer.from('Bearer ' + (env.CRON_SECRET || ''));
    if (!env.CRON_SECRET || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return res.status(401).json({ error: 'Unauthorized' });
    if (env.VERCEL_ENV !== 'production') return res.status(403).json({ error: '本番環境のみ実行できます。' });
    // Capture the date once; request parameters cannot select today or other days.
    const date = previousTokyoDate(now());
    try {
      const config = configure();
      if (!config.ready) return res.status(503).json({ date, error: '初回サーバー設定が必要です。' });
      const result = await run({ config, store: makeStore(config), client: makeClient(config), date, automatic: true, now });
      log(JSON.stringify({ event: 'daily-report-cron', date, status: result.skipped ? 'skipped' : 'saved' }));
      return res.status(200).json({ ok: true, date, skipped: !!result.skipped });
    } catch (error) {
      const status = error.status || 500;
      log(JSON.stringify({ event: 'daily-report-cron', date, status: 'failed', httpStatus: status, code: error.code === 'RECONNECT_REQUIRED' ? error.code : '' }));
      return res.status(status).json({ date, error: '日報の自動保存に失敗しました。管理者が実行ログと連携状態を確認してください。' });
    }
  };
}

export default createCronHandler();
