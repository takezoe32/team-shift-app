import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCronHandler, previousTokyoDate } from '../api/daily-report-cron.js';
import { runDailyReport } from '../api/_lib/save-daily-report.js';

const env = { CRON_SECRET: 'test-only-cron-secret', VERCEL_ENV: 'production' };
const req = (extra = {}) => ({ method: 'GET', headers: { authorization: 'Bearer ' + env.CRON_SECRET }, ...extra });
const response = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(v) { this.code = v; return this; }, json(v) { this.body = v; return this; } });

test('previous day follows Japan midnight, month/year boundaries and leap days', () => {
  for (const [instant, date] of [
    ['2026-10-15T14:59:59Z', '2026-10-14'],
    ['2026-10-15T15:00:00Z', '2026-10-15'],
    ['2026-10-15T15:59:59Z', '2026-10-15'],
    ['2026-12-31T15:00:00Z', '2026-12-31'],
    ['2026-10-31T15:00:00Z', '2026-10-31'],
    ['2028-02-29T15:00:00Z', '2028-02-29']
  ]) assert.equal(previousTokyoDate(Date.parse(instant)), date);
});

test('cron auth fails closed before reading configuration, including cookies and spoofed user agents', async () => {
  let configured = 0;
  for (const [selectedEnv, request, expected] of [
    [env, req({ headers: {} }), 401],
    [env, req({ headers: { cookie: 'admin=yes', 'user-agent': 'vercel-cron/1.0' } }), 401],
    [env, req({ headers: { authorization: 'Bearer bad' } }), 401],
    [{ VERCEL_ENV: 'production' }, req(), 401],
    [{ ...env, VERCEL_ENV: 'preview' }, req(), 403],
    [env, req({ method: 'POST' }), 405]
  ]) {
    const handler = createCronHandler({ env: selectedEnv, configure: () => { configured++; }, log: () => {} });
    const res = response(); await handler(request, res); assert.equal(res.code, expected);
  }
  assert.equal(configured, 0);
});

function fixture() {
  const state = { saved: [], dates: new Set(), connection: { refreshToken: 'private-refresh' }, released: 0, locked: false, attempts: 0, logs: [] };
  const store = {
    async lock() {
      if (state.locked) throw Object.assign(new Error('busy'), { status: 409 });
      state.locked = true;
      return async () => { state.locked = false; state.released++; };
    },
    async automaticRun(date) { return state.dates.has(date); },
    async completeAutomaticRun(date, fileId) { assert.equal(fileId, 'month-file'); if (state.markerFailure) throw new Error('marker failed'); state.dates.add(date); },
    async get() { return state.connection; },
    async put(value) { state.connection = value; },
    async source() { return { teamData: { tasks: { '2026-10-15': { u: [
      { id: 'yesterday', subject: 'yesterday only', completed: true, completedAt: '2026-10-15T14:59:59Z' },
      { id: 'today', subject: 'today excluded', completed: true, completedAt: '2026-10-15T15:00:00Z' }
    ] } } } }; }
  };
  const client = { setCredentials(value) { assert.equal(value.refresh_token, 'private-refresh'); }, async getAccessToken() { if (state.oauthError) throw state.oauthError; return { token: 'private-access' }; } };
  const saveReport = async (token, report, fields) => {
    state.attempts++;
    assert.equal(token, 'private-access'); assert.deepEqual(fields, {});
    assert.deepEqual(report.entries.map(e => e.text), ['yesterday only']);
    if (state.saveFailure) throw new Error('private-upstream-secret');
    state.saved.push(report.date);
    return { id: 'month-file', count: 1 };
  };
  const handler = createCronHandler({ env, configure: () => ({ ready: true }), makeStore: () => store, makeClient: () => client,
    now: () => Date.parse('2026-10-15T15:42:00Z'), log: v => state.logs.push(v),
    run: args => runDailyReport({ ...args, saveReport, loadWeather: async () => null }) });
  return { state, handler, store, client, saveReport };
}

test('a scheduled save needs no browser session and cannot select today or backfill via parameters', async () => {
  const { handler, state } = fixture(); const res = response();
  await handler(req({ query: { date: '2026-10-16' }, body: { date: '2026-10-01' } }), res);
  assert.equal(res.code, 200); assert.equal(res.body.date, '2026-10-15');
  assert.deepEqual(state.saved, ['2026-10-15']); assert.equal(state.released, 1);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.doesNotMatch(JSON.stringify([res.body, state.logs]), /private-refresh|private-access/);
});

test('duplicate delivery skips a completed day, while a manual save can still regenerate it', async () => {
  const { handler, state, store, client, saveReport } = fixture();
  await handler(req(), response()); const duplicate = response(); await handler(req(), duplicate);
  assert.equal(duplicate.body.skipped, true); assert.equal(state.attempts, 1);
  await runDailyReport({ store, client, saveReport, loadWeather: async () => null, date: '2026-10-15' });
  assert.equal(state.attempts, 2);
});

test('failed saves release the lock, do not mark success, and can be retried without leaking upstream errors', async () => {
  const { handler, state } = fixture(); state.saveFailure = true;
  const res = response(); await handler(req(), res);
  assert.equal(res.code, 500); assert.equal(state.dates.size, 0); assert.equal(state.locked, false);
  assert.doesNotMatch(JSON.stringify([res.body, state.logs]), /private-upstream-secret/);
  state.saveFailure = false; await handler(req(), response());
  assert.equal(state.dates.size, 1);
});

test('Drive success with a failed completion marker remains retryable', async () => {
  const { handler, state } = fixture(); state.markerFailure = true;
  const res = response(); await handler(req(), res); assert.equal(res.code, 500); assert.equal(state.dates.size, 0);
  state.markerFailure = false; await handler(req(), response()); assert.equal(state.dates.size, 1);
});

test('concurrent monthly work prevents the cron from writing a report', async () => {
  const { handler, state } = fixture(); state.locked = true;
  const res = response(); await handler(req(), res);
  assert.equal(res.code, 409); assert.equal(state.attempts, 0); assert.equal(state.dates.size, 0);
});

test('unconnected and revoked Drive credentials fail without an interactive fallback', async () => {
  for (const revoked of [false, true]) {
    const { handler, state } = fixture();
    if (revoked) state.oauthError = { response: { data: { error: 'invalid_grant' } } };
    else state.connection = null;
    const res = response(); await handler(req(), res);
    assert.equal(res.code, 409); assert.equal(state.attempts, 0); assert.equal(state.locked, false);
    if (revoked) assert.equal(state.connection.needsReconnect, true);
  }
});

test('daily UTC schedule maps to Japan midnight and packages the template for the cron function', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(config.crons, [{ path: '/api/daily-report-cron', schedule: '0 15 * * *' }]);
  assert.equal(config.functions['api/daily-report-cron.js'].includeFiles, 'public/templates/daily-report.xlsx');
});
