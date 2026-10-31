import { fault } from './report-auth.js';
const emailOf = value => String(value || '').trim().toLowerCase();
export function inventoryActor(data, identity) {
  if (!identity?.sub || !identity.email) throw fault(401,'Googleログインしてください。');
  const email=emailOf(identity.email);
  const matches=Object.entries(data?.users || {}).filter(([,user])=>emailOf(user.email)===email);
  if (matches.length > 1) throw fault(403,'登録メールが重複しています。管理者に確認してください。');
  const match=matches[0];
  if (match && (match[1].role==='viewer' || data?.roles?.[match[1].role]?.readOnly)) throw fault(403,'閲覧専用のアカウントでは在庫を変更できません。');
  if (!match && !email.endsWith('@plandosee.co.jp')) throw fault(403,'会社のGoogleアカウント、またはアプリ登録済みのアカウントでログインしてください。');
  return {uid:match?.[0] || 'google_'+identity.sub, name:match?.[1].name || identity.name || email, email};
}
export function inventoryPublicItems(items) {
  const keys=['id','name','kind','manufacturer','modelNumber','barcode','shelfNumber','usageLocation','stock','imageUrl'];
  return items.map(item=>Object.fromEntries(keys.filter(key=>item[key]!==undefined).map(key=>[key,item[key]])));
}
export function inventoryAdjustment(data,input,actor,timestamp) {
  const {itemId,quantity,direction,requestId}=input;
  if (!Number.isSafeInteger(quantity) || quantity<1 || quantity>1000000 || !['in','out'].includes(direction) || typeof itemId!=='string' || !/^[a-f0-9-]{36}$/i.test(requestId || '')) throw fault(400,'商品と数量を確認してください。');
  const id='qr_'+requestId, movements=data?.inventoryMovements || [], previous=movements.find(row=>row.id===id);
  if (previous) {
    if (previous.actorUid!==actor.uid || previous.productId!==itemId || previous.delta!==(direction==='out'?-quantity:quantity)) throw fault(409,'操作番号が重複しています。画面を更新してください。');
    return {duplicate:true,items:data.inventoryItems || [],movements,movement:previous};
  }
  const items=data?.inventoryItems || [], item=items.find(row=>row.id===itemId);
  if (!item) throw fault(404,'商品が見つかりません。画面を再読込してください。');
  const before=Number(item.stock || 0), delta=direction==='out'?-quantity:quantity, after=before+delta;
  if (!Number.isSafeInteger(before) || before<0 || !Number.isSafeInteger(after)) throw fault(400,'在庫数を確認してください。');
  if (after<0) throw fault(409,'在庫数が不足しています。最新の在庫を再読込してください。');
  const movement={id,timestamp,type:direction==='in'?'stock_in':'stock_out',typeLabel:direction==='in'?'入庫':'出庫',productId:itemId,productName:item.name || [item.manufacturer,item.modelNumber].filter(Boolean).join(' ') || item.kind || '商品',delta,stockBefore:before,stockAfter:after,reason:'QR共通在庫画面から入出庫',actorUid:actor.uid,actorName:actor.name,actorEmail:actor.email};
  return {items:items.map(row=>row.id===itemId?{...row,stock:after}:row),movements:[...movements,movement],movement};
}
