import { useEffect,useRef,useState } from 'react';
import { createPortal } from 'react-dom';
import { safeTaskFileUrl } from '../taskFiles.mjs';
export default function TaskFileViewer({file,onClose}){
 const dialog=useRef(null),[preview,setPreview]=useState(null),[error,setError]=useState('');
 const download=safeTaskFileUrl(file.imageUrl);
 useEffect(()=>{
  dialog.current?.showModal();const before=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=before;};
 },[]);
 useEffect(()=>{
  const controller=new AbortController();let objectUrl;
  const load=async()=>{
   try{
    if(!download)throw new Error('添付ファイルのリンクを確認できません。');
    const response=await fetch(download+'&mode=preview',{signal:controller.signal}),info=await response.json();if(!response.ok)throw new Error(info.error||'ファイルを表示できませんでした。');
    if(info.kind==='drive'){
     const url=new URL(info.url);if(url.origin!=='https://drive.google.com'||!/^\/file\/d\/[A-Za-z0-9_-]+\/preview$/.test(url.pathname))throw new Error('プレビューの接続先を確認できません。');
     if(!controller.signal.aborted)setPreview({...info,openUrl:url.href.replace(/preview$/, 'view')});return;
    }
    const responseFile=await fetch(download,{signal:controller.signal});if(!responseFile.ok){const data=await responseFile.json();throw new Error(data.error||'ファイルを読み込めませんでした。');}
    if(info.kind==='text'){const text=await responseFile.text();if(!controller.signal.aborted)setPreview({...info,text});}
    else if(info.kind==='pdf'){const bytes=await responseFile.blob();if(controller.signal.aborted)return;objectUrl=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));setPreview({...info,url:objectUrl});}
    else throw new Error('このファイルはダウンロードして確認してください。');
   }catch(e){if(!controller.signal.aborted)setError(e.message||'ファイルを表示できませんでした。');}
  };
  void load();return()=>{controller.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[download]);
 return createPortal(<dialog ref={dialog} aria-labelledby="task-file-viewer-title" onCancel={e=>{e.preventDefault();onClose();}} className="fixed inset-0 m-auto h-[90dvh] max-h-[90dvh] w-[calc(100%-1rem)] max-w-6xl overflow-hidden rounded-2xl border border-gray-200 bg-white p-0 text-gray-800 shadow-2xl backdrop:bg-black/50">
  <div className="flex h-full min-h-0 flex-col"><header className="flex shrink-0 items-center justify-between gap-3 border-b p-3"><h2 id="task-file-viewer-title" className="min-w-0 break-all text-sm font-bold">{file.imageName||'添付ファイル'}</h2><button type="button" autoFocus onClick={onClose} aria-label="ファイル閲覧を閉じる" className="min-h-11 shrink-0 rounded-lg bg-gray-100 px-4 text-sm font-bold">閉じる ✕</button></header>
  <div className="min-h-0 flex-1 overflow-auto bg-gray-100">
   {!preview&&!error&&<p role="status" className="p-6 text-sm">ファイルを読み込んでいます…</p>}
   {error&&<p role="alert" className="p-6 text-sm text-red-700">{error}</p>}
   {preview?.kind==='text'&&<pre className="min-h-full whitespace-pre-wrap break-words bg-white p-4 font-mono text-sm">{preview.text}</pre>}
   {preview&&['pdf','drive'].includes(preview.kind)&&<iframe title={file.imageName||'添付ファイルの内容'} src={preview.url} className="h-full min-h-80 w-full border-0 bg-white" allow="fullscreen" referrerPolicy="no-referrer"/>}
  </div><footer className="shrink-0 space-y-2 border-t bg-white p-3">
   {preview?.kind==='drive'&&<p className="text-xs text-gray-600">Officeファイルの表示には、保存先へアクセスできるGoogleアカウントでのログインが必要です。表示できない場合は「別画面で開く」またはダウンロードをご利用ください。</p>}
   {preview?.kind==='pdf'&&<p className="text-xs text-gray-600">端末によって表示が異なる場合は「別画面で開く」をご利用ください。</p>}
   <div className="flex flex-wrap gap-2">{preview?.url&&<a href={preview.kind==='drive'?preview.openUrl:preview.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg border border-blue-200 px-4 text-sm font-bold text-blue-800">別画面で開く</a>}<a href={download||undefined} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-4 text-sm font-bold text-white">ダウンロード</a></div>
  </footer></div>
 </dialog>,document.body);
}
