import { useEffect, useRef, useState } from 'react';
import { cameraConstraints, enableContinuousFocus } from '../barcodeCamera.mjs';

const loadReader = () => import(/* @vite-ignore */ 'https://esm.sh/@zxing/browser@0.2.1');

export default function BarcodeScannerModal({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const photoRef = useRef(null);
  const callbackRef = useRef(onDetected);
  const stopRef = useRef(() => {});
  const deliveredRef = useRef(false);
  const mountedRef = useRef(false);
  const [status, setStatus] = useState('カメラを準備しています…');
  const [cameras, setCameras] = useState([]);
  const [deviceId, setDeviceId] = useState('');
  const [activeDeviceId, setActiveDeviceId] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [photoMode, setPhotoMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [manualCode, setManualCode] = useState('');

  useEffect(() => { callbackRef.current = onDetected; }, [onDetected]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const deliver = (value) => {
    const code = String(value || '').trim();
    if (!code || deliveredRef.current || !mountedRef.current) return;
    deliveredRef.current = true;
    stopRef.current();
    callbackRef.current(code);
  };

  useEffect(() => {
    if (photoMode) return;
    let cancelled = false;
    let stream;
    let controls;
    const stop = () => {
      cancelled = true;
      controls?.stop();
      stream?.getTracks().forEach(track => track.stop());
    };
    stopRef.current = stop;
    const start = async () => {
      try {
        setStatus('カメラを起動しています…');
        const ZXing = await loadReader();
        if (cancelled) return;
        stream = await navigator.mediaDevices.getUserMedia(cameraConstraints(deviceId));
        if (cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
        const track = stream.getVideoTracks()[0];
        await enableContinuousFocus(track);
        if (cancelled) return;
        setActiveDeviceId(track.getSettings?.().deviceId || deviceId);
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          if (!cancelled) setCameras(devices.filter(device => device.kind === 'videoinput' && device.deviceId));
        } catch { /* Camera switching is optional. */ }
        if (cancelled) return;
        const reader = new ZXing.BrowserMultiFormatReader();
        controls = await reader.decodeFromStream(stream, videoRef.current, result => {
          if (!result || cancelled || deliveredRef.current) return;
          const code = String(result.getText?.() || result.text || '').trim();
          if (!code) return;
          deliveredRef.current = true;
          stop();
          callbackRef.current(code);
        });
        if (cancelled) { controls.stop(); return; }
        setStatus('少し離して、バーコード全体を映してください。ぼやける場合はカメラを切り替えてください。');
      } catch {
        if (cancelled) return;
        stop();
        if (mountedRef.current) setStatus('カメラを使えませんでした。写真から読み取るか、番号を入力してください。');
      }
    };
    void start();
    return stop;
  }, [deviceId, attempt, photoMode]);

  const readPhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    stopRef.current();
    setPhotoMode(true);
    setBusy(true);
    setStatus('写真のバーコードを読み取っています…');
    const url = URL.createObjectURL(file);
    try {
      const ZXing = await loadReader();
      if (!mountedRef.current) return;
      const reader = new ZXing.BrowserMultiFormatReader();
      const result = await reader.decodeFromImageUrl(url);
      deliver(result.getText?.() || result.text);
    } catch {
      if (mountedRef.current) setStatus('写真から読み取れませんでした。バーコード全体にピントを合わせて撮り直すか、番号を入力してください。');
    } finally {
      URL.revokeObjectURL(url);
      if (mountedRef.current) setBusy(false);
    }
  };

  return <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="バーコード・QRコード読み取り">
    <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl bg-white p-4 space-y-3 shadow-xl">
      <div className="flex items-center justify-between"><h3 className="font-black text-gray-800">バーコード・QRコード読取</h3><button type="button" onClick={onClose} className="min-h-11 min-w-11 rounded-lg border border-gray-200" aria-label="閉じる">×</button></div>
      <video ref={videoRef} muted playsInline autoPlay hidden={photoMode} className="w-full aspect-[4/3] bg-black rounded-xl object-contain" />
      <p className="text-sm text-gray-600" role="status">{status}</p>
      {!photoMode && cameras.length > 1 && <label className="block text-sm font-bold text-gray-700">カメラ切替<select value={activeDeviceId} onChange={event => { stopRef.current(); setDeviceId(event.target.value); setAttempt(value => value + 1); }} className="mt-1 w-full min-h-11 rounded-xl border border-gray-300 bg-white px-2">{cameras.map((camera, index) => <option key={camera.deviceId} value={camera.deviceId}>{camera.label || 'カメラ ' + (index + 1)}</option>)}</select></label>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={() => { stopRef.current(); setPhotoMode(true); setStatus('写真を撮影または選択してください。戻ったら「カメラを再開」も使えます。'); photoRef.current?.click(); }} className="min-h-11 rounded-xl border border-blue-300 bg-blue-50 px-2 text-sm font-bold text-blue-800 disabled:opacity-50">写真から読み取る</button>
        <button type="button" disabled={busy} onClick={() => { stopRef.current(); setPhotoMode(false); setAttempt(value => value + 1); }} className="min-h-11 rounded-xl border border-gray-300 px-2 text-sm font-bold disabled:opacity-50">カメラを再開</button>
      </div>
      <input ref={photoRef} type="file" accept="image/*" capture="environment" onChange={readPhoto} className="hidden" aria-label="バーコードの写真を撮影または選択" />
      <p className="text-xs text-gray-500">写真は読み取りだけに使用し、サーバーには送信しません。</p>
      <div className="border-t pt-3 space-y-2"><label className="block text-xs font-bold text-gray-600">読めない場合は番号を入力<input value={manualCode} onChange={event => setManualCode(event.target.value)} inputMode="numeric" autoComplete="off" placeholder="バーコード番号" className="mt-1 w-full min-h-11 rounded-xl border border-gray-300 px-3 text-base"/></label><button type="button" disabled={!manualCode.trim() || busy} onClick={() => deliver(manualCode)} className="w-full min-h-11 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-50">番号を使用</button></div>
    </div>
  </div>;
}
