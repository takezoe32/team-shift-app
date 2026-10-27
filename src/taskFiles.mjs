export const TASK_FILE_LIMIT = 3 * 1024 * 1024;
export const TASK_FILE_ACCEPT = '.pdf,.xlsx,.xls,.docx,.doc,.pptx,.ppt,.txt,.csv';
const types = {pdf:'application/pdf',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',xls:'application/vnd.ms-excel',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',doc:'application/msword',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',ppt:'application/vnd.ms-powerpoint',txt:'text/plain',csv:'text/csv'};
export const taskFileExtension = name => String(name || '').split('.').pop().toLowerCase();
export const isTaskFile = file => Object.hasOwn(types, taskFileExtension(file?.name));
export function validateTaskFiles(files) {
 if(files.length>5)throw new Error('1回に追加できるファイルは5件までです。');
 for(const file of files){if(!isTaskFile(file))throw new Error('PDF・Excel・Word・PowerPoint・テキスト・CSVを選択してください。');if(!Number.isFinite(file.size)||file.size<=0||file.size>TASK_FILE_LIMIT)throw new Error('添付ファイルは1件3MB以下にしてください。');}
}
export const taskFileMime = name => types[taskFileExtension(name)];
export const taskFileUrl = id => /^[A-Za-z0-9_-]{10,200}$/.test(String(id||''))?'/api/task-files?id='+encodeURIComponent(id):'';
export function safeTaskFileUrl(url) { return /^\/api\/task-files\?id=[A-Za-z0-9_-]{10,200}$/.test(String(url||'')) ? url : ''; }
export function validateTaskFileContent(name, bytes) {
 const ext=taskFileExtension(name);validateTaskFiles([{name,size:bytes.length}]);
 const starts=signature=>signature.every((value,i)=>bytes[i]===value);
 if(ext==='pdf'&&!starts([37,80,68,70,45]))throw new Error('PDFファイルの形式を確認してください。');
 if(['xlsx','docx','pptx'].includes(ext)&&!starts([80,75,3,4]))throw new Error('Officeファイルの形式を確認してください。');
 if(['xls','doc','ppt'].includes(ext)&&!starts([208,207,17,224,161,177,26,225]))throw new Error('Officeファイルの形式を確認してください。');
 if(['txt','csv'].includes(ext)&&bytes.includes(0))throw new Error('UTF-8形式のテキスト・CSVを選択してください。');
 return taskFileMime(name);
}
export async function uploadTaskDocuments(files,user,onProgress=()=>{},fetcher=fetch) {
 validateTaskFiles(files);const uploaded=[];
 for(const [index,file] of files.entries()){
  onProgress({stage:'uploading',index:index+1,count:files.length,percent:null});
  const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('添付ファイルを読み込めませんでした。'));reader.readAsDataURL(file);});
  const response=await fetcher('/api/task-files',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({appUid:user?.id,name:file.name,base64})});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'ファイルを保存できませんでした。');uploaded.push(result.attachment);
 }
 return uploaded;
}
export function taskFileVisibleTo(source, uid, fileId, ownerUid) {
 if (ownerUid === uid) return true;
 const contains=item=>[...(item?.images||[]),...(item?.updates||[]).flatMap(update=>update.images||[])].some(file=>file.mediaType==='file'&&file.fileId===fileId);
 for(const day of Object.values(source?.teamData?.tasks||{}))for(const [owner,tasks]of Object.entries(day||{}))for(const task of tasks||[])if((task.visibility!=='private'||owner===uid)&&contains(task))return true;
 return (source?.partnerItems||[]).some(task=>(task.visibility!=='private'||task.createdByUid===uid)&&contains(task));
}
