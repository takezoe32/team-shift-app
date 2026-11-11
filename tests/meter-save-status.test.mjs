import test from 'node:test';
import assert from 'node:assert/strict';
import { recordMeterSave, todayMeterSaves, msUntilJapanMidnight } from '../src/meterSaveStatus.mjs';
import { createMeterHandler } from '../api/meter-readings.js';
import { seal } from '../api/_lib/report-auth.js';

const at = (h, m = 0) => new Date(Date.UTC(2026, 9, 26, h - 9, m)).toISOString(); // 2026-10-26 h:m in Japan
test('同じ日の保存者を時刻順に並べ、同じ人は最新の時刻1行にする', () => {
  let saves = recordMeterSave(null, { kind: 'daily', uid: 'a', name: '田中', at: at(7, 45) });
  saves = recordMeterSave(saves, { kind: 'daily', uid: 'b', name: '佐藤', at: at(8, 10) });
  saves = recordMeterSave(saves, { kind: 'monthly', uid: 'a', name: '田中', at: at(9), month: '2026-10' });
  saves = recordMeterSave(saves, { kind: 'daily', uid: 'a', name: '田中', at: at(8, 30) });
  assert.equal(saves.date, '2026-10-26');
  const groups = todayMeterSaves(saves, Date.parse(at(12)));
  assert.deepEqual(groups.map(g => [g.kind, g.rows.map(r => r.name)]), [['daily', ['佐藤', '田中']], ['monthly', ['田中']]]);
  assert.equal(groups[1].rows[0].month, '2026-10');
});
test('日付が変わったら表示せず、次の保存で前日分を消す（0時リセット）', () => {
  const saves = recordMeterSave(null, { kind: 'daily', uid: 'a', name: '田中', at: at(23, 59) });
  assert.equal(todayMeterSaves(saves, Date.parse(at(23, 59)) + 60000).length, 0);
  const next = recordMeterSave(saves, { kind: 'daily', uid: 'b', name: '佐藤', at: new Date(Date.parse(at(23, 59)) + 120000).toISOString() });
  assert.deepEqual([next.date, next.daily.map(r => r.name)], ['2026-10-27', ['佐藤']]);
  assert.equal(msUntilJapanMidnight(Date.parse(at(23, 59))), 60050);
});

// The meter API: only the final 「保存」 is recorded, the 毎朝検針 only for today's reading.
const secret = Buffer.alloc(32, 8).toString('base64'), uid = 'u1', email = 'member@plandosee.co.jp';
const today = Date.UTC(2026, 9, 26, 23, 0), now = () => today; // 2026-10-27 08:00 in Japan
const baseline = { date: '2026-10-27', previousDate: '2026-10-26', current: { 'gas-main': 10 }, previous: { 'gas-main': 8 }, formulas: { 'gas-main': false }, sheets: { main: '10', h: 'Ｈ-10' } };
function fixture() {
  const records = { 'app_data/shared_state': { users: { [uid]: { email, name: '田中' } } } };
  let reads = 0;
  const h = createMeterHandler({ now, configure: () => ({ ready: true, secret }), makeStore: () => ({ source: async () => ({ users: { [uid]: { email, role: 'member', name: '田中' } } }), get: async () => ({ refreshToken: 't' }) }), makeClient: () => ({ setCredentials() {}, getAccessToken: async () => ({ token: 'a' }) }), makeSheets: () => ({ read: async () => (++reads > 1 ? { ...baseline, current: { 'gas-main': 11 } } : baseline), write: async () => {} }), makeLocks: () => ({ read: async () => null, transact: async (paths, plan) => { const out = plan(records); for (const w of out.writes || []) records[w.path] = w.fields ? { ...records[w.path], ...w.value } : w.value; return out.result; } }) });
  return { h, records };
}
function request(body) {
  return { method: 'POST', url: '/api/meter-readings', headers: { origin: 'https://team-shift-app.vercel.app', 'content-type': 'application/json', cookie: '__Host-teamshift_line_member=' + seal({ purpose: 'line-member', uid, email, expires: today + 60000 }, secret) }, body: { action: 'save', appUid: uid, date: '2026-10-27', values: { 'gas-main': '11' }, revision: seal({ purpose: 'meter-snapshot', uid, date: '2026-10-27', expires: today + 60000, snapshot: baseline }, secret), ...body } };
}
async function invoke(h, req) { const res = { setHeader() {}, status(n) { this.code = n; return this; }, json(data) { this.data = data; return this; } }; await h(req, res); return res; }
test('検針の「保存」で今日の保存者を記録し、途中保存では記録しない', async () => {
  const partial = fixture();
  assert.equal((await invoke(partial.h, request({ final: false }))).code, 200);
  assert.equal(partial.records['app_data/shared_state'].meterSaves, undefined);
  const full = fixture();
  assert.equal((await invoke(full.h, request({ final: true }))).code, 200);
  const saves = full.records['app_data/shared_state'].meterSaves;
  assert.deepEqual([saves.date, saves.daily.map(r => r.name)], ['2026-10-27', ['田中']]);
  assert.ok(full.records['app_data/shared_state'].users, 'other shared data stays');
});
