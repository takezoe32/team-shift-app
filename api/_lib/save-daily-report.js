import { readFile } from 'node:fs/promises';
import { fault } from './report-auth.js';
import { collectDailyReport, validateReportDate } from '../../src/dailyReport.mjs';
import { saveDailyReportToDrive } from '../../src/dailyReportDrive.mjs';

// Manual and scheduled saves use the same canonical source and monthly lock.
export async function runDailyReport({ store, client, date, fields = {}, automatic = false, saveReport = saveDailyReportToDrive, fetcher = fetch, now = Date.now }) {
  validateReportDate(date);
  const release = await store.lock(date.slice(0, 7));
  try {
    if (automatic && await store.automaticRun(date)) return { date, skipped: true };
    const connection = await store.get();
    if (!connection?.refreshToken || connection.needsReconnect) throw fault(409, '管理者がGoogle Driveを初回連携してください。', 'RECONNECT_REQUIRED');
    client.setCredentials({ refresh_token: connection.refreshToken });
    let access;
    try { access = (await client.getAccessToken()).token; }
    catch (error) {
      if (error.response?.data?.error === 'invalid_grant') {
        await store.put({ ...connection, needsReconnect: true });
        throw fault(409, 'Google連携の有効期限が切れました。管理者が再連携してください。', 'RECONNECT_REQUIRED');
      }
      throw fault(503, 'Google認証を更新できませんでした。時間をおいて再実行してください。');
    }
    if (!access) throw fault(503, 'Google認証を更新できませんでした。');
    const report = collectDailyReport(await store.source(), date);
    const reportFetch = async (url, options) => url === '/templates/daily-report.xlsx'
      ? new Response(await readFile(new URL('../../public/templates/daily-report.xlsx', import.meta.url)))
      : fetcher(url, { ...options, signal: AbortSignal.timeout(30000) });
    const saved = await saveReport(access, report, fields, reportFetch);
    // Mark only after Drive readback has succeeded. A retry after a partial save
    // safely updates the existing monthly file instead of creating another one.
    if (automatic) await store.completeAutomaticRun(date, saved.id, new Date(now()).toISOString());
    return { ...saved, date, visitors: report.visitors.length, handoff: report.handoff.length, media: report.media.length, unknownDates: report.unknownDates };
  } finally { await release(); }
}
