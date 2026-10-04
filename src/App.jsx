import React, { useState, useEffect, useRef } from 'react';
import { GoogleOAuthProvider, GoogleLogin, googleLogout } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, onSnapshot, setDoc, updateDoc, deleteField, arrayUnion } from 'firebase/firestore';

import { 
  Calendar as CalendarIcon, 
  CheckSquare, 
  Plus, 
  Trash2, 
  ChevronLeft, 
  ChevronRight, 
  ChevronUp,
  ChevronDown,
  X, 
  Users, 
  Edit2, 
  Save, 
  LogOut, 
  ClipboardList,
  Handshake,
  Settings, 
  Table, 
  UserPlus,
  ShieldAlert,
  FileSpreadsheet,
  Image as ImageIcon,
  Paperclip,
  Loader2
} from 'lucide-react';

// Google OAuth Client ID
const GOOGLE_CLIENT_ID = "147696997284-sttbu4gtchokcqqn0votaeq49s17dtbf.apps.googleusercontent.com";

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyB0VeqCI-it5uqe5BTjNcdDM25ciTB5Tlk",
  authDomain: "team-shift-app.firebaseapp.com",
  projectId: "team-shift-app",
  storageBucket: "team-shift-app.firebasestorage.app",
  messagingSenderId: "147696997284",
  appId: "1:147696997284:web:359a8e43d8aef38aab2731"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const CLOUDINARY_CLOUD_NAME = 'hfkn6ad1';
const CLOUDINARY_UPLOAD_PRESET = 'teamshift_tasks';
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

const writeDebugLog = async ({ level = 'INFO', event, user = null, details = {} }) => {
  try {
    const safeDetails = details && typeof details === 'object' ? details : { value: String(details ?? '') };
    await updateDoc(doc(db, 'app_data', 'shared_state'), {
      debugLogs: arrayUnion({
        id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        timestamp: new Date().toISOString(), level, event: String(event || 'unknown'),
        userId: user?.id || '', userEmail: user?.email || '', userName: user?.name || '',
        page: window.location.pathname, userAgent: navigator.userAgent, details: safeDetails
      })
    });
  } catch (error) { console.error('Debug log write failed:', error); }
};
const uploadTaskImageToCloudinary = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  const response = await fetch(CLOUDINARY_UPLOAD_URL, { method: 'POST', body: formData });
  const result = await response.json();
  if (!response.ok || !result.secure_url) {
    throw new Error(result?.error?.message || 'Cloudinaryへの画像アップロードに失敗しました。');
  }
  return result;
};

const INITIAL_ROLES = {
  admin: { level: 40, name: '管理者' },
  area_manager: { level: 30, name: 'エリアM' },
  manager: { level: 20, name: '店長' },
  staff: { level: 10, name: 'スタッフ' }
};

