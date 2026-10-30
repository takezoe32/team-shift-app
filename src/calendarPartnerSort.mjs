import { calendarTaskDay } from './calendarTaskSort.mjs';
const company = item => String(item.partnerName || '').normalize('NFKC').trim();
export function compareCalendarPartners(a, b, mode = 'time', today = '') {
  const day = item => today ? calendarTaskDay(item, item.date, today) : item.date || '';
  const group = item => !today ? 0 : day(item) < today ? 0 : day(item) === today ? 1 : 2;
  const schedule = item => `${day(item) || '9999-12-31'}T${item.time || '23:59'}`;
  const byTime = () => schedule(a).localeCompare(schedule(b));
  const byCompany = () => !company(a) !== !company(b)
    ? (company(a) ? -1 : 1)
    : company(a).localeCompare(company(b), 'ja', { numeric: true });
  return group(a) - group(b)
    || (mode === 'company' ? byCompany() || byTime() : byTime() || byCompany())
    || String(a.id || '').localeCompare(String(b.id || ''));
}
