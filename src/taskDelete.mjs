import { inventoryProductLabel } from './inventoryProduct.mjs';

// Run against the transaction snapshot so repeated deletes cannot return stock twice.
export function planTaskDelete(data, date, ownerUid, taskId, movementBase) {
  const teamData = data.teamData || {};
  const day = teamData.tasks?.[date] || {};
  const tasks = day[ownerUid] || [];
  const target = tasks.find(task => task.id === taskId);
  if (!target) return null;
  const nextTasks = tasks.filter(task => task.id !== taskId);
  const nextTeam = { ...teamData, tasks: { ...teamData.tasks, [date]: { ...day, [ownerUid]: nextTasks } } };
  const updates = { [`teamData.tasks.${date}.${ownerUid}`]: nextTasks };
  let inventoryItems = data.inventoryItems || [];
  let inventoryMovements = data.inventoryMovements || [];
  const product = target.inventoryDeducted && inventoryItems.find(item => item.id === target.productId);
  if (product) {
    const quantity = Math.max(1, Number(target.inventoryQuantity) || 1);
    const before = Number(product.stock) || 0;
    inventoryItems = inventoryItems.map(item => item.id === product.id ? { ...item, stock: before + quantity } : item);
    inventoryMovements = [...inventoryMovements, { ...movementBase, type: 'task_delete_restore', typeLabel: 'タスク削除による在庫戻し', productId: product.id, productName: inventoryProductLabel(product), delta: quantity, stockBefore: before, stockAfter: before + quantity, reason: '削除したタスク：' + (target.subject || target.text || '') }];
    Object.assign(updates, { inventoryItems, inventoryMovements });
  }
  return { updates, teamData: nextTeam, inventoryItems, inventoryMovements, restocked: !!product };
}
