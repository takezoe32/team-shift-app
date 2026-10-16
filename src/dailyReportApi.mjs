export async function reportConnection(signal) {
  const response = await fetch('/api/daily-report', { signal });
  const data = await response.json();
  if (!response.ok && data.ready !== false) throw new Error(data.error || '日報の連携状態を確認できません。');
  return data;
}
export async function reportAction(action, values, csrf) {
  const response = await fetch('/api/daily-report', { method: 'POST', keepalive: action === 'logout', headers: { 'Content-Type': 'application/json', 'X-Report-CSRF': csrf }, body: JSON.stringify({ action, ...values }) });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || '日報処理に失敗しました。'), { code: data.code, status: response.status });
  return data;
}
export async function establishReportSession(credential) {
  const connection = await reportConnection();
  if (!connection.ready) return;
  await reportAction('session', { credential }, connection.csrf);
  window.dispatchEvent(new Event('teamshift-report-session'));
}
export async function endReportSession() {
  const connection = await reportConnection();
  if (connection.ready) await reportAction('logout', {}, connection.csrf);
}
