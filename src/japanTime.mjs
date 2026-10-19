const japan = { timeZone: 'Asia/Tokyo', calendar: 'gregory', numberingSystem: 'latn', hourCycle: 'h23' };
function parts(value, options) {
  let source = value;
  // Older timestamps without an offset are interpreted as Japan time as well.
  if (typeof source === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(source)) source += '+09:00';
  const date = new Date(source);
  if (!Number.isFinite(date.getTime())) return null;
  return Object.fromEntries(new Intl.DateTimeFormat('en-GB', { ...japan, ...options }).formatToParts(date).map(part => [part.type, part.value]));
}
export function japanToday(value = Date.now()) {
  const p = parts(value, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return p ? `${p.year}-${p.month}-${p.day}` : '';
}
export function japanTime(value, seconds = false) {
  const p = parts(value, { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) });
  return p ? `${p.hour}:${p.minute}${seconds ? ':' + p.second : ''}` : '--';
}
export function japanDateTime(value) {
  const day = japanToday(value);
  return day ? `${day.replaceAll('-', '/')} ${japanTime(value, true)}` : '--';
}
// Calendar dates are civil dates, not instants: never parse them as UTC midnight.
export function calendarDate(value = japanToday()) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}
