export const isPrivateLine = event => event.source?.type === 'user';
export const lineAccess = (event, config) => isPrivateLine(event)
  ? event.privateAuthorized === true && !!config?.ownerUid && config.status !== 'disconnected'
  : !!config?.groupId && config.groupId === event.source?.groupId;
export const lineProfileUrl = event => isPrivateLine(event)
  ? 'https://api.line.me/v2/bot/profile/' + encodeURIComponent(event.source.userId)
  : 'https://api.line.me/v2/bot/group/' + encodeURIComponent(event.source.groupId) + '/member/' + encodeURIComponent(event.source.userId);
