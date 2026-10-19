import { GoogleAuth } from 'google-auth-library';
import { decodeFields } from './report-auth.js';

const root = 'https://firestore.googleapis.com/v1/projects/team-shift-app/databases/(default)/documents';
export const lineConfigPath = '_server_integrations/line_config';
export const linePendingPath = id => '_server_integrations/line_task_' + id;
const encode = value => {
  if (value === null || value === undefined) return { nullValue: null };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (typeof value === 'object') return { mapValue: { fields: encodeFields(value) } };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  return { stringValue: String(value) };
};
const encodeFields = value => Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]));
export function makeLineStore(env = globalThis.process.env, fetcher = fetch, makeAuth = credentials => new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/datastore'] })) {
  let credentials;
  try { credentials = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON); } catch { throw new Error('保存設定がありません。'); }
  if (credentials.project_id !== 'team-shift-app') throw new Error('保存先が不正です。');
  const auth = makeAuth(credentials);
  const request = async (path, options = {}) => {
    const token = await auth.getAccessToken();
    const response = await fetcher(root + path, { ...options, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(12000) });
    if (response.status === 404 && !options.method) return null;
    if (response.status === 409 || response.status === 412) throw Object.assign(new Error('競合'), { conflict: true });
    if (!response.ok) throw new Error('データの保存に失敗しました。');
    return response.status === 204 ? {} : response.json();
  };
  const read = async path => {
    const doc = await request('/' + path);
    return { path, value: doc ? decodeFields(doc.fields) : null, updateTime: doc?.updateTime };
  };
  return {
    async ensurePrivate() {
      const response = await fetcher(root + '/' + lineConfigPath, { signal: AbortSignal.timeout(10000) });
      if (![401, 403].includes(response.status)) throw new Error('LINE連携情報を保護するFirestoreルールの確認が必要です。');
    },
    async read(path) { return (await read(path)).value; },
    async transact(paths, plan) {
      for (let retry = 0; retry < 5; retry++) {
        const records = await Promise.all(paths.map(read));
        const values = Object.fromEntries(records.map(record => [record.path, record.value]));
        const result = plan(values);
        const writes = records.map(record => {
          const currentDocument = record.updateTime ? { updateTime: record.updateTime } : { exists: false };
          const patch = result.writes?.find(write => write.path === record.path);
          if (!patch) return { verify: root.replace('https://firestore.googleapis.com/v1/', '') + '/' + record.path, currentDocument };
          return { update: { name: root.replace('https://firestore.googleapis.com/v1/', '') + '/' + record.path, fields: encodeFields(patch.value) }, ...(patch.fields ? { updateMask: { fieldPaths: patch.fields } } : {}), currentDocument };
        });
        try {
          await request(':commit', { method: 'POST', body: JSON.stringify({ writes }) });
          return result.result;
        } catch (error) {
          if (!error.conflict || retry === 4) throw error;
        }
      }
    },
    async inbox() {
      const docs = await request(':runQuery', { method: 'POST', body: JSON.stringify({ structuredQuery: { from: [{ collectionId: '_server_integrations' }], where: { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'review' } } }, limit: 100 } }) });
      return (docs || []).filter(row => row.document?.name?.includes('/line_task_')).map(row => decodeFields(row.document.fields));
    }
  };
}
