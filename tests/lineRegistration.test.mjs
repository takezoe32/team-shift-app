import test from 'node:test';
import assert from 'node:assert/strict';
import { matchingLineMember, eligibleLineMembers, partnerSuggestions } from '../src/lineRegistration.mjs';
test('member matching is exact after normalization and refuses ambiguous or viewer names', () => {
  const users = { a: { name: '竹添 三剛' }, b: { name: '高橋信次' }, v: { name: '閲覧者', role: 'viewer' } };
  assert.equal(matchingLineMember(users, '竹添三剛'), 'a');
  assert.equal(matchingLineMember(users, '竹添'), '');
  assert.equal(matchingLineMember(users, '閲覧者'), '');
  assert.equal(eligibleLineMembers(users).length, 2);
  assert.equal(matchingLineMember({ ...users, c: { name: '竹添三剛' } }, '竹添三剛'), '');
});
test('partner spelling suggestions rank existing names without inventing replacements', () => {
  const names = ['サンダストケミカル', '山下健装', '株式会社山下健装', 'トラステック企画'];
  assert.equal(partnerSuggestions('山下健創', names)[0], '山下健装');
  assert.ok(partnerSuggestions('トラステック', names).includes('トラステック企画'));
  assert.deepEqual(partnerSuggestions('会社', []), []);
});
