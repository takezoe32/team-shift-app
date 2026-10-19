import { createHash } from 'node:crypto';
import { lineConfigPath } from './line-store.js';
import { accountCodePath, accountRequestPath, appLineMemberPath } from './line-account.js';
const hash = value => createHash('sha256').update(String(value)).digest('hex');
const emailOf = value => String(value || '').trim().toLowerCase();
export const privateMemberPath = userId => '_server_integrations/line_private_' + hash(userId);
export const privateHelp = 'この個別トークで操作できます。メンションは不要です。\n\n「タスク」→種類を選ぶ→記入用フォーマットを送信→確認して登録\n\n「追記」→対象タスクを選ぶ→内容を送信→確認して追加\n\n担当者は連携したアプリの本人です。LINEの表示名が違っても同じ担当者になります。入力途中の会話をグループへ送ることはありません。登録した内容は共有アプリに反映されます。';
export async function authorizePrivateLine({ event, store, now }) {
  const userId = event.source.userId, path = privateMemberPath(userId);
  const config = await store.read(lineConfigPath);
  if (!config?.ownerUid || config.status === 'disconnected') return false;
  const command = event.type === 'message' && event.message?.type === 'text' && event.message.text.trim().match(/^連携\s+([a-f0-9]{32})$/);
  if (command) {
    const code = command[1], codePath = accountCodePath(code), candidate = await store.read(codePath);
    if (!candidate?.appUid) return false;
    const reversePath = appLineMemberPath(candidate.appUid), requestPath = accountRequestPath(candidate.appUid);
    const bindingPath = '_server_integrations/line_member_' + hash('private:' + userId + ':' + userId);
    return store.transact([lineConfigPath, codePath, path, reversePath, requestPath, bindingPath, 'app_data/shared_state'], values => {
      const current = values[lineConfigPath], record = values[codePath], user = values['app_data/shared_state']?.users?.[candidate.appUid];
      if (!current?.ownerUid || current.status === 'disconnected' || !record || record.appUid !== candidate.appUid || record.epoch !== (current.accessEpoch || 'legacy') || !user || user.role === 'viewer' || emailOf(user.email) !== record.email) return { result: false };
      if (record.used) return { result: record.linkedUserId === userId && values[path]?.appUid === record.appUid && values[reversePath]?.userId === userId ? { appUid: record.appUid } : false };
      if (record.expires <= now() || values[requestPath]?.codeHash !== hash(code)) return { result: false };
      const binding = { appUid: record.appUid, userId, email: record.email, status: 'active', epoch: current.accessEpoch || 'legacy', confirmedAt: new Date(now()).toISOString() };
      const lineLinkedMembers = { ...values['app_data/shared_state']?.lineLinkedMembers };
      if (values[path]?.appUid) delete lineLinkedMembers[values[path].appUid];
      lineLinkedMembers[record.appUid] = record.email;
      return { writes: [
        { path: 'app_data/shared_state', value: { lineLinkedMembers }, fields: ['lineLinkedMembers'] },
        { path: codePath, value: { ...record, used: true, linkedUserId: userId } },
        { path, value: binding },
        { path: reversePath, value: { userId } },
        { path: bindingPath, value: { ...binding, groupId: 'private:' + userId } }
      ], result: { appUid: record.appUid } };
    });
  }
  const member = await store.read(path);
  if (!member?.appUid || member.status !== 'active' || member.epoch !== (config.accessEpoch || 'legacy')) return false;
  const state = await store.read('app_data/shared_state'), user = state?.users?.[member.appUid];
  const reverse = await store.read(appLineMemberPath(member.appUid));
  if (!user || user.role === 'viewer' || emailOf(user.email) !== member.email || reverse?.userId !== userId) return false;
  // Backfill the display marker for accounts linked before markers were introduced.
  if (state.lineLinkedMembers?.[member.appUid] !== member.email) {
    return store.transact([lineConfigPath, path, appLineMemberPath(member.appUid), 'app_data/shared_state'], values => {
      const current = values[lineConfigPath], binding = values[path], shared = values['app_data/shared_state'], currentUser = shared?.users?.[member.appUid];
      if (!current?.ownerUid || current.status === 'disconnected' || binding?.appUid !== member.appUid || binding.status !== 'active' || binding.epoch !== (current.accessEpoch || 'legacy') || values[appLineMemberPath(member.appUid)]?.userId !== userId || !currentUser || currentUser.role === 'viewer' || emailOf(currentUser.email) !== binding.email) return { result: false };
      return { writes: [{ path: 'app_data/shared_state', value: { lineLinkedMembers: { ...shared.lineLinkedMembers, [member.appUid]: binding.email } }, fields: ['lineLinkedMembers'] }], result: { appUid: member.appUid } };
    });
  }
  return { appUid: member.appUid };
}
