import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraConstraints, enableContinuousFocus } from '../src/barcodeCamera.mjs';
test('default camera prefers rear and high resolution without requiring them', () => {
  const constraints = cameraConstraints();
  assert.deepEqual(constraints.video.facingMode, { ideal: 'environment' });
  assert.deepEqual(constraints.video.width, { ideal: 1920 });
  assert.equal(constraints.audio, false);
});
test('camera switch selects exact device without conflicting facing mode', () => {
  const constraints = cameraConstraints('rear-wide');
  assert.deepEqual(constraints.video.deviceId, { exact: 'rear-wide' });
  assert.equal('facingMode' in constraints.video, false);
});
test('continuous focus is enabled only when supported', async () => {
  let applied;
  await enableContinuousFocus({ getCapabilities: () => ({ focusMode: ['continuous'] }), applyConstraints: async value => { applied = value; } });
  assert.deepEqual(applied, { advanced: [{ focusMode: 'continuous' }] });
  await enableContinuousFocus({ getCapabilities: () => ({ focusMode: ['manual'] }), applyConstraints: () => { throw new Error('must not be called'); } });
  await enableContinuousFocus({});
});
test('focus rejection does not prevent reading', async () => {
  await assert.doesNotReject(enableContinuousFocus({ getCapabilities: () => ({ focusMode: ['continuous'] }), applyConstraints: async () => { throw new Error('unsupported'); } }));
});
