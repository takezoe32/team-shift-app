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

// Every given item is filled after a save (formula cells do not count): the line then appears even when
// the last values went in with 途中保存, and stays away while an item is still missing.
export function meterComplete(snapshot, fields) {
  return fields.every(f => snapshot?.formulas?.[f.id] || ![null, undefined, ''].includes(snapshot?.current?.[f.id]));
}

// The items that have to be filled for "complete": those placed on the meter map, which is what the screen asks for
// (items of the book that are not on the map, e.g. 給湯配管気泡, stay empty); every item while the map is still empty.
export function meterCompleteFields(fields, points) {
  const placed = new Set((Array.isArray(points) ? points : []).flatMap(point => Array.isArray(point?.fields) ? point.fields : []));
  const onMap = fields.filter(f => placed.has(f.id));
  return onMap.length ? onMap : fields;
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
