import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meterFrameBox } from '../src/meterFrame.mjs';
const phone = { width: 390, height: 844, offsetTop: 0, headerBottom: 64, navHeight: 76 };
test('the workspace fills the visible area between the header and the menu', () => {
  assert.deepEqual(meterFrameBox({}, phone).box, { top: 64, height: 704 });
});
test('the workspace keeps its size and position while the keyboard is open, then follows the screen again', () => {
  const before = meterFrameBox({}, phone);
  const typing = meterFrameBox(before, { ...phone, height: 464 });
  assert.deepEqual(typing.box, { top: 64, height: 704 });
  const panned = meterFrameBox(typing, { ...phone, height: 464, offsetTop: 180 });
  assert.deepEqual(panned.box, { top: 64, height: 704 });
  assert.deepEqual(meterFrameBox(panned, phone).box, { top: 64, height: 704 });
});
test('small height changes such as the address bar and rotation still resize the workspace', () => {
  const before = meterFrameBox({}, phone);
  assert.deepEqual(meterFrameBox(before, { ...phone, height: 790 }).box, { top: 64, height: 650 });
  assert.deepEqual(meterFrameBox(before, { ...phone, width: 844, height: 390 }).box, { top: 64, height: 250 });
});
