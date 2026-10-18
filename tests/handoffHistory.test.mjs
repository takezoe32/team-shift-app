import test from 'node:test';
import assert from 'node:assert/strict';
import { handoffUpdates, initialPartnerText } from '../src/handoffHistory.mjs';
test('initial text and images are excluded while all later handoffs remain', () => {
  const initial = { id: 'initial', kind: 'initial', text: 'registration', images: [{ imageUrl: 'initial-photo' }] };
  const text = { id: 'text', kind: 'handoff', text: 'added' };
  const photo = { id: 'photo', kind: 'handoff', text: '', images: [{ imageUrl: 'new-photo' }] };
  assert.deepEqual(handoffUpdates({ updates: [initial, text, photo] }), [text, photo]);
  assert.deepEqual(handoffUpdates({ updates: [initial] }), []);
});
test('partner registration remains available outside handoff history', () => {
  const item = { partnerName: 'partner', content: 'latest', updates: [{ id: 'a', kind: 'initial', text: 'registration' }, { id: 'b', kind: 'handoff', text: 'latest' }] };
  assert.equal(initialPartnerText(item), 'registration');
  assert.equal(handoffUpdates(item).length, 1);
  const legacy = { partnerName: 'partner', updates: [{ id: 'a', text: 'old registration' }, { id: 'b', text: 'later' }] };
  assert.equal(initialPartnerText(legacy), 'old registration');
  assert.deepEqual(handoffUpdates(legacy).map(item => item.id), ['b']);
  assert.equal(initialPartnerText({ content: 'old body' }), 'old body');
});
test('untyped daily notes are preserved and empty history is safe', () => {
  assert.equal(handoffUpdates({ updates: [{ id: 'a', text: 'legacy daily handoff' }] }).length, 1);
  assert.deepEqual(handoffUpdates(null), []);
});
