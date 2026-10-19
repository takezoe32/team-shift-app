
const norm = value => String(value || '').normalize('NFKC').trim();
export const taskBody = text => {
  const value = norm(text);
  return /^タスク(?:[\s:：]|$)/u.test(value) ? value.replace(/^タスク[\s:：]*/u, '').trim() : null;
};
export const tokyoDay = timestamp => new Date(Number(timestamp) + 9 * 3600000).toISOString().slice(0, 10);
const validDate = text => /^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(Date.parse(text)) && new Date(text).toISOString().slice(0, 10) === text;
export function extractLineTask(text, timestamp, users = {}, partnerNames = []) {
  const body = taskBody(text);
  if (body === null || !body || body.length > 5000) throw new Error('タスクの後に内容を入力してください。');
  const today = tokyoDay(timestamp);
  const lines = body.split(/\r?\n/).map(norm).filter(Boolean);
  const label = name => lines.find(line => line.startsWith(name + ':'))?.slice(name.length + 1).trim() || '';
  const dateLabel = label('日付') || label('対象日');
  const source = dateLabel || body;
  const dates = [...source.matchAll(/(?:(\d{4})[年/\-])?(\d{1,2})[月/\-](\d{1,2})日?/g)];
  let date = '';
  let ambiguousDate = dates.length > 1;
  if (dates.length === 1) {
    const [, year, month, day] = dates[0];
    date = (year || today.slice(0, 4)) + '-' + month.padStart(2, '0') + '-' + day.padStart(2, '0');
    // A yearless past date may mean next year; leave it for review.
    if (!year && date < today) ambiguousDate = true;
  } else {
    const relative = [...source.matchAll(/明後日|あさって|明日|あした|今日|本日/g)];
    if (relative.length === 1) date = tokyoDay(Number(timestamp) + (/明後日|あさって/.test(relative[0][0]) ? 2 : /明日|あした/.test(relative[0][0]) ? 1 : 0) * 86400000);
    if (relative.length > 1) ambiguousDate = true;
  }
  if (!validDate(date) || ambiguousDate) date = '';
  const timeSource = label('時間') || label('開始') || body;
  const times = [...timeSource.matchAll(/(\d{1,2})(?::(\d{2})|時(?:(\d{1,2})分?|(半))?)/g)];
  let time = '';
  if (times.length === 1 && !/午前|午後|夕方|夜/.test(timeSource)) {
    const match = times[0], hour = Number(match[1]), minute = Number(match[2] || match[3] || (match[4] ? 30 : 0));
    if (hour < 24 && [0, 15, 30, 45].includes(minute)) time = String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
  }
  const candidates = Object.entries(users).map(([id, user]) => ({ ...user, id })).filter(user => user.role !== 'viewer' && user.name);
  const assigneeText = label('担当') || label('担当者');
  let assigneeIds = [];
  let unknownAssignee = false;
  if (assigneeText) {
    for (const token of assigneeText.split(/[・、,\/\s]+/).filter(Boolean)) {
      const name = token.replace(/さん$/, '');
      const matches = candidates.filter(user => norm(user.name).replace(/\s/g, '') === name || norm(user.name).split(/\s/)[0] === name || norm(user.name).replace(/\s/g, '').startsWith(name));
      if (matches.length === 1) assigneeIds.push(matches[0].id); else unknownAssignee = true;
    }
  } else {
    const match = body.match(/担当(?:者)?(?:は|[:：])\s*([^\n。]+)/);
    if (match) {
      const tokens = match[1].replace(/です[。]?$/, '').split(/[・、,\/\s]+/).filter(Boolean);
      for (const token of tokens) {
        const name = token.replace(/さん$/, '');
        const matches = candidates.filter(user => norm(user.name).replace(/\s/g, '').startsWith(name));
        if (matches.length === 1) assigneeIds.push(matches[0].id); else unknownAssignee = true;
      }
    }
  }
  if (unknownAssignee) assigneeIds = [];
  assigneeIds = [...new Set(assigneeIds)];
  const partners = partnerNames.filter(name => norm(name) && body.includes(norm(name)));
  const partnerName = label('パートナー') || label('会社') || (partners.length === 1 ? partners[0] : '');
  const subject = (label('件名') || label('内容') || lines.filter(line => !/^(日付|対象日|時間|開始|担当|担当者|パートナー|会社):/.test(line))[0] || '').slice(0, 120);
  return { date, time, subject, text: body, assigneeIds, partnerName, important: /(?:^|\n)重要(?:[:：]\s*(?:はい|あり|true))?(?:\n|$)/i.test(body) };
}
export function reviewReasons(draft, kind, users) {
  const reasons = [];
  if (!['member', 'partner'].includes(kind)) reasons.push('種類');
  if (!validDate(draft.date || '')) reasons.push('日付');
  if (!String(draft.subject || '').trim()) reasons.push('件名');
  if (!draft.assigneeIds?.length || draft.assigneeIds.some(id => !users[id] || users[id].role === 'viewer')) reasons.push('担当者');
  if (kind === 'partner') {
    if (!draft.partnerName?.trim()) reasons.push('パートナー名');
    if (!/^([01]\d|2[0-3]):(00|15|30|45)$/.test(draft.time || '')) reasons.push('開始時刻（15分刻み）');
  }
  return reasons;
}
export function lineTaskChanges(state, pending, draft, kind, now) {
  const owner = state.users?.[pending.ownerUid];
  if (!owner || owner.role === 'viewer') throw new Error('管理者の登録情報を確認してください。');
  const reasons = reviewReasons(draft, kind, state.users || {});
  if (reasons.length) throw new Error('確認が必要です：' + reasons.join('・'));
  const common = { id: pending.id, subject: draft.subject.trim(), important: draft.important === true, completed: false, completedAt: null, createdAt: new Date(now).toISOString(), endTime: '', images: [], updates: [], source: 'line' };
  if (kind === 'member') {
    const task = { ...common, text: draft.text, ownerUid: pending.ownerUid, assigneeIds: draft.assigneeIds, visibility: 'public' };
    const tasks = state.teamData?.tasks || {};
    const list = tasks[draft.date]?.[pending.ownerUid] || [];
    if (list.some(item => item.id === pending.id)) return {};
    return { teamData: { ...(state.teamData || {}), tasks: { ...tasks, [draft.date]: { ...(tasks[draft.date] || {}), [pending.ownerUid]: [...list, task] } } } };
  }
  const items = state.partnerItems || [];
  if (items.some(item => item.id === pending.id)) return {};
  return { partnerItems: [...items, { ...common, partnerName: draft.partnerName.trim(), content: draft.text, date: draft.date, time: draft.time, assigneeUid: draft.assigneeIds[0], assigneeIds: draft.assigneeIds, createdByUid: pending.ownerUid, createdByName: owner.name || '' }], partnerNames: [...new Set([...(state.partnerNames || []), draft.partnerName.trim()])] };
}
