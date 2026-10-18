export const DEFAULT_CALENDAR_BLOCKS = ['memo', 'calendar', 'partner', 'member'];
export function normalizeCalendarBlocks(value) {
  return [...new Set((Array.isArray(value) ? value : []).filter(id => DEFAULT_CALENDAR_BLOCKS.includes(id))), ...DEFAULT_CALENDAR_BLOCKS].filter((id, index, all) => all.indexOf(id) === index);
}
export function moveCalendarBlock(value, id, target) {
  const order = normalizeCalendarBlocks(value);
  if (!order.includes(id) || !Number.isInteger(target) || target < 0 || target >= order.length) return order;
  order.splice(order.indexOf(id), 1); order.splice(target, 0, id);
  return order;
}
