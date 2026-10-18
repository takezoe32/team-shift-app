export function planCalendarNote(current, text, expectedVersion, actor, now = new Date().toISOString()) {
  if (!actor?.id) throw new Error('ログインしてから保存してください。');
  if (typeof text !== 'string' || text.length > 4000) throw new Error('メモは4000文字以内で入力してください。');
  const version = Number(current?.version) || 0;
  if (version !== expectedVersion) throw new Error('ほかの人がメモを更新しました。最新の内容を確認してから書き直してください。');
  return { text, version: version + 1, updatedBy: actor.id, updatedByName: actor.name || '', updatedAt: now };
}
