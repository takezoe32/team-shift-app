import test from 'node:test';
import assert from 'node:assert/strict';
import { mentionedCommand } from '../api/_lib/line-mention.js';

test('only actual bot mentions qualify, including destination fallback', () => {
  const message = { type: 'text', text: '@管理課 タスク受付 追記' };
  assert.equal(mentionedCommand(message, 'bot'), null);
  const mention = { index: 0, length: '@管理課 タスク受付'.length, type: 'user' };
  const withMention = fields => ({ ...message, mention: { mentionees: [{ ...mention, ...fields }] } });
  assert.equal(mentionedCommand(withMention({ isSelf: true })), '追記');
  assert.equal(mentionedCommand(withMention({ userId: 'bot' }), 'bot'), '追記');
  assert.equal(mentionedCommand(withMention({ userId: 'bot', isSelf: false }), 'bot'), null);
  assert.equal(mentionedCommand(withMention({ userId: 'someone' }), 'bot'), null);
  assert.equal(mentionedCommand(withMention({ type: 'all', isSelf: true }), 'bot'), null);
  for (const fields of [{ index: -1 }, { length: 99999 }, { index: 0.5 }, { length: 0 }]) assert.equal(mentionedCommand(withMention({ isSelf: true, ...fields })), null);
});

test('mention removal preserves multiline task text and other mentions', () => {
  const text = '😀 @Bot タスク\n件名：点検\n担当：@田中';
  const message = { type: 'text', text, mention: { mentionees: [{ index: 3, length: 4, type: 'user', isSelf: true }, { index: text.indexOf('@田中'), length: 3, type: 'user', isSelf: false }] } };
  assert.equal(mentionedCommand(message), '😀   タスク\n件名：点検\n担当：@田中');
  assert.equal(mentionedCommand({ type: 'image' }), null);
});
