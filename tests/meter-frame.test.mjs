import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meterFrameBox, revealDelta } from '../src/meterFrame.mjs';
const phone = { width: 390, height: 844, offsetTop: 0, headerBottom: 64, navHeight: 76, navTop: 768 };
test('the workspace fills the visible area between the header and the menu', () => {
  const s = meterFrameBox({}, phone);
  assert.deepEqual(s.box, { top: 64, height: 704, contentHeight: 704 });
  assert.equal(s.keyboard, false);
});
test('with the keyboard open the map and input keep their size and the workspace scrolls above the keyboard', () => {
  const before = meterFrameBox({}, phone);
  const typing = meterFrameBox(before, { ...phone, height: 464 });
  assert.equal(typing.keyboard, true);
  assert.deepEqual(typing.box, { top: 64, height: 400, contentHeight: 704 });
  const panned = meterFrameBox(typing, { ...phone, height: 464, offsetTop: 180 });
  assert.deepEqual(panned.box, { top: 180, height: 464, contentHeight: 704 });
  const closed = meterFrameBox(panned, phone);
  assert.equal(closed.keyboard, false);
  assert.deepEqual(closed.box, { top: 64, height: 704, contentHeight: 704 });
});
test('a menu that stays above the keyboard is not covered by the workspace', () => {
  const before = meterFrameBox({}, phone);
  assert.deepEqual(meterFrameBox(before, { ...phone, height: 464, navTop: 388 }).box, { top: 64, height: 324, contentHeight: 704 });
});
test('small height changes such as the address bar and rotation still resize the workspace', () => {
  const before = meterFrameBox({}, phone);
  assert.deepEqual(meterFrameBox(before, { ...phone, height: 790 }).box, { top: 64, height: 650, contentHeight: 650 });
  assert.deepEqual(meterFrameBox(before, { ...phone, width: 844, height: 390 }).box, { top: 64, height: 250, contentHeight: 250 });
});
test('the focused input is scrolled into the visible part of the workspace', () => {
  const view = { top: 64, bottom: 464 };
  assert.equal(revealDelta(view, { top: 200, bottom: 240 }), 0);
  assert.equal(revealDelta(view, { top: 500, bottom: 540 }), 88);
  assert.equal(revealDelta(view, { top: 40, bottom: 80 }), -36);
});
