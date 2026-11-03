export function sharedDataError(error) {
  const code=String(error?.code || '').replace(/^firestore\//,'');
  if (code==='permission-denied') return '保存データへのアクセスが拒否されました。Firestoreのアクセス設定、またはメンバー登録を管理者に確認してください。データが削除されたことを示すエラーではありません。';
  if (code==='not-found') return '共有データが見つかりません。新しいデータは作成せず、管理者に保存先を確認してください。';
  return '保存データを読み込めませんでした。通信状態を確認して再試行してください。';
}
export function appAuthError(error) {
  if (['auth/configuration-not-found','auth/operation-not-allowed','auth/admin-restricted-operation'].includes(error?.code)) return 'Firebase Authenticationの初期設定が必要です。管理者に確認してください。';
  if (error?.code==='auth/network-request-failed') return '認証サーバーへ接続できません。通信状態を確認して再試行してください。';
  return error?.message || 'ログインできませんでした。もう一度お試しください。';
}