const DEFAULT_SHIFT_TYPES = [
  { id: 'work', label: '出勤', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { id: 'off', label: '休み', color: 'bg-red-50 text-red-600 border-red-100' },
  { id: 'summer', label: '夏休', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { id: 'paid', label: '有給', color: 'bg-green-100 text-green-700 border-green-200' },
  { id: 'winter', label: '冬休', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { id: 'course', label: '講習', color: 'bg-teal-100 text-teal-700 border-teal-200' },
  { id: 'none', label: '未定', color: 'bg-gray-100 text-gray-500 border-gray-200' }
];

const COLOR_PRESETS = [
  'bg-orange-100 text-orange-700 border-orange-200',
  'bg-blue-100 text-blue-700 border-blue-200',
  'bg-purple-100 text-purple-700 border-purple-200',
  'bg-indigo-100 text-indigo-700 border-indigo-200',
  'bg-green-100 text-green-700 border-green-200',
  'bg-pink-100 text-pink-700 border-pink-200',
  'bg-teal-100 text-teal-700 border-teal-200',
  'bg-red-50 text-red-600 border-red-100'
];

const DEFAULT_ROLE_NAMES = {
  admin: '管理者',
  area_manager: 'エリアM',
  manager: '店長',
  staff: 'スタッフ'
};

const DAYS_OF_WEEK = ['日', '月', '火', '水', '木', '金', '土'];

const formatDate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();

const checkCanManageShift = (user, roles) => {
  if (!user || !roles[user.role]) return false;
  const level = roles[user.role].level || 0;
  return level >= 40 || !!user.canManageShift;
};

const checkIsAdmin = (user, roles) => {
  if (!user || !roles[user.role]) return false;
  return (roles[user.role].level || 0) >= 40;
};

const LoginScreen = ({ onGoogleLoginSuccess, authError }) => (
  <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 p-6 min-h-screen">
    <div className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-lg text-center space-y-6">
      <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto">
        <Users size={32}/>
      </div>
      <div>
        <div className="flex items-center justify-center gap-2">
          <div className="flex flex-col text-[10px] sm:text-xs font-black text-gray-800 tracking-tight leading-[0.9] text-right">
            <span>LUIGANS</span>
            <span>OPERATIONS</span>
            <span>CREW</span>
          </div>
          <span className="text-3xl sm:text-4xl font-normal text-blue-600 tracking-tight leading-none">App</span>
        </div>
        <p className="text-sm text-gray-500 mt-2">Google アカウントでログインしてください</p>
      </div>

      {authError && (
        <div className="bg-red-50 border border-red-200 text-red-600 p-3 rounded-xl text-xs flex items-center gap-2 text-left">
          <ShieldAlert size={20} className="shrink-0 text-red-500"/>
          <div>
            <p className="font-bold">アクセスが拒否されました</p>
            <p className="mt-0.5">{authError}</p>
          </div>
        </div>
      )}

      <div className="pt-2 flex justify-center">
        <GoogleLogin
          onSuccess={onGoogleLoginSuccess}
          onError={() => alert('Google ログインに失敗しました')}
          useOneTap
        />
      </div>
    </div>
  </div>
);

const CalendarView = ({ currentDate, changeMonth, teamData, partnerItems, partnerNames, currentUserUid, shiftTypes, sortedUsers, roles, currentUser, updateTaskAssignees, updateTaskText, deleteTask, toggleTask, updatePartnerItem }) => {
  const [detailTask, setDetailTask] = useState(null);
  const [detailPartner, setDetailPartner] = useState(null);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState([]);
  const [isUpdatingAssignees, setIsUpdatingAssignees] = useState(false);
  const [assigneeUpdateMessage, setAssigneeUpdateMessage] = useState('');
  const [editingTaskText, setEditingTaskText] = useState('');
  const [isEditingTask, setIsEditingTask] = useState(false);
  const [isEditingPartner, setIsEditingPartner] = useState(false);
  const [partnerEditName, setPartnerEditName] = useState('');
  const [partnerEditDate, setPartnerEditDate] = useState('');
  const [partnerEditHour, setPartnerEditHour] = useState('');
  const [partnerEditMinute, setPartnerEditMinute] = useState('');
  const [partnerEditContent, setPartnerEditContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const isAdmin = currentUser?.role === 'admin' || (roles?.[currentUser?.role]?.level || 0) >= 40;
  const canEditTask = detailTask && (isAdmin || detailTask.ownerUid === currentUserUid);
  const todayStr = formatDate(new Date());
  const [selectedCalendarTaskDate, setSelectedCalendarTaskDate] = useState(todayStr);
  const year = currentDate.getFullYear(), month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month), firstDayOfWeek = new Date(year, month, 1).getDay();
  const days = [];
  for (let i=0;i<firstDayOfWeek;i++) days.push(<div key={`empty-${i}`} className="p-2 border-b border-r border-gray-100 bg-gray-50/50 min-h-[80px]"></div>);
  for (let i=1;i<=daysInMonth;i++) {
    const dateStr=formatDate(new Date(year,month,i));
    const myShiftId=(teamData.shifts[dateStr]||{})[currentUserUid]||'none';
    const myShift=shiftTypes.find(s=>s.id===myShiftId)||shiftTypes.find(s=>s.id==='none');
    const hasMyTask=teamData.tasks[dateStr]?.[currentUserUid]?.length>0;
    days.push(<div key={i} onClick={()=>setSelectedCalendarTaskDate(dateStr)} className="p-1 border-b border-r border-gray-100 min-h-[80px] cursor-pointer active:bg-gray-50 flex flex-col">
      <div className="flex justify-between items-start p-1"><span className={`text-sm font-bold ${new Date().getDate()===i&&new Date().getMonth()===month?'bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center':'text-gray-700'}`}>{i}</span>{hasMyTask&&<div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5"></div>}</div>
      <div className="mt-1 flex-1 px-1">{myShift.id!=='none'&&<div className={`text-[10px] font-bold px-1.5 py-0.5 rounded truncate ${myShift.color}`}>{myShift.label}</div>}</div>
    </div>);
  }
  const activePartnerItems=(partnerItems||[]).filter(i=>!i.completed).sort((a,b)=>`${a.date||''}T${a.time||'00:00'}`.localeCompare(`${b.date||''}T${b.time||'00:00'}`));
  const datesToShow=Array.from(new Set([...Object.keys(teamData.tasks||{}).filter(d=>d<todayStr),selectedCalendarTaskDate])).sort();
  const selectedTasks=datesToShow.flatMap(taskDate=>(sortedUsers||[]).flatMap(member=>(teamData.tasks[taskDate]?.[member.id]||[]).filter(t=>!t.completed).map(task=>({...task,ownerUid:member.id,member,taskDate,assigneeIds:Array.isArray(task.assigneeIds)&&task.assigneeIds.length?task.assigneeIds:[member.id]}))));
  const startPartnerEdit=()=>{const [h='',m='']=String(detailPartner?.time||'').split(':');setPartnerEditName(detailPartner?.partnerName||'');setPartnerEditDate(detailPartner?.date||'');setPartnerEditHour(h);setPartnerEditMinute(m);setPartnerEditContent(detailPartner?.content||'');setIsEditingPartner(true);};
  const savePartnerEdit=async()=>{if(!detailPartner||!updatePartnerItem)return;if(!partnerEditName||!partnerEditDate||!partnerEditHour||!partnerEditMinute||!partnerEditContent.trim()){alert('パートナー名・日付・時間・内容を入力してください。');return;}setIsSaving(true);try{const changes={partnerName:partnerEditName,date:partnerEditDate,time:`${partnerEditHour}:${partnerEditMinute}`,content:partnerEditContent.trim()};await updatePartnerItem(detailPartner.id,changes);setDetailPartner(p=>p?{...p,...changes}:p);setIsEditingPartner(false);}catch(e){alert('パートナータスクの更新に失敗しました。');}finally{setIsSaving(false);}};
  const saveTaskEdit=async()=>{if(!detailTask||!canEditTask)return;setIsSaving(true);try{const text=editingTaskText.trim();await updateTaskText(detailTask.taskDate,detailTask.ownerUid,detailTask.id,text);setDetailTask(p=>p?{...p,text}:p);setIsEditingTask(false);}catch(e){alert('タスクの更新に失敗しました。');}finally{setIsSaving(false);}};
  const removeTask=async()=>{if(!detailTask||!canEditTask)return;if(!window.confirm('このタスクを削除してもよろしいですか？'))return;await deleteTask(detailTask.taskDate,detailTask.ownerUid,detailTask.id);setDetailTask(null);};
  const finishTask=async()=>{if(!detailTask||!canEditTask)return;await toggleTask(detailTask.taskDate,detailTask.ownerUid,detailTask.id);setDetailTask(null);};

  return <div className="flex-1 flex flex-col bg-gray-50 pb-[68px] overflow-hidden">
    <div className="bg-white px-4 py-3 flex items-center justify-between shadow-sm z-10 shrink-0 md:border-b md:border-gray-200"><button onClick={()=>changeMonth(-1)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full"><ChevronLeft className="w-5 h-5"/></button><h2 className="text-base font-bold text-gray-800">{year}年 {month+1}月</h2><button onClick={()=>changeMonth(1)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full"><ChevronRight className="w-5 h-5"/></button></div>
    <div className="flex-1 overflow-y-auto bg-white"><div className="md:grid md:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)] md:items-start md:gap-3 md:p-3">
      <div className="min-w-0 md:border md:border-gray-200 md:rounded-xl md:overflow-hidden"><div className="grid grid-cols-7 border-b border-gray-200 sticky top-0 bg-white z-10 shadow-sm">{DAYS_OF_WEEK.map((d,i)=><div key={d} className={`py-2 text-center text-[10px] font-bold ${i===0?'text-red-500':i===6?'text-blue-500':'text-gray-500'}`}>{d}</div>)}</div><div className="grid grid-cols-7 border-l border-gray-100">{days}</div></div>
      <div className="min-w-0 md:space-y-3">
        <div className="border-t border-gray-200 bg-blue-50/40 px-3 py-2"><div className="flex items-center justify-between mb-1.5"><h3 className="text-[11px] font-bold text-gray-600">パートナータスク</h3><span className="text-[9px] text-gray-400">{activePartnerItems.length}件</span></div>{activePartnerItems.length===0?<p className="text-[10px] text-gray-400 py-1">登録されている未終了のパートナータスクはありません</p>:<div className="space-y-1.5">{activePartnerItems.map(item=><button type="button" key={item.id} onClick={()=>{setDetailPartner(item);setIsEditingPartner(false);}} className="w-full bg-white border border-blue-100 rounded-md px-2 py-1.5 flex items-center gap-2 min-w-0 text-left hover:border-blue-300 active:bg-blue-50">{item.date&&item.date<todayStr?<span className="shrink-0 text-[8px] font-bold text-red-500 whitespace-nowrap">未終了 {item.date.replace(/-/g,'/')}</span>:<span className="shrink-0 text-[8px] font-bold text-blue-600 whitespace-nowrap">{item.date?item.date.replace(/-/g,'/'):'日付なし'}</span>}<span className="shrink-0 text-[8px] text-gray-500">{item.time||'--:--'}</span><span className="shrink-0 max-w-24 text-[9px] font-bold text-purple-600 truncate">{item.partnerName||'パートナー未設定'}</span><span className="min-w-0 flex-1 text-[10px] text-gray-700 truncate">{(item.content||'').split(/\r?\n/)[0]}</span></button>)}</div>}</div>
        <div className="border-t border-gray-200 bg-gray-50 px-3 py-2"><div className="flex items-center justify-between mb-1.5"><h3 className="text-[11px] font-bold text-gray-600">本日のタスク（全員）</h3><span className="text-[9px] text-gray-400">{selectedCalendarTaskDate.replace(/-/g,'/')}・{selectedTasks.length}件</span></div>{selectedTasks.length===0?<p className="text-[10px] text-gray-400 py-1">本日までに終了していないタスクはありません</p>:<div className="space-y-1.5">{selectedTasks.map(task=><button type="button" key={`${task.taskDate}-${task.ownerUid}-${task.id}`} onClick={()=>{setDetailTask(task);setSelectedAssigneeIds(task.assigneeIds);setAssigneeUpdateMessage('');setIsEditingTask(false);}} className="w-full text-left bg-white border rounded-md px-2 py-1.5 flex items-center gap-2 min-w-0 hover:border-purple-300 active:bg-purple-50">{task.taskDate<todayStr&&<span className="shrink-0 text-[8px] font-bold text-red-500 whitespace-nowrap">対象日 {task.taskDate.replace(/-/g,'/')}</span>}<span className="min-w-0 flex-1 text-[10px] truncate text-gray-700">{task.text||'📷 画像タスク'}</span><span className="shrink-0 max-w-32 text-[8px] text-purple-600 truncate">担当: {task.assigneeIds.map(id=>sortedUsers.find(u=>u.id===id)?.name?.split(' ')[0]||'').filter(Boolean).join('・')}</span><span className="shrink-0 text-[8px] text-gray-400">開始 {task.createdAt?new Date(task.createdAt).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'}):'--:--'}</span></button>)}</div>}</div>
      </div>
    </div>
    {detailPartner&&<div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={()=>setDetailPartner(null)}><div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden" onClick={e=>e.stopPropagation()}><div className="px-4 py-3 border-b flex items-center justify-between"><div><div className="text-sm font-bold text-gray-800">パートナータスク詳細</div><div className="text-[10px] text-gray-400">{detailPartner.date?.replace(/-/g,'/')} {detailPartner.time||'--:--'}</div></div><button onClick={()=>setDetailPartner(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-full"><X size={18}/></button></div><div className="p-4 space-y-3">{isEditingPartner?<><select value={partnerEditName} onChange={e=>setPartnerEditName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">パートナーを選択</option>{(partnerNames||[]).map(n=><option key={n} value={n}>{n}</option>)}</select><div className="grid grid-cols-2 gap-2"><input type="date" value={partnerEditDate} onChange={e=>setPartnerEditDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm"/><div className="flex gap-1"><select value={partnerEditHour} onChange={e=>setPartnerEditHour(e.target.value)} className="w-1/2 border rounded-lg px-1 py-2 text-sm"><option value="">時</option>{Array.from({length:24},(_,i)=>String(i).padStart(2,'0')).map(v=><option key={v} value={v}>{v}</option>)}</select><select value={partnerEditMinute} onChange={e=>setPartnerEditMinute(e.target.value)} className="w-1/2 border rounded-lg px-1 py-2 text-sm"><option value="">分</option>{['00','15','30','45'].map(v=><option key={v} value={v}>{v}</option>)}</select></div></div><textarea value={partnerEditContent} onChange={e=>setPartnerEditContent(e.target.value)} rows={5} className="w-full border rounded-lg px-3 py-2 text-sm resize-y"/><div className="flex gap-2"><button type="button" onClick={()=>setIsEditingPartner(false)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold">キャンセル</button><button type="button" disabled={isSaving} onClick={savePartnerEdit} className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold"><span>{isSaving?'保存中…':'変更を保存'}</span></button></div></>:<><div className="text-xs font-bold text-purple-600">{detailPartner.partnerName||'パートナー未設定'}</div><div className="text-sm text-gray-700 whitespace-pre-wrap break-words">{detailPartner.content||''}</div>{detailPartner.imageUrl&&<img src={detailPartner.imageUrl} alt={detailPartner.imageName||'添付画像'} className="max-h-72 w-auto max-w-full rounded-lg border object-contain mx-auto"/>}<button type="button" onClick={startPartnerEdit} className="w-full py-2.5 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold flex items-center justify-center gap-1.5"><Edit2 size={14}/><span>編集</span></button></>}</div></div></div>}
    {detailTask&&<div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={()=>setDetailTask(null)}><div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden" onClick={e=>e.stopPropagation()}><div className="px-4 py-3 border-b flex items-center justify-between"><div><div className="text-sm font-bold text-gray-800">タスク詳細</div><div className="text-[10px] text-gray-400">登録者: {detailTask.member.name}</div>{!canEditTask&&<div className="text-[9px] text-gray-400">他のメンバーのタスクは操作できません</div>}</div><button onClick={()=>setDetailTask(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-full"><X size={18}/></button></div><div className="p-4 space-y-3">{isEditingTask?<><textarea value={editingTaskText} onChange={e=>setEditingTaskText(e.target.value)} rows={5} className="w-full border rounded-xl px-3 py-2.5 text-sm resize-y"/><div className="flex gap-2"><button type="button" onClick={()=>setIsEditingTask(false)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold">キャンセル</button><button type="button" disabled={isSaving} onClick={saveTaskEdit} className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold"><span>{isSaving?'保存中…':'変更を保存'}</span></button></div></>:<><div className="text-sm text-gray-700 whitespace-pre-wrap break-words">{detailTask.text||'📷 画像タスク'}</div>{detailTask.imageUrl&&<img src={detailTask.imageUrl} alt={detailTask.imageName||'添付画像'} className="max-h-64 w-auto max-w-full rounded-lg border object-contain mx-auto"/>}<div className="grid grid-cols-2 gap-2 text-[10px] text-gray-500"><div className="bg-gray-50 rounded-lg p-2">開始<br/><span className="font-bold text-gray-700">{detailTask.createdAt?new Date(detailTask.createdAt).toLocaleString('ja-JP'):'--'}</span></div><div className="bg-gray-50 rounded-lg p-2">終了<br/><span className="font-bold text-gray-700">{detailTask.completedAt?new Date(detailTask.completedAt).toLocaleString('ja-JP'):'--'}</span></div></div><div><div className="text-xs font-bold text-gray-600 mb-2">担当者（複数選択可）</div><div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">{(sortedUsers||[]).map(member=>{const checked=selectedAssigneeIds.includes(member.id);return <label key={member.id} className={`flex items-center gap-2 p-2 rounded-lg border ${canEditTask?'cursor-pointer':'cursor-not-allowed opacity-70'} ${checked?'border-purple-400 bg-purple-50':'border-gray-200'}`}><input type="checkbox" disabled={!canEditTask} checked={checked} onChange={()=>setSelectedAssigneeIds(p=>checked?p.filter(id=>id!==member.id):[...p,member.id])}/><span className="text-xs font-bold text-gray-700 truncate">{member.name.split(' ')[0]}</span></label>})}</div></div>{canEditTask&&<><button type="button" disabled={!selectedAssigneeIds.length||isUpdatingAssignees} onClick={async()=>{setIsUpdatingAssignees(true);setAssigneeUpdateMessage('');try{await updateTaskAssignees(detailTask.ownerUid,detailTask.taskDate,detailTask.id,selectedAssigneeIds);setDetailTask(p=>p?{...p,assigneeIds:[...selectedAssigneeIds]}:p);setAssigneeUpdateMessage('担当者を更新しました');}catch(e){setAssigneeUpdateMessage('担当者の更新に失敗しました。')}finally{setIsUpdatingAssignees(false);}}} className="w-full py-2.5 rounded-xl bg-purple-600 text-white text-xs font-bold disabled:opacity-40"><span>{isUpdatingAssignees?'更新中…':'担当者を更新'}</span></button><div className="flex gap-2"><button type="button" onClick={()=>{setEditingTaskText(detailTask.text||'');setIsEditingTask(true);}} className="flex-1 py-2 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold"><span>編集</span></button><button type="button" onClick={finishTask} className="flex-1 py-2 rounded-xl bg-green-50 text-green-700 text-xs font-bold"><span>終了にする</span></button><button type="button" onClick={removeTask} className="p-2 rounded-xl bg-red-50 text-red-600"><Trash2 size={16}/></button></div></>}{assigneeUpdateMessage&&<div className="text-[10px] text-green-600 font-bold">{assigneeUpdateMessage}</div>}</>}</div></div></div>}
    </div>
  </div>;
};

const TeamShiftView = ({ currentDate, changeMonth, teamData, shiftTypes, updateUserShift, sortedUsers, roleNames, roles, bulkImportShifts, updateShiftTypes, currentUser, shiftLogs }) => {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  
  const [editingCell, setEditingCell] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState('');
  const isAdmin = checkIsAdmin(currentUser, roles);
  const monthKey = `${year}_${String(month + 1).padStart(2, '0')}`;
  const monthLogs = Array.isArray(shiftLogs?.[monthKey])
    ? [...shiftLogs[monthKey]].sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))
    : [];

  const days = [];
  for(let i=1; i<=daysInMonth; i++) {
     const d = new Date(year, month, i);
     days.push({ day: i, dateStr: formatDate(d), weekDay: DAYS_OF_WEEK[d.getDay()] });
  }

  const handleImportExecute = () => {
    if (!isAdmin) {
      alert('シフトの一括取り込みは管理者のみ実行できます。');
      return;
    }
    if (!importText.trim()) return;

    const rawLines = importText.replace(/\r\n?/g, '\n').split('\n');
    const newShifts = { ...teamData.shifts };
    let newShiftTypes = [...shiftTypes];
    const importedUsers = [];
    const errors = [];
    const importedUserIds = new Set();

    // 名前比較用。全角/半角スペース、改行などをすべて無視する。
    const normalizeName = (value) =>
      String(value ?? '').replace(/[\s\u3000]+/g, '').trim();

    const cleanCell = (value) =>
      String(value ?? '')
        .replace(/<br\s*\/?>/gi, '')
        .replace(/`/g, '')
        .trim();

    const normalizeSymbol = (value) => cleanCell(value);

    const findUserByCell = (cell) => {
      const target = normalizeName(cell);
      if (!target) return null;
      return sortedUsers.filter(u => u.shiftEligible !== false).find(u => normalizeName(u.name) === target) || null;
    };

    // Markdown表、タブ区切り、通常の空白区切りを同じ形式にする。
    const parseLine = (line) => {
      const text = line.trim();
      if (!text) return null;

      if (text.includes('|')) {
        let cells = text.split('|').map(cleanCell);
        if (cells.length && cells[0] === '') cells.shift();
        if (cells.length && cells[cells.length - 1] === '') cells.pop();
        return cells;
      }

      if (text.includes('\t')) {
        return text.split('\t').map(cleanCell);
      }

      // 最後の保険：登録済みメンバー名を先頭部分から探し、残りをシフト列として扱う。
      const candidates = sortedUsers
        .slice()
        .sort((a, b) => normalizeName(b.name).length - normalizeName(a.name).length);
      for (const user of candidates) {
        const name = String(user.name || '').trim();
        if (!name) continue;
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[\\s\\u3000]+/g, '[\\s\\u3000]*');
        const match = text.match(new RegExp('^\\s*' + escaped + '(?:\\s+|$)', 'i'));
        if (match) {
          const rest = text.slice(match[0].length).trim();
          return [name, ...rest.split(/[\s\u3000]+/).filter(Boolean)];
        }
      }
      return null;
    };

    const isShiftToken = (value) => {
      const sym = normalizeSymbol(value);
      return ['A', '／', '/', '夏休', '有', '有休', '有給', '冬休', '講習', '出勤', '休み', '有給', '冬休', '講習'].includes(sym);
    };

    const findOrCreateShiftId = (symbol) => {
      const sym = normalizeSymbol(symbol);
      if (!sym) return 'none';

      let targetLabel = sym;
      if (sym === 'A') targetLabel = '出勤';
      else if (sym === '／' || sym === '/') targetLabel = '休み';
      else if (sym === '夏休') targetLabel = '夏休';
      else if (sym === '有' || sym === '有休' || sym === '有給') targetLabel = '有給';
      else if (sym === '冬休') targetLabel = '冬休';
      else if (sym === '講習') targetLabel = '講習';

      let matched = newShiftTypes.find(s => s.label === targetLabel);
      if (!matched && targetLabel === '出勤') {
        matched = newShiftTypes.find(s => s.id === 'work' || s.id === 'early' || s.label === '早番');
      }
      if (matched) return matched.id;

      const newId = `shift_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const colors = [
        'bg-green-100 text-green-700 border-green-200',
        'bg-teal-100 text-teal-700 border-teal-200',
        'bg-pink-100 text-pink-700 border-pink-200',
        'bg-amber-100 text-amber-700 border-amber-200',
        'bg-purple-100 text-purple-700 border-purple-200'
      ];
      const noneShift = newShiftTypes.find(s => s.id === 'none') || {
        id: 'none', label: '未定', color: 'bg-gray-100 text-gray-500 border-gray-200'
      };
      const filtered = newShiftTypes.filter(s => s.id !== 'none');
      newShiftTypes = [
        ...filtered,
        { id: newId, label: targetLabel, color: colors[filtered.length % colors.length] },
        noneShift
      ];
      return newId;
    };

    rawLines.forEach((rawLine, lineIndex) => {
      const cells = parseLine(rawLine);
      if (!cells || cells.length === 0) return;

      // 日付見出し・曜日行・Markdown区切り行などはメンバー名がないので無視。
      const userIndex = cells.findIndex(cell => !!findUserByCell(cell));
      if (userIndex < 0) return;

      const matchedUser = findUserByCell(cells[userIndex]);

      // コピー元によっては、名前の直後に空列や補助列が入ることがある。
      // 最初の「実際のシフト記号」を1日目として、そこから月末までを取得する。
      // A / 有 / 夏休 / 冬休 / 講習など、シフトとして認識できる値だけを起点にする。
      const afterName = cells.slice(userIndex + 1).map(cleanCell);
      const firstShiftIndex = afterName.findIndex(isShiftToken);
      if (firstShiftIndex < 0) {
        errors.push(`${lineIndex + 1}行目 ${matchedUser.name}: シフト開始位置を見つけられません`);
        return;
      }
      const shiftValues = afterName.slice(firstShiftIndex);

      if (importedUserIds.has(matchedUser.id)) {
        errors.push(`${lineIndex + 1}行目 ${matchedUser.name}: 同じメンバーが複数行あります`);
        return;
      }

      if (shiftValues.length < daysInMonth) {
        errors.push(`${lineIndex + 1}行目 ${matchedUser.name}: シフトが${shiftValues.length}個しかありません（${daysInMonth}個必要）`);
        return;
      }

      importedUserIds.add(matchedUser.id);
      importedUsers.push(matchedUser);

      for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
        const val = shiftValues[dayNum - 1];
        const dateStr = formatDate(new Date(year, month, dayNum));
        const shiftId = findOrCreateShiftId(val);
        if (!newShifts[dateStr]) newShifts[dateStr] = {};
        newShifts[dateStr][matchedUser.id] = shiftId;
      }
    });

    if (errors.length > 0) {
      alert(`一括取り込みを中止しました。\n\n${errors.join('\n')}`);
      return;
    }

    if (importedUsers.length === 0) {
      alert('取り込めるメンバー行が見つかりませんでした。\n名前と1日〜31日のシフトが入った表をそのまま貼り付けてください。');
      return;
    }

    // 現在の親コンポーネントの保存APIをそのまま使い、
    // シフト種類とシフト本体を保存する。
    let changedCount = 0;
    importedUsers.forEach(user => {
      for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
        const dateStr = formatDate(new Date(year, month, dayNum));
        const oldShiftId = teamData.shifts[dateStr]?.[user.id] || 'none';
        const newShiftId = newShifts[dateStr]?.[user.id] || 'none';
        if (oldShiftId !== newShiftId) changedCount += 1;
      }
    });
    updateShiftTypes(newShiftTypes);
    bulkImportShifts(newShifts, changedCount);
    setShowImportModal(false);
    setImportText('');
    alert(`${importedUsers.length}人 × ${daysInMonth}日分のシフトを取り込みました。\n\n${importedUsers.map(u => u.name).join('、')}`);
  };

  return (
    <div className="flex-1 flex flex-col bg-gray-50 pb-[68px] overflow-hidden relative">
      <div className="bg-white px-4 py-3 flex items-center justify-between sticky top-0 z-20 border-b border-gray-100 shadow-sm">
        <button onClick={() => changeMonth(-1)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors active:scale-95"><ChevronLeft className="w-5 h-5"/></button>
        
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-purple-700 flex items-center">
            <Table className="w-5 h-5 mr-1.5"/>
            シフト管理 ({year}年{month + 1}月)
          </h2>
          {isAdmin && (
            <button 
              onClick={() => setShowImportModal(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 active:scale-95 transition-all shadow-sm shrink-0"
            >
              <FileSpreadsheet size={16}/>
              一括取り込み
            </button>
          )}
        </div>

        <button onClick={() => changeMonth(1)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors active:scale-95"><ChevronRight className="w-5 h-5"/></button>
      </div>
      
      <div className="flex-1 overflow-auto bg-white relative">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-gray-50 shadow-sm">
            <tr>
              <th className="sticky left-0 bg-gray-50 z-20 min-w-[100px] p-2 border-r border-b border-gray-200 text-left font-bold text-gray-600 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                メンバー
              </th>
              {days.map(d => (
                <th key={d.day} className={`min-w-[48px] p-1.5 border-r border-b border-gray-200 text-center font-medium ${d.weekDay === '日' ? 'text-red-500' : d.weekDay === '土' ? 'text-blue-500' : 'text-gray-500'}`}>
                  {d.day}<br/>
                  <span className="text-[10px]">{d.weekDay}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedUsers.filter(u => u.shiftEligible !== false).map(u => {
              return (
                <tr key={u.id}>
                  <td className="sticky left-0 bg-white z-10 p-2 border-r border-b border-gray-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                    <div className="font-bold text-gray-800 truncate">{u.name.split(' ')[0]}</div>
                  </td>
                  {days.map(d => {
                     const shiftId = teamData.shifts[d.dateStr]?.[u.id] || 'none';
                     const shift = shiftTypes.find(s => s.id === shiftId) || shiftTypes.find(s => s.id === 'none');
                     return (
                       <td 
                         key={d.day} 
                         onClick={() => setEditingCell({ dateStr: d.dateStr, uid: u.id, userName: u.name })}
                         className="p-1 border-r border-b border-gray-100 text-center cursor-pointer active:bg-gray-100 transition-colors"
                       >
                         <div className={`w-full h-8 flex items-center justify-center rounded-md font-bold text-[10px] ${shiftId !== 'none' ? shift.color : 'text-gray-300'}`}>
                           {shift.label.substring(0, 2)}
                         </div>
                       </td>
                     );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-white border-t border-gray-200 px-4 py-3 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-700">シフト変更ログ（{month + 1}月分）</h3>
          <span className="text-[10px] text-gray-400">{monthLogs.length}件</span>
        </div>
        {monthLogs.length === 0 ? (
          <p className="text-[10px] text-gray-400 py-2">この月のシフト変更ログはありません。</p>
        ) : (
          <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
            {monthLogs.map((log, index) => {
              const timestamp = log.timestamp ? new Date(log.timestamp) : null;
              const timeText = timestamp && !Number.isNaN(timestamp.getTime())
                ? timestamp.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : '--/-- --:--';
              return (
                <div key={log.id || `${log.timestamp}-${index}`} className="text-[10px] text-gray-600 bg-gray-50 rounded-lg px-2.5 py-2 border border-gray-100">
                  <span className="font-bold text-gray-500">{timeText}</span>
                  <span className="mx-1"> </span>
                  <span className="font-bold text-gray-800">{log.actorName || '不明なユーザー'}</span>
                  {log.type === 'bulk' ? (
                    <span>が{log.monthLabel || `${month + 1}月`}分のシフトを一括取り込み（{log.changedCount || 0}件変更）</span>
                  ) : (
                    <span>が{log.targetDate ? log.targetDate.replace(/-/g, '/') : '--'}の{log.targetName || '不明なメンバー'}のシフトを{log.oldLabel || '未定'}→{log.newLabel || '未定'}に変更</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {editingCell && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-[1px] p-0 md:p-4">
          <div className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-2xl p-5 shadow-2xl transition-transform animate-in slide-in-from-bottom duration-200">
            <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-3">
              <div>
                <h3 className="font-bold text-gray-800 text-sm">{editingCell.userName} のシフト</h3>
                <p className="text-xs text-gray-500 mt-1">{editingCell.dateStr.replace(/-/g, '/')} の予定を変更</p>
              </div>
              <button onClick={() => setEditingCell(null)} className="p-2 bg-gray-100 rounded-full text-gray-500 active:scale-95"><X size={18}/></button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {shiftTypes.map(s => (
                <button
                  key={s.id}
                  onClick={() => {
                    updateUserShift(editingCell.dateStr, editingCell.uid, s.id);
                    setEditingCell(null);
                  }}
                  className={`py-3 rounded-xl border text-xs font-bold active:scale-95 transition-transform ${s.color}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-gray-800 text-base flex items-center gap-2">
                <FileSpreadsheet className="text-purple-600"/>
                シフトデータ一括貼り付け ({year}年{month + 1}月分)
              </h3>
              <button onClick={() => setShowImportModal(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-full"><X size={20}/></button>
            </div>

            <p className="text-xs text-gray-500">
              Excelやスプレッドシートから、名前と1日〜31日のシフト記号をそのままコピーして下に貼り付けてください。
            </p>

            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={`竹添 三剛\tA\t／\tA\tA...\n高橋 信次\tA\t／\t／\tA...`}
              className="w-full h-48 border border-gray-300 rounded-xl p-3 text-xs font-mono focus:ring-2 focus:ring-purple-500 outline-none resize-none bg-gray-50"
            />

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowImportModal(false)} className="px-4 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl">キャンセル</button>
              <button 
                onClick={handleImportExecute}
                disabled={!importText.trim()}
                className="px-5 py-2 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-xl shadow-md disabled:opacity-50 active:scale-95 transition-all"
              >
                一括取り込みを実行
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const DailyDetailView = ({ 
  selectedDate, changeDay, teamData, currentUserUid, shiftTypes,
  addTask, toggleTask, deleteTask, updateTaskText, updateTaskAssignees, users, roles, sortedUsers
}) => {
  const [newTaskText, setNewTaskText] = useState('');
  const [selectedUserUid, setSelectedUserUid] = useState(currentUserUid);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [newTaskImage, setNewTaskImage] = useState(null);
  const [newTaskImagePreview, setNewTaskImagePreview] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const imageInputRef = React.useRef(null);
  
  const currentUser = users[currentUserUid];
  const viewUser = users[selectedUserUid] || currentUser;
  const canManageShift = checkCanManageShift(currentUser, roles);
  const isAdmin = !!currentUser && !!roles[currentUser.role] && (roles[currentUser.role].level || 0) >= 40;
  const selectedDateTasks = Object.entries(teamData.tasks[selectedDate] || {}).flatMap(([ownerUid, tasks]) => (tasks || []).filter(task => { const assignees = Array.isArray(task.assigneeIds) && task.assigneeIds.length ? task.assigneeIds : [ownerUid]; return assignees.includes(selectedUserUid); }).map(task => ({ ...task, ownerUid, taskDate: selectedDate })));
  const unfinishedPastTasks = Object.keys(teamData.tasks || {})
    .filter(dateStr => dateStr < selectedDate)
    .sort((a, b) => b.localeCompare(a))
    .flatMap(dateStr =>
      Object.entries(teamData.tasks[dateStr] || {})
        .filter(([ownerUid]) => ownerUid === selectedUserUid)
        .flatMap(([ownerUid, tasks]) => (tasks || [])
          .filter(task => !task.completed)
          .map(task => ({ ...task, ownerUid, taskDate: dateStr })))
    );
  const selectedDateShifts = teamData.shifts[selectedDate] || {};
  const myCurrentShift = selectedDateShifts[currentUserUid] || 'none';

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('画像ファイルを選択してください。');
      e.target.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('画像は10MB以下にしてください。');
      e.target.value = '';
      return;
    }
    setNewTaskImage(file);
    setNewTaskImagePreview(URL.createObjectURL(file));
  };

  const clearNewTaskImage = () => {
    if (newTaskImagePreview) URL.revokeObjectURL(newTaskImagePreview);
    setNewTaskImage(null);
    setNewTaskImagePreview('');
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleAddTask = async () => {
    if (!newTaskText.trim() && !newTaskImage) return;
    setIsUploading(true);
    try {
      let imageUrl = '';
      let imageName = '';
      let imagePublicId = '';
      let imageBytes = 0;
      if (newTaskImage) {
        const result = await uploadTaskImageToCloudinary(newTaskImage);
        imageUrl = result.secure_url || result.url || '';
        imageName = newTaskImage.name;
        imagePublicId = result.public_id || '';
        imageBytes = Number(result.bytes || newTaskImage.size || 0);
      }
      addTask(selectedDate, selectedUserUid, newTaskText.trim(), imageUrl, imageName, imagePublicId, imageBytes);
      setNewTaskText('');
      clearNewTaskImage();
    } catch (error) {
      console.error('画像のアップロードに失敗しました:', error);
      alert(`画像の保存に失敗しました。\n${error?.message || 'Cloudinaryへのアップロードに失敗しました。'}`);
    } finally {
      setIsUploading(false);
    }
  };

  const TaskItem = ({ task }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editVal, setEditVal] = useState(task.text || '');
    const [selectedAssigneeIds, setSelectedAssigneeIds] = useState(
      Array.isArray(task.assigneeIds) && task.assigneeIds.length ? task.assigneeIds : [task.ownerUid || selectedUserUid]
    );
    const [isUpdatingAssignees, setIsUpdatingAssignees] = useState(false);
    const [assigneeUpdateMessage, setAssigneeUpdateMessage] = useState('');
    const isSelected = selectedTaskId === task.id;
    const canEditTask = isAdmin || task.ownerUid === currentUserUid;

    const handleAssigneeChange = (uid) => {
      setSelectedAssigneeIds(prev =>
        prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
      );
      setAssigneeUpdateMessage('');
    };

    const handleSaveAssignees = async () => {
      if (!selectedAssigneeIds.length) {
        alert('担当者を1名以上選択してください。');
        return;
      }
      setIsUpdatingAssignees(true);
      setAssigneeUpdateMessage('');
      try {
        await updateTaskAssignees(
          task.ownerUid || selectedUserUid,
          task.taskDate || selectedDate,
          task.id,
          selectedAssigneeIds
        );
        setAssigneeUpdateMessage('担当者を更新しました');
      } catch (error) {
        console.error('担当者更新エラー:', error);
        setAssigneeUpdateMessage('担当者の更新に失敗しました。');
      } finally {
        setIsUpdatingAssignees(false);
      }
    };

    if (isEditing) {
      return (
        <div className="bg-white p-3 rounded-xl border border-blue-400 shadow-sm space-y-2">
          <div className="flex gap-2 items-start">
            <textarea
              className="flex-1 bg-blue-50/50 p-2 text-sm rounded outline-none resize-none"
              value={editVal}
              onChange={(e) => setEditVal(e.target.value)}
              rows={4}
              autoFocus
            />
            <button
              onClick={() => {
                updateTaskText(task.taskDate || selectedDate, task.ownerUid || selectedUserUid, task.id, editVal);
                setIsEditing(false);
              }}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg h-fit"
              title="保存"
            >
              <Save size={18}/>
            </button>
          </div>
          <p className="text-[10px] text-gray-400">Enterで改行できます。保存は右のボタンを押してください。</p>
        </div>
      );
    }

    return (
      <div
        onClick={() => setSelectedTaskId(isSelected ? null : task.id)}
        className={`bg-white p-3 rounded-xl border transition-all cursor-pointer ${
          isSelected
            ? 'border-purple-400 bg-purple-50/20 ring-2 ring-purple-400/20 shadow-md'
            : task.completed ? 'border-gray-100 bg-gray-50/50' : 'border-gray-200 shadow-sm hover:border-gray-300'
        } flex items-start gap-3`}
      >
        <input
          type="checkbox"
          checked={!!task.completed}
          disabled={!canEditTask}
          aria-label={task.completed ? 'タスクを未完了に戻す' : 'タスクを完了にする'}
          onClick={(e) => e.stopPropagation()}
          onChange={async (e) => {
            e.stopPropagation();
            const taskDate = task.taskDate || selectedDate;
            const ownerUid = task.ownerUid || selectedUserUid;
            try {
              await toggleTask(taskDate, ownerUid, task.id);
            } catch (error) {
              console.error('タスクチェック処理に失敗しました:', error);
            }
          }}
          className={`appearance-none relative z-20 shrink-0 mt-0.5 w-7 h-7 rounded-full border-2 flex items-center justify-center cursor-pointer pointer-events-auto touch-manipulation checked:bg-green-500 checked:border-green-500 disabled:cursor-not-allowed disabled:opacity-50 ${
            task.completed ? 'bg-green-500 border-green-500' : 'bg-white border-gray-300 hover:border-blue-400'
          }`}
        />

        <div className="flex-1 min-w-0">
          {task.text && (
            <span className={`text-sm block whitespace-pre-wrap leading-tight ${
              task.completed ? 'text-gray-400 line-through' : 'text-gray-700'
            } ${isSelected ? '' : 'overflow-hidden max-h-[2.8em] line-clamp-2'}`}>
              {task.text}
            </span>
          )}
          <div className="mt-1 text-[9px] text-purple-600">担当: {selectedAssigneeIds.map(id => users[id]?.name?.split(' ')[0] || '').filter(Boolean).join('・') || '未設定'}</div>

          {isSelected && (
            <div className="mt-3 pt-3 border-t border-purple-100" onClick={(e) => e.stopPropagation()}>
              <div className="text-[10px] font-bold text-gray-600 mb-2">担当者（複数選択可）</div>
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                {(sortedUsers || []).map(member => {
                  const checked = selectedAssigneeIds.includes(member.id);
                  return (
                    <label
                      key={member.id}
                      className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer ${checked ? 'border-purple-400 bg-purple-50' : 'border-gray-200 bg-white'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleAssigneeChange(member.id)}
                        className="shrink-0"
                      />
                      <span className="text-xs font-bold text-gray-700 truncate">{member.name.split(' ')[0]}</span>
                    </label>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={handleSaveAssignees}
                  disabled={!selectedAssigneeIds.length || isUpdatingAssignees}
                  className="flex-1 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 active:scale-[0.98] text-white text-xs font-bold disabled:opacity-40 flex items-center justify-center gap-1.5 transition-all"
                >
                  {isUpdatingAssignees ? <Loader2 size={14} className="animate-spin"/> : <Save size={14}/>}
                  {isUpdatingAssignees ? '更新中…' : '担当者を更新'}
                </button>
              </div>
              {assigneeUpdateMessage && (
                <p className="text-[9px] text-green-600 font-bold mt-1.5">{assigneeUpdateMessage}</p>
              )}
              <p className="text-[9px] text-gray-400 mt-1">1名なら担当変更、2名以上なら共同作業です。</p>
            </div>
          )}
          {task.imageUrl && (
            <img
              src={task.imageUrl}
              alt={task.imageName || '添付画像'}
              className="mt-2 max-h-56 w-auto max-w-full rounded-lg border border-gray-200 object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>

        <div className="shrink-0 flex gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setIsEditing(true)}
            className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-gray-100 rounded-lg active:scale-95"
            title="編集"
          >
            <Edit2 size={16}/>
          </button>
          <button
            onClick={() => deleteTask(task.taskDate || selectedDate, task.ownerUid || selectedUserUid, task.id)}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg active:scale-95"
            title="削除"
          >
            <Trash2 size={16}/>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col bg-gray-50 pb-[68px] h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto flex flex-col relative">
        <div className="bg-white px-4 py-2 flex items-center justify-between border-b border-gray-100 shrink-0 sticky top-0 z-20 shadow-sm">
          <button onClick={() => changeDay(-1)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full active:scale-95"><ChevronLeft className="w-5 h-5"/></button>
          <h2 className="text-sm font-bold text-gray-800">{selectedDate.replace(/-/g, '/')}</h2>
          <button onClick={() => changeDay(1)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full active:scale-95"><ChevronRight className="w-5 h-5"/></button>
        </div>

        <div className="bg-white p-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500">あなたの今日のシフト:</span>
            {shiftTypes.map(shift => myCurrentShift === shift.id && (
              <div key={shift.id} className={`px-3 py-1 rounded-md border text-xs font-bold ${shift.color}`}>{shift.label}</div>
            ))}
            {myCurrentShift === 'none' && <span className="text-xs text-gray-400">未定</span>}
          </div>
          {!canManageShift && <p className="text-[10px] text-gray-400 mt-1">※シフトの編集は管理者および権限を付与されたメンバーのみ可能です</p>}
        </div>

        <div className="bg-white px-3 py-2 border-b border-gray-200 flex overflow-x-auto gap-2 no-scrollbar shadow-sm shrink-0 items-center min-h-[56px] sticky top-[53px] z-10">
          <div className="flex items-center gap-2 pr-4">
            {sortedUsers.map(member => {
              const isSelected = selectedUserUid === member.id;
              const shiftId = selectedDateShifts[member.id] || 'none';
              const shiftObj = shiftTypes.find(s => s.id === shiftId) || shiftTypes.find(s => s.id === 'none');
              return (
                <button
                  key={member.id}
                  onClick={() => { setSelectedUserUid(member.id); setSelectedTaskId(null); }}
                  className={`flex flex-col items-center px-3 py-1.5 rounded-xl border transition-all shrink-0 active:scale-95 ${isSelected ? 'bg-purple-50 border-purple-400 ring-2 ring-purple-400/20 shadow-sm' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                >
                  <div className={`text-xs font-bold ${isSelected ? 'text-purple-700' : 'text-gray-700'}`}>{member.name.split(' ')[0]}</div>
                  <div className={`text-[9px] mt-0.5 px-1.5 rounded-sm ${shiftObj.id !== 'none' ? shiftObj.color : 'text-gray-400'}`}>{shiftObj.label.substring(0, 2)}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* スマホで使いやすいよう、タスク入力欄を一覧の上へ移動 */}
        <div className="bg-white border-b border-gray-200 p-3 shrink-0 shadow-sm">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-2 items-end">
              <textarea
                value={newTaskText}
                onChange={(e) => setNewTaskText(e.target.value)}
                placeholder={`${viewUser.name.split(' ')[0]}さんのタスクを入力`}
                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-shadow resize-y"
                rows={2}
                style={{ minHeight: '52px', maxHeight: '160px' }}
                disabled={isUploading}
              />
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={isUploading}
                className="shrink-0 p-3 text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl active:scale-95 disabled:opacity-50"
                title="画像を添付"
              >
                <ImageIcon size={21}/>
              </button>
              <button
                onClick={handleAddTask}
                disabled={isUploading || (!newTaskText.trim() && !newTaskImage)}
                className="shrink-0 bg-blue-600 text-white px-4 py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:bg-gray-400 transition-colors shadow-sm active:scale-95 font-bold text-sm flex items-center gap-1.5"
              >
                {isUploading ? <Loader2 size={18} className="animate-spin"/> : <Save size={18}/>} 保存
              </button>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleImageChange}
                className="hidden"
              />
            </div>

            {newTaskImagePreview && (
              <div className="mt-2 flex items-start gap-2">
                <div className="relative">
                  <img src={newTaskImagePreview} alt="添付画像プレビュー" className="h-20 w-20 rounded-lg object-cover border border-gray-200"/>
                  <button type="button" onClick={clearNewTaskImage} className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gray-800 text-white flex items-center justify-center shadow" title="画像を外す">
                    <X size={14}/>
                  </button>
                </div>
                <div className="text-xs text-gray-500 pt-1 flex items-center gap-1"><Paperclip size={13}/>{newTaskImage?.name}</div>
              </div>
            )}
            <p className="text-[10px] text-gray-400 mt-1.5">Enterで改行。保存は「保存」ボタン。画像ボタンから写真・画像を添付できます。</p>
          </div>
        </div>

        {unfinishedPastTasks.length > 0 && (
          <div className="bg-red-50/50 border-b border-red-100 px-3 py-3 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[11px] font-bold text-red-600">過去の未終了タスク</h3>
              <span className="text-[9px] text-red-400">{unfinishedPastTasks.length}件</span>
            </div>
            <div className="space-y-2">
              {unfinishedPastTasks.map(task => (
                <div key={`${task.taskDate}-${task.ownerUid}-${task.id}`}>
                  <div className="text-[9px] font-bold text-red-500 mb-1">未終了 {task.taskDate.replace(/-/g, '/')}</div>
                  <TaskItem task={task} />
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-3 relative max-w-3xl mx-auto w-full">
          {selectedDateTasks.length === 0 ? (
            <div className="text-center py-10">
              <ClipboardList className="mx-auto text-gray-300 mb-3" size={48}/>
              <p className="text-gray-400 text-sm">タスクはありません</p>
            </div>
          ) : selectedDateTasks.map(task => <TaskItem key={task.id} task={task}/>) }
        </div>
      </div>
    </div>
  );
};

const SettingsView = ({ shiftTypes, updateShiftTypes, users, updateUsers, currentUserUid, roleNames, updateRoleNames, roles, updateRoles, deleteUserCompletely, sortedUsers, userOrder, updateUserOrder, debugLogs }) => {
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState(Object.keys(roles)[0] || 'staff');
  const [newUserShiftEligible, setNewUserShiftEligible] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingUserId, setEditingUserId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [editingEmail, setEditingEmail] = useState('');

  const [showAddRoleForm, setShowAddRoleForm] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleLevel, setNewRoleLevel] = useState(10);

  const [showAddShiftForm, setShowAddShiftForm] = useState(false);
  const [newShiftLabel, setNewShiftLabel] = useState('');
  const [newShiftColor, setNewShiftColor] = useState(COLOR_PRESETS[0]);

  const moveUserOrder = (index, direction) => {
    const newOrderedList = [...sortedUsers];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newOrderedList.length) return;

    const temp = newOrderedList[index];
    newOrderedList[index] = newOrderedList[targetIndex];
    newOrderedList[targetIndex] = temp;

    const newOrder = newOrderedList.map(u => u.id);
    updateUserOrder(newOrder);
  };

  const handleLabelChange = (id, newLabel) => {
    updateShiftTypes(shiftTypes.map(s => s.id === id ? { ...s, label: newLabel } : s));
  };

  const handleAddShift = () => {
    if (!newShiftLabel.trim()) return;
    const newShift = {
      id: `shift_${Date.now()}`,
      label: newShiftLabel.trim(),
      color: newShiftColor
    };
    const noneShift = shiftTypes.find(s => s.id === 'none') || { id: 'none', label: '未定', color: 'bg-gray-100 text-gray-500 border-gray-200' };
    const filtered = shiftTypes.filter(s => s.id !== 'none');
    updateShiftTypes([...filtered, newShift, noneShift]);
    setNewShiftLabel('');
    setShowAddShiftForm(false);
  };

  const handleDeleteShift = (shiftId) => {
    if (shiftId === 'none') {
      alert('「未定」シフトは削除できません。');
      return;
    }
    if (window.confirm('このシフトを削除してもよろしいですか？')) {
      updateShiftTypes(shiftTypes.filter(s => s.id !== shiftId));
    }
  };
  
  const handleRoleNameChange = (roleKey, newName) => {
    updateRoleNames({
      ...roleNames,
      [roleKey]: newName
    });
  };

  const handleAddRole = () => {
    if (!newRoleName.trim()) return;
    const roleKey = `role_${Date.now()}`;
    updateRoles({
      ...roles,
      [roleKey]: { level: Number(newRoleLevel), name: newRoleName.trim() }
    });
    updateRoleNames({
      ...roleNames,
      [roleKey]: newRoleName.trim()
    });
    setNewRoleName('');
    setNewRoleLevel(10);
    setShowAddRoleForm(false);
  };

  const handleDeleteRole = (roleKey) => {
    const isRoleUsed = Object.values(users).some(u => u.role === roleKey);
    if (isRoleUsed) {
      alert('この役職が割り当てられているメンバーがいるため削除できません。先にメンバーの役職を変更してください。');
      return;
    }

    if (window.confirm('この役職を削除してもよろしいですか？')) {
      const nextRoles = { ...roles };
      delete nextRoles[roleKey];
      updateRoles(nextRoles);

      const nextRoleNames = { ...roleNames };
      delete nextRoleNames[roleKey];
      updateRoleNames(nextRoleNames);
    }
  };

  const handleRoleChange = (uid, newRole) => {
    updateUsers({
      ...users,
      [uid]: { ...users[uid], role: newRole }
    });
  };

  const handleToggleShiftAuth = (uid) => {
    updateUsers({
      ...users,
      [uid]: { ...users[uid], canManageShift: !users[uid].canManageShift }
    });
  };

  const handleToggleShiftEligible = (uid) => {
    updateUsers({
      ...users,
      [uid]: { ...users[uid], shiftEligible: users[uid].shiftEligible === false }
    });
  };

  const handleDeleteUser = (uid) => {
    if(uid === currentUserUid) return;
    if(window.confirm(`${users[uid].name}さんを完全に削除してもよろしいですか？`)) {
      deleteUserCompletely(uid);
    }
  };

  const handleAddUser = () => {
    if(!newUserName.trim() || !newUserEmail.trim()) {
      alert('名前とメールアドレスの両方を入力してください。');
      return;
    }

    const normalizedEmail = newUserEmail.trim().toLowerCase();
    const duplicate = Object.values(users).find(
      u => (u.email || '').trim().toLowerCase() === normalizedEmail
    );
    if (duplicate) {
      alert(`このメールアドレスはすでに「${duplicate.name}」さんに登録されています。\n同じメールアドレスを重複登録することはできません。`);
      return;
    }

    const newId = `u_${Date.now()}`;
    const defaultRole = Object.keys(roles)[0] || 'staff';
    
    const newUsers = {
      ...users,
      [newId]: { 
        id: newId, 
        name: newUserName.trim(), 
        email: normalizedEmail,
        role: newUserRole || defaultRole, 
        canManageShift: false,
        shiftEligible: newUserShiftEligible 
      }
    };

    updateUsers(newUsers);
    updateUserOrder([...userOrder, newId]);

    setNewUserName('');
    setNewUserEmail('');
    setNewUserRole(defaultRole);
    setNewUserShiftEligible(true);
    setShowAddForm(false);
  };

  const handleStartRename = (u) => {
    setEditingUserId(u.id);
    setEditingName(u.name);
    setEditingEmail(u.email || '');
  };

  const handleSaveName = (uid) => {
    if (!editingName.trim()) return;
    updateUsers({
      ...users,
      [uid]: { 
        ...users[uid], 
        // この名前がアプリ上の正式名称。Googleプロフィール名では上書きしない。
        name: editingName.trim(),
        displayName: editingName.trim(),
        email: editingEmail.trim().toLowerCase()
      }
    });
    setEditingUserId(null);
  };

  const sortedRoleKeys = Object.keys(roles).sort((a,b) => roles[b].level - roles[a].level);

  return (
    <div className="flex-1 bg-gray-50 overflow-y-auto pb-[68px]">
      <div className="bg-white px-4 py-3 border-b border-gray-100 shadow-sm sticky top-0 z-10">
        <h2 className="text-base font-bold text-gray-800 flex items-center">
          <Settings className="w-5 h-5 mr-1.5"/>
          設定
        </h2>
      </div>
      <div className="p-4 space-y-6 max-w-3xl mx-auto">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center border-b pb-2 mb-4">
            <h3 className="font-bold text-gray-700 text-sm flex items-center">
              シフト名称のカスタマイズ
            </h3>
            <button 
              onClick={() => setShowAddShiftForm(!showAddShiftForm)}
              className="text-xs flex items-center text-blue-600 font-bold bg-blue-50 px-2 py-1 rounded-md active:scale-95"
            >
              <Plus className="mr-1" size={14}/>
              シフトを追加
            </button>
          </div>

          {showAddShiftForm && (
            <div className="bg-gray-50 p-3 rounded-xl mb-4 border border-gray-200 animate-in fade-in slide-in-from-top-2 space-y-3">
              <input 
                type="text" 
                value={newShiftLabel}
                onChange={(e) => setNewShiftLabel(e.target.value)}
                placeholder="新しいシフト名 (例: 中番)"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <div>
                <span className="text-xs text-gray-500 block mb-1.5">カラー選択:</span>
                <div className="flex flex-wrap gap-2">
                  {COLOR_PRESETS.map((color, idx) => (
                    <button
                      key={idx}
                      onClick={() => setNewShiftColor(color)}
                      className={`w-7 h-7 rounded-full border-2 ${color} ${newShiftColor === color ? 'ring-2 ring-blue-500 ring-offset-1' : 'opacity-70'}`}
                    />
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button 
                  onClick={handleAddShift}
                  disabled={!newShiftLabel.trim()}
                  className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50"
                >
                  保存
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {shiftTypes.filter(s => s.id !== 'none').map(shift => (
              <div key={shift.id} className="flex items-center gap-3">
                <div className={`w-16 text-center text-xs py-1.5 rounded-md font-bold ${shift.color}`}>
                  {shift.label}
                </div>
                <input 
                  type="text" 
                  value={shift.label}
                  onChange={(e) => handleLabelChange(shift.id, e.target.value)}
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <button
                  onClick={() => handleDeleteShift(shift.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 rounded-md transition-colors shrink-0"
                  title="シフトを削除"
                >
                  <Trash2 size={16}/>
                </button>
              </div>
            ))}
          </div>
        </div>
        
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex justify-between items-center border-b pb-2 mb-4">
            <h3 className="font-bold text-gray-700 text-sm flex items-center">
              役職名称のカスタマイズ
            </h3>
            <button 
              onClick={() => setShowAddRoleForm(!showAddRoleForm)}
              className="text-xs flex items-center text-blue-600 font-bold bg-blue-50 px-2 py-1 rounded-md active:scale-95"
            >
              <Plus className="mr-1" size={14}/>
              役職を追加
            </button>
          </div>

          {showAddRoleForm && (
            <div className="bg-gray-50 p-3 rounded-xl mb-4 border border-gray-200 animate-in fade-in slide-in-from-top-2 space-y-2">
              <input 
                type="text" 
                value={newRoleName}
                onChange={(e) => setNewRoleName(e.target.value)}
                placeholder="新しい役職名 (例: 副店長)"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              />
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 shrink-0">権限レベル:</span>
                <select
                  value={newRoleLevel}
                  onChange={(e) => setNewRoleLevel(Number(e.target.value))}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none"
                >
                  <option value={40}>管理者 相当 (Lv.40)</option>
                  <option value={30}>エリアM 相当 (Lv.30)</option>
                  <option value={20}>店長 相当 (Lv.20)</option>
                  <option value={10}>スタッフ 相当 (Lv.10)</option>
                </select>
                <button 
                  onClick={handleAddRole}
                  disabled={!newRoleName.trim()}
                  className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 disabled:opacity-50"
                >
                  保存
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {sortedRoleKeys.map((key) => {
              const roleInfo = roles[key];
              return (
                <div key={key} className="flex items-center gap-3">
                  <input 
                    type="text" 
                    value={roleNames[key] || ''}
                    onChange={(e) => handleRoleNameChange(key, e.target.value)}
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-bold text-gray-800"
                    placeholder={roleInfo.name}
                  />
                  <button
                    onClick={() => handleDeleteRole(key)}
                    className="p-2 text-gray-400 hover:text-red-500 rounded-md transition-colors shrink-0"
                    title="役職を削除"
                  >
                    <Trash2 size={16}/>
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 mb-6">
          <div className="flex justify-between items-center border-b pb-2 mb-4">
            <div>
              <h3 className="font-bold text-gray-700 text-sm flex items-center">
                メンバー管理（ログイン許可リスト）
              </h3>
              <p className="text-[11px] text-gray-400 mt-0.5">▲/▼ ボタンで全体の表示順を変更できます</p>
            </div>
            <button 
              onClick={() => setShowAddForm(!showAddForm)}
              className="text-xs flex items-center text-blue-600 font-bold bg-blue-50 px-2 py-1 rounded-md active:scale-95"
            >
              <UserPlus className="mr-1" size={14}/>
              追加
            </button>
          </div>
          
          {showAddForm && (
            <div className="bg-gray-50 p-3 rounded-xl mb-4 border border-gray-200 animate-in fade-in slide-in-from-top-2">
              <div className="space-y-2">
                <input 
                  type="text" 
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="名前 (例: 山田太郎)"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <input 
                  type="email" 
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="Googleメールアドレス (例: example@gmail.com)"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value)}
                    className="flex-1 min-w-[150px] border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {sortedRoleKeys.map((key) => (
                      <option key={key} value={key}>{roleNames[key] || roles[key].name}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1.5 text-[10px] text-gray-600 font-bold px-1 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={!newUserShiftEligible}
                      onChange={(e) => setNewUserShiftEligible(!e.target.checked)}
                      className="w-3.5 h-3.5 rounded"
                    />
                    シフト対象外
                  </label>
                  <button 
                    onClick={handleAddUser}
                    disabled={!newUserName.trim() || !newUserEmail.trim()}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50"
                  >
                    保存
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {sortedUsers.map((u, idx) => {
              const isMe = u.id === currentUserUid;
              const isEditingThisUser = editingUserId === u.id;
              const userRoleObj = roles[u.role] || { level: 10, name: '' };
              const roleLevel = userRoleObj.level;

              return (
                <div key={u.id} className="flex flex-col md:flex-row md:items-center justify-between p-3 hover:bg-gray-50 rounded-xl border border-gray-100 gap-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {/* 上下並び替えボタン */}
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button
                        onClick={() => moveUserOrder(idx, 'up')}
                        disabled={idx === 0}
                        className="p-1 hover:bg-gray-200 text-gray-500 disabled:opacity-20 rounded"
                        title="上に移動"
                      >
                        <ChevronUp size={14}/>
                      </button>
                      <button
                        onClick={() => moveUserOrder(idx, 'down')}
                        disabled={idx === sortedUsers.length - 1}
                        className="p-1 hover:bg-gray-200 text-gray-500 disabled:opacity-20 rounded"
                        title="下に移動"
                      >
                        <ChevronDown size={14}/>
                      </button>
                    </div>

                    <div className="flex-1 min-w-0 font-bold text-sm text-gray-800">
                      {isEditingThisUser ? (
                        <div className="space-y-1.5">
                          <input
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            className="w-full border border-blue-400 bg-blue-50/50 rounded-md px-2 py-1 text-xs outline-none"
                            placeholder="名前"
                            autoFocus
                          />
                          <div className="flex gap-1">
                            <input
                              type="email"
                              value={editingEmail}
                              onChange={(e) => setEditingEmail(e.target.value)}
                              className="flex-1 border border-blue-400 bg-blue-50/50 rounded-md px-2 py-1 text-xs outline-none"
                              placeholder="Googleメールアドレス"
                            />
                            <button
                              onClick={() => handleSaveName(u.id)}
                              className="p-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 shrink-0"
                            >
                              <Save size={14}/>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="truncate">{u.name}</span>
                            {isMe && (
                              <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded shrink-0 font-normal">あなた</span>
                            )}
                            <button
                              onClick={() => handleStartRename(u)}
                              className="p-1 text-gray-400 hover:text-blue-600 rounded-md transition-colors shrink-0"
                              title="編集"
                            >
                              <Edit2 size={13}/>
                            </button>
                          </div>
                          <div className="text-xs text-gray-400 font-normal truncate mt-0.5">
                            {u.email || 'メールアドレス未設定'}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 shrink-0 justify-end border-t md:border-t-0 pt-2 md:pt-0 border-gray-100 pl-6 md:pl-0">
                    <label className="flex items-center gap-1 cursor-pointer" title="このメンバーをシフト管理表の対象外にします">
                      <input
                        type="checkbox"
                        checked={u.shiftEligible === false}
                        onChange={() => handleToggleShiftEligible(u.id)}
                        className="w-3.5 h-3.5 rounded"
                      />
                      <span className="text-[10px] text-gray-600 font-bold mr-1">シフト対象外</span>
                    </label>

                    {roleLevel < 40 && (
                      <label className="flex items-center gap-1 cursor-pointer" title="管理者以外のユーザーにシフト操作権限を付与">
                        <input 
                          type="checkbox" 
                          checked={u.canManageShift || false}
                          onChange={() => handleToggleShiftAuth(u.id)}
                          className="w-3.5 h-3.5 text-yellow-500 rounded"
                        />
                        <span className="text-[10px] text-gray-600 font-bold mr-1">管理</span>
                      </label>
                    )}

                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value)}
                      disabled={isMe}
                      className="text-xs rounded-md px-2 py-1 border bg-white outline-none"
                    >
                      {sortedRoleKeys.map((key) => (
                        <option key={key} value={key}>{roleNames[key] || roles[key].name}</option>
                      ))}
                    </select>

                    <button 
                      onClick={() => handleDeleteUser(u.id)}
                      disabled={isMe}
                      className="p-1.5 text-gray-400 hover:text-red-500 rounded-md disabled:opacity-30"
                    >
                      <Trash2 size={16}/>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 mb-6">
        <div className="flex items-center justify-between border-b pb-2 mb-3">
          <div>
            <h3 className="font-bold text-gray-700 text-sm">調査ログ</h3>
            <p className="text-[10px] text-gray-400 mt-0.5">白画面・保存失敗などの調査用。最新50件を表示します。</p>
          </div>
          <span className="text-[10px] text-gray-400">{(debugLogs || []).length}件</span>
        </div>
        <div className="space-y-2 max-h-[420px] overflow-y-auto">
          {[...(debugLogs || [])].slice().sort((a,b) => String(b.timestamp || '').localeCompare(String(a.timestamp || ''))).slice(0, 50).map((log, index) => (
            <details key={log.id || String(log.timestamp || '') + '-' + index} className={log.level === 'ERROR' ? 'rounded-lg border border-red-200 bg-red-50 p-2' : 'rounded-lg border border-gray-100 bg-gray-50 p-2'}>
              <summary className="cursor-pointer text-[10px] font-bold text-gray-700">
                {log.timestamp ? new Date(log.timestamp).toLocaleString('ja-JP') : '--'} ・ {log.level || 'INFO'} ・ {log.event || 'unknown'} ・ {log.userName || log.userEmail || 'ユーザー不明'}
              </summary>
              <div className="mt-2 text-[9px] text-gray-600 space-y-1">
                <div>ユーザー: {log.userName || '--'} / {log.userEmail || '--'}</div>
                <div>画面: {log.page || '--'}</div>
                <div>端末: {log.userAgent || '--'}</div>
                <pre className="whitespace-pre-wrap break-all bg-white border border-gray-100 rounded p-2">{JSON.stringify(log.details || {}, null, 2)}</pre>
              </div>
            </details>
          ))}
          {(!debugLogs || debugLogs.length === 0) && <p className="text-[10px] text-gray-400 py-3">まだ調査ログはありません。</p>}
        </div>
      </div>
    </div>
  );
};

const PartnerView = ({ partnerItems, partnerNames, addPartnerItem, updatePartnerItem, togglePartnerItem, deletePartnerItem, addPartnerName, updatePartnerName, deletePartnerName, currentUser, debugLog }) => {
  const [date, setDate] = useState(formatDate(new Date()));
  const [timeHour, setTimeHour] = useState('');
  const [timeMinute, setTimeMinute] = useState('');
  const time = timeHour && timeMinute ? `${timeHour}:${timeMinute}` : '';
  const [partnerName, setPartnerName] = useState('');
  const [content, setContent] = useState('');
  const [newPartnerName, setNewPartnerName] = useState('');
  const [newPartnerImage, setNewPartnerImage] = useState(null);
  const [newPartnerImagePreview, setNewPartnerImagePreview] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingName, setIsAddingName] = useState(false);
  const [showPartnerNameMenu, setShowPartnerNameMenu] = useState(false);
  const [editingPartnerName, setEditingPartnerName] = useState(null);
  const [editingPartnerNameValue, setEditingPartnerNameValue] = useState('');
  const [editingItemId, setEditingItemId] = useState(null);
  const partnerPageRef = useRef(null);

  // iPhone Safariでは、DOMレイアウト変更と同時にwindow.scrollTo()を実行すると
  // 画面が一瞬白くなるWebKitの既知問題があるため、編集開始後に
  // パートナーページ自身のスクロール位置を直接戻す。
  useEffect(() => {
    if (!editingItemId) return;
    const frame = requestAnimationFrame(() => {
      if (partnerPageRef.current) partnerPageRef.current.scrollTop = 0;
    });
    return () => cancelAnimationFrame(frame);
  }, [editingItemId]);

  const handleStartEditPartnerName = (name) => {
    setEditingPartnerName(name);
    setEditingPartnerNameValue(name);
    setShowPartnerNameMenu(true);
  };

  const handleSavePartnerName = async () => {
    const oldName = editingPartnerName;
    const newName = editingPartnerNameValue.trim();
    if (!oldName || !newName) return;
    if (newName.toLowerCase() !== oldName.toLowerCase() &&
        (partnerNames || []).some(name => name.toLowerCase() === newName.toLowerCase())) {
      alert('同じパートナー名がすでに登録されています。');
      return;
    }
    await updatePartnerName(oldName, newName);
    if (partnerName === oldName) setPartnerName(newName);
    setEditingPartnerName(null);
    setEditingPartnerNameValue('');
    setShowPartnerNameMenu(false);
  };

  const handleDeletePartnerName = async (name) => {
    if (!window.confirm(`「${name}」をパートナー名の登録一覧から削除してもよろしいですか？`)) return;
    await deletePartnerName(name);
    if (partnerName === name) setPartnerName('');
    if (editingPartnerName === name) {
      setEditingPartnerName(null);
      setEditingPartnerNameValue('');
    }
    setShowPartnerNameMenu(false);
  };

  const handleSave = async () => {
    if (!partnerName || !date || !time || !content.trim()) {
      alert('パートナー名・日付・時間・内容を入力してください。');
      return;
    }

    setIsSaving(true);
    const action = editingItemId ? 'partner.edit.save' : 'partner.add.save';
    await debugLog?.('INFO', action + '.start', { itemId: editingItemId || '', partnerName, date, time, hasImage: !!newPartnerImage });
    try {
      let imageUrl = editingItemId ? ((partnerItems || []).find(item => item.id === editingItemId)?.imageUrl || '') : '';
      let imageName = editingItemId ? ((partnerItems || []).find(item => item.id === editingItemId)?.imageName || '') : '';
      let imagePublicId = editingItemId ? ((partnerItems || []).find(item => item.id === editingItemId)?.imagePublicId || '') : '';
      let imageBytes = editingItemId ? Number((partnerItems || []).find(item => item.id === editingItemId)?.imageBytes || 0) : 0;
      if (newPartnerImage) {
        const result = await uploadTaskImageToCloudinary(newPartnerImage);
        imageUrl = result.secure_url || result.url || '';
        imageName = newPartnerImage.name;
        imagePublicId = result.public_id || '';
        imageBytes = Number(result.bytes || newPartnerImage.size || 0);
      }
      const itemData = { partnerName, date, time, content: content.trim(), ...(imageUrl ? { imageUrl, imageName, imagePublicId, imageBytes, imageUploadedAt: new Date().toISOString() } : {}) };
      if (editingItemId) {
        const savedItemId = editingItemId;
        await debugLog?.('INFO', action + '.firestore.update.start', { itemId: savedItemId, itemData });
        await updatePartnerItem(savedItemId, itemData);
        await debugLog?.('INFO', action + '.success', { itemId: savedItemId });
        // 保存が成功してから編集状態を解除する。
        setEditingItemId(null);
      } else {
        const newItemId = Date.now().toString();
        await addPartnerItem({
          id: newItemId,
          ...itemData,
          completed: false,
          completedAt: null,
          createdAt: new Date().toISOString()
        });
        await debugLog?.('INFO', action + '.success', { itemId: newItemId });
      }
      setContent('');
      setTimeHour(''); setTimeMinute('');
      setPartnerName('');
      setNewPartnerImage(null);
      setNewPartnerImagePreview('');
    } catch (error) {
      await debugLog?.('ERROR', action + '.error', { itemId: editingItemId || '', name: error?.name || '', message: error?.message || String(error), stack: error?.stack || '' });
      console.error('パートナー予定の保存に失敗しました:', error);
      alert('保存に失敗しました。もう一度お試しください。');
    } finally {
      setIsSaving(false);
    }
  };

  const sortedItems = [...(partnerItems || [])].sort((a, b) => {
    const aKey = `${a.date || ''}T${a.time || '00:00'}`;
    const bKey = `${b.date || ''}T${b.time || '00:00'}`;
    return aKey.localeCompare(bKey);
  });

  return (
    <div ref={partnerPageRef} className="flex-1 bg-gray-50 pb-[68px] overflow-y-auto">
      <div className="bg-white px-4 py-3 border-b border-gray-100 shadow-sm">
        <h2 className="text-base font-bold text-gray-800">パートナー</h2>
        <p className="text-[10px] text-gray-400 mt-0.5">日付・時間・内容を登録できます</p>
      </div>

      <div className="p-4 max-w-2xl mx-auto space-y-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
          {editingItemId && (
            <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
              <span className="text-[10px] font-bold text-blue-700">パートナー予定を編集中</span>
              <button type="button" onClick={() => {
                setEditingItemId(null); setPartnerName(''); setDate(formatDate(new Date())); setTimeHour(''); setTimeMinute(''); setContent(''); setNewPartnerImage(null); setNewPartnerImagePreview('');
              }} className="text-[10px] font-bold text-gray-500 hover:text-gray-800">キャンセル</button>
            </div>
          )}
          <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
            <div className="text-[10px] font-bold text-gray-500 mb-2">パートナー名を追加</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newPartnerName}
                onChange={(e) => setNewPartnerName(e.target.value)}
                placeholder="例：○○会社"
                className="min-w-0 flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const name = newPartnerName.trim();
                    if (!name) return;
                    setIsAddingName(true);
                    try {
                      const added = await addPartnerName(name);
                      if (added) {
                        setPartnerName(name);
                        setNewPartnerName('');
                      }
                    } finally {
                      setIsAddingName(false);
                    }
                  }
                }}
              />
              <button
                type="button"
                disabled={isAddingName || !newPartnerName.trim()}
                onClick={async () => {
                  const name = newPartnerName.trim();
                  if (!name) return;
                  setIsAddingName(true);
                  try {
                    const added = await addPartnerName(name);
                    if (added) {
                      setPartnerName(name);
                      setNewPartnerName('');
                    }
                  } finally {
                    setIsAddingName(false);
                  }
                }}
                className="shrink-0 px-3 rounded-xl bg-gray-700 text-white text-xs font-bold disabled:opacity-40"
              >
                {isAddingName ? '…' : '追加'}
              </button>
            </div>
          </div>

          <div className="block">
            <span className="text-[10px] font-bold text-gray-500">パートナー名</span>
            <div className="relative mt-1">
              <button
                type="button"
                onClick={() => setShowPartnerNameMenu(v => !v)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-400 text-left flex items-center justify-between"
              >
                <span className={partnerName ? 'text-gray-800' : 'text-gray-400'}>
                  {partnerName || 'パートナー名を選択'}
                </span>
                <ChevronDown size={16} className="text-gray-400" />
              </button>
              {showPartnerNameMenu && (
                <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                  {(partnerNames || []).length === 0 ? (
                    <div className="px-3 py-3 text-[9px] text-gray-400">上の欄からパートナー名を追加してください。</div>
                  ) : (
                    <div className="max-h-56 overflow-y-auto">
                      {(partnerNames || []).map(name => (
                        <div key={name} className="flex items-center gap-1 border-b border-gray-100 last:border-b-0">
                          <button
                            type="button"
                            onClick={() => { setPartnerName(name); setShowPartnerNameMenu(false); }}
                            className="min-w-0 flex-1 text-left px-3 py-2.5 text-sm text-gray-700 hover:bg-blue-50 truncate"
                          >
                            {name}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStartEditPartnerName(name)}
                            className="shrink-0 p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-md"
                            title="パートナー名を編集"
                          >
                            <Edit2 size={14}/>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeletePartnerName(name)}
                            className="shrink-0 p-2 mr-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md"
                            title="パートナー名を削除"
                          >
                            <Trash2 size={14}/>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[10px] font-bold text-gray-500">日付</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-bold text-gray-500">時間</span>
              <div className="mt-1 flex items-center gap-2">
                <select
                  value={timeHour}
                  onChange={(e) => setTimeHour(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="">時</option>
                  {Array.from({ length: 24 }, (_, hour) => {
                    const value = String(hour).padStart(2, '0');
                    return <option key={value} value={value}>{value}</option>;
                  })}
                </select>
                <span className="text-sm font-bold text-gray-500">時</span>
                <select
                  value={timeMinute}
                  onChange={(e) => setTimeMinute(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value="">分</option>
                  {['00', '15', '30', '45'].map(value => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
                <span className="text-sm font-bold text-gray-500">分</span>
              </div>
            </label>
          </div>

          <div className="block">
            <span className="text-[10px] font-bold text-gray-500">画像</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                id="partner-image-input"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  if (!file.type.startsWith('image/')) { alert('画像ファイルを選択してください。'); e.target.value = ''; return; }
                  if (file.size > 10 * 1024 * 1024) { alert('画像は10MB以下にしてください。'); e.target.value = ''; return; }
                  setNewPartnerImage(file);
                  setNewPartnerImagePreview(URL.createObjectURL(file));
                  e.target.value = '';
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => document.getElementById('partner-image-input')?.click()}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-gray-100 border border-gray-200 text-gray-700 text-xs font-bold hover:bg-gray-200"
              >
                <ImageIcon size={16} />
                画像を追加
              </button>
              {newPartnerImage && (
                <span className="text-[9px] text-gray-500 truncate max-w-[180px]">{newPartnerImage.name}</span>
              )}
            </div>
            {newPartnerImagePreview && <img src={newPartnerImagePreview} alt="添付画像プレビュー" className="mt-2 h-24 w-auto rounded-lg object-cover border border-gray-200" />}
            {!newPartnerImagePreview && editingItemId && (partnerItems || []).find(item => item.id === editingItemId)?.imageUrl && (
              <p className="text-[9px] text-gray-400 mt-1">保存済み画像があります。新しい画像を選ぶと差し替えます。</p>
            )}
          </div>

          <label className="block">
            <span className="text-[10px] font-bold text-gray-500">内容</span>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              placeholder="パートナーに関する内容を入力"
              className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            />
          </label>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <span aria-hidden="true" className="inline-flex w-4 h-4 items-center justify-center">
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : null}
            </span>
            <span translate="no">
              {isSaving ? '保存中…' : (editingItemId ? '変更を保存' : '保存')}
            </span>
          </button>
        </div>

        <div className="space-y-2">
          {sortedItems.length === 0 ? (
            <div className="text-center text-[11px] text-gray-400 py-8">登録された内容はありません</div>
          ) : (
            sortedItems.map(item => (
              <div key={item.id} className={`bg-white rounded-xl border ${item.completed ? 'border-green-200' : 'border-gray-200'} px-3 py-2 flex items-start gap-2`}>
                <button type="button" onClick={() => togglePartnerItem(item.id)}
                  className={`shrink-0 mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${item.completed ? 'border-green-500 bg-green-500 text-white' : 'border-gray-300 hover:border-blue-400'}`}
                  title={item.completed ? '未完了に戻す' : '終了にする'}>
                  {item.completed && <CheckSquare className="stroke-[3]" size={12}/>}
                </button>
                <div className="shrink-0 text-center min-w-[68px]">
                  <div className={`text-[10px] font-bold ${item.completed ? 'text-gray-400 line-through' : 'text-blue-600'}`}>{item.date?.replace(/-/g, '/')}</div>
                  <div className={`text-[11px] font-bold mt-0.5 ${item.completed ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{item.time || '--:--'}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-[10px] font-bold mb-0.5 ${item.completed ? 'text-gray-400 line-through' : 'text-purple-600'}`}>{item.partnerName || 'パートナー未設定'}</div>
                  <div className={`text-xs whitespace-pre-wrap break-words ${item.completed ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{item.content}</div>
                  {item.completedAt && <div className="text-[8px] text-green-600 mt-0.5">終了 {new Date(item.completedAt).toLocaleString('ja-JP')}</div>}
                </div>
                <div className="shrink-0 flex gap-0.5">
                  <button type="button" onClick={() => {
                    setEditingItemId(item.id);
                    setPartnerName(item.partnerName || '');
                    setDate(item.date || formatDate(new Date()));
                    const [editHour, editMinute] = (item.time || '').split(':');
                    setTimeHour(editHour || '');
                    setTimeMinute(editMinute || '');
                    setContent(item.content || '');
                    setNewPartnerImage(null);
                    setNewPartnerImagePreview('');
                  }} className="p-1 text-gray-300 hover:text-blue-500 rounded-md" title="編集"><Edit2 size={14}/></button>
                  <button type="button" onClick={() => deletePartnerItem(item.id)}
                    className="p-1 text-gray-300 hover:text-red-500 rounded-md" title="削除"><Trash2 size={14}/></button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

const BottomNav = ({ activeTab, setActiveTab, currentUser, roles }) => {
  const canManageShift = checkCanManageShift(currentUser, roles);
  const userRoleObj = roles[currentUser.role] || { level: 10 };
  const canManageSettings = userRoleObj.level >= 30;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 pb-safe z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
      <div className="flex h-[68px] w-full max-w-full">
        <button 
          onClick={() => setActiveTab('calendar')}
          className={`flex-1 flex flex-col items-center justify-center space-y-1.5 relative ${activeTab === 'calendar' ? 'text-blue-600' : 'text-gray-400'}`}
        >
          <CalendarIcon className="w-6 h-6"/>
          <span className="text-[10px] font-bold">カレンダー</span>
          {activeTab === 'calendar' && <div className="absolute top-0 w-1/2 h-0.5 bg-blue-600 rounded-b-full"></div>}
        </button>
        
        {canManageShift && (
          <button 
            onClick={() => setActiveTab('team-shift')}
            className={`flex-1 flex flex-col items-center justify-center space-y-1.5 relative ${activeTab === 'team-shift' ? 'text-purple-600' : 'text-gray-400'}`}
          >
            <Table className="w-6 h-6"/>
            <span className="text-[10px] font-bold">シフト管理</span>
            {activeTab === 'team-shift' && <div className="absolute top-0 w-1/2 h-0.5 bg-purple-600 rounded-b-full"></div>}
          </button>
        )}

        <button 
          onClick={() => setActiveTab('daily')}
          className={`flex-1 flex flex-col items-center justify-center space-y-1.5 relative ${activeTab === 'daily' ? 'text-blue-600' : 'text-gray-400'}`}
        >
          <CheckSquare className="w-6 h-6"/>
          <span className="text-[10px] font-bold">日別タスク</span>
          {activeTab === 'daily' && <div className="absolute top-0 w-1/2 h-0.5 bg-blue-600 rounded-b-full"></div>}
        </button>

        <button
          onClick={() => setActiveTab('partner')}
          className={`flex-1 flex flex-col items-center justify-center space-y-1.5 relative ${activeTab === 'partner' ? 'text-blue-600' : 'text-gray-400'}`}
        >
          <Handshake className="w-6 h-6"/>
          <span className="text-[10px] font-bold">パートナー</span>
          {activeTab === 'partner' && <div className="absolute top-0 w-1/2 h-0.5 bg-blue-600 rounded-b-full"></div>}
        </button>

        {canManageSettings && (
          <button 
            onClick={() => setActiveTab('settings')}
            className={`flex-1 flex flex-col items-center justify-center space-y-1.5 relative ${activeTab === 'settings' ? 'text-blue-600' : 'text-gray-400'}`}
          >
            <Settings className="w-6 h-6"/>
            <span className="text-[10px] font-bold">設定</span>
            {activeTab === 'settings' && <div className="absolute top-0 w-1/2 h-0.5 bg-blue-600 rounded-b-full"></div>}
          </button>
        )}
      </div>
    </div>
  );
};

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState('calendar');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [authError, setAuthError] = useState('');
  
  const [shiftTypes, setShiftTypes] = useState(DEFAULT_SHIFT_TYPES);
  const [roles, setRoles] = useState(INITIAL_ROLES);
  const [roleNames, setRoleNames] = useState(DEFAULT_ROLE_NAMES);
  const [users, setUsers] = useState({});
  const [userOrder, setUserOrder] = useState([]);
  const [teamData, setTeamData] = useState({ shifts: {}, tasks: {} });
  const [partnerItems, setPartnerItems] = useState([]);
  const [partnerNames, setPartnerNames] = useState([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [debugLogs, setDebugLogs] = useState([]);
  const [shiftLogs, setShiftLogs] = useState({});
  const currentUserRef = useRef(null);
  const lastDebugActionRef = useRef('app.loaded');

  const debugLog = async (level, event, details = {}) => {
    lastDebugActionRef.current = event;
    await writeDebugLog({ level, event, user: currentUserRef.current, details: { ...details, lastAction: event } });
  };

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    const handleWindowError = (event) => {
      void writeDebugLog({
        level: 'ERROR', event: 'window.error', user: currentUserRef.current,
        details: { lastAction: lastDebugActionRef.current, message: event?.message || '', source: event?.filename || '', line: event?.lineno || 0, column: event?.colno || 0, stack: event?.error?.stack || '' }
      });
    };
    const handleUnhandledRejection = (event) => {
      const reason = event?.reason;
      void writeDebugLog({
        level: 'ERROR', event: 'unhandledrejection', user: currentUserRef.current,
        details: { lastAction: lastDebugActionRef.current, name: reason?.name || '', message: reason?.message || String(reason || ''), stack: reason?.stack || '' }
      });
    };
    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => {
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  // Firestoreから古いsnapshotが返ってきても、直前に設定画面で変更した
  // ユーザー名を一瞬でも古い名前へ戻さないためのローカル上書き。
  const pendingUserOverridesRef = useRef({});

  const saveToFirestore = async (updates) => {
    try {
      const docRef = doc(db, 'app_data', 'shared_state');
      await setDoc(docRef, updates, { merge: true });
    } catch (error) {
      console.error("Firestore Save Error:", error);
    }
  };

  // ユーザー情報はusers全体を一括保存しない。
  // ログイン情報や設定変更が古いusers全体をFirestoreへ書き戻して
  // 設定した名前を元に戻してしまう競合を防ぐため、変更されたユーザーだけを更新する。
  const saveUsersToFirestore = async (nextUsers, previousUsers = users) => {
    try {
      const docRef = doc(db, 'app_data', 'shared_state');
      const updates = {};
      const ids = new Set([
        ...Object.keys(previousUsers || {}),
        ...Object.keys(nextUsers || {})
      ]);

      ids.forEach(id => {
        const before = previousUsers?.[id];
        const after = nextUsers?.[id];
        if (!after) {
          if (before) updates[`users.${id}`] = deleteField();
          return;
        }
        if (JSON.stringify(before) !== JSON.stringify(after)) {
          updates[`users.${id}`] = after;
        }
      });

      if (Object.keys(updates).length > 0) {
        await updateDoc(docRef, updates);
      }
    } catch (error) {
      console.error("Firestore User Save Error:", error);
    }
  };

  // Firestore Realtime Listener
  useEffect(() => {
    const docRef = doc(db, 'app_data', 'shared_state');
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        let currentUsers = { ...(data.users || {}) };
        let currentShifts = { ...(data.teamData?.shifts || {}) };
        let currentTasks = { ...(data.teamData?.tasks || {}) };
        let currentUserOrder = [...(data.userOrder || [])];
        let currentPartnerItems = Array.isArray(data.partnerItems) ? data.partnerItems : [];
        let currentPartnerNames = Array.isArray(data.partnerNames) ? data.partnerNames : [];
        let currentDebugLogs = Array.isArray(data.debugLogs) ? data.debugLogs : [];
        let currentShiftLogs = (data.shiftLogs && typeof data.shiftLogs === 'object') ? data.shiftLogs : {};

        // 設定画面から直前に変更したユーザー情報を優先する。
        // 古いsnapshotが後から届いても、画面上の名前が元へ戻らないようにする。
        Object.entries(pendingUserOverridesRef.current).forEach(([uid, override]) => {
          if (!currentUsers[uid]) return;
          const firestoreUser = currentUsers[uid];
          const sameName = firestoreUser.name === override.name;
          const sameDisplayName = (firestoreUser.displayName || '') === (override.displayName || '');
          const sameEmail = (firestoreUser.email || '').trim().toLowerCase() === (override.email || '').trim().toLowerCase();
          if (sameName && sameDisplayName && sameEmail) {
            delete pendingUserOverridesRef.current[uid];
          } else {
            currentUsers[uid] = { ...firestoreUser, ...override };
          }
        });

        // 同じメールアドレスの重複ユーザーを自動統合する。
        // 正規ユーザーは userOrder に入っているIDを最優先し、
        // それがなければ Google のID（u_ で始まらない旧形式）を優先する。
        const emailMap = {};
        let needsCleanup = false;

        Object.values(currentUsers).forEach(u => {
          const em = (u.email || '').trim().toLowerCase();
          if (!em) return;
          if (!emailMap[em]) emailMap[em] = [];
          emailMap[em].push(u);
        });

        Object.keys(emailMap).forEach(em => {
          const list = emailMap[em];
          if (list.length <= 1) return;

          needsCleanup = true;
          // 設定画面で登録・編集した名前を正として扱う。
          // u_ で始まるユーザーは設定画面から追加したメンバーなので、
          // Googleプロフィール名を持つログインIDより優先する。
          const settingsUser = list.find(u => u.id.startsWith('u_'));
          const orderedUser = currentUserOrder
            .map(id => list.find(u => u.id === id))
            .find(Boolean);
          const googleIdUser = list.find(u => !u.id.startsWith('u_'));
          const realUser = settingsUser || orderedUser || googleIdUser || list[0];
          const duplicateUsers = list.filter(u => u.id !== realUser.id);

          duplicateUsers.forEach(dUser => {
            Object.keys(currentShifts).forEach(dStr => {
              const day = currentShifts[dStr];
              if (!day?.[dUser.id]) return;
              // 「none」は未設定として扱う。
              // 設定画面側のユーザーに仮の「none」が入っていても、
              // 旧ユーザー側に実際のシフトがあれば、そのシフトを引き継ぐ。
              const existingShift = day[realUser.id];
              const duplicateShift = day[dUser.id];
              if (
                existingShift === undefined ||
                existingShift === null ||
                existingShift === '' ||
                existingShift === 'none'
              ) {
                if (duplicateShift && duplicateShift !== 'none') {
                  day[realUser.id] = duplicateShift;
                }
              }
              delete day[dUser.id];
            });

            Object.keys(currentTasks).forEach(dStr => {
              const day = currentTasks[dStr];
              if (!day?.[dUser.id]) return;

              const existingTasks = Array.isArray(day[realUser.id]) ? day[realUser.id] : [];
              const existingIds = new Set(existingTasks.map(task => task?.id).filter(Boolean));
              const migratedTasks = day[dUser.id].filter(task => {
                if (!task?.id) return true;
                if (existingIds.has(task.id)) return false;
                existingIds.add(task.id);
                return true;
              });

              day[realUser.id] = [...existingTasks, ...migratedTasks];
              delete day[dUser.id];
            });

            currentUserOrder = currentUserOrder.filter(id => id !== dUser.id);
            delete currentUsers[dUser.id];
          });
        });

        // 同じタスクIDが同じ日・同じ担当者に複数保存されていた場合は1件に整理する。
        // 重複ユーザー統合の再実行で同じタスクが増殖するのを防ぐ。
        Object.keys(currentTasks).forEach(dStr => {
          const day = currentTasks[dStr];
          if (!day || typeof day !== 'object') return;

          Object.keys(day).forEach(uid => {
            if (!Array.isArray(day[uid])) return;
            const seenTaskIds = new Set();
            const dedupedTasks = [];
            day[uid].forEach(task => {
              const taskId = task?.id;
              if (taskId && seenTaskIds.has(taskId)) {
                needsCleanup = true;
                return;
              }
              if (taskId) seenTaskIds.add(taskId);
              dedupedTasks.push(task);
            });

            if (dedupedTasks.length !== day[uid].length) {
              day[uid] = dedupedTasks;
            }
          });
        });

        // userOrder に存在しないユーザーは末尾に追加して表示対象から漏れないようにする。
        Object.keys(currentUsers).forEach(id => {
          if (!currentUserOrder.includes(id)) currentUserOrder.push(id);
        });

        if (needsCleanup) {
          const updatedTeamData = { shifts: currentShifts, tasks: currentTasks };
          // usersは差分だけ更新する。正規ユーザーの名前を古いsnapshotで上書きしない。
          const usersForCleanup = { ...(data.users || {}) };
          Object.entries(pendingUserOverridesRef.current).forEach(([uid, override]) => {
            if (usersForCleanup[uid]) usersForCleanup[uid] = { ...usersForCleanup[uid], ...override };
          });
          saveUsersToFirestore(currentUsers, usersForCleanup);
          saveToFirestore({
            userOrder: currentUserOrder,
            teamData: updatedTeamData
          });
        }

        setUsers(currentUsers);
        setUserOrder(currentUserOrder);
        if (data.teamData || needsCleanup) setTeamData({ shifts: currentShifts, tasks: currentTasks });
        setPartnerItems(currentPartnerItems);
        setPartnerNames(currentPartnerNames);
        setDebugLogs(currentDebugLogs);
        setShiftLogs(currentShiftLogs);
        if (data.shiftTypes) setShiftTypes(data.shiftTypes);
        if (data.roles) setRoles(data.roles);
        if (data.roleNames) setRoleNames(data.roleNames);

        // Firestoreの読み込み後にだけ保存済みログインを復元する。
        // 重複IDが残っていた場合も、正規ユーザーへ自動的に付け替える。
        const savedUserRaw = localStorage.getItem('google_user');
        if (savedUserRaw) {
          try {
            const savedUser = JSON.parse(savedUserRaw);
            const savedEmail = (savedUser.email || '').trim().toLowerCase();
            const restoredUser = Object.values(currentUsers).find(
              u => (u.email || '').trim().toLowerCase() === savedEmail
            );
            if (restoredUser) {
              setCurrentUser(restoredUser);
              localStorage.setItem('google_user', JSON.stringify(restoredUser));
            } else {
              localStorage.removeItem('google_user');
            }
          } catch {
            localStorage.removeItem('google_user');
          }
        }
      }
      setIsLoaded(true);
    }, (error) => {
      console.error("Firestore Listen Error:", error);
      setIsLoaded(true);
    });

    return () => unsubscribe();
  }, []);

  const deleteUserCompletely = (uid) => {
    const updatedUsers = { ...users };
    delete updatedUsers[uid];

    const updatedOrder = userOrder.filter(id => id !== uid);

    const updatedShifts = { ...teamData.shifts };
    Object.keys(updatedShifts).forEach(dateStr => {
      if (updatedShifts[dateStr] && updatedShifts[dateStr][uid]) {
        delete updatedShifts[dateStr][uid];
      }
    });

    const updatedTasks = { ...teamData.tasks };
    Object.keys(updatedTasks).forEach(dateStr => {
      if (updatedTasks[dateStr] && updatedTasks[dateStr][uid]) {
        delete updatedTasks[dateStr][uid];
      }
    });

    const updatedTeamData = { shifts: updatedShifts, tasks: updatedTasks };

    setUsers(updatedUsers);
    setUserOrder(updatedOrder);
    setTeamData(updatedTeamData);
    saveUsersToFirestore(updatedUsers, users);
    saveToFirestore({ userOrder: updatedOrder, teamData: updatedTeamData });
  };

  const handleGoogleLoginSuccess = (credentialResponse) => {
    setAuthError('');
    lastDebugActionRef.current = 'login.start';

    if (!isLoaded) {
      setAuthError('メンバー情報を読み込み中です。少し待ってからもう一度ログインしてください。');
      return;
    }

    const decoded = jwtDecode(credentialResponse.credential);
    const loginEmail = (decoded.email || '').trim().toLowerCase();
    void writeDebugLog({ level: 'INFO', event: 'login.start', user: { id: decoded.sub || '', email: loginEmail, name: decoded.name || '' }, details: { googleSub: decoded.sub || '' } });

    if (!loginEmail) {
      setAuthError('Googleアカウントのメールアドレスを取得できませんでした。');
      return;
    }

    const userList = Object.values(users);
    const matchedUsers = userList.filter(
      u => (u.email || '').trim().toLowerCase() === loginEmail
    );

    const isFirstUser = userList.length === 0;

    if (!isFirstUser && matchedUsers.length === 0) {
      setAuthError(`メールアドレス (${loginEmail}) は登録されていません。管理者に登録を依頼してください。`);
      return;
    }

    let loggedInUser;

    if (isFirstUser) {
      loggedInUser = {
        id: decoded.sub,
        name: decoded.name,
        email: loginEmail,
        picture: decoded.picture,
        role: 'admin',
        canManageShift: true
      };
      const updatedUsers = { [loggedInUser.id]: loggedInUser };
      const updatedOrder = [loggedInUser.id];
      setUsers(updatedUsers);
      setUserOrder(updatedOrder);
      saveUsersToFirestore(updatedUsers, users);
      saveToFirestore({ userOrder: updatedOrder });
    } else {
      // 同じメールが複数残っていても、userOrderに登録されているIDを優先。
      // これにより古い重複IDで新しいシフトが作られるのを防ぐ。
      const matchedUser =
        matchedUsers.find(u => userOrder.includes(u.id)) ||
        matchedUsers.find(u => !u.id.startsWith('u_')) ||
        matchedUsers[0];

      // ログイン時はGoogleプロフィール名で設定名を上書きしない。
      // 名前は設定画面で登録・編集した users[].name をそのまま使用する。
      loggedInUser = {
        ...matchedUser,
        picture: decoded.picture
      };

      const updatedUsers = {
        ...users,
        [matchedUser.id]: {
          ...matchedUser,
          picture: decoded.picture
        }
      };
      setUsers(updatedUsers);
      saveUsersToFirestore(updatedUsers, users);
    }

    setCurrentUser(loggedInUser);
    currentUserRef.current = loggedInUser;
    lastDebugActionRef.current = 'login.success';
    void writeDebugLog({ level: 'INFO', event: 'login.success', user: loggedInUser, details: { matchedUserId: loggedInUser.id } });
    localStorage.setItem('google_user', JSON.stringify(loggedInUser));
  };

  const handleLogout = () => {
    googleLogout();
    setCurrentUser(null);
    setAuthError('');
    localStorage.removeItem('google_user');
  };

  const allUserKeys = Object.keys(users);
  const sortedUsers = [...allUserKeys].sort((a, b) => {
    const indexA = userOrder.indexOf(a);
    const indexB = userOrder.indexOf(b);

    if (indexA !== -1 && indexB !== -1) return indexA - indexB;
    if (indexA !== -1) return -1;
    if (indexB !== -1) return 1;

    const levelA = roles[users[a]?.role]?.level || 0;
    const levelB = roles[users[b]?.role]?.level || 0;
    return levelB - levelA || a.localeCompare(b);
  }).map(id => users[id]).filter(Boolean);

  if (!isLoaded) return <div className="flex-1 bg-gray-50 flex items-center justify-center min-h-screen">Loading...</div>;

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      {!currentUser ? (
        <LoginScreen onGoogleLoginSuccess={handleGoogleLoginSuccess} authError={authError} />
      ) : (
        <div className="min-h-screen bg-gray-100 flex flex-col w-full">
          <div className="w-full flex-1 flex flex-col bg-white min-h-screen relative overflow-hidden font-sans">
            
            <div className="bg-white border-b border-gray-100 pt-safe px-6 py-3 flex justify-between items-center z-20 shrink-0 shadow-sm">
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex flex-col text-[9px] sm:text-[10px] font-black text-gray-900 tracking-tight leading-[0.9] text-right">
                    <span>LUIGANS</span>
                    <span>OPERATIONS</span>
                    <span>CREW</span>
                  </div>
                  <span className="text-2xl sm:text-3xl font-normal text-blue-600 tracking-tight leading-none">App</span>
                </div>
              </div>
              <button 
                onClick={handleLogout}
                className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 px-3.5 py-1.5 rounded-full transition-colors active:scale-95"
              >
                <img src={currentUser.picture} alt="Avatar" className="w-6 h-6 rounded-full" />
                <div className="text-right flex items-center">
                  <span className="text-xs font-bold text-gray-500 mr-1.5">{roleNames[currentUser.role] || roles[currentUser.role]?.name || '管理者'}</span>
                  <span className="text-xs font-bold text-gray-800">{currentUser.name.split(' ')[0]}</span>
                </div>
                <LogOut className="text-gray-500 ml-1" size={15}/>
              </button>
            </div>

            {activeTab === 'partner' ? (
              <PartnerView
                currentUser={currentUser}
                debugLog={debugLog}
                partnerItems={partnerItems}
                partnerNames={partnerNames}
                updatePartnerItem={async (itemId, changes) => {
                  lastDebugActionRef.current = 'partner.firestore.update';
                  await debugLog('INFO', 'partner.firestore.update.start', { itemId });
                  const currentItem = (partnerItems || []).find(item => item.id === itemId);
                  if (!currentItem) throw new Error('対象のパートナー予定が見つかりません。');

                  const updatedItem = { ...currentItem, ...changes };
                  const updatedItems = (partnerItems || []).map(item =>
                    item.id === itemId ? updatedItem : item
                  );

                  // パートナー予定の編集はpartnerItems全体を読み直して保存せず、
                  // 現在の配列を1回だけ更新する。別PCの古いsnapshotによる
                  // 上書きや、編集直後の再描画競合を減らす。
                  setPartnerItems(updatedItems);
                  await updateDoc(doc(db, 'app_data', 'shared_state'), {
                    partnerItems: updatedItems
                  });
                  await debugLog('INFO', 'partner.firestore.update.success', { itemId });
                }}
                togglePartnerItem={async (itemId) => {
                  const now = new Date().toISOString();
                  const updatedItems = partnerItems.map(item => item.id === itemId
                    ? { ...item, completed: !item.completed, completedAt: !item.completed ? now : null }
                    : item
                  );
                  setPartnerItems(updatedItems);
                  await saveToFirestore({ partnerItems: updatedItems });
                }}
                addPartnerName={async (name) => {
                  const normalized = name.trim();
                  if (!normalized) return false;
                  if (partnerNames.some(existing => existing.toLowerCase() === normalized.toLowerCase())) {
                    alert('同じパートナー名がすでに登録されています。');
                    return false;
                  }
                  const updatedNames = [...partnerNames, normalized];
                  setPartnerNames(updatedNames);
                  await saveToFirestore({ partnerNames: updatedNames });
                  return true;
                }}
                updatePartnerName={async (oldName, newName) => {
                  const updatedNames = partnerNames.map(name => name === oldName ? newName : name);
                  const updatedItems = partnerItems.map(item => item.partnerName === oldName ? { ...item, partnerName: newName } : item);
                  setPartnerNames(updatedNames);
                  setPartnerItems(updatedItems);
                  await saveToFirestore({ partnerNames: updatedNames, partnerItems: updatedItems });
                }}
                deletePartnerName={async (name) => {
                  const updatedNames = partnerNames.filter(existing => existing !== name);
                  setPartnerNames(updatedNames);
                  await saveToFirestore({ partnerNames: updatedNames });
                }}
                addPartnerItem={async (item) => {
                  const updatedItems = [...partnerItems, item];
                  setPartnerItems(updatedItems);
                  await saveToFirestore({ partnerItems: updatedItems });
                }}
                deletePartnerItem={async (itemId) => {
                  const updatedItems = partnerItems.filter(item => item.id !== itemId);
                  setPartnerItems(updatedItems);
                  await saveToFirestore({ partnerItems: updatedItems });
                }}
              />
            ) : activeTab === 'calendar' ? (
              <CalendarView 
                changeMonth={(offset) => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1))} 
                currentDate={currentDate} 
                currentUserUid={currentUser.id} 
                currentUser={currentUser}
                roles={roles}
                onDateClick={(dateStr) => { setSelectedDate(dateStr); setActiveTab('daily'); }} 
                shiftTypes={shiftTypes} 
                teamData={teamData} 
                partnerItems={partnerItems}
                partnerNames={partnerNames}
                updatePartnerItem={async (itemId, changes) => {
                  const currentItem = (partnerItems || []).find(item => item.id === itemId);
                  if (!currentItem) throw new Error('対象のパートナー予定が見つかりません。');
                  const updatedItems = (partnerItems || []).map(item => item.id === itemId ? { ...item, ...changes } : item);
                  setPartnerItems(updatedItems);
                  await updateDoc(doc(db, 'app_data', 'shared_state'), { partnerItems: updatedItems });
                }}
                updateTaskAssignees={async (ownerUid, dateStr, taskId, assigneeIds) => {
                  const dayTasks = teamData.tasks[dateStr] || {};
                  const ownerTasks = dayTasks[ownerUid] || [];
                  const targetTask = ownerTasks.find(t => t.id === taskId);
                  if (!targetTask) throw new Error('対象タスクが見つかりません。');

                  const updatedOwnerTasks = ownerTasks.map(t =>
                    t.id === taskId ? { ...t, assigneeIds: [...assigneeIds] } : t
                  );
                  const updatedTeamData = {
                    ...teamData,
                    tasks: {
                      ...teamData.tasks,
                      [dateStr]: {
                        ...dayTasks,
                        [ownerUid]: updatedOwnerTasks
                      }
                    }
                  };

                  // 担当者変更はteamData全体ではなく対象ユーザーのタスク配列だけを保存。
                  // 古いsnapshotとの競合で変更直後に元へ戻るのを防ぐ。
                  setTeamData(updatedTeamData);
                  await updateDoc(doc(db, 'app_data', 'shared_state'), {
                    [`teamData.tasks.${dateStr}.${ownerUid}`]: updatedOwnerTasks
                  });
                }}
                updateTaskText={async (dateStr, ownerUid, taskId, newText) => {
                  const dayTasks = teamData.tasks[dateStr] || {};
                  const ownerTasks = dayTasks[ownerUid] || [];
                  const updatedOwnerTasks = ownerTasks.map(t => t.id === taskId ? { ...t, text: newText } : t);
                  setTeamData({ ...teamData, tasks: { ...teamData.tasks, [dateStr]: { ...dayTasks, [ownerUid]: updatedOwnerTasks } } });
                  await updateDoc(doc(db, 'app_data', 'shared_state'), { [`teamData.tasks.${dateStr}.${ownerUid}`]: updatedOwnerTasks });
                }}
                deleteTask={async (dateStr, ownerUid, taskId) => {
                  const dayTasks = teamData.tasks[dateStr] || {};
                  const ownerTasks = dayTasks[ownerUid] || [];
                  const updatedOwnerTasks = ownerTasks.filter(t => t.id !== taskId);
                  setTeamData({ ...teamData, tasks: { ...teamData.tasks, [dateStr]: { ...dayTasks, [ownerUid]: updatedOwnerTasks } } });
                  await updateDoc(doc(db, 'app_data', 'shared_state'), { [`teamData.tasks.${dateStr}.${ownerUid}`]: updatedOwnerTasks });
                }}
                toggleTask={async (dateStr, ownerUid, taskId) => {
                  const dayTasks = teamData.tasks[dateStr] || {};
                  const ownerTasks = dayTasks[ownerUid] || [];
                  const targetTask = ownerTasks.find(t => t.id === taskId);
                  if (!targetTask) return;
                  const nextCompleted = !targetTask.completed;
                  const updatedOwnerTasks = ownerTasks.map(t =>
                    t.id === taskId
                      ? { ...t, completed: nextCompleted, completedAt: nextCompleted ? new Date().toISOString() : null }
                      : t
                  );
                  const updatedTeamData = {
                    ...teamData,
                    tasks: {
                      ...teamData.tasks,
                      [dateStr]: {
                        ...dayTasks,
                        [ownerUid]: updatedOwnerTasks
                      }
                    }
                  };
                  setTeamData(updatedTeamData);
                  try {
                    await updateDoc(doc(db, 'app_data', 'shared_state'), {
                      [`teamData.tasks.${dateStr}.${ownerUid}`]: updatedOwnerTasks
                    });
                  } catch (error) {
                    console.error('タスク完了状態の保存に失敗しました:', error);
                    setTeamData(teamData);
                    alert('タスクの完了状態を保存できませんでした。もう一度お試しください。');
                  }
                }}
                sortedUsers={sortedUsers}
                users={users}
              />
            ) : activeTab === 'team-shift' ? (
              <TeamShiftView 
                changeMonth={(offset) => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1))} 
                currentDate={currentDate} 
                currentUserUid={currentUser.id} 
                roleNames={roleNames} 
                roles={roles} 
                shiftTypes={shiftTypes} 
                teamData={teamData} 
                currentUser={currentUser}
                shiftLogs={shiftLogs}
                updateUserShift={async (dateStr, targetUid, shiftId) => {
                  const oldShiftId = teamData.shifts[dateStr]?.[targetUid] || 'none';
                  const oldShift = shiftTypes.find(s => s.id === oldShiftId) || shiftTypes.find(s => s.id === 'none');
                  const newShift = shiftTypes.find(s => s.id === shiftId) || shiftTypes.find(s => s.id === 'none');
                  if (oldShiftId === shiftId) return;
                  const updatedTeamData = {
                    ...teamData,
                    shifts: { ...teamData.shifts, [dateStr]: { ...(teamData.shifts[dateStr] || {}), [targetUid]: shiftId } }
                  };
                  setTeamData(updatedTeamData);
                  saveToFirestore({ teamData: updatedTeamData });

                  const monthKey = dateStr.slice(0, 7).replace('-', '_');
                  const logEntry = {
                    id: \`shiftlog_\${Date.now()}_\${Math.random().toString(36).slice(2, 8)}\`,
                    timestamp: new Date().toISOString(),
                    type: 'manual',
                    actorUid: currentUser.id,
                    actorName: currentUser.name || '不明なユーザー',
                    targetUid,
                    targetName: users[targetUid]?.name || '不明なメンバー',
                    targetDate: dateStr,
                    oldShiftId,
                    oldLabel: oldShift?.label || '未定',
                    newShiftId: shiftId,
                    newLabel: newShift?.label || '未定'
                  };
                  const nextLogs = [...(shiftLogs?.[monthKey] || []), logEntry];
                  setShiftLogs({ ...shiftLogs, [monthKey]: nextLogs });
                  await updateDoc(doc(db, 'app_data', 'shared_state'), {
                    [\`shiftLogs.\${monthKey}\`]: arrayUnion(logEntry)
                  });
                }} 
                sortedUsers={sortedUsers}
                bulkImportShifts={async (newShifts, changedCount) => {
                  if (!checkIsAdmin(currentUser, roles)) {
                    alert('シフトの一括取り込みは管理者のみ実行できます。');
                    return false;
                  }
                  const updatedTeamData = { ...teamData, shifts: newShifts };
                  setTeamData(updatedTeamData);
                  saveToFirestore({ teamData: updatedTeamData });
                  const monthKey = \`\${currentDate.getFullYear()}-\${String(currentDate.getMonth() + 1).padStart(2, '0')}\`;
                  const logEntry = {
                    id: \`shiftlog_\${Date.now()}_\${Math.random().toString(36).slice(2, 8)}\`,
                    timestamp: new Date().toISOString(),
                    type: 'bulk',
                    actorUid: currentUser.id,
                    actorName: currentUser.name || '不明なユーザー',
                    monthKey,
                    monthLabel: \`\${currentDate.getMonth() + 1}月\`,
                    changedCount: changedCount || 0
                  };
                  const nextLogs = [...(shiftLogs?.[monthKey] || []), logEntry];
                  setShiftLogs({ ...shiftLogs, [monthKey]: nextLogs });
                  await updateDoc(doc(db, 'app_data', 'shared_state'), {
                    [\`shiftLogs.\${monthKey}\`]: arrayUnion(logEntry)
                  });
                  return true;
                }}
                updateShiftTypes={(newShiftTypes) => {
                  setShiftTypes(newShiftTypes);
                  saveToFirestore({ shiftTypes: newShiftTypes });
                }}
              />
            ) : activeTab === 'daily' ? (
              <DailyDetailView 
                addTask={(dateStr, targetUid, text, imageUrl = '', imageName = '', imagePublicId = '', imageBytes = 0) => {
                  const dayTasks = teamData.tasks[dateStr] || {};
                  const userTasks = dayTasks[targetUid] || [];
                  const updatedTeamData = {
                    ...teamData,
                    tasks: {
                      ...teamData.tasks,
                      [dateStr]: {
                        ...dayTasks,
                        [targetUid]: [
                          ...userTasks,
                          {
                            id: Date.now().toString(),
                            text,
                            completed: false,
                            createdAt: new Date().toISOString(),
                            ownerUid: targetUid,
                            assigneeIds: [targetUid],
                            completedAt: null,
                            ...(imageUrl ? {
                              imageUrl,
                              imageName,
                              imagePublicId,
                              imageBytes,
                              imageUploadedAt: new Date().toISOString()
                            } : {})
                          }
                        ]
                      }
                    }
                  };
                  setTeamData(updatedTeamData);
                  saveToFirestore({ teamData: updatedTeamData });
                }} 
                changeDay={(offset) => {
                  const d = new Date(selectedDate);
                  d.setDate(d.getDate() + offset);
                  const newDateStr = formatDate(d);
                  setSelectedDate(newDateStr);
                  setCurrentDate(new Date(d.getFullYear(), d.getMonth(), 1));
                }} 
                currentUserUid={currentUser.id} 
                deleteTask={(dateStr, targetUid, taskId) => {
                  const updatedTeamData = {
                    ...teamData,
                    tasks: { ...teamData.tasks, [dateStr]: { ...(teamData.tasks[dateStr] || {}), [targetUid]: (teamData.tasks[dateStr]?.[targetUid] || []).filter(t => t.id !== taskId) } }
                  };
                  setTeamData(updatedTeamData);
                  saveToFirestore({ teamData: updatedTeamData });
                }} 
                updateTaskAssignees={async (ownerUid, dateStr, taskId, assigneeIds) => {
                  const dayTasks = teamData.tasks[dateStr] || {};
                  const ownerTasks = dayTasks[ownerUid] || [];
                  const targetTask = ownerTasks.find(t => t.id === taskId);
                  if (!targetTask) throw new Error('対象タスクが見つかりません。');

                  const updatedOwnerTasks = ownerTasks.map(t =>
                    t.id === taskId ? { ...t, assigneeIds: [...assigneeIds] } : t
                  );
                  const updatedTeamData = {
                    ...teamData,
                    tasks: {
                      ...teamData.tasks,
                      [dateStr]: {
                        ...dayTasks,
                        [ownerUid]: updatedOwnerTasks
                      }
                    }
                  };

                  // 担当者変更はteamData全体ではなく対象ユーザーのタスク配列だけを保存。
                  // 古いsnapshotとの競合で変更直後に元へ戻るのを防ぐ。
                  setTeamData(updatedTeamData);
                  await updateDoc(doc(db, 'app_data', 'shared_state'), {
                    [`teamData.tasks.${dateStr}.${ownerUid}`]: updatedOwnerTasks
                  });
                }} 
                roleNames={roleNames} 
                roles={roles} 
                selectedDate={selectedDate} 
                shiftTypes={shiftTypes} 
                teamData={teamData} 
                toggleTask={async (dateStr, targetUid, taskId) => {
                  const dayTasks = teamData.tasks[dateStr] || {};
                  const ownerTasks = dayTasks[targetUid] || [];
                  const targetTask = ownerTasks.find(t => t.id === taskId);
                  if (!targetTask) return;

                  const targetUserRole = roles[currentUser.role];
                  const isAdmin = !!targetUserRole && (targetUserRole.level || 0) >= 40;
                  if (!isAdmin && targetUid !== currentUser.id) {
                    alert('他のメンバーが担当するタスクは操作できません。');
                    return;
                  }

                  const nextCompleted = !targetTask.completed;
                  const updatedOwnerTasks = ownerTasks.map(t =>
                    t.id === taskId
                      ? { ...t, completed: nextCompleted, completedAt: nextCompleted ? new Date().toISOString() : null }
                      : t
                  );
                  const updatedTeamData = {
                    ...teamData,
                    tasks: {
                      ...teamData.tasks,
                      [dateStr]: {
                        ...dayTasks,
                        [targetUid]: updatedOwnerTasks
                      }
                    }
                  };
                  setTeamData(updatedTeamData);
                  try {
                    await updateDoc(doc(db, 'app_data', 'shared_state'), {
                      ['teamData.tasks.' + dateStr + '.' + targetUid]: updatedOwnerTasks
                    });
                  } catch (error) {
                    console.error('タスク完了状態の保存に失敗しました:', error);
                    setTeamData(teamData);
                    alert('タスクの完了状態を保存できませんでした。もう一度お試しください。');
                  }
                }} 
                updateTaskText={(dateStr, targetUid, taskId, newText) => {
                  const updatedTeamData = {
                    ...teamData,
                    tasks: { ...teamData.tasks, [dateStr]: { ...(teamData.tasks[dateStr] || {}), [targetUid]: (teamData.tasks[dateStr]?.[targetUid] || []).map(t => t.id === taskId ? { ...t, text: newText } : t) } }
                  };
                  setTeamData(updatedTeamData);
                  saveToFirestore({ teamData: updatedTeamData });
                }} 
                users={users}
                sortedUsers={sortedUsers}
              />
            ) : (
              <SettingsView 
                currentUserUid={currentUser.id} 
                debugLogs={debugLogs}
                roleNames={roleNames} 
                roles={roles} 
                deleteUserCompletely={deleteUserCompletely}
                updateRoleNames={(newRoleNames) => {
                  setRoleNames(newRoleNames);
                  saveToFirestore({ roleNames: newRoleNames });
                }} 
                updateRoles={(newRoles) => {
                  setRoles(newRoles);
                  saveToFirestore({ roles: newRoles });
                }} 
                updateShiftTypes={(newShiftTypes) => {
                  setShiftTypes(newShiftTypes);
                  saveToFirestore({ shiftTypes: newShiftTypes });
                }} 
                updateUsers={(newUsers) => {
                  const previousUsers = users;
                  Object.keys(newUsers).forEach(uid => {
                    if (JSON.stringify(previousUsers?.[uid]) !== JSON.stringify(newUsers[uid])) {
                      pendingUserOverridesRef.current[uid] = newUsers[uid];
                    }
                  });
                  Object.keys(previousUsers || {}).forEach(uid => {
                    if (!newUsers[uid]) delete pendingUserOverridesRef.current[uid];
                  });

                  setUsers(newUsers);
                  if (currentUser?.id && newUsers[currentUser.id]) {
                    setCurrentUser(newUsers[currentUser.id]);
                    localStorage.setItem('google_user', JSON.stringify(newUsers[currentUser.id]));
                  }
                  saveUsersToFirestore(newUsers, previousUsers);
                }} 
                shiftTypes={shiftTypes} 
                users={users}
                sortedUsers={sortedUsers}
                userOrder={userOrder}
                updateUserOrder={(newOrder) => {
                  setUserOrder(newOrder);
                  saveToFirestore({ userOrder: newOrder });
                }}
              />
            )}

            <BottomNav activeTab={activeTab} currentUser={currentUser} roles={roles} setActiveTab={setActiveTab}/>
          </div>
        </div>
      )}
    </GoogleOAuthProvider>
  );
}