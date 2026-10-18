import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureDragPointer, releaseDragPointer, cancelPendingGesture } from '../src/calendarDragPointer.mjs';
test('ended iPhone pointer and detached targets do not throw or activate a drag', () => {
  assert.equal(captureDragPointer({ isConnected: true, setPointerCapture() { throw new DOMException('The object can not be found.', 'NotFoundError'); } }, 7), false);
  assert.equal(captureDragPointer({ isConnected: false, setPointerCapture() { throw Error('must not call'); } }, 7), false);
  assert.equal(captureDragPointer({ isConnected: true, setPointerCapture() {}, hasPointerCapture: () => false }, 7), false);
  assert.equal(captureDragPointer({ isConnected: true, setPointerCapture() {}, hasPointerCapture: () => true }, 7), true);
  assert.doesNotThrow(() => releaseDragPointer({ hasPointerCapture: () => true, releasePointerCapture() { throw new DOMException('ended', 'NotFoundError'); } }, 7));
});
test('releasing outside a block cancels the pending long press before its timer fires', async () => {
  let activated = false;
  const gesture = { current: { pointer: 7, active: false, timer: setTimeout(() => { activated = true; }, 10) } };
  assert.equal(cancelPendingGesture(gesture, 8), false);
  assert.equal(cancelPendingGesture(gesture, 7), true);
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(activated, false); assert.equal(gesture.current, null);
});
test('global pending cancellation leaves an active drag available for its normal drop handler', () => {
  const state = { pointer: 7, active: true };
  const gesture = { current: state };
  assert.equal(cancelPendingGesture(gesture, 7), false); assert.equal(gesture.current, state);
});
