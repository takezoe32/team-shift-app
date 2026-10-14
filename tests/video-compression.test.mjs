import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareTaskVideo, TASK_VIDEO_MAX_BYTES } from '../src/videoCompression.mjs';

test('small videos bypass encoding; large videos retry below the limit and reuse the compressed file', async () => {
  let calls = 0;
  const small = { size: TASK_VIDEO_MAX_BYTES };
  assert.equal(await prepareTaskVideo(small, 12, () => {}, () => { throw new Error('must not encode'); }), small);
  const large = { size: TASK_VIDEO_MAX_BYTES + 1 };
  const progress = [];
  const result = { size: TASK_VIDEO_MAX_BYTES - 1, type: 'video/mp4' };
  const convert = async (file, duration, attempt, report) => {
    calls++; assert.equal(file, large); assert.equal(duration, 30); report(50);
    return attempt === 0 ? { size: TASK_VIDEO_MAX_BYTES + 1 } : result;
  };
  assert.equal(await prepareTaskVideo(large, 30, p => progress.push(p), convert), result);
  assert.equal(calls, 2);
  assert.equal(progress.at(-1).attempt, 2);
  assert.equal(await prepareTaskVideo(large, 30, () => {}, convert), result);
  assert.equal(calls, 2);
});

test('never returns an oversized, empty, unsupported or failed compression, and failures can be retried', async () => {
  const large = { size: TASK_VIDEO_MAX_BYTES + 1 };
  await assert.rejects(prepareTaskVideo(large, 31), /30秒/);
  await assert.rejects(prepareTaskVideo(large, 10, () => {}, async () => ({ size: TASK_VIDEO_MAX_BYTES + 1 })), /20MB以下/);
  await assert.rejects(prepareTaskVideo(large, 10, () => {}, async () => ({ size: 0 })), /20MB以下/);
  await assert.rejects(prepareTaskVideo(large, 10, () => {}, async () => { throw new Error('decoder failure'); }), /圧縮できません/);
  assert.equal((await prepareTaskVideo(large, 10, () => {}, async () => ({ size: 100 }))).size, 100);
});
