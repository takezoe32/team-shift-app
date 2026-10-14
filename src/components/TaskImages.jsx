import { useEffect, useRef, useState } from 'react';
import { getTaskImages, validateTaskImageFiles, isTaskVideo } from '../taskImages.mjs';

function FilePreview({ file }) {
  const ref = useRef(null);
  useEffect(() => { const url = URL.createObjectURL(file); if (ref.current) ref.current.src = url; return () => URL.revokeObjectURL(url); }, [file]);
  if (isTaskVideo(file)) return <video ref={ref} controls playsInline preload="metadata" className="h-28 w-48 max-w-full rounded border bg-black"/>;
  return <img ref={ref} alt={file.name} className="h-20 w-20 rounded border object-contain bg-white"/>;
}
export function ImagePicker({ files, onChange, disabled = false }) {
  const addFiles = event => {
    const incoming = Array.from(event.target.files || []); event.target.value = '';
    const next = [...files, ...incoming];
    try { validateTaskImageFiles(next); onChange(next); } catch(error) { alert(error.message); }
  };
  return <div className="space-y-2"><div className="flex flex-wrap gap-2"><label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-gray-300 bg-white px-3 text-xs font-bold text-blue-700">画像を追加（複数選択可）<input type="file" accept="image/*" multiple disabled={disabled} className="hidden" onChange={addFiles}/></label><label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-gray-300 bg-white px-3 text-xs font-bold text-blue-700">動画を追加（音声付き）<input type="file" accept="video/*,.mp4,.mov,.m4v,.webm,.3gp" disabled={disabled} className="hidden" onChange={addFiles}/></label></div><div className="flex flex-wrap gap-2">{files.map((file,index)=><div key={index} className="max-w-full space-y-1"><FilePreview file={file}/><button type="button" disabled={disabled} onClick={()=>onChange(files.filter((_,i)=>i!==index))} className="min-h-9 text-xs font-bold text-red-600" aria-label={file.name + 'を外す'}>この{isTaskVideo(file) ? '動画' : '画像'}を外す</button></div>)}</div><p className="text-[10px] text-gray-500">1回：画像5枚（各10MB以下）・動画1本（30秒以内・20MB以下）。動画の長さは保存時に確認します。高画質で容量を超える場合は短く撮影してください。</p></div>;
}
function VideoAttachment({ media }) {
  const [failed, setFailed] = useState(false);
  return <div className="w-72 max-w-full space-y-1"><video src={media.playbackUrl || media.imageUrl} controls playsInline preload="none" onError={()=>setFailed(true)} className="w-full max-h-64 rounded-lg bg-black"/>{failed && <p className="text-xs text-red-700">動画を再生できませんでした。通信を確認して再度開くか、元の動画をダウンロードしてください。</p>}<a href={media.imageUrl} target="_blank" rel="noopener noreferrer" className="block break-all text-xs text-blue-700 underline">元の動画を開く・ダウンロード</a></div>;
}
export function ImageGallery({ item, onOpen }) {
  const images = getTaskImages(item);
  return images.length ? <div className="mt-2 flex flex-wrap gap-2" onClick={event=>event.stopPropagation()}>{images.map((image,index)=>image.mediaType === 'video' ? <VideoAttachment key={image.imageUrl} media={image}/> : <a key={image.imageUrl} onClick={event=>{if(onOpen){event.preventDefault();onOpen(image.imageUrl,image.imageName);}}} href={image.imageUrl} target="_blank" rel="noopener noreferrer" className="block"><img src={image.imageUrl} alt={image.imageName || `添付画像${index+1}`} loading="lazy" className="max-h-48 max-w-full w-32 rounded-lg border object-contain bg-white"/></a>)}</div> : null;
}
