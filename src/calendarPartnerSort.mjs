
const company = item => String(item.partnerName || '').normalize('NFKC').trim();
const schedule = item => `${item.date || '9999-12-31'}T${item.time || '23:59'}`;
export function compareCalendarPartners(a, b, mode = 'time') {
  const byTime = () => schedule(a).localeCompare(schedule(b));
  const byCompany = () => !company(a) !== !company(b)
    ? (company(a) ? -1 : 1)
    : company(a).localeCompare(company(b), 'ja', { numeric: true });
  return (mode === 'company' ? byCompany() || byTime() : byTime() || byCompany())
    || String(a.id || '').localeCompare(String(b.id || ''));
}
