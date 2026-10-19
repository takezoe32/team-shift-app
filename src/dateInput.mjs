export function dateLabel(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.replaceAll('-', '/') : '';
}
export function monthDays(year, month) {
  const first = new Date(year, month - 1, 1).getDay();
  const count = new Date(year, month, 0).getDate();
  return Array.from({ length: Math.ceil((first + count) / 7) * 7 }, (_, index) => {
    const day = index - first + 1;
    return day < 1 || day > count ? null : `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  });
}
