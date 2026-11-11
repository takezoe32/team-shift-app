// 「検針 保存完了」 under the calendar's shared memo: who completed the 毎朝検針 / 毎月検針 today (Japan time).
// Kept in app_data/shared_state.meterSaves = {date, daily:[{uid,name,at}], monthly:[{uid,name,at,month}]} by the meter API;
// only the full 「保存」 counts (not 途中保存), and the 毎朝検針 only for today's reading. A new day starts empty (0:00 reset).
import { japanToday } from './japanTime.mjs';

const KINDS = ['daily', 'monthly'];
const list = value => Array.isArray(value) ? value.filter(row => row && typeof row.uid === 'string' && typeof row.at === 'string') : [];

// The next meterSaves after `name` (uid) saved: same person again moves to the latest time, not a second line.
export function recordMeterSave(current, { kind, uid, name, at, month = '' }) {
  if (!KINDS.includes(kind) || !uid) throw new Error('検針の保存記録を確認できません。');
  const today = japanToday(at);
  const base = current?.date === today ? current : { date: today };
  const rows = list(base[kind]).filter(row => row.uid !== uid);
  rows.push({ uid, name: String(name || '').slice(0, 40) || '名前未設定', at, ...(kind === 'monthly' ? { month } : {}) });
  return { date: today, daily: list(base.daily), monthly: list(base.monthly), [kind]: rows };
}

// What the calendar shows now: nothing once the day has changed.
export function todayMeterSaves(saves, now = Date.now()) {
  if (!saves || saves.date !== japanToday(now)) return [];
  return KINDS.map(kind => ({ kind, rows: list(saves[kind]).sort((a, b) => a.at.localeCompare(b.at)) })).filter(group => group.rows.length);
}

// Milliseconds until the next 0:00 in Japan, so the line disappears at midnight without reloading.
export function msUntilJapanMidnight(now = Date.now()) {
  const day = 86400000, offset = 9 * 3600000;
  return day - ((now + offset) % day) + 50;
}
