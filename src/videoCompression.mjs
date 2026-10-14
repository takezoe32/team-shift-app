export const TASK_VIDEO_MAX_BYTES = 20 * 1024 * 1024;
const preparedVideos = new WeakMap();

// Loaded only when a video needs compression; ordinary task/image saves stay light.
async function convertVideo(file, duration, attempt, onProgress) {
  const m = await import('mediabunny');
  const input = new m.Input({ source: new m.BlobSource(file), formats: m.ALL_FORMATS });
  let conversion;
  let timer;
  let exceededLimit = false;
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('動画の映像を読み取れません。');
    const sourceWidth = await track.getDisplayWidth();
    const sourceHeight = await track.getDisplayHeight();
    const scale = Math.min(1, (attempt ? 720 : 1280) / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(2, Math.floor(sourceWidth * scale / 2) * 2);
    const height = Math.max(2, Math.floor(sourceHeight * scale / 2) * 2);
    const audioTrack = await input.getPrimaryAudioTrack();
    const bitrate = Math.floor(Math.min(3500000, (18 * 1024 * 1024 * 8 / duration) - 128000) * (attempt ? 0.5 : 1));
    const copyAudio = audioTrack && await audioTrack.getCodec() === 'aac' && (await audioTrack.computeDuration()) * (await audioTrack.computePacketStats()).averageBitrate / 8 < 1024 * 1024;
    const mp4 = await m.canEncodeVideo('avc', { width, height, bitrate }) && (!audioTrack || copyAudio || await m.canEncodeAudio('aac'));
    const codec = mp4 ? 'avc' : 'vp8';
    if (!mp4 && (!await m.canEncodeVideo(codec, { width, height, bitrate }) || (audioTrack && !await m.canEncodeAudio('opus')))) {
      throw new Error('このブラウザは動画の圧縮に対応していません。最新版のSafariまたはChromeで開くか、20MB以下にして選び直してください。');
    }
    const target = new m.BufferTarget();
    target.on('write', ({ end }) => {
      if (end > TASK_VIDEO_MAX_BYTES && !exceededLimit) {
        exceededLimit = true;
        queueMicrotask(() => { if (conversion) void conversion.cancel(); });
      }
    });
    const output = new m.Output({ target, format: mp4 ? new m.Mp4OutputFormat({ fastStart: false }) : new m.WebMOutputFormat() });
    conversion = await m.Conversion.init({
      input, output, tracks: 'primary', tags: {}, trim: { end: duration },
      video: { width, height, fit: 'contain', frameRate: 30, codec, quality: new m.Quality({ bitrate, bitrateMode: 'constant' }), forceTranscode: true, allowTransformationMetadata: false },
      audio: mp4 && copyAudio ? {} : { codec: mp4 ? 'aac' : 'opus', quality: new m.Quality({ bitrate: 128000 }), numberOfChannels: 2, sampleRate: 48000 },
    });
    // A valid conversion can still silently discard audio. Never save a muted substitute.
    if (!conversion.isValid || !conversion.utilizedTracks.includes(track) || (audioTrack && !conversion.utilizedTracks.includes(audioTrack))) {
      throw new Error('この動画の映像・音声を圧縮できません。MP4形式で保存し直して選択してください。');
    }
    conversion.onProgress = value => onProgress(Math.min(99, Math.round(value * 100)));
    timer = setTimeout(() => { void conversion.cancel(); }, 180000);
    await conversion.execute();
    return new File([target.buffer], file.name.replace(/\.[^.]+$/, '') + (mp4 ? '.mp4' : '.webm'), { type: mp4 ? 'video/mp4' : 'video/webm', lastModified: file.lastModified });
  } catch (error) {
    if (exceededLimit) return { size: TASK_VIDEO_MAX_BYTES + 1 };
    throw error;
  } finally {
    clearTimeout(timer);
    if (conversion && !['done', 'canceled'].includes(conversion.state)) await conversion.cancel();
    input.dispose();
  }
}

export async function prepareTaskVideo(file, duration, onProgress = () => {}, convert = convertVideo) {
  if (file.size <= TASK_VIDEO_MAX_BYTES) return file;
  if (!Number.isFinite(duration) || duration <= 0 || duration > 30) throw new Error('動画は30秒以内にしてください。');
  if (preparedVideos.has(file)) return preparedVideos.get(file);
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const progress = percent => onProgress({ stage: 'compressing', percent, attempt: attempt + 1 });
      progress(0);
      const result = await convert(file, duration, attempt, progress);
      if (result.size > 0 && result.size <= TASK_VIDEO_MAX_BYTES) {
        preparedVideos.set(file, result);
        return result;
      }
    }
    throw new Error('20MB以下に圧縮できませんでした。動画を短くして再度選択してください。');
  } catch (error) {
    if (/圧縮|30秒/.test(error.message || '')) throw error;
    throw new Error('動画を圧縮できませんでした。最新版のSafariまたはChromeで再試行するか、20MB以下の動画を選択してください。');
  }
}
