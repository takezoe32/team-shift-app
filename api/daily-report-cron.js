import { runDailyBackup } from './_lib/daily-backup.js';
import { sendAdminAlert } from './_lib/admin-alert.js';
import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';
import { configuration, oauth, privateStore } from './_lib/report-auth.js';
import { runDailyReport } from './_lib/save-daily-report.js';
import { tokyoDate } from '../src/dailyReport.mjs';
import { runYearFiles } from './_lib/year-files.js';
import { makeLineStore } from './_lib/line-store.js';

export function previousTokyoDate(now) {
  return tokyoDate(Number(now) - 86400000);
}

export function createCronHandler({ env = globalThis.process.env, configure = configuration, makeClient = oauth, makeStore = privateStore, run = runDailyReport, backup = runDailyBackup, notify = sendAdminAlert, now = Date.now, log = console.info, yearFiles = runYearFiles, makeLocks = makeLineStore } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'GETのみ対応しています。' }); }
    const supplied = Buffer.from(String(req.headers?.authorization || ''));
    const expected = Buffer.from('Bearer ' + (env.CRON_SECRET || ''));
    if (!env.CRON_SECRET || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return res.status(401).json({ error: 'Unauthorized' });
    if (env.VERCEL_ENV !== 'production') return res.status(403).json({ error: '本番環境のみ実行できます。' });
    // Capture the date once; request parameters cannot select today or other days.
    const date = previousTokyoDate(now());
    let config;
    const outcome={};
    async function reportFailure(code,detail='') {
      try { const alert=await notify({code,config,env,now,scheduled:true,detail}); log(JSON.stringify({event:'admin-alert',code,...alert})); }
      catch { log(JSON.stringify({event:'admin-alert',code,status:'failed'})); }
    }
    try {
      config = configure(env);
      if (!config.ready) throw new Error('configuration');
    } catch {
      await reportFailure('backup_failed');
      return res.status(503).json({date,error:'サーバー設定を確認してください。'});
    }
    try {
      const result=await backup({config,now});
      outcome.backup={ok:true,id:result.id,skipped:!!result.skipped};
      log(JSON.stringify({event:'daily-backup',...outcome.backup}));
    } catch(error) {
      outcome.backup={ok:false};
      log(JSON.stringify({event:'daily-backup',status:'failed',code:error.code||''}));
      await reportFailure('backup_failed');
    }
    let reportStatus=200;
    try {
      const result = await run({ config, store: makeStore(config), client: makeClient(config), date, automatic: true, now });
      outcome.report={ok:true,skipped:!!result.skipped};
      log(JSON.stringify({ event: 'daily-report-cron', date, status: result.skipped ? 'skipped' : 'saved', weatherWarning: result.weatherWarning || '' }));
    } catch(error) {
      reportStatus=error.status||500;
      outcome.report={ok:false};
      log(JSON.stringify({ event: 'daily-report-cron', date, status: 'failed', httpStatus: reportStatus, code: error.code === 'RECONNECT_REQUIRED' ? error.code : '' }));
      await reportFailure('report_failed');
    }
    // From December 1: next year's meter folder/files and shift workbook (does nothing once they exist).
    try {
      const result=await yearFiles({config,env,now,day:tokyoDate(now()),makeStore,makeClient,makeLocks});
      outcome.yearFiles={ok:true,skipped:!!result.skipped,year:result.year||null,created:result.created||[],warnings:result.warnings||[]};
      log(JSON.stringify({event:'year-files',...outcome.yearFiles}));
      if(outcome.yearFiles.created.length||outcome.yearFiles.warnings.length)await reportFailure('year_files_created',[...outcome.yearFiles.created.map(n=>'作成：'+n),...outcome.yearFiles.warnings.map(w=>'確認：'+w)].join('\n'));
    } catch(error) {
      outcome.yearFiles={ok:false};
      log(JSON.stringify({event:'year-files',status:'failed',message:String(error.message||'').slice(0,200)}));
      await reportFailure('year_files_failed',String(error.message||''));
    }
    if(!outcome.backup.ok||!outcome.report.ok)return res.status(reportStatus===200?503:reportStatus).json({date,...outcome,error:'自動処理の一部に失敗しました。実行ログと連携状態を確認してください。'});
    return res.status(200).json({ok:true,date,skipped:outcome.report.skipped,...outcome});
  };
}

export default createCronHandler();
