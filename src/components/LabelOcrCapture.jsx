import { useEffect, useRef, useState } from 'react';

export default function LabelOcrCapture({ onApply, onUseImage, disabled = false }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [text, setText] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [preview, setPreview] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [message, setMessage] = useState('');
  const sessionRef = useRef({ token: 0, worker: null, busy: false, timer: null });

  useEffect(() => {
    const session = sessionRef.current;
    return () => {
      ++session.token;
      clearTimeout(session.timer);
      void session.worker?.terminate().catch(() => {});
      session.worker = null;
    };
  }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const cancel = () => {
    const session = sessionRef.current;
    ++session.token;
    clearTimeout(session.timer);
    void session.worker?.terminate().catch(() => {});
    session.worker = null;
    session.busy = false;
    setBusy(false);
    setProgress('');
    setMessage('読み取りを中止しました。手入力も利用できます。');
  };

  const recognize = async file => {
    if (!file || sessionRef.current.busy || disabled) return;
    if (!file.type.startsWith('image/')) { setMessage('写真・画像ファイルを選択してください。'); return; }
    if (file.size > 10 * 1024 * 1024) { setMessage('画像は10MB以下にしてください。'); return; }
    const session = sessionRef.current;
    const token = ++session.token;
    session.busy = true;
    setBusy(true);
    setText('');
    setSelectedText('');
    setMessage('');
    setProgress('読み取りの準備中…');
    const imageUrl = URL.createObjectURL(file);
    setPreview(imageUrl);
    setPhotoFile(null);
    let worker;
    session.timer = setTimeout(() => {
      if (token !== session.token) return;
      cancel();
      setMessage('読み取りに時間がかかっています。通信を確認して再撮影するか、手入力してください。');
    }, 90000);
    try {
      const image = new Image();
      image.src = imageUrl;
      await image.decode();
      if (token !== session.token) return;
      setPhotoFile(file);
      const scale = Math.min(1, 2000 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('画像を準備できません。');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const { createWorker, PSM } = await import('tesseract.js');
      if (token !== session.token) return;
      worker = await createWorker(['eng', 'jpn'], 1, {
        logger: entry => {
          if (token !== session.token) return;
          const percent = Math.round((entry.progress || 0) * 100);
          setProgress(entry.status === 'recognizing text' ? `文字を読み取り中… ${percent}%` : '読み取り機能を準備中…（初回は通信が必要です）');
        },
        errorHandler: () => {},
      });
      if (token !== session.token) return;
      session.worker = worker;
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
      const { data } = await worker.recognize(canvas);
      if (token !== session.token) return;
      const result = String(data.text || '').trim();
      setText(result);
      setMessage(result ? '文字を確認・修正し、必要な行を選んで入力してください。保存は商品登録ボタンで行います。' : '文字を読み取れませんでした。ラベルに近づいて再撮影するか、手入力してください。');
    } catch {
      if (token === session.token) setMessage('文字を読み取れませんでした。通信・画像を確認するか、Google検索／手入力をご利用ください。');
    } finally {
      await worker?.terminate().catch(() => {});
      if (token === session.token) {
        clearTimeout(session.timer);
        session.worker = null;
        session.busy = false;
        setBusy(false);
        setProgress('');
      }
    }
  };

  const lines = [...new Set(text.split(/\r?\n/).map(line => line.trim()).filter(Boolean))];
  return <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 space-y-3">
    <div className="text-sm font-bold text-indigo-900">商品ラベルから文字を読み取る</div>
    <p className="text-xs text-gray-600">商品名・型番が大きく写るように撮影してください。文字の読み取りは端末内で行います。「この写真を商品画像に使う」を選ぶと、商品登録時に写真をアップロードします。初回は読み取りデータのダウンロードが必要です。</p>
    <div className="flex flex-wrap gap-2">
      <label className={`inline-flex min-h-11 items-center rounded-lg bg-indigo-600 px-3 text-sm font-bold text-white cursor-pointer ${busy || disabled ? 'opacity-50' : ''}`}>ラベルを撮影
        <input aria-label="商品ラベルを撮影" type="file" accept="image/*" capture="environment" className="sr-only" disabled={busy || disabled} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void recognize(file); }}/>
      </label>
      <label className={`inline-flex min-h-11 items-center rounded-lg border border-indigo-300 bg-white px-3 text-sm font-bold text-indigo-800 cursor-pointer ${busy || disabled ? 'opacity-50' : ''}`}>写真を選ぶ
        <input aria-label="商品ラベルの写真を選ぶ" type="file" accept="image/*" className="sr-only" disabled={busy || disabled} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void recognize(file); }}/>
      </label>
      {busy && <button type="button" onClick={cancel} className="min-h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm">中止</button>}
    </div>
    {preview && <img src={preview} alt="読み取り対象の商品ラベル" className="max-h-48 w-full object-contain rounded-lg bg-white"/>}
    {photoFile && onUseImage && <button type="button" disabled={disabled} onClick={() => onUseImage(photoFile)} className="min-h-11 w-full rounded-lg border border-indigo-300 bg-white px-3 text-sm font-bold text-indigo-800 disabled:opacity-50">この写真を商品画像に使う</button>}
    <div role="status" className="text-xs text-indigo-900">{progress || message}</div>
    {text && !busy && <div className="space-y-2">
      <label className="block text-xs font-bold text-gray-700">読み取った文字（修正できます）<textarea aria-label="読み取った文字" value={text} onChange={event => { setText(event.target.value); setSelectedText(''); }} rows={5} className="mt-1 w-full rounded-lg border border-gray-300 bg-white p-2 text-base"/></label>
      <div className="text-xs font-bold text-gray-700">入力する文字を選択</div>
      <div className="flex flex-wrap gap-2">{lines.map(line => <button key={line} type="button" onClick={() => setSelectedText(line)} aria-pressed={selectedText === line} className={`min-h-11 max-w-full break-all rounded-lg border px-3 py-2 text-left text-sm ${selectedText === line ? 'border-indigo-600 bg-indigo-100' : 'border-gray-300 bg-white'}`}>{line}</button>)}</div>
      <div className="flex flex-wrap gap-2">{[['name', '商品名'], ['modelNumber', '型番'], ['manufacturer', 'メーカー']].map(([field, label]) => <button key={field} type="button" disabled={!selectedText || disabled} onClick={() => onApply(field, selectedText)} className="min-h-11 rounded-lg bg-indigo-600 px-3 text-sm font-bold text-white disabled:opacity-40">{label}に入力</button>)}</div>
    </div>}
  </div>;
}
