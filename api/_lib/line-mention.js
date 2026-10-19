// Inspect LINE's signed mention metadata, never the visible account name alone.
export function mentionedCommand(message, destination) {
  if (message?.type !== 'text' || typeof message.text !== 'string') return null;
  const mentions = message.mention?.mentionees;
  if (!Array.isArray(mentions)) return null;
  const self = mentions.filter(mention => mention.type === 'user' && (mention.isSelf === true || (mention.isSelf === undefined && typeof destination === 'string' && destination && mention.userId === destination)));
  const spans = self.filter(mention => Number.isInteger(mention.index) && Number.isInteger(mention.length) && mention.index >= 0 && mention.length > 0 && mention.index + mention.length <= message.text.length && message.text[mention.index] === '@');
  if (!spans.length) return null;
  let text = message.text;
  for (const mention of spans.sort((a, b) => b.index - a.index)) text = text.slice(0, mention.index) + ' ' + text.slice(mention.index + mention.length);
  return text.trim();
}
