import DateInput from './DateInput';
import { completionActorName } from '../taskCompletionActor.mjs';
import { handoffUpdates, initialPartnerText } from '../handoffHistory.mjs';
import { useState } from 'react';
import { ImageGallery } from './TaskImages';
import { ImportantBadge } from './ImportantToggle';
import { partnerAssigneeIds } from '../partnerAssignees.mjs';
import { inventoryProductLabel } from '../inventoryProduct.mjs';

export default function ViewerWorkspace({ tab, teamData, partnerItems, inventoryItems, users, date, onDate }) {
  const [query, setQuery] = useState('');
  const names = ids => ids.map(id => users.find(user => user.id === id)?.name || '担当者不明').join('・');
  const allTasks = Object.entries(teamData.tasks || {}).flatMap(([taskDate, owners]) => Object.entries(owners || {}).flatMap(([uid, tasks]) => (tasks || []).filter(task => task.visibility !== 'private').map(task => ({ ...task, taskDate, assigneeIds: task.assigneeIds?.length ? task.assigneeIds : [uid], recordKey: taskDate + uid + task.id }))));
  const partners = (partnerItems || []).map(item => ({ ...item, taskDate: item.date, assigneeIds: partnerAssigneeIds(item), recordKey: 'partner' + item.id }));
  const records = (tab === 'partner' ? partners : tab === 'completed' ? [...allTasks, ...partners].filter(item => item.completed) : allTasks.filter(item => item.taskDate === date || (!item.completed && item.taskDate < date)))
    .filter(item => !query || [item.subject, item.text, item.content, item.partnerName, names(item.assigneeIds)].join(' ').includes(query))
    .sort((a, b) => (tab === 'completed' ? String(b.completedAt || '').localeCompare(String(a.completedAt || '')) : String(a.taskDate || '').localeCompare(String(b.taskDate || '')) || String(a.time || '').localeCompare(String(b.time || ''))));
  const title = { daily: '日別タスク', partner: 'パートナータスク', completed: '終了履歴', inventory: '在庫一覧' }[tab] || '閲覧';
  return <main className="flex-1 overflow-y-auto bg-gray-50 p-3 pb-24 space-y-3">
    <h2 className="text-lg font-bold">{title}</h2><p className="rounded-lg bg-blue-50 p-2 text-sm text-blue-800">閲覧のみ：追加・編集・削除・終了操作はできません。</p>
    {tab === 'daily' && <label className="block text-sm font-bold">対象日<DateInput value={date} onChange={event => onDate(event.target.value)} className="ml-2 min-h-11 rounded-lg border bg-white px-2"/></label>}
    <input aria-label="表示内容を検索" placeholder="検索" value={query} onChange={event => setQuery(event.target.value)} className="w-full min-h-11 rounded-lg border bg-white px-3"/>
    {tab === 'inventory' ? inventoryItems.filter(item => !query || [inventoryProductLabel(item), item.barcode, item.usageLocation].join(' ').includes(query)).map(item => <details key={item.id} className="rounded-xl border bg-white p-3"><summary className="cursor-pointer font-bold">{inventoryProductLabel(item)} ／ 在庫 {Number(item.stock || 0)}個</summary><p className="mt-2 text-sm">品番：{item.modelNumber || '未登録'} ／ 棚：{item.shelfNumber || '未登録'}</p><p className="text-sm">使用箇所：{item.usageLocation || '未登録'} ／ JAN：{item.barcode || '未登録'}</p>{item.imageUrl && <img src={item.imageUrl} alt={inventoryProductLabel(item)} className="mt-2 max-h-48 max-w-full object-contain"/>}</details>) : records.length ? records.map(item => <details key={item.recordKey} className={'rounded-xl border bg-white p-3 ' + (item.important ? 'border-2 border-red-500' : 'border-blue-100')}>
      <summary className="cursor-pointer space-y-1"><div className="text-xs text-gray-600">{item.taskDate?.replaceAll('-', '/')} {item.time || ''} <ImportantBadge important={item.important}/> <span className={item.completed ? 'text-green-700' : 'text-orange-700'}>{item.completed ? '終了済み' : '未終了'}</span></div><div className="font-bold">{item.partnerName ? item.partnerName + ' ／ ' : ''}{item.subject || item.text || '件名なし'}</div><div className="text-xs text-gray-600">担当：{names(item.assigneeIds)}</div></summary>
      <div className="mt-3 space-y-2 text-sm"><p className="whitespace-pre-wrap break-words">{item.partnerName ? initialPartnerText(item) : item.text || ''}</p><p>終了予定：{item.endTime || '未設定'}</p>{item.completedAt && <p>終了：{new Date(item.completedAt).toLocaleString('ja-JP')} ・ 終了操作: {completionActorName(item)}</p>}<ImageGallery item={item}/>{handoffUpdates(item).map((update, index) => <div key={update.id || index} className="rounded-lg bg-gray-50 p-2"><p className="text-xs text-gray-500">{update.authorName} {update.createdAt ? new Date(update.createdAt).toLocaleString('ja-JP') : ''}</p><p className="whitespace-pre-wrap break-words">{update.text}</p><ImageGallery item={update}/></div>)}</div>
    </details>) : <p className="p-4 text-sm text-gray-500">表示するタスクはありません。</p>}
  </main>;
}

