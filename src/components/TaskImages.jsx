import { useEffect, useRef } from 'react';
import { getTaskImages, validateTaskImageFiles } from '../taskImages.mjs';

function FilePreview({ file }) {
  const ref = useRef(null);
  useEffect(() => { const url = URL.createObjectURL(file); if (ref.current) ref.current.src = url; return () => URL.revokeObjectURL(url); }, [file]);
  return <img ref={ref} alt={file.name} className="h-20 w-20 rounded border object-contain bg-white"/>;
}
export function ImagePicker({ files, onChange, disabled = false }) {
  return <div className="space-y-2"><label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-gray-300 bg-white px-3 text-xs font-bold text-blue-700">画像を追加（複数選択可）<input type="file" accept="image/*" multiple disabled={disabled} className="hidden" onChange={event=>{
    const incoming = Array.from(event.target.files || []); event.target.value = '';
    const next = [...files, ...incoming];
    try { validateTaskImageFiles(next); onChange(next); } catch(error) { alert(error.message); }
  }}/></label><div className="flex flex-wrap gap-2">{files.map((file,index)=><div key={index} className="space-y-1"><FilePreview file={file}/><button type="button" disabled={disabled} onClick={()=>onChange(files.filter((_,i)=>i!==index))} className="min-h-9 text-xs font-bold text-red-600" aria-label={file.name + 'を外す'}>この画像を外す</button></div>)}</div><p className="text-[10px] text-gray-500">1回5枚まで・1枚10MB以下。保存前に1枚ずつ外せます。</p></div>;
}
export function ImageGallery({ item, onOpen }) {
  const images = getTaskImages(item);
  return images.length ? <div className="mt-2 flex flex-wrap gap-2" onClick={event=>event.stopPropagation()}>{images.map((image,index)=><a key={image.imageUrl} onClick={event=>{if(onOpen){event.preventDefault();onOpen(image.imageUrl,image.imageName);}}} href={image.imageUrl} target="_blank" rel="noopener noreferrer" className="block"><img src={image.imageUrl} alt={image.imageName || `添付画像${index+1}`} loading="lazy" className="max-h-48 max-w-full w-32 rounded-lg border object-contain bg-white"/></a>)}</div> : null;
}
