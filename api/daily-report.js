import { runDailyReport } from './_lib/save-daily-report.js';
import { configuration, fault, oauth, privateStore, verifyIdentity, sessionFrom, issueSession, csrfToken, verifyRequest, clearSession } from './_lib/report-auth.js';
import { collectDailyReport, validateReportDate } from '../src/dailyReport.mjs';
import { saveDailyReportToDrive } from '../src/dailyReportDrive.mjs';

export function createReportHandler({ configure = configuration, makeClient = oauth, makeStore = privateStore, verifyUser = verifyIdentity, saveReport = saveDailyReportToDrive, fetcher = fetch } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const config = configure();
      if (!config.ready) return res.status(503).json({ ready: false, missing: config.missing, error: '日報の自動認証は初回サーバー設定が必要です。' });
      const store = makeStore(config);
      const session = sessionFrom(req, config);
      if (req.method === 'GET') {
        const csrf = csrfToken(req, res);
        const connection = session ? await store.get() : null;
        return res.status(200).json({ ready: true, authenticated: !!session, admin: !!session && config.admins.includes(session.email), connected: !!connection?.refreshToken && !connection.needsReconnect, csrf });
      }
      if (req.method !== 'POST') return res.status(405).json({ error: 'GETまたはPOSTを使用してください。' });
      verifyRequest(req);
      const body = req.body || {};
      if (body.action === 'logout') { clearSession(res); return res.status(200).json({ ok: true }); }
      const client = makeClient(config);
      if (body.action === 'session') {
        if (typeof body.credential !== 'string' || body.credential.length > 20000) throw fault(400, 'Googleログインを確認してください。');
        const email = await verifyUser(client, body.credential, config.allowed);
        issueSession(res, email, config);
        return res.status(200).json({ ok: true });
      }
      if (!session) throw fault(401, '日報保存用のGoogleログインを確認してください。', 'SESSION_REQUIRED');
      if (body.action === 'connect') {
        if (!config.admins.includes(session.email)) throw fault(403, '初回連携は管理者が行ってください。');
        if (typeof body.code !== 'string' || !body.code || body.code.length > 10000) throw fault(400, '連携をもう一度実行してください。');
        let tokens;
        try { ({ tokens } = await client.getToken({ code: body.code, redirect_uri: 'postmessage' })); }
        catch { throw fault(400, 'Google連携に失敗しました。もう一度連携してください。'); }
        const email = await verifyUser(client, tokens.id_token, config.admins);
        if (email !== session.email) throw fault(403, 'ログインと同じ管理者アカウントを選択してください。');
        if (!String(tokens.scope || '').split(' ').includes('https://www.googleapis.com/auth/drive')) throw fault(403, '日報保存に必要なGoogle Driveの許可を確認してください。');
        const existing = await store.get();
        const refreshToken = tokens.refresh_token || (existing?.email === email ? existing.refreshToken : null);
        if (!refreshToken) throw fault(400, '継続利用の許可を取得できませんでした。Google連携を解除してから再連携してください。');
        // Check both fixed folders before making this account the shared connection.
        client.setCredentials(tokens);
        const access = (await client.getAccessToken()).token;
        for (const id of ['1WeUCx0SPcPLXLEzqyNhaMAod22TBjoBO', '1ZH9lLBsZE0wtXvA_Cdq48Hl7PY3Ld-gw']) {
          const response = await fetcher(`https://www.googleapis.com/drive/v3/files/${id}?fields=mimeType,capabilities&supportsAllDrives=true`, { headers: { Authorization: 'Bearer ' + access }, signal: AbortSignal.timeout(10000) });
          const folder = await response.json();
          if (!response.ok || folder.mimeType !== 'application/vnd.google-apps.folder' || !folder.capabilities?.canAddChildren) throw fault(403, '日報・画像動画の両方の保存先を編集できるアカウントで連携してください。');
        }
        await store.put({ refreshToken, email, connectedAt: new Date().toISOString() });
        return res.status(200).json({ connected: true });
      }
      if (!['save', 'preview'].includes(body.action)) throw fault(400, '操作を確認してください。');
      try { validateReportDate(body.date); } catch { throw fault(400, '有効な日付を選んでください。'); }
      const fields = {};
      for (const key of ['weather', 'chlorine', 'remarks']) if (body.fields?.[key] !== undefined) {
        if (typeof body.fields[key] !== 'string' || body.fields[key].length > (key === 'remarks' ? 10000 : 500)) throw fault(400, '入力内容を確認してください。');
        fields[key] = body.fields[key];
      }
      if (body.action === 'preview') {
        const report = collectDailyReport(await store.source(), body.date);
        return res.status(200).json({ report, fields });
      }
      const saved = await runDailyReport({ store, client, date: body.date, fields, saveReport, fetcher });
      issueSession(res, session.email, config);
      return res.status(200).json(saved);
    } catch (error) {
      // Do not return upstream OAuth errors, credential values, or request bodies.
      return res.status(error.status || 500).json({ error: error.status ? error.message : '日報処理に失敗しました。サーバー設定を確認し、再実行してください。', code: error.code || '' });
    }
  };
}
export default createReportHandler();

