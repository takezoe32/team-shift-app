export async function reportAppIncident(auth,code){
 try{
  if(!auth.currentUser)return;
  const key='teamshift-incident-'+code,last=Number(sessionStorage.getItem(key)||0);
  if(Date.now()-last<300000)return;sessionStorage.setItem(key,String(Date.now()));
  const token=await auth.currentUser.getIdToken();
  await fetch('/api/app-auth',{method:'POST',keepalive:true,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:'incident',code})});
 }catch{/* Errors in alert delivery must never change app data or recurse. */}
}
