import { OAuth2Client } from 'google-auth-library';
import { CLIENT_ID, configuration, cookies, seal, unseal, verifyRequest, fault } from './_lib/report-auth.js';
import { makeLineStore } from './_lib/line-store.js';
import { inventoryActor, inventoryPublicItems, inventoryAdjustment } from './_lib/inventory-access.js';
const path = 'app_data/shared_state', COOKIE = '__Host-teamshift_inventory';
const cookie = (value, age) => `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
async function googleIdentity(credential) {
  const ticket = await new OAuth2Client(CLIENT_ID).verifyIdToken({ idToken: credential, audience: CLIENT_ID });
  const data = ticket.getPayload();
  if (!data?.email_verified || !data.sub || !data.email) throw fault(401, 'Googleログインをやり直してください。');
  return { sub: data.sub, email: data.email.toLowerCase(), name: data.name || data.email };
}
export function createInventoryAccessHandler({ env = globalThis.process.env, configure = configuration, makeStore = makeLineStore, verifyGoogle = googleIdentity, now = Date.now } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (!['GET','POST','DELETE'].includes(req.method)) return res.status(405).end();
      if (req.method !== 'GET') verifyRequest(req, false);
      const config = configure(env);
      if (!config.ready) throw fault(503, '在庫操作のサーバー設定を確認してください。');
      if (req.method === 'DELETE') { res.setHeader('Set-Cookie', cookie('',0)); return res.status(200).json({done:true}); }
      const store = makeStore(env);
      let identity;
      if (req.method === 'POST' && req.body?.action === 'login') {
        if (typeof req.body.credential !== 'string' || req.body.credential.length > 10000) throw fault(400, 'Googleログインをやり直してください。');
        try { identity = await verifyGoogle(req.body.credential); } catch { throw fault(401,'Googleログインをやり直してください。'); }
      } else {
        try { const session = unseal(cookies(req)[COOKIE],config.secret); if (session.purpose === 'inventory-access' && session.expires > now()) identity = session.identity; } catch { /* Expired or missing session. */ }
        if (!identity) throw fault(401,'Googleログインしてください。');
      }
      if (req.method === 'POST' && req.body?.action === 'adjust') {
        const result = await store.transact([path], values => {
          const data=values[path];
          const actor=inventoryActor(data,identity);
          const plan=inventoryAdjustment(data,req.body,actor,new Date(now()).toISOString());
          return { writes: plan.duplicate ? [] : [{path,value:{inventoryItems:plan.items,inventoryMovements:plan.movements},fields:['inventoryItems','inventoryMovements']}], result:{actor,items:inventoryPublicItems(plan.items),movement:plan.movement} };
        });
        return res.status(200).json(result);
      }
      if (req.method === 'POST' && req.body?.action !== 'login') throw fault(400,'操作を確認してください。');
      const data=await store.read(path), actor=inventoryActor(data,identity);
      if (req.method === 'POST') res.setHeader('Set-Cookie',cookie(seal({purpose:'inventory-access',identity,expires:now()+8*3600000},config.secret),8*3600));
      return res.status(200).json({actor,items:inventoryPublicItems(data.inventoryItems || [])});
    } catch(error) { return res.status(error.status || 500).json({error:error.status ? error.message : '在庫データを取得・保存できませんでした。時間を置いて再度お試しください。'}); }
  };
}
export default createInventoryAccessHandler();
