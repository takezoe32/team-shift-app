import { useRef, useState } from 'react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
const CLIENT_ID='147696997284-sttbu4gtchokcqqn0votaeq49s17dtbf.apps.googleusercontent.com';
function DataSafetyPage(){
 const credential=useRef('');const [rows,setRows]=useState([]),[mail,setMail]=useState(null),[busy,setBusy]=useState(false),[authenticated,setAuthenticated]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[preview,setPreview]=useState(null);
 async function request(action,values={}){
  const response=await fetch('/api/app-auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,credential:credential.current,...values})});
  const result=await response.json();if(!response.ok)throw new Error(result.error||'操作に失敗しました。');return result;
 }
 async function refresh(){const data=await request('backup-status');setRows(data.backups);setMail(await request('alert-status'));}
 async function run(operation){if(busy)return;setBusy(true);setError('');setMessage('');try{await operation();}catch(err){setError(err.message);}finally{setBusy(false);}}
 async function login(result){credential.current=result.credential;await run(async()=>{await refresh();setAuthenticated(true);});}
 async function restore(){
  if(!preview||!window.confirm(`${preview.id} の状態へ全データを戻します。現在の状態は復元前バックアップに残します。実行しますか？`))return;
  await run(async()=>{await request('backup-restore',{backupId:preview.id,checksum:preview.checksum,expectedUpdateTime:preview.expectedUpdateTime,confirm:'RESTORE '+preview.id});setPreview(null);await refresh();setMessage('復元しました。アプリへ戻って内容を確認してください。');});
 }
 return <main className="min-h-dvh bg-gray-50 p-4 sm:p-8 text-slate-800"><div className="mx-auto max-w-2xl space-y-5"><a href="#" className="text-blue-700 underline">アプリへ戻る</a><h1 className="text-2xl font-bold">データ保護（管理者用）</h1><p className="text-sm">毎日午前0時台に自動保存し、直近30日分を保持します。添付ファイルはリンク・登録情報が保存対象です。</p>
 {error&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}{message&&<p role="status" className="rounded-xl bg-green-50 p-4 text-green-800">{message}</p>}
 {!authenticated?<section className="rounded-xl bg-white p-5 space-y-3"><p>管理者のGoogleアカウントで本人確認してください。</p>{busy?<p>確認中…</p>:<GoogleLogin onSuccess={login} onError={()=>setError('Googleログインに失敗しました。')}/>}</section>:<>
 <section className="rounded-xl border bg-white p-5 space-y-3"><h2 className="font-bold">バックアップ</h2><div className="flex flex-wrap gap-3"><button disabled={busy} className="min-h-11 rounded-lg border px-4" onClick={()=>run(refresh)}>一覧を更新</button><button disabled={busy} className="min-h-11 rounded-lg bg-blue-600 px-4 text-white" onClick={()=>run(async()=>{const r=await request('backup-now');await refresh();setMessage(r.skipped?'本日分はすでに保存されています。':'本日分のバックアップを保存・検証しました。');})}>本日分を保存</button></div>
 {!rows.length&&<p className="text-sm text-amber-800">まだバックアップがありません。「本日分を保存」で初回保存できます。</p>}
 <ul className="divide-y">{rows.map(row=><li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div><p className="font-bold">{row.kind==='before-restore'?'復元直前の退避':row.id}</p><p className="text-sm">{new Date(row.createdAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})} ／ 約{Math.ceil(row.byteLength/1024)}KB</p></div><button disabled={busy} className="min-h-11 rounded-lg border px-3" onClick={()=>run(async()=>setPreview(await request('backup-preview',{backupId:row.id})))}>復元内容を確認</button></li>)}</ul></section>
 {preview&&<section className="rounded-xl border-2 border-amber-300 bg-white p-5 space-y-3"><h2 className="font-bold">{preview.id} の復元確認</h2><p className="text-sm">メンバー {preview.counts.members}名 ／ メンバータスク {preview.counts.memberTasks}件 ／ パートナータスク {preview.counts.partnerTasks}件 ／ 在庫商品 {preview.counts.inventory}件 ／ 検針マップ {preview.counts.meterPoints===null?'このバックアップには含まれていません（現在の配置を維持）':preview.counts.meterPoints+'か所'}</p><p className="text-sm">確認後にデータが更新されていた場合は復元を中止します。過去のメンバー登録・権限も戻ります。</p><button disabled={busy} className="min-h-11 rounded-lg bg-red-700 px-4 text-white" onClick={restore}>この時点へ復元する</button><button disabled={busy} className="min-h-11 px-4" onClick={()=>setPreview(null)}>閉じる</button></section>}
 <section className="rounded-xl border bg-white p-5 space-y-3"><h2 className="font-bold">不具合のメール通知</h2><p className="text-sm">通知先：{mail?.to}</p><p className="text-sm">{mail?.configured?'送信設定あり。テストメールで受信を確認してください。':'未設定：VercelのProduction環境変数に ALERT_SMTP_PASSWORD を登録してください。送信元Gmailのアプリパスワードを使います。'}</p><p className="text-sm">バックアップ・日報の自動保存失敗、ログイン中に検知したデータ読込失敗・処理エラーを通知します。同じ種類の通知は原則1日1回です。</p><button disabled={busy||!mail?.configured} className="min-h-11 rounded-lg border px-4" onClick={()=>run(async()=>{await request('alert-test');setMessage('テストメールを送信しました。受信箱をご確認ください。');})}>テストメールを送信</button></section>
 </>}{busy&&<p role="status">処理中…</p>}</div></main>;
}
export default function DataSafety(){return <GoogleOAuthProvider clientId={CLIENT_ID}><DataSafetyPage/></GoogleOAuthProvider>;}
