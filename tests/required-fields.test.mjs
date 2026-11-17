import test from 'node:test';
import assert from 'node:assert/strict';
import { missingRequired, requiredBox } from '../src/requiredFields.mjs';

test('必須項目の未入力だけを入力順に挙げ、未入力の枠は赤・入力済みは通常の色にする', () => {
  assert.deepEqual(missingRequired([['件名', false], ['担当者', true], ['日付', false]]), ['件名', '日付']);
  assert.deepEqual(missingRequired([['件名', true]]), []);
  assert.match(requiredBox(false), /bg-red-50/);
  assert.doesNotMatch(requiredBox(true), /red/);
});
