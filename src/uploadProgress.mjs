export function createUploadEstimator(now = () => Date.now()) {
  const started = now();
  const samples = [{ time: started, loaded: 0 }];
  return (loaded, total) => {
    const time = now();
    samples.push({ time, loaded });
    while (samples.length > 2 && time - samples[0].time > 6000) samples.shift();
    const elapsed = (time - samples[0].time) / 1000;
    const bytesPerSecond = time - started >= 1000 && elapsed > 0 ? (loaded - samples[0].loaded) / elapsed : 0;
    const percent = total > 0 ? Math.min(100, Math.max(0, Math.round(loaded / total * 100))) : null;
    return { stage: 'uploading', percent, loaded, total, bytesPerSecond, remainingSeconds: total > loaded && bytesPerSecond > 0 ? Math.ceil((total - loaded) / bytesPerSecond) : loaded >= total && total > 0 ? 0 : null };
  };
}

export function uploadWithProgress(url, formData, onProgress, createRequest = () => new XMLHttpRequest()) {
  return new Promise((resolve, reject) => {
    const xhr = createRequest();
    const estimate = createUploadEstimator();
    xhr.open('POST', url);
    xhr.responseType = 'json';
    xhr.timeout = 180000;
    xhr.upload.addEventListener('progress', event => onProgress(estimate(event.loaded, event.lengthComputable ? event.total : 0)));
    xhr.upload.addEventListener('load', () => onProgress({ stage: 'processing', percent: 100 }));
    xhr.onload = () => {
      const result = xhr.response;
      if (!result || typeof result !== 'object') { reject(new Error('保存先からの応答を確認できません。再試行してください。')); return; }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, result });
    };
    xhr.onerror = () => reject(new Error('送信できませんでした。回線を確認して再試行してください。'));
    xhr.ontimeout = () => reject(new Error('送信がタイムアウトしました。回線を確認して再試行してください。'));
    xhr.onabort = () => reject(new Error('送信を中止しました。'));
    xhr.send(formData);
  });
}
