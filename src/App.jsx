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
  Loader2,
  BookOpen
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

const getPartnerUpdates = (item) => {
  if (Array.isArray(item?.updates) && item.updates.length) return item.updates;
  if (item?.content) return [{ id: `legacy_${item.id || Date.now()}`, text: item.content, authorUid: item.createdByUid || '', authorName: item.createdByName || '登録時の内容', createdAt: item.createdAt || null }];
  return [];
};
const getPartnerHandoffUpdates = (item) => {
  const updates = getPartnerUpdates(item);
  return updates.filter((update, index) => update?.kind === 'handoff' || (!update?.kind && index > 0));
};
const hasUnreadPartnerHandoff = (item, userUid) => {
  if (!userUid) return false;
  const handoffs = getPartnerHandoffUpdates(item);
  if (!handoffs.length) return false;
  const latest = handoffs[handoffs.length - 1];
  return item?.handoffReadBy?.[userUid] !== latest.id;
};
const createPartnerUpdate = (text, user, image = null, kind = 'handoff') => ({
  id: `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  text: String(text || '').trim(),
  authorUid: user?.id || '',
  authorName: user?.name || '不明なユーザー',
  createdAt: new Date().toISOString(),
  kind,
  ...(image?.imageUrl ? { imageUrl: image.imageUrl, imageName: image.imageName || '', imagePublicId: image.imagePublicId || '', imageBytes: Number(image.imageBytes || 0) } : {})
});

const PartnerUpdateHistory = ({ item }) => {
  const updates = getPartnerUpdates(item);
  if (!updates.length) return null;
  return <div className="rounded-lg border border-gray-200 bg-gray-50 p-2.5 space-y-1.5 max-h-48 overflow-y-auto">
    <div className="text-[10px] font-bold text-gray-500">これまでの申し送り</div>
    {updates.map(update => <div key={update.id} className="bg-white rounded-md border border-gray-100 px-2.5 py-2">
      <div className="text-[9px] font-bold text-gray-500">（{update.authorName || '不明なユーザー'}）{update.createdAt ? ' ・ ' + new Date(update.createdAt).toLocaleString('ja-JP') : ''}</div>
      <div className="text-xs text-gray-700 whitespace-pre-wrap break-words mt-0.5">{update.text}</div>{update.imageUrl&&<img src={update.imageUrl} alt="添付画像" className="mt-2 max-h-48 w-auto max-w-full rounded-lg border object-contain"/>}
    </div>)}
  </div>;
};

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

const getJapaneseHolidayMap = (year) => {
  const holidays = {};
  const nationalHolidayKeys = [];
  const addHoliday = (month, day, name) => {
    const key = String(year) + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
    holidays[key] = name;
    nationalHolidayKeys.push(key);
  };
  const nthWeekday = (month, weekday, occurrence) => {
    const firstDay = new Date(year, month - 1, 1).getDay();
    return 1 + ((weekday - firstDay + 7) % 7) + (occurrence - 1) * 7;
  };
  const equinoxDay = (spring) => {
    if (year >= 1980 && year <= 2099) {
      const base = spring ? 20.8431 : 23.2488;
      return Math.floor(base + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
    }
    return spring ? 20 : 23;
  };

  addHoliday(1, 1, '元日');
  if (year >= 2000) addHoliday(1, nthWeekday(1, 1, 2), '成人の日');
  else addHoliday(1, 15, '成人の日');
  if (year >= 1967) addHoliday(2, 11, '建国記念の日');
  if (year >= 2020) addHoliday(2, 23, '天皇誕生日');
  else if (year >= 1989 && year <= 2018) addHoliday(12, 23, '天皇誕生日');
  else if (year < 1989) addHoliday(4, 29, '天皇誕生日');

  addHoliday(3, equinoxDay(true), '春分の日');

  if (year >= 2007) addHoliday(4, 29, '昭和の日');
  else if (year >= 1989) addHoliday(4, 29, 'みどりの日');
  addHoliday(5, 3, '憲法記念日');
  if (year >= 2007) addHoliday(5, 4, 'みどりの日');
  addHoliday(5, 5, 'こどもの日');

  if (year === 2020) addHoliday(7, 23, '海の日');
  else if (year === 2021) addHoliday(7, 22, '海の日');
  else if (year >= 2003) addHoliday(7, nthWeekday(7, 1, 3), '海の日');
  else if (year >= 1996) addHoliday(7, 20, '海の日');

  if (year === 2020) addHoliday(8, 10, '山の日');
  else if (year === 2021) addHoliday(8, 8, '山の日');
  else if (year >= 2016) addHoliday(8, 11, '山の日');

  if (year >= 2003) addHoliday(9, nthWeekday(9, 1, 3), '敬老の日');
  else if (year >= 1966) addHoliday(9, 15, '敬老の日');
  addHoliday(9, equinoxDay(false), '秋分の日');

  if (year === 2020) addHoliday(7, 24, 'スポーツの日');
  else if (year === 2021) addHoliday(7, 23, 'スポーツの日');
  else if (year >= 2000) addHoliday(10, nthWeekday(10, 1, 2), year >= 2020 ? 'スポーツの日' : '体育の日');
  else addHoliday(10, 10, '体育の日');

  addHoliday(11, 3, '文化の日');
  addHoliday(11, 23, '勤労感謝の日');

  // 2019年の天皇即位に伴う特別な休日。
  if (year === 2019) {
    addHoliday(5, 1, '天皇の即位の日');
    addHoliday(10, 22, '即位礼正殿の儀');
  }

  // 祝日に挟まれた平日を「国民の休日」とする（祝日法第3条第3項）。
  const baseHolidayKeys = [...nationalHolidayKeys];
  const isNextDay = (key, offset) => {
    const date = new Date(key + 'T12:00:00');
    date.setDate(date.getDate() + offset);
    return formatDate(date);
  };
  const start = new Date(year, 0, 2);
  const end = new Date(year, 11, 30);
  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const key = formatDate(date);
    if (!holidays[key] && holidays[isNextDay(key, -1)] && holidays[isNextDay(key, 1)]) {
      holidays[key] = '国民の休日';
    }
  }

  // 祝日が日曜日の場合、その後の祝日でない日に振替休日を置く。
  baseHolidayKeys.forEach((key) => {
    const date = new Date(key + 'T12:00:00');
    if (date.getDay() !== 0) return;
    do {
      date.setDate(date.getDate() + 1);
    } while (holidays[formatDate(date)]);
    holidays[formatDate(date)] = '振替休日';
  });

  return holidays;
};

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
  const [partnerEditSubject, setPartnerEditSubject] = useState('');
  const [partnerEditAssigneeUid, setPartnerEditAssigneeUid] = useState('');
  const [partnerEditDate, setPartnerEditDate] = useState('');
  const [partnerEditHour, setPartnerEditHour] = useState('');
  const [partnerEditMinute, setPartnerEditMinute] = useState('');
  const [partnerEditEndTime, setPartnerEditEndTime] = useState('');
  const [partnerEditContent, setPartnerEditContent] = useState('');
  const [partnerEditNote, setPartnerEditNote] = useState('');
  const [partnerEditImage, setPartnerEditImage] = useState(null);
  const [partnerEditImagePreview, setPartnerEditImagePreview] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedPartnerImage, setSelectedPartnerImage] = useState(null);
  const [partnerImageScale, setPartnerImageScale] = useState(1);
  const [partnerImagePosition, setPartnerImagePosition] = useState({ x: 0, y: 0 });
  const partnerPinchRef = useRef(null);
  const partnerPanRef = useRef(null);
  const isAdmin = currentUser?.role === 'admin' || (roles?.[currentUser?.role]?.level || 0) >= 40;
  const canEditTask = detailTask && (isAdmin || detailTask.ownerUid === currentUserUid);
  const todayStr = formatDate(new Date());
  const [selectedCalendarTaskDate, setSelectedCalendarTaskDate] = useState(todayStr);
  const year = currentDate.getFullYear(), month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month), firstDayOfWeek = new Date(year, month, 1).getDay();
  const holidays = getJapaneseHolidayMap(year);
  const days = [];
  for (let i=0;i<firstDayOfWeek;i++) days.push(<div key={`empty-${i}`} className="p-2 border-b border-r border-gray-100 bg-gray-50/50 min-h-[80px]"></div>);
  for (let i=1;i<=daysInMonth;i++) {
    const dateStr=formatDate(new Date(year,month,i));
    const myShiftId=(teamData.shifts[dateStr]||{})[currentUserUid]||'none';
    const myShift=shiftTypes.find(s=>s.id===myShiftId)||shiftTypes.find(s=>s.id==='none');
    const hasMyTask=teamData.tasks[dateStr]?.[currentUserUid]?.some(task => task?.visibility !== 'private');
    const isPastDate=dateStr<todayStr;
    const holidayName=holidays[dateStr] || '';
    const isHoliday=!!holidayName;
    days.push(<div key={i} onClick={()=>setSelectedCalendarTaskDate(dateStr)} title={holidayName || undefined} className={`p-1 border-b border-r border-gray-100 min-h-[80px] cursor-pointer active:bg-gray-50 flex flex-col ${isPastDate?'bg-gray-200':isHoliday?'bg-rose-50':''}`}>
      <div className="flex justify-between items-start p-1"><span className={`text-sm font-bold ${new Date().getDate()===i&&new Date().getMonth()===month?'bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center':isPastDate?'text-gray-400':isHoliday?'text-red-600':'text-gray-700'}`}>{i}</span>{hasMyTask&&<div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5"></div>}</div>
      {holidayName && <div className="px-1 mt-0.5 text-[9px] leading-tight font-bold text-red-600 break-words line-clamp-2">{holidayName}</div>}
      <div className="mt-1 flex-1 px-1">{myShift.id!=='none'&&<div className={`text-[10px] font-bold px-1.5 py-0.5 rounded truncate ${myShift.color}`}>{myShift.label}</div>}</div>
    </div>);
  }
  const activePartnerItems=(partnerItems||[]).filter(i=>!i.completed).sort((a,b)=>`${a.date||''}T${a.time||'00:00'}`.localeCompare(`${b.date||''}T${b.time||'00:00'}`));
  const datesToShow=Array.from(new Set([...Object.keys(teamData.tasks||{}).filter(d=>d<todayStr),selectedCalendarTaskDate])).sort();
  const selectedTasks=datesToShow.flatMap(taskDate=>(sortedUsers||[]).flatMap(member=>(teamData.tasks[taskDate]?.[member.id]||[]).filter(t=>t.visibility!=='private'&&!t.completed).map(task=>({...task,ownerUid:member.id,member,taskDate,assigneeIds:Array.isArray(task.assigneeIds)&&task.assigneeIds.length?task.assigneeIds:[member.id]}))));
  const startPartnerEdit=()=>{const [h='',m='']=String(detailPartner?.time||'').split(':');setPartnerEditName(detailPartner?.partnerName||'');setPartnerEditSubject(detailPartner?.subject||'');setPartnerEditAssigneeUid(detailPartner?.assigneeUid||'');setPartnerEditDate(detailPartner?.date||'');setPartnerEditHour(h);setPartnerEditMinute(m);setPartnerEditEndTime(detailPartner?.endTime||'');setPartnerEditContent(detailPartner?.content||'');setPartnerEditNote('');setIsEditingPartner(true);};
  const handlePartnerEditImageChange=(e)=>{const file=e.target.files?.[0];if(!file)return;if(!file.type.startsWith('image/')){alert('画像ファイルを選択してください。');e.target.value='';return;}if(file.size>10*1024*1024){alert('画像は10MB以下にしてください。');e.target.value='';return;}if(partnerEditImagePreview)URL.revokeObjectURL(partnerEditImagePreview);setPartnerEditImage(file);setPartnerEditImagePreview(URL.createObjectURL(file));};
  const clearPartnerEditImage=()=>{if(partnerEditImagePreview)URL.revokeObjectURL(partnerEditImagePreview);setPartnerEditImage(null);setPartnerEditImagePreview('');};
  const openPartnerImage=(imageUrl,imageName='添付画像')=>{setSelectedPartnerImage({imageUrl,imageName});setPartnerImageScale(1);setPartnerImagePosition({x:0,y:0});};
  const closePartnerImage=()=>{setSelectedPartnerImage(null);setPartnerImageScale(1);setPartnerImagePosition({x:0,y:0});partnerPinchRef.current=null;partnerPanRef.current=null;};
  const getPartnerTouchDistance=(touches)=>{if(touches.length<2)return 0;const dx=touches[0].clientX-touches[1].clientX;const dy=touches[0].clientY-touches[1].clientY;return Math.hypot(dx,dy);};
  const getPartnerTouchCenter=(touches)=>({x:(touches[0].clientX+touches[1].clientX)/2,y:(touches[0].clientY+touches[1].clientY)/2});
  const handlePartnerImageTouchStart=(e)=>{
    if(e.touches.length===2){
      const distance=getPartnerTouchDistance(e.touches);
      const center=getPartnerTouchCenter(e.touches);
      partnerPinchRef.current={distance,scale:partnerImageScale,center,startPosition:{...partnerImagePosition}};
      partnerPanRef.current=null;
    }else if(e.touches.length===1&&partnerImageScale>1){
      partnerPanRef.current={startX:e.touches[0].clientX,startY:e.touches[0].clientY,startPosition:{...partnerImagePosition}};
    }
  };
  const handlePartnerImageTouchMove=(e)=>{
    if(e.touches.length===2&&partnerPinchRef.current){
      const distance=getPartnerTouchDistance(e.touches);
      if(!distance)return;
      e.preventDefault();
      const ratio=distance/partnerPinchRef.current.distance;
      const nextScale=Math.min(4,Math.max(0.5,Number((partnerPinchRef.current.scale*ratio).toFixed(2))));
      const center=getPartnerTouchCenter(e.touches);
      const dx=center.x-partnerPinchRef.current.center.x;
      const dy=center.y-partnerPinchRef.current.center.y;
      setPartnerImageScale(nextScale);
      setPartnerImagePosition({x:partnerPinchRef.current.startPosition.x+dx,y:partnerPinchRef.current.startPosition.y+dy});
    }else if(e.touches.length===1&&partnerPanRef.current&&partnerImageScale>1){
      e.preventDefault();
      const dx=e.touches[0].clientX-partnerPanRef.current.startX;
      const dy=e.touches[0].clientY-partnerPanRef.current.startY;
      setPartnerImagePosition({x:partnerPanRef.current.startPosition.x+dx,y:partnerPanRef.current.startPosition.y+dy});
    }
  };
  const handlePartnerImageTouchEnd=(e)=>{
    if(e.touches.length<2)partnerPinchRef.current=null;
    if(e.touches.length===0)partnerPanRef.current=null;
    else if(e.touches.length===1&&partnerImageScale>1){
      partnerPanRef.current={startX:e.touches[0].clientX,startY:e.touches[0].clientY,startPosition:{...partnerImagePosition}};
    }
  };
  const handlePartnerImageMouseDown=(e)=>{
    if(partnerImageScale<=1)return;
    e.preventDefault();
    partnerPanRef.current={startX:e.clientX,startY:e.clientY,startPosition:{...partnerImagePosition}};
  };
  const handlePartnerImageMouseMove=(e)=>{
    if(!partnerPanRef.current||partnerImageScale<=1)return;
    e.preventDefault();
    const dx=e.clientX-partnerPanRef.current.startX;
    const dy=e.clientY-partnerPanRef.current.startY;
    setPartnerImagePosition({x:partnerPanRef.current.startPosition.x+dx,y:partnerPanRef.current.startPosition.y+dy});
  };
  const handlePartnerImageMouseUp=()=>{partnerPanRef.current=null;};
  const savePartnerEdit=async()=>{if(!detailPartner||!updatePartnerItem)return;if(!partnerEditName||!partnerEditSubject.trim()||!partnerEditAssigneeUid||!partnerEditDate||!partnerEditHour||!partnerEditMinute){alert('パートナー名・件名・主担当者・日付・時間を入力してください。');return;}const noteText=partnerEditNote.trim();if(!noteText&&!partnerEditImage){alert('申し送り内容または画像を入力してください。');return;}setIsSaving(true);try{const changes={partnerName:partnerEditName,subject:partnerEditSubject.trim(),assigneeUid:partnerEditAssigneeUid,date:partnerEditDate,time:`${partnerEditHour}:${partnerEditMinute}`,endTime:partnerEditEndTime};let imageData=null;if(partnerEditImage){const result=await uploadTaskImageToCloudinary(partnerEditImage);imageData={imageUrl:result.secure_url||result.url||'',imageName:partnerEditImage.name,imagePublicId:result.public_id||'',imageBytes:Number(result.bytes||partnerEditImage.size||0)};}const updates=[...getPartnerUpdates(detailPartner),createPartnerUpdate(noteText,currentUser,imageData)];changes.updates=updates;changes.content=updates[updates.length-1]?.text||detailPartner.content||'';await updatePartnerItem(detailPartner.id,changes);setDetailPartner(p=>p?{...p,...changes}:p);setIsEditingPartner(false);setPartnerEditNote('');clearPartnerEditImage();}catch(e){console.error('パートナー申し送り画像の保存に失敗しました:',e);alert(`パートナータスクの更新に失敗しました。\n${e?.message||'画像のアップロードに失敗しました。'}`);}finally{setIsSaving(false);}};
  const saveTaskEdit=async()=>{if(!detailTask||!canEditTask)return;setIsSaving(true);try{const text=editingTaskText.trim();await updateTaskText(detailTask.taskDate,detailTask.ownerUid,detailTask.id,text);setDetailTask(p=>p?{...p,text}:p);setIsEditingTask(false);}catch(e){alert('タスクの更新に失敗しました。');}finally{setIsSaving(false);}};
  const removeTask=async()=>{if(!detailTask||!canEditTask)return;if(!window.confirm('このタスクを削除してもよろしいですか？'))return;await deleteTask(detailTask.taskDate,detailTask.ownerUid,detailTask.id);setDetailTask(null);};
  const finishTask=async()=>{if(!detailTask||!canEditTask)return;await toggleTask(detailTask.taskDate,detailTask.ownerUid,detailTask.id);setDetailTask(null);};

  return <div className="flex-1 flex flex-col bg-gray-50 pb-[68px] overflow-hidden">
    <div className="bg-white px-4 py-3 flex items-center justify-between shadow-sm z-10 shrink-0 md:border-b md:border-gray-200"><button onClick={()=>changeMonth(-1)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full"><ChevronLeft className="w-5 h-5"/></button><h2 className="text-base font-bold text-gray-800">{year}年 {month+1}月</h2><button onClick={()=>changeMonth(1)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full"><ChevronRight className="w-5 h-5"/></button></div>
    <div className="flex-1 overflow-y-auto bg-white"><div className="md:grid md:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)] md:items-start md:gap-3 md:p-3">
      <div className="min-w-0 md:border md:border-gray-200 md:rounded-xl md:overflow-hidden"><div className="grid grid-cols-7 border-b border-gray-200 sticky top-0 bg-white z-10 shadow-sm">{DAYS_OF_WEEK.map((d,i)=><div key={d} className={`py-2 text-center text-[10px] font-bold ${i===0?'text-red-500':i===6?'text-blue-500':'text-gray-500'}`}>{d}</div>)}</div><div className="grid grid-cols-7 border-l border-gray-100">{days}</div></div>
      <div className="min-w-0 md:space-y-3">
        <div className="border-t border-gray-200 bg-blue-50/40 px-3 py-2"><div className="flex items-center justify-between mb-1.5"><h3 className="text-[11px] font-bold text-gray-600">パートナータスク</h3><span className="text-[9px] text-gray-400">{activePartnerItems.length}件</span></div>{activePartnerItems.length===0?<p className="text-[10px] text-gray-400 py-1">登録されている未終了のパートナータスクはありません</p>:<div className="space-y-1.5">{activePartnerItems.map(item=><button type="button" key={item.id} onClick={async ()=>{setDetailPartner(item);setIsEditingPartner(false);const handoffs=getPartnerHandoffUpdates(item);const latest=handoffs[handoffs.length-1];if(latest?.id&&item?.handoffReadBy?.[currentUserUid]!==latest.id){try{await updatePartnerItem(item.id,{handoffReadBy:{...(item.handoffReadBy||{}),[currentUserUid]:latest.id}});}catch(e){console.error("申し送り確認状態の保存に失敗しました:",e);}}}} className="w-full bg-white border border-blue-100 rounded-md px-2 py-1.5 flex items-center gap-2 min-w-0 text-left hover:border-blue-300 active:bg-blue-50">{item.date&&item.date<todayStr?<span className="shrink-0 text-[8px] font-bold text-red-500 whitespace-nowrap">未終了 {item.date.replace(/-/g,'/')}</span>:<span className="shrink-0 text-[8px] font-bold text-blue-600 whitespace-nowrap">{item.date?item.date.replace(/-/g,'/'):'日付なし'}</span>}<span className="shrink-0 text-[8px] text-gray-500">{item.time||'--:--'}</span>{item.endTime&&<span className="shrink-0 text-[8px] text-orange-600">終了 {item.endTime}</span>}<span className="shrink-0 max-w-24 text-[9px] font-bold text-purple-600 truncate">{item.partnerName||'パートナー未設定'}</span><span className="min-w-0 flex-1 text-[10px] font-bold text-gray-800 truncate">{item.subject||(item.content||'').split(/\r?\n/)[0]||'件名未設定'}</span>{hasUnreadPartnerHandoff(item,currentUserUid)&&<span className="shrink-0 w-1.5 h-1.5 bg-blue-500 rounded-full shrink-0 mt-1" title="申し送りあり" aria-label="申し送りあり"></span>}</button>)}</div>}</div>
        <div className="border-t border-gray-200 bg-gray-50 px-3 py-2"><div className="flex items-center justify-between mb-1.5"><h3 className="text-[11px] font-bold text-gray-600">本日のタスク（全員）</h3><span className="text-[9px] text-gray-400">{selectedCalendarTaskDate.replace(/-/g,'/')}・{selectedTasks.length}件</span></div>{selectedTasks.length===0?<p className="text-[10px] text-gray-400 py-1">本日までに終了していないタスクはありません</p>:<div className="space-y-1.5">{selectedTasks.map(task=><button type="button" key={`${task.taskDate}-${task.ownerUid}-${task.id}`} onClick={()=>{setDetailTask(task);setSelectedAssigneeIds(task.assigneeIds);setAssigneeUpdateMessage('');setIsEditingTask(false);}} className="w-full text-left bg-white border rounded-md px-2 py-1.5 flex items-center gap-2 min-w-0 hover:border-purple-300 active:bg-purple-50">{task.taskDate<todayStr&&<span className="shrink-0 text-[8px] font-bold text-red-500 whitespace-nowrap">対象日 {task.taskDate.replace(/-/g,'/')}</span>}<span className="min-w-0 flex-1 text-[10px] truncate text-gray-700"><span className="font-bold">{task.subject||task.text||'📷 画像タスク'}</span>{task.subject&&task.text&&<span className="ml-1 text-gray-500">{task.text}</span>}</span><span className="shrink-0 text-[8px] text-orange-600">終了予定 {task.endTime||'未設定'}</span><span className="shrink-0 max-w-32 text-[8px] text-purple-600 truncate">担当: {task.assigneeIds.map(id=>sortedUsers.find(u=>u.id===id)?.name?.split(' ')[0]||'').filter(Boolean).join('・')}</span><span className="shrink-0 text-[8px] text-gray-400">開始 {task.createdAt?new Date(task.createdAt).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'}):'--:--'}</span></button>)}</div>}</div>
      </div>
    </div>
    {detailPartner&&<div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-2 sm:p-4" onClick={()=>setDetailPartner(null)}><div className="w-full max-w-md max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col" onClick={e=>e.stopPropagation()}><div className="px-4 py-3 border-b flex items-center justify-between shrink-0"><div><div className="text-sm font-bold text-gray-800">パートナータスク詳細</div><div className="text-[10px] text-gray-400">{detailPartner.date?.replace(/-/g,'/')} {detailPartner.time||'--:--'} ・ 終了予定 {detailPartner.endTime||'未設定'}</div></div><button onClick={()=>setDetailPartner(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-full"><X size={18}/></button></div><div className="p-4 space-y-3 overflow-y-auto min-h-0 flex-1">{isEditingPartner?<><select value={partnerEditName} onChange={e=>setPartnerEditName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">パートナーを選択</option>{(partnerNames||[]).map(n=><option key={n} value={n}>{n}</option>)}</select><input type="text" value={partnerEditSubject} onChange={e=>setPartnerEditSubject(e.target.value)} placeholder="件名" className="w-full border rounded-lg px-3 py-2 text-sm"/><select value={partnerEditAssigneeUid} onChange={e=>setPartnerEditAssigneeUid(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">主担当者を選択</option>{(sortedUsers||[]).map(user=><option key={user.id} value={user.id}>{user.name}</option>)}</select><div className="grid grid-cols-2 gap-2"><input type="date" value={partnerEditDate} onChange={e=>setPartnerEditDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm"/><div className="flex gap-1"><select value={partnerEditHour} onChange={e=>setPartnerEditHour(e.target.value)} className="w-1/2 border rounded-lg px-1 py-2 text-sm"><option value="">時</option>{Array.from({length:24},(_,i)=>String(i).padStart(2,'0')).map(v=><option key={v} value={v}>{v}</option>)}</select><select value={partnerEditMinute} onChange={e=>setPartnerEditMinute(e.target.value)} className="w-1/2 border rounded-lg px-1 py-2 text-sm"><option value="">分</option>{['00','15','30','45'].map(v=><option key={v} value={v}>{v}</option>)}</select></div><label className="block"><span className="text-[10px] font-bold text-gray-500">終了予定時刻</span><div className="flex items-center gap-1"><select aria-label="終了予定時刻の時" value={partnerEditEndTime ? partnerEditEndTime.split(':')[0] : ''} onChange={e=>setPartnerEditEndTime(e.target.value ? e.target.value+':'+((partnerEditEndTime||'').split(':')[1]||'00') : '')} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" ><option value="">時</option>{Array.from({length:24},(_,i)=>String(i).padStart(2,'0')).map(v=><option key={v} value={v}>{v}</option>)}</select><span>:</span><select aria-label="終了予定時刻の分" value={partnerEditEndTime ? partnerEditEndTime.split(':')[1] : ''} onChange={e=>setPartnerEditEndTime(((partnerEditEndTime||'').split(':')[0]||'00')+':'+e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" ><option value="">分</option>{['00','15','30','45'].map(v=><option key={v} value={v}>{v}</option>)}</select></div></label></div><div className="space-y-2"><PartnerUpdateHistory item={detailPartner}/><div><div className="text-[10px] font-bold text-gray-500 mb-1">今回の申し送り・追記</div><textarea value={partnerEditNote} onChange={e=>setPartnerEditNote(e.target.value)} rows={5} placeholder="今回追加する申し送りを入力" className="w-full border rounded-lg px-3 py-2 text-sm resize-y"/><div className="mt-2 flex items-center gap-2"><label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 text-gray-700 text-xs font-bold cursor-pointer hover:bg-gray-200"><ImageIcon size={15}/><span>画像を追加</span><input type="file" accept="image/*" className="hidden" onChange={handlePartnerEditImageChange}/></label>{partnerEditImage&&<button type="button" onClick={clearPartnerEditImage} className="text-xs text-red-500 font-bold">画像を削除</button>}</div>{partnerEditImagePreview&&<img src={partnerEditImagePreview} alt="追加画像プレビュー" className="mt-2 max-h-48 w-auto max-w-full rounded-lg border object-contain"/>}<p className="text-[9px] text-gray-400 mt-1">画像は10MB以下。文章だけでも、画像だけでも保存できます。</p></div></div><div className="flex gap-2 sticky bottom-0 bg-white pt-2 pb-1 border-t border-gray-100"><button type="button" onClick={()=>setIsEditingPartner(false)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold">キャンセル</button><button type="button" disabled={isSaving} onClick={savePartnerEdit} className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold"><span>{isSaving?'保存中…':'変更を保存'}</span></button></div></>:<><div className="text-xs font-bold text-purple-600">{detailPartner.partnerName||'パートナー未設定'}</div><div className="text-base font-bold text-gray-800">{detailPartner.subject||(detailPartner.content||'').split(/\r?\n/)[0]||'件名未設定'}</div>{((detailPartner.updates||[]).some(u=>u?.kind==='handoff')||(detailPartner.updates||[]).length>1)&&<div className="inline-flex px-2 py-1 rounded-full bg-orange-50 text-orange-700 text-[10px] font-bold">申し送りあり</div>}<div className="text-xs font-bold text-blue-600">主担当: {(sortedUsers||[]).find(user=>user.id===detailPartner.assigneeUid)?.name||'未設定'}</div><div className="space-y-2 max-h-64 overflow-y-auto pr-1">{getPartnerUpdates(detailPartner).map(update=><div key={update.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"><div className="text-[9px] font-bold text-gray-500 mb-1">（{update.authorName||'不明なユーザー'}）</div><div className="text-sm text-gray-700 whitespace-pre-wrap break-words">{update.text}</div>{update.imageUrl&&<button type="button" onClick={()=>openPartnerImage(update.imageUrl,update.imageName)} className="mt-2 block w-full text-left"><img src={update.imageUrl} alt={update.imageName||'添付画像'} className="max-h-72 w-auto max-w-full rounded-lg border object-contain mx-auto cursor-zoom-in"/></button>}{update.createdAt&&<div className="text-[8px] text-gray-400 mt-1">{new Date(update.createdAt).toLocaleString('ja-JP')}</div>}</div>)}</div>{detailPartner.imageUrl&&<button type="button" onClick={()=>openPartnerImage(detailPartner.imageUrl,detailPartner.imageName)} className="block w-full"><img src={detailPartner.imageUrl} alt={detailPartner.imageName||'添付画像'} className="max-h-72 w-auto max-w-full rounded-lg border object-contain mx-auto cursor-zoom-in"/></button>}<button type="button" onClick={startPartnerEdit} className="w-full py-2.5 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold flex items-center justify-center gap-1.5"><Edit2 size={14}/><span>編集</span></button></>}</div></div></div>}
    {selectedPartnerImage&&<div className="fixed inset-0 z-[70] bg-black/90 flex flex-col" onClick={closePartnerImage}>
      <div className="shrink-0 flex items-center justify-between px-3 py-2 text-white bg-black/60" onClick={e=>e.stopPropagation()}>
        <div className="text-xs font-bold truncate pr-2">{selectedPartnerImage.imageName||'添付画像'}</div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={()=>{setPartnerImageScale(1);setPartnerImagePosition({x:0,y:0});}} className="px-2 h-9 rounded-lg bg-white/15 text-[10px] font-bold">{Math.round(partnerImageScale*100)}%</button>
          <span className="hidden sm:inline text-[10px] text-white/70 px-1">拡大後はドラッグで移動 / 2本指で拡大・縮小</span>
          <button type="button" onClick={closePartnerImage} className="w-9 h-9 rounded-lg bg-white/15 text-lg font-bold">×</button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center p-3" onClick={e=>e.stopPropagation()}>
        <img src={selectedPartnerImage.imageUrl} alt={selectedPartnerImage.imageName||'添付画像'}
          style={{transform:'translate('+partnerImagePosition.x+'px, '+partnerImagePosition.y+'px) scale('+partnerImageScale+')',transformOrigin:'center center'}}
          className={`max-w-none max-h-none object-contain transition-transform duration-150 touch-none select-none ${partnerImageScale>1?'cursor-grab active:cursor-grabbing':'cursor-zoom-in'}`}
          onDoubleClick={()=>{const nextScale=partnerImageScale===1?2:1;setPartnerImageScale(nextScale);if(nextScale===1)setPartnerImagePosition({x:0,y:0});}}
          onMouseDown={handlePartnerImageMouseDown}
          onMouseMove={handlePartnerImageMouseMove}
          onMouseUp={handlePartnerImageMouseUp}
          onMouseLeave={handlePartnerImageMouseUp}
          onTouchStart={handlePartnerImageTouchStart}
          onTouchMove={handlePartnerImageTouchMove}
          onTouchEnd={handlePartnerImageTouchEnd}
          onTouchCancel={handlePartnerImageTouchEnd}
        />
      </div>
    </div>}
    {detailTask&&<div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={()=>setDetailTask(null)}><div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden" onClick={e=>e.stopPropagation()}><div className="px-4 py-3 border-b flex items-center justify-between"><div><div className="text-sm font-bold text-gray-800">タスク詳細</div><div className="text-[10px] text-gray-400">登録者: {detailTask.member.name}</div>{!canEditTask&&<div className="text-[9px] text-gray-400">他のメンバーのタスクは操作できません</div>}</div><button onClick={()=>setDetailTask(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-full"><X size={18}/></button></div><div className="p-4 space-y-3">{isEditingTask?<><textarea value={editingTaskText} onChange={e=>setEditingTaskText(e.target.value)} rows={5} className="w-full border rounded-xl px-3 py-2.5 text-sm resize-y"/><div className="flex gap-2"><button type="button" onClick={()=>setIsEditingTask(false)} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold">キャンセル</button><button type="button" disabled={isSaving} onClick={saveTaskEdit} className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold"><span>{isSaving?'保存中…':'変更を保存'}</span></button></div></>:<><div className="text-base font-bold text-gray-800 whitespace-pre-wrap break-words">{detailTask.subject||detailTask.text||'📷 画像タスク'}</div>{detailTask.subject&&detailTask.text&&<div className="text-sm text-gray-700 whitespace-pre-wrap break-words">{detailTask.text}</div>}<div className="text-xs text-orange-600 font-bold">終了予定: {detailTask.endTime||'未設定'}</div>{detailTask.imageUrl&&<img src={detailTask.imageUrl} alt={detailTask.imageName||'添付画像'} className="max-h-64 w-auto max-w-full rounded-lg border object-contain mx-auto"/>}<div className="grid grid-cols-2 gap-2 text-[10px] text-gray-500"><div className="bg-gray-50 rounded-lg p-2">開始<br/><span className="font-bold text-gray-700">{detailTask.createdAt?new Date(detailTask.createdAt).toLocaleString('ja-JP'):'--'}</span></div><div className="bg-gray-50 rounded-lg p-2">終了<br/><span className="font-bold text-gray-700">{detailTask.completedAt?new Date(detailTask.completedAt).toLocaleString('ja-JP'):'--'}</span></div></div><div><div className="text-xs font-bold text-gray-600 mb-2">担当者（複数選択可）</div><div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">{(sortedUsers||[]).map(member=>{const checked=selectedAssigneeIds.includes(member.id);return <label key={member.id} className={`flex items-center gap-2 p-2 rounded-lg border ${canEditTask?'cursor-pointer':'cursor-not-allowed opacity-70'} ${checked?'border-purple-400 bg-purple-50':'border-gray-200'}`}><input type="checkbox" disabled={!canEditTask} checked={checked} onChange={()=>setSelectedAssigneeIds(p=>checked?p.filter(id=>id!==member.id):[...p,member.id])}/><span className="text-xs font-bold text-gray-700 truncate">{member.name.split(' ')[0]}</span></label>})}</div></div>{canEditTask&&<><button type="button" disabled={!selectedAssigneeIds.length||isUpdatingAssignees} onClick={async()=>{setIsUpdatingAssignees(true);setAssigneeUpdateMessage('');try{await updateTaskAssignees(detailTask.ownerUid,detailTask.taskDate,detailTask.id,selectedAssigneeIds);setDetailTask(p=>p?{...p,assigneeIds:[...selectedAssigneeIds]}:p);setAssigneeUpdateMessage('担当者を更新しました');}catch(e){setAssigneeUpdateMessage('担当者の更新に失敗しました。')}finally{setIsUpdatingAssignees(false);}}} className="w-full py-2.5 rounded-xl bg-purple-600 text-white text-xs font-bold disabled:opacity-40"><span>{isUpdatingAssignees?'更新中…':'担当者を更新'}</span></button><div className="flex gap-2"><button type="button" onClick={()=>{setEditingTaskText(detailTask.text||'');setIsEditingTask(true);}} className="flex-1 py-2 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold"><span>編集</span></button><button type="button" onClick={finishTask} className="flex-1 py-2 rounded-xl bg-green-50 text-green-700 text-xs font-bold"><span>終了にする</span></button><button type="button" onClick={removeTask} className="p-2 rounded-xl bg-red-50 text-red-600"><Trash2 size={16}/></button></div></>}{assigneeUpdateMessage&&<div className="text-[10px] text-green-600 font-bold">{assigneeUpdateMessage}</div>}</>}</div></div></div>}
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

  const holidays = getJapaneseHolidayMap(year);
  const todayStr = formatDate(new Date());
  const days = [];
  for(let i=1; i<=daysInMonth; i++) {
     const d = new Date(year, month, i);
     const dateStr = formatDate(d);
     days.push({ day: i, dateStr, weekDay: DAYS_OF_WEEK[d.getDay()], holiday: holidays[dateStr] || '' });
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
                <th key={d.day} title={d.holiday || undefined} className={`min-w-[48px] p-1.5 border-r border-b border-gray-200 text-center font-medium ${d.dateStr < todayStr ? (d.holiday ? 'bg-gray-200 text-red-600' : 'bg-gray-200 text-gray-400') : d.holiday ? 'bg-rose-50 text-red-600' : d.weekDay === '日' ? 'text-red-500' : d.weekDay === '土' ? 'text-blue-500' : 'text-gray-500'}`}>
                  {d.day}<br/>
                  <span className="text-[10px]">{d.weekDay}</span>
                  {d.holiday && <div className="mt-0.5 text-[8px] leading-tight text-red-600 font-bold break-words">{d.holiday}</div>}
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
                         title={d.holiday || undefined}
                         className={`p-1 border-r border-b border-gray-100 text-center cursor-pointer active:bg-gray-100 transition-colors ${d.dateStr < todayStr ? 'bg-gray-200' : d.holiday ? 'bg-rose-50/60' : ''}`}
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
  const [newTaskSubject, setNewTaskSubject] = useState('');
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskEndTime, setNewTaskEndTime] = useState('');
  const [newTaskVisibility, setNewTaskVisibility] = useState('public');
  const [selectedUserUid, setSelectedUserUid] = useState(currentUserUid);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [pastFinishConfirmTaskKey, setPastFinishConfirmTaskKey] = useState(null);
  const [newTaskImage, setNewTaskImage] = useState(null);
  const [newTaskImagePreview, setNewTaskImagePreview] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [selectedPersonalMemoKey, setSelectedPersonalMemoKey] = useState('');
  const [isEditingPersonalMemo, setIsEditingPersonalMemo] = useState(false);
  const [personalMemoEditText, setPersonalMemoEditText] = useState('');
  const [personalMemoEditImage, setPersonalMemoEditImage] = useState(null);
  const [isSavingPersonalMemo, setIsSavingPersonalMemo] = useState(false);
  const [isDeletingPersonalMemo, setIsDeletingPersonalMemo] = useState(false);
  const imageInputRef = React.useRef(null);
  
  const currentUser = users[currentUserUid];
  const viewUser = users[selectedUserUid] || currentUser;
  const canManageShift = checkCanManageShift(currentUser, roles);
  const isAdmin = !!currentUser && !!roles[currentUser.role] && (roles[currentUser.role].level || 0) >= 40;
  const canViewTask = (task, ownerUid) => task?.visibility !== 'private' || ownerUid === currentUserUid;
  const selectedDateTasks = Object.entries(teamData.tasks[selectedDate] || {}).flatMap(([ownerUid, tasks]) => (tasks || []).filter(task => { if (task?.visibility === 'private' || !canViewTask(task, ownerUid)) return false; const assignees = Array.isArray(task.assigneeIds) && task.assigneeIds.length ? task.assigneeIds : [ownerUid]; return assignees.includes(selectedUserUid); }).map(task => ({ ...task, ownerUid, taskDate: selectedDate })));
  const selectedDateActiveTasks = selectedDateTasks.filter(task => !task.completed);
  const unfinishedPastTasks = Object.keys(teamData.tasks || {})
    .filter(dateStr => dateStr < selectedDate)
    .sort((a, b) => b.localeCompare(a))
    .flatMap(dateStr =>
      Object.entries(teamData.tasks[dateStr] || {})
        .flatMap(([ownerUid, tasks]) => (tasks || [])
          .filter(task => {
            if (task?.visibility === 'private' || !canViewTask(task, ownerUid)) return false;
            if (task.completed) return false;
            const assignees = Array.isArray(task.assigneeIds) && task.assigneeIds.length
              ? task.assigneeIds
              : [ownerUid];
            return assignees.includes(selectedUserUid);
          })
          .map(task => ({ ...task, ownerUid, taskDate: dateStr })))
    );
  const selectedDateShifts = teamData.shifts[selectedDate] || {};

  // 個人メモは日付に関係なく、自分が登録した private タスクを一覧化する。
  // 他のユーザーの個人メモは検索・表示対象にしない。
  const personalMemoTasks = Object.entries(teamData.tasks || {})
    .flatMap(([dateStr, owners]) => (owners?.[currentUserUid] || [])
      .filter(task => task?.visibility === 'private')
      .map(task => ({ ...task, ownerUid: currentUserUid, taskDate: dateStr })))
    .sort((a, b) => (b.taskDate || '').localeCompare(a.taskDate || '') ||
      (b.createdAt || '').localeCompare(a.createdAt || ''));
  const selectedPersonalMemo = personalMemoTasks.find(
    task => `${task.taskDate}-${task.id}` === selectedPersonalMemoKey
  ) || null;

  const openPersonalMemo = (task) => {
    setSelectedPersonalMemoKey(`${task.taskDate}-${task.id}`);
    setIsEditingPersonalMemo(false);
    setPersonalMemoEditImage(null);
  };

  const startPersonalMemoEdit = () => {
    if (!selectedPersonalMemo) return;
    setPersonalMemoEditText(selectedPersonalMemo.text || '');
    setPersonalMemoEditImage(null);
    setIsEditingPersonalMemo(true);
  };

  const closePersonalMemoDetail = () => {
    setSelectedPersonalMemoKey('');
    setIsEditingPersonalMemo(false);
    setPersonalMemoEditImage(null);
  };

  const handlePersonalMemoImageChange = (e) => {
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
    setPersonalMemoEditImage(file);
  };

  const savePersonalMemo = async () => {
    if (!selectedPersonalMemo) return;
    if (!personalMemoEditText.trim() && !selectedPersonalMemo.imageUrl && !personalMemoEditImage) {
      alert('内容または画像を追加してください。');
      return;
    }
    setIsSavingPersonalMemo(true);
    try {
      const changes = {
        subject: '',
        text: personalMemoEditText.trim(),
        endTime: '',
        visibility: 'private',
        assigneeIds: [currentUserUid]
      };
      if (personalMemoEditImage) {
        const result = await uploadTaskImageToCloudinary(personalMemoEditImage);
        changes.imageUrl = result.secure_url || result.url || '';
        changes.imageName = personalMemoEditImage.name;
        changes.imagePublicId = result.public_id || '';
        changes.imageBytes = Number(result.bytes || personalMemoEditImage.size || 0);
        changes.imageUploadedAt = new Date().toISOString();
      }
      await updateTaskText(selectedPersonalMemo.taskDate, currentUserUid, selectedPersonalMemo.id, changes);
      setIsEditingPersonalMemo(false);
      setPersonalMemoEditImage(null);
    } catch (error) {
      console.error('個人メモの更新に失敗しました:', error);
      alert(`個人メモを保存できませんでした。\n${error?.message || 'もう一度お試しください。'}`);
    } finally {
      setIsSavingPersonalMemo(false);
    }
  };

  const deletePersonalMemo = async () => {
    if (
      !selectedPersonalMemo ||
      selectedPersonalMemo.visibility !== 'private' ||
      selectedPersonalMemo.ownerUid !== currentUserUid
    ) return;

    if (!window.confirm('この個人メモを削除しますか？\n削除したメモは元に戻せません。')) return;

    setIsDeletingPersonalMemo(true);
    try {
      await deleteTask(selectedPersonalMemo.taskDate, currentUserUid, selectedPersonalMemo.id);
      closePersonalMemoDetail();
    } catch (error) {
      console.error('個人メモの削除に失敗しました:', error);
      alert(`個人メモを削除できませんでした。\n${error?.message || 'もう一度お試しください。'}`);
    } finally {
      setIsDeletingPersonalMemo(false);
    }
  };

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
    if (newTaskVisibility === 'private' ? (!newTaskText.trim() && !newTaskImage) : (!newTaskSubject.trim() || (!newTaskText.trim() && !newTaskImage))) { alert(newTaskVisibility === 'private' ? '内容または画像を追加してください。' : '件名と内容または画像を入力してください。'); return; }
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
      if (newTaskVisibility === 'private' && selectedUserUid !== currentUserUid) {
        alert('個人メモは、自分の名前を選んでいるときだけ登録できます。');
        return;
      }
      addTask(selectedDate, selectedUserUid, newTaskText.trim(), imageUrl, imageName, imagePublicId, imageBytes, newTaskVisibility, newTaskVisibility === 'private' ? '' : newTaskSubject.trim(), newTaskVisibility === 'private' ? '' : newTaskEndTime);
      setNewTaskVisibility('public');
      setNewTaskSubject('');
      setNewTaskText('');
      setNewTaskEndTime('');
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
    const [editSubject, setEditSubject] = useState(task.subject || task.text || '');
    const [editEndTime, setEditEndTime] = useState(task.endTime || '');
    const [selectedAssigneeIds, setSelectedAssigneeIds] = useState(
      Array.isArray(task.assigneeIds) && task.assigneeIds.length ? task.assigneeIds : [task.ownerUid || selectedUserUid]
    );
    const [isUpdatingAssignees, setIsUpdatingAssignees] = useState(false);
    const [assigneeUpdateMessage, setAssigneeUpdateMessage] = useState('');
    const [showPastFinishConfirm, setShowPastFinishConfirm] = useState(false);
    const isSelected = selectedTaskId === task.id;
    const canEditTask = isAdmin || task.ownerUid === currentUserUid;
    const taskDate = task.taskDate || selectedDate;
    const isPastTask = taskDate < formatDate(new Date());

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
          <input type="text" value={editSubject} onChange={e=>setEditSubject(e.target.value)} placeholder="件名" className="w-full bg-blue-50/50 p-2 text-sm rounded outline-none" />
          <label className="flex items-center gap-2 text-xs text-gray-600">終了予定時刻 <div className="flex items-center gap-1"><select aria-label="終了予定時刻の時" value={editEndTime ? editEndTime.split(':')[0] : ''} onChange={e=>setEditEndTime(e.target.value ? e.target.value+':'+((editEndTime||'').split(':')[1]||'00') : '')} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" ><option value="">時</option>{Array.from({length:24},(_,i)=>String(i).padStart(2,'0')).map(v=><option key={v} value={v}>{v}</option>)}</select><span>:</span><select aria-label="終了予定時刻の分" value={editEndTime ? editEndTime.split(':')[1] : ''} onChange={e=>setEditEndTime(((editEndTime||'').split(':')[0]||'00')+':'+e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" ><option value="">分</option>{['00','15','30','45'].map(v=><option key={v} value={v}>{v}</option>)}</select></div></label>
          <div className="flex gap-2 items-start">
            <textarea
              className="flex-1 bg-blue-50/50 p-2 text-sm rounded outline-none resize-none"
              value={editVal}
              onChange={(e) => setEditVal(e.target.value)}
              rows={4}
              autoFocus
            />
            <button type="button"
              onClick={() => {
                updateTaskText(task.taskDate || selectedDate, task.ownerUid || selectedUserUid, task.id, { subject: editSubject.trim(), text: editVal.trim(), endTime: editEndTime, updates: [...(Array.isArray(task.updates) ? task.updates : []), createPartnerUpdate(editVal.trim(), currentUser, null, 'handoff')] });
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
            : task.completed ? 'border-green-200 bg-green-50/60' : 'border-gray-200 shadow-sm hover:border-gray-300'
        } flex items-start gap-3`}
      >
        <button
          type="button"
          aria-label={task.completed ? 'タスクを未完了に戻す' : 'タスクを完了にする'}
          title={canEditTask ? (task.completed ? '未完了に戻す' : '完了にする') : '他のメンバーが登録したタスクは操作できません'}
          onClick={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const taskDate = task.taskDate || selectedDate;
            const ownerUid = task.ownerUid || selectedUserUid;

            if (!canEditTask) {
              alert('他のメンバーが登録したタスクは操作できません。');
              void writeDebugLog({
                level: 'WARN',
                event: 'daily.task.checkbox.denied',
                user: currentUser,
                details: { taskId: task.id, taskDate, ownerUid, currentUserUid, isAdmin: !!isAdmin }
              });
              return;
            }

            if (isPastTask && !task.completed) {
              setPastFinishConfirmTaskKey(`${taskDate}-${ownerUid}-${task.id}`);
              void writeDebugLog({
                event: 'daily.task.checkbox.past.confirm.show',
                user: currentUser,
                details: { taskId: task.id, taskDate, ownerUid }
              });
              return;
            }

            await writeDebugLog({
              event: 'daily.task.checkbox.click',
              user: currentUser,
              details: {
                taskId: task.id,
                taskDate,
                selectedDate,
                ownerUid,
                currentUserUid,
                currentUserName: currentUser?.name || '',
                isAdmin: !!isAdmin,
                canEditTask,
                completedBefore: !!task.completed,
                isPastTask
              }
            });
            try {
              await writeDebugLog({
                event: 'daily.task.checkbox.toggle.start',
                user: currentUser,
                details: { taskId: task.id, taskDate, ownerUid, currentUserUid, canEditTask, isAdmin: !!isAdmin }
              });
              await toggleTask(taskDate, ownerUid, task.id);
              await writeDebugLog({
                event: 'daily.task.checkbox.toggle.success',
                user: currentUser,
                details: { taskId: task.id, taskDate, ownerUid }
              });
            } catch (error) {
              await writeDebugLog({
                level: 'ERROR',
                event: 'daily.task.checkbox.toggle.error',
                user: currentUser,
                details: { taskId: task.id, taskDate, ownerUid, message: error?.message || String(error), stack: error?.stack || '' }
              });
              console.error('タスクチェック処理に失敗しました:', error);
            }
          }}
          className={`relative z-20 shrink-0 mt-0.5 w-7 h-7 rounded-full border-2 flex items-center justify-center cursor-pointer touch-manipulation transition-colors ${
            task.completed
              ? 'bg-green-500 border-green-500 text-white'
              : canEditTask
                ? 'bg-white border-gray-300 hover:border-blue-400'
                : 'bg-gray-100 border-gray-300 text-gray-400'
          }`}
        >
          {task.completed && <span className="text-white text-sm font-black leading-none">✓</span>}
        </button>
        <div className="flex-1 min-w-0">
          {task.completed && <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-[9px] font-black mb-1"><CheckSquare size={11}/>終了済み</span>}
          {(task.subject || task.text) && <span className={`text-sm font-bold block whitespace-pre-wrap leading-tight ${task.completed ? 'text-gray-500 line-through' : 'text-gray-800'}`}>{task.subject || task.text}</span>}
          {task.subject && task.text && <span className="text-xs block mt-1 whitespace-pre-wrap text-gray-600">{task.text}</span>}
          {task.endTime && <div className="text-[10px] text-orange-600 font-bold mt-1">終了予定 {task.endTime}</div>}
          {!task.subject && task.text && (
            <span className={`text-sm block whitespace-pre-wrap leading-tight ${
              task.completed ? 'text-gray-400 line-through' : 'text-gray-700'
            } ${isSelected ? '' : 'overflow-hidden max-h-[2.8em] line-clamp-2'}`}>
              {task.text}
            </span>
          )}
          <div className="mt-1 text-[9px] text-purple-600">担当: {selectedAssigneeIds.map(id => users[id]?.name?.split(' ')[0] || '').filter(Boolean).join('・') || '未設定'}</div>

          {pastFinishConfirmTaskKey === `${taskDate}-${task.ownerUid || selectedUserUid}-${task.id}` && isPastTask && !task.completed && canEditTask && (
            <label
              className="mt-2 flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-bold text-orange-700 cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                onChange={async (e) => {
                  e.stopPropagation();
                  if (!e.target.checked) return;
                  await writeDebugLog({
                    event: 'daily.task.checkbox.past.confirmed',
                    user: currentUser,
                    details: { taskId: task.id, taskDate, ownerUid: task.ownerUid || selectedUserUid }
                  });
                  setPastFinishConfirmTaskKey(null);
                  try {
                    await toggleTask(taskDate, task.ownerUid || selectedUserUid, task.id);
                  } catch (error) {
                    console.error('過去タスクの終了処理に失敗しました:', error);
                  }
                }}
                className="shrink-0 w-4 h-4"
              />
              <span>終了しますか？</span>
            </label>
          )}

          {isSelected && (
            <div className="mt-3 pt-3 border-t border-purple-100" onClick={(e) => e.stopPropagation()}>
              {Array.isArray(task.updates) && task.updates.length > 0 && <div className="mb-3 space-y-2"><div className="text-[10px] font-bold text-gray-600">申し送り履歴</div>{task.updates.map(update=><div key={update.id} className="rounded-lg bg-gray-50 border border-gray-100 p-2"><div className="text-[9px] text-gray-500 font-bold">{update.authorName||'不明なユーザー'}{update.createdAt?' ・ '+new Date(update.createdAt).toLocaleString('ja-JP'):''}</div><div className="text-xs text-gray-700 whitespace-pre-wrap break-words">{update.text}</div>{update.imageUrl&&<img src={update.imageUrl} alt={update.imageName||'添付画像'} className="mt-1 max-h-36 rounded-lg object-contain"/>}</div>)}</div>}
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
          <button type="button"
            onClick={() => setIsEditing(true)}
            className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-gray-100 rounded-lg active:scale-95"
            title="編集"
          >
            <Edit2 size={16}/>
          </button>
          <button type="button"
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
          <button type="button" onClick={() => changeDay(-1)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full active:scale-95"><ChevronLeft className="w-5 h-5"/></button>
          <h2 className="text-sm font-bold text-gray-800">{selectedDate.replace(/-/g, '/')}</h2>
          <button type="button" onClick={() => changeDay(1)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full active:scale-95"><ChevronRight className="w-5 h-5"/></button>
        </div>

        <div className="bg-white px-3 py-2 border-b border-gray-200 flex overflow-x-auto gap-2 no-scrollbar shadow-sm shrink-0 items-center min-h-[56px] sticky top-[53px] z-10">
          <div className="flex items-center gap-2 pr-4">
            {sortedUsers.map(member => {
              const isSelected = selectedUserUid === member.id;
              const shiftId = selectedDateShifts[member.id] || 'none';
              const shiftObj = shiftTypes.find(s => s.id === shiftId) || shiftTypes.find(s => s.id === 'none');
              return (
                <button type="button"
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
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-black text-gray-600">このタスクを</span>
              <button type="button" onClick={() => setNewTaskVisibility('public')} className={`px-3 py-1.5 rounded-full text-xs font-black border transition-all ${newTaskVisibility === 'public' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'}`}>👥 みんなに公開</button>
              <button type="button" onClick={() => { setNewTaskVisibility('private'); setNewTaskSubject(''); setNewTaskEndTime(''); }} disabled={selectedUserUid !== currentUserUid} className={`px-3 py-1.5 rounded-full text-xs font-black border transition-all ${newTaskVisibility === 'private' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-500 border-gray-200'} ${selectedUserUid !== currentUserUid ? 'opacity-40 cursor-not-allowed' : ''}`}>🔒 個人メモ</button>
              {newTaskVisibility === 'private' && <span className="text-[10px] font-bold text-purple-600">自分だけに表示されます</span>}
            </div>
            <div className="space-y-2 mb-2">
              {newTaskVisibility !== 'private' && <input type="text" value={newTaskSubject} onChange={e=>setNewTaskSubject(e.target.value)} placeholder="件名（例：備品の補充）" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm" disabled={isUploading}/>}
              {newTaskVisibility !== 'private' && <label className="flex items-center gap-2 text-xs text-gray-600"><span className="font-bold">終了予定時刻</span><div className="flex items-center gap-1"><select aria-label="終了予定時刻の時" value={newTaskEndTime ? newTaskEndTime.split(':')[0] : ''} onChange={e=>setNewTaskEndTime(e.target.value ? e.target.value+':'+((newTaskEndTime||'').split(':')[1]||'00') : '')} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" disabled={isUploading}><option value="">時</option>{Array.from({length:24},(_,i)=>String(i).padStart(2,'0')).map(v=><option key={v} value={v}>{v}</option>)}</select><span>:</span><select aria-label="終了予定時刻の分" value={newTaskEndTime ? newTaskEndTime.split(':')[1] : ''} onChange={e=>setNewTaskEndTime(((newTaskEndTime||'').split(':')[0]||'00')+':'+e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" disabled={isUploading}><option value="">分</option>{['00','15','30','45'].map(v=><option key={v} value={v}>{v}</option>)}</select></div></label>}
            </div>
            <div className="flex gap-2 items-end">
              <textarea
                value={newTaskText}
                onChange={(e) => setNewTaskText(e.target.value)}
                placeholder={newTaskVisibility === 'private' ? '個人メモを入力' : '内容・申し送りを入力'}
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
              <button type="button"
                onClick={handleAddTask}
                disabled={isUploading || (newTaskVisibility === 'private' ? (!newTaskText.trim() && !newTaskImage) : (!newTaskSubject.trim() || (!newTaskText.trim() && !newTaskImage)))}
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
          {selectedDateActiveTasks.length === 0 ? (
            <div className="text-center py-8">
              <ClipboardList className="mx-auto text-gray-300 mb-2" size={40}/>
              <p className="text-gray-400 text-sm">未終了タスクはありません</p>
            </div>
          ) : selectedDateActiveTasks.map(task => <TaskItem key={task.id} task={task}/>)}

          {selectedUserUid === currentUserUid && (
            <section className="mt-4 rounded-2xl border border-purple-200 bg-white overflow-hidden">
              <div className="px-3 py-3 border-b border-purple-100 bg-purple-50 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-black text-purple-800">🔒 個人メモ</h3>
                  <p className="text-[10px] text-purple-600 mt-0.5">自分だけが確認できるメモです</p>
                </div>
                <span className="shrink-0 rounded-full bg-purple-200 text-purple-800 px-2.5 py-1 text-[10px] font-black">{personalMemoTasks.length}件</span>
              </div>
              <div className="p-3 space-y-2">
                {personalMemoTasks.length === 0 ? (
                  <div className="py-5 text-center">
                    <p className="text-xs font-bold text-gray-500">個人メモはまだありません</p>
                    <p className="text-[10px] text-gray-400 mt-1">上の入力欄で「個人メモ」を選んで保存すると、ここに表示されます。</p>
                  </div>
                ) : personalMemoTasks.map(memo => (
                  <button
                    key={`${memo.taskDate}-${memo.id}`}
                    type="button"
                    onClick={() => openPersonalMemo(memo)}
                    className="w-full text-left rounded-xl border border-purple-100 bg-purple-50/40 hover:bg-purple-50 active:bg-purple-100 p-3 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-[10px] text-purple-700 font-bold shrink-0">{memo.taskDate.replace(/-/g, '/')}</span>
                    </div>
                    {(memo.text || (!memo.imageUrl && memo.subject)) && <p className="text-sm text-gray-800 mt-1 whitespace-pre-wrap break-words line-clamp-3">{memo.text || memo.subject}</p>}
                    {!memo.text && memo.imageUrl && <div className="text-sm text-gray-600 mt-1">画像メモ</div>}
                    {memo.imageUrl && <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 mt-2"><ImageIcon size={12}/>画像添付あり</span>}
                    <div className="text-[10px] font-bold text-purple-600 mt-2">タップして詳細・編集・削除</div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {selectedPersonalMemo && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-4" onClick={closePersonalMemoDetail}>
          <div className="w-full max-w-xl max-h-[90dvh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-4 py-3 border-b flex items-start justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <div className="text-[10px] font-bold text-purple-700">🔒 個人メモ詳細</div>
                <h3 className="text-base font-black text-gray-800 mt-1 break-words">個人メモ</h3>
                <p className="text-xs text-gray-500 mt-1">{selectedPersonalMemo.taskDate.replace(/-/g, '/')}</p>
              </div>
              <button type="button" onClick={closePersonalMemoDetail} className="p-2 rounded-full text-gray-500 hover:bg-gray-100 shrink-0" aria-label="個人メモ詳細を閉じる"><X size={18}/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {isEditingPersonalMemo ? (
                <>
                  <label className="block">
                    <span className="block text-xs font-bold text-gray-600 mb-1">内容</span>
                    <textarea value={personalMemoEditText} onChange={e => setPersonalMemoEditText(e.target.value)} rows={7} className="w-full border rounded-lg px-3 py-2 text-sm resize-y" placeholder="個人メモの内容"/>
                  </label>
                  <div className="rounded-xl border border-gray-200 p-3">
                    <div className="text-xs font-bold text-gray-600 mb-2">画像（任意）</div>
                    {selectedPersonalMemo.imageUrl && <img src={selectedPersonalMemo.imageUrl} alt={selectedPersonalMemo.imageName || '個人メモの画像'} className="max-h-48 max-w-full object-contain rounded-lg border mb-2"/>}
                    <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 text-gray-700 text-xs font-bold cursor-pointer hover:bg-gray-200">
                      <ImageIcon size={15}/><span>画像を追加・差し替え</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handlePersonalMemoImageChange}/>
                    </label>
                    {personalMemoEditImage && <p className="text-[10px] text-gray-500 mt-2">{personalMemoEditImage.name} を保存時にアップロードします。</p>}
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-xl bg-purple-50 border border-purple-100 p-3">
                    <div className="text-[10px] font-bold text-purple-700 mb-1">内容</div>
                    <div className="text-sm text-gray-800 whitespace-pre-wrap break-words">{selectedPersonalMemo.text || '内容はありません。'}</div>
                  </div>
                  {selectedPersonalMemo.imageUrl && <div><div className="text-[10px] font-bold text-gray-500 mb-1">添付画像</div><img src={selectedPersonalMemo.imageUrl} alt={selectedPersonalMemo.imageName || '個人メモの画像'} className="max-h-[50vh] max-w-full rounded-lg border object-contain"/></div>}
                  {selectedPersonalMemo.createdAt && <p className="text-[10px] text-gray-400">登録日時：{new Date(selectedPersonalMemo.createdAt).toLocaleString('ja-JP')}</p>}
                </>
              )}
            </div>
            <div className="border-t p-3 flex gap-2 shrink-0">
              {isEditingPersonalMemo ? (
                <>
                  <button type="button" onClick={() => { setIsEditingPersonalMemo(false); setPersonalMemoEditImage(null); }} disabled={isSavingPersonalMemo} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold">キャンセル</button>
                  <button type="button" onClick={savePersonalMemo} disabled={isSavingPersonalMemo} className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold disabled:opacity-50">{isSavingPersonalMemo ? '保存中…' : '変更を保存'}</button>
                </>
              ) : (
                <>
                  <button type="button" onClick={closePersonalMemoDetail} disabled={isDeletingPersonalMemo} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold disabled:opacity-50">閉じる</button>
                  <button type="button" onClick={deletePersonalMemo} disabled={isDeletingPersonalMemo} className="flex-1 py-2.5 rounded-xl bg-red-50 text-red-700 border border-red-200 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"><Trash2 size={14}/>{isDeletingPersonalMemo ? '削除中…' : '削除'}</button>
                  <button type="button" onClick={startPersonalMemoEdit} disabled={isDeletingPersonalMemo} className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"><Edit2 size={14}/>編集</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const GuideMockup = ({ title, active, steps, children }) => (
  <div className="mt-5 rounded-3xl border-2 border-gray-200 bg-gray-100 p-3 sm:p-5">
    <div className="text-sm font-black text-gray-500 mb-3">画面のイメージ</div>
    <div className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between"><div className="font-black text-gray-800">{title}</div><div className="w-7 h-7 rounded-full bg-gray-200" /></div>
      <div className="min-h-40 p-4 relative">{children}</div>
      <div className="border-t border-gray-200 bg-white flex">{['カレンダー','シフト管理','日別タスク','パートナー'].map(name=><div key={name} className="flex-1 py-3 text-center text-[9px] sm:text-[11px] font-bold relative"><div className={name===active?'text-blue-600':'text-gray-400'}>{name}</div>{name===active&&<div className="absolute left-1/4 right-1/4 bottom-0 h-1 rounded-t bg-blue-600" />}</div>)}</div>
    </div>
    <div className="mt-4 space-y-3">{steps.map((step,index)=><div key={index} className="flex gap-3 items-start"><div className="shrink-0 w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center font-black">{index+1}</div><p className="text-base sm:text-lg font-bold text-gray-800 leading-relaxed">{step}</p></div>)}</div>
  </div>
);

const HelpView = () => {
  const [skipHelpOnLogin, setSkipHelpOnLogin] = useState(() => localStorage.getItem('teamshift_skip_help_on_login') === 'true');

  const handleSkipHelpChange = (checked) => {
    setSkipHelpOnLogin(checked);
    localStorage.setItem('teamshift_skip_help_on_login', checked ? 'true' : 'false');
  };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 pb-24">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <section className="bg-blue-600 text-white rounded-3xl p-6 sm:p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <BookOpen size={34} />
            <h1 className="text-2xl sm:text-3xl font-black">LUIGANSOPERATIONSCREW App 使い方</h1>
          </div>
          <p className="text-lg sm:text-xl font-bold leading-relaxed">
            このページを見れば、このアプリで何をすればよいかが分かります。
          </p>
          <label className="mt-5 flex items-start gap-3 bg-white/15 rounded-2xl p-4 cursor-pointer">
            <input
              type="checkbox"
              checked={skipHelpOnLogin}
              onChange={(e) => handleSkipHelpChange(e.target.checked)}
              className="mt-1 w-5 h-5 rounded"
            />
            <span className="text-base sm:text-lg font-bold leading-relaxed">
              次回から、ログインしたときに最初に「使い方」を開かない
            </span>
          </label>
        </section>

        <section className="bg-yellow-50 border-2 border-yellow-200 rounded-3xl p-5 sm:p-6 shadow-sm">
          <p className="text-base sm:text-lg font-black text-gray-800 leading-relaxed">
            「使い方」から戻るときは、画面の下にある「カレンダー」「シフト管理」「日別タスク」「パートナー」などのアイコンを押してください。
          </p>
          <p className="text-sm sm:text-base font-bold text-gray-600 mt-2">
            押したアイコンの画面に戻ります。
          </p>
        </section>

        <section className="bg-white rounded-3xl border border-blue-100 shadow-sm p-6 sm:p-8">
          <h2 className="text-2xl font-black text-blue-700 mb-4">このツールの目的</h2>
          <div className="bg-blue-50 rounded-2xl p-5 sm:p-6">
            <p className="text-lg sm:text-xl font-bold text-gray-800 leading-loose">
              このツールは何の作業が残っているの？どうゆう状況なの？明日のシフトは？などをまとめて確認できるようにするために作成したツールです。不具合等があれば竹添に伝えてください。
            </p>
          </div>
        </section>

        <section className="bg-green-50 border-2 border-green-200 rounded-3xl p-6 sm:p-8 shadow-sm">
          <h2 className="text-2xl sm:text-3xl font-black text-green-800 mb-4">まず、この流れで使ってください</h2>
          <div className="space-y-3">
            {[
              ['1', '今日・明日の自分の仕事を確認する', '「日別タスク」を開いて、今日または明日に自分がやらなければならない作業を確認します。'],
              ['2', '自分がやる作業を日別タスクに書く', 'まだ登録されていない作業があれば、自分の名前を選んで、作業内容を書き、「保存」を押します。'],
              ['3', 'パートナーから連絡があったら記録する', '「パートナー」を開いて、相手・日時・主担当を確認し、「今回の申し送り・追記」に連絡内容を書いて保存します。'],
              ['4', '終わった作業はチェックする', '日別タスクの作業が終わったら、左の□を押して終了にします。'],
              ['5', '次の人が見ても分かる状態にする', '作業の状況やパートナーからの連絡を残しておくことで、次の人も「何が残っているか」を確認できます。']
            ].map(([number, title, text]) => (
              <div key={number} className="flex gap-3 items-start bg-white rounded-2xl border border-green-100 p-4">
                <div className="shrink-0 w-9 h-9 rounded-full bg-green-600 text-white flex items-center justify-center font-black">{number}</div>
                <div>
                  <h3 className="text-lg sm:text-xl font-black text-gray-800">{title}</h3>
                  <p className="text-base sm:text-lg text-gray-700 leading-relaxed mt-1">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-3xl border-2 border-blue-100 shadow-sm p-6 sm:p-8">
          <h2 className="text-2xl font-black text-blue-700 mb-4">今日・明日の「自分がやる仕事」を登録する方法</h2>
          <p className="text-base sm:text-lg leading-relaxed text-gray-700">
            「あとでやる」「明日やる」「今日中にやらなければならない」など、<strong>自分が担当する作業</strong>は日別タスクに書いてください。
          </p>
          <GuideMockup title="日別タスク：自分の仕事を入力" active="日別タスク" steps={[
            '下の「日別タスク」を押します。',
            '上の「◀」「▶」で、今日または明日の日付にします。',
            '上の名前から、自分の名前を押します。',
            '入力欄に「自分がやる作業」を具体的に書きます。',
            '右の「保存」を押します。これで、その日の自分のタスクとして登録されます。'
          ]}>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-black text-gray-700">2026/10/05</span>
                <span className="text-xs text-gray-500">← 今日・明日を選ぶ</span>
              </div>
              <div className="flex gap-2">
                <div className="rounded-xl border-4 border-red-500 bg-blue-50 px-4 py-2 text-sm font-black relative">
                  竹添
                  <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-red-500 text-white rounded px-2 py-1 text-[9px] whitespace-nowrap">←自分を押す</span>
                </div>
                <div className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-500">平川</div>
                <div className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-500">田中</div>
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex-1 border-4 border-red-500 rounded-xl bg-white px-3 py-3 text-sm font-bold text-gray-700">
                  明日の開店準備をする
                  <div className="text-[9px] text-red-500 mt-1">←ここに作業を書く</div>
                </div>
                <div className="bg-blue-600 text-white rounded-xl px-4 py-3 font-black text-sm">保存</div>
              </div>
            </div>
          </GuideMockup>
          <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-2xl p-4 text-base sm:text-lg font-bold leading-relaxed">
            <strong>ポイント：</strong>「自分がやらなければならない作業」を、できるだけ具体的に書いてください。<br />
            例：「○○さんへ電話する」「明日の資料を準備する」「入口の備品を確認する」
          </div>
        </section>

        <section className="bg-white rounded-3xl border-2 border-purple-100 shadow-sm p-6 sm:p-8">
          <h2 className="text-2xl font-black text-purple-700 mb-4">パートナーから連絡があったときの記録方法</h2>
          <p className="text-base sm:text-lg leading-relaxed text-gray-700">
            パートナーから電話・口頭・メッセージなどで連絡があったら、忘れないうちに「パートナー」に記録してください。
          </p>
          <GuideMockup title="パートナー：申し送りを追加" active="パートナー" steps={[
            '下の「パートナー」を押します。',
            '連絡を受けたパートナーを選びます。',
            '「編集」を押します。必要なら日付・時間・主担当も確認します。',
            '「今回の申し送り・追記」に、連絡内容をそのまま分かるように書きます。',
            '「変更を保存」を押します。前の申し送りは消さず、新しい内容として追加します。'
          ]}>
            <div className="space-y-2">
              <div className="rounded-xl border-2 border-gray-200 p-3">
                <div className="text-sm font-black">パートナーA</div>
                <div className="text-xs text-blue-600 font-bold mt-1">主担当：竹添</div>
              </div>
              <div className="rounded-xl border border-gray-200 p-3 text-xs">
                <div className="font-black text-gray-500 mb-1">これまでの申し送り</div>
                <div>（竹添）10/5 来店予定です。</div>
                <div>（平川）10/5 15時ごろ到着しました。</div>
              </div>
              <div className="relative rounded-xl border-4 border-red-500 bg-purple-50 p-3">
                <div className="text-xs font-black text-purple-700">今回の申し送り・追記</div>
                <div className="mt-2 text-sm font-bold text-gray-700">「明日10時に来店予定。入口で対応してください。」</div>
                <span className="absolute -right-2 -top-7 bg-red-500 text-white rounded px-2 py-1 text-[9px] font-black">←ここに書く</span>
              </div>
              <div className="text-right"><span className="inline-block bg-blue-600 text-white rounded-xl px-5 py-2 font-black">変更を保存</span></div>
            </div>
          </GuideMockup>
          <div className="mt-4 bg-red-50 border border-red-200 rounded-2xl p-4 text-base sm:text-lg font-bold leading-relaxed">
            <strong>大事：</strong>以前の申し送りは削除しません。誰が・いつ・何を伝えたかが分かるように、今回の内容を追加してください。
          </div>
        </section>

        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 sm:p-8">
          <h2 className="text-2xl font-black text-gray-800 mb-5">まず覚えるのは、この4つです</h2>
          <div className="grid gap-4">
            {[
              ['1', 'カレンダー', '今日・明日などのシフトと、パートナーの予定を確認します。'],
              ['2', 'シフト管理', 'スタッフの出勤・休みを確認、変更します。※使える人だけ表示されます。'],
              ['3', '日別タスク', 'その日にやる仕事を確認し、終わったらチェックします。'],
              ['4', 'パートナー', 'パートナーの予定や申し送りを確認・追加します。']
            ].map(([number, title, text]) => (
              <div key={number} className="flex gap-4 items-start border border-gray-200 rounded-2xl p-4">
                <div className="shrink-0 w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center text-lg font-black">{number}</div>
                <div>
                  <h3 className="text-xl font-black text-gray-800">{title}</h3>
                  <p className="text-base sm:text-lg text-gray-600 leading-relaxed mt-1">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 sm:p-8">
          <h2 className="text-2xl font-black text-gray-800 mb-5">① カレンダー</h2>
          <p className="text-base sm:text-lg leading-relaxed text-gray-700"><strong>まずここを見ます。</strong> 明日のシフトやパートナーの予定を確認します。</p>
          <GuideMockup title="カレンダー" active="カレンダー" steps={['下の「カレンダー」を押します。','見たい日付を押します。','その日のシフト・パートナー予定が表示されます。']}>
            <div className="grid grid-cols-7 gap-1 text-center text-[9px]">{['月','火','水','木','金','土','日'].map(d=><div key={d} className="font-black text-gray-400">{d}</div>)}{Array.from({length:14},(_,i)=><div key={i} className={i===7?'relative rounded-lg border-4 border-red-500 bg-blue-50 p-3 font-black text-blue-700':'rounded-lg bg-gray-50 p-3 text-gray-600'}>{i+1}</div>)}</div><div className="absolute right-3 bottom-3 bg-red-500 text-white rounded-full px-3 py-1 text-xs font-black shadow">← 見たい日を押す</div>
          </GuideMockup>
        </section>

        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 sm:p-8">
          <h2 className="text-2xl font-black text-gray-800 mb-5">② シフト管理</h2>
          <p className="text-base sm:text-lg leading-relaxed text-gray-700">出勤・休みを確認したり、変更するときに使います。</p>
          <GuideMockup title="シフト管理" active="シフト管理" steps={['下の「シフト管理」を押します。','変更したい人・日付を探します。','変更する場所を押して、出勤・休みを選びます。','最後に、変更できているか確認します。']}>
            <div className="space-y-2">{['竹添','平川','田中'].map((n,i)=><div key={n} className="flex items-center gap-2"><div className="w-16 text-xs font-bold">{n}</div>{['出勤','休み','出勤','出勤','休み'].map((s,j)=><div key={j} className={i===0&&j===2?'relative border-4 border-red-500 rounded-lg bg-blue-50 w-10 py-2 text-center font-black':'w-10 py-2 rounded-lg bg-gray-100 text-center font-bold'}>{s}{i===0&&j===2&&<span className="absolute -top-7 -right-8 bg-red-500 text-white rounded px-2 py-1 text-[9px] whitespace-nowrap">←ここを押す</span>}</div>)}</div>)}</div>
          </GuideMockup>
          <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-2xl p-4 text-base sm:text-lg font-bold">シフトを変更すると、他の人にも同じ内容が表示されます。</div>
        </section>

        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 sm:p-8">
          <h2 className="text-2xl font-black text-gray-800 mb-5">③ 日別タスク</h2>
          <p className="text-base sm:text-lg leading-relaxed text-gray-700">その日にやる仕事を確認し、終わったらチェックします。</p>
          <GuideMockup title="日別タスク" active="日別タスク" steps={['下の「日別タスク」を押します。','やる仕事を確認します。','終わった仕事の□を押します。','まだ終わっていない仕事は、そのままにします。']}>
            <div className="space-y-3">{['開店準備をする','メールを確認する','パートナーの予定を確認する'].map((t,i)=><div key={t} className={i===1?'relative flex items-center gap-3 border-4 border-red-500 rounded-xl p-3 bg-blue-50':'flex items-center gap-3 border border-gray-200 rounded-xl p-3'}><div className="w-7 h-7 border-2 border-gray-500 rounded bg-white flex items-center justify-center text-sm">{i===0?'✓':''}</div><span className="font-bold text-gray-700">{t}</span>{i===1&&<span className="absolute -right-2 -top-7 bg-red-500 text-white rounded px-2 py-1 text-[9px] font-black">← 終わったら押す</span>}</div>)}</div>
          </GuideMockup>
        </section>

        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 sm:p-8">
          <h2 className="text-2xl font-black text-gray-800 mb-5">④ パートナー</h2>
          <p className="text-base sm:text-lg leading-relaxed text-gray-700">パートナーの予定と申し送りを確認・追加します。</p>
          <GuideMockup title="パートナー" active="パートナー" steps={['下の「パートナー」を押します。','追加・編集したいパートナーを押します。','「今回の申し送り・追記」に文章を書きます。','「保存」を押します。']}>
            <div className="space-y-2">
              <div className="border-2 border-gray-200 rounded-xl p-3 font-bold">パートナーA　<span className="text-blue-600">主担当：竹添</span></div>
              <div className="border-4 border-red-500 rounded-xl p-3 relative"><div className="text-xs font-black text-gray-500 mb-2">これまでの申し送り</div><div className="text-sm">（竹添）パートナーが来ました。</div><div className="text-sm">（平川）作業終了して帰りました。</div><div className="mt-3 border-2 border-blue-300 rounded-lg p-3 bg-blue-50"><div className="text-xs font-black text-blue-700">今回の申し送り・追記</div><div className="text-xs text-gray-400 mt-2">ここに今回の内容を書きます</div></div><span className="absolute -right-2 -top-7 bg-red-500 text-white rounded px-2 py-1 text-[9px] font-black">←ここに書く</span></div>
              <div className="text-right"><span className="inline-block bg-blue-600 text-white rounded-lg px-5 py-2 font-black">保存</span></div>
            </div>
          </GuideMockup>
          <div className="mt-4 bg-red-50 border border-red-200 rounded-2xl p-4 text-base sm:text-lg font-bold">過去の申し送りは消しません。新しい内容を下に追加してください。</div>
        </section>

        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 sm:p-8">
          <h2 className="text-2xl font-black text-gray-800 mb-5">パートナーの申し送りを追加する方法</h2>
          <ol className="list-decimal pl-6 space-y-4 text-base sm:text-lg leading-relaxed text-gray-700">
            <li>「パートナー」を押します。</li>
            <li>追加・編集したいパートナーを選びます。</li>
            <li>「今回の申し送り・追記」に、今回伝えたいことを書きます。</li>
            <li>保存します。</li>
          </ol>
          <p className="mt-5 bg-red-50 border border-red-200 rounded-2xl p-4 text-base sm:text-lg font-bold text-gray-800">
            過去の申し送りを消す必要はありません。新しい内容を追加してください。
          </p>
        </section>

        <section className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 sm:p-8">
          <h2 className="text-2xl font-black text-gray-800 mb-5">困ったときは</h2>
          <div className="space-y-4 text-base sm:text-lg leading-relaxed text-gray-700">
            <p>分からないときは、まずこの「使い方」を確認してください。</p>
            <p>それでも分からない場合や、画面がおかしい・保存できないなどの<strong>不具合</strong>があれば、<strong>竹添に伝えてください。</strong></p>
            <div className="bg-blue-600 text-white rounded-2xl p-5 text-center">
              <p className="text-xl font-black">「おかしいかな？」と思ったら、無理に操作を続けず竹添へ。</p>
            </div>
          </div>
        </section>

        <section className="bg-gray-800 text-white rounded-3xl p-6 sm:p-8">
          <h2 className="text-xl font-black mb-3">最後に</h2>
          <p className="text-base sm:text-lg leading-relaxed">
            このアプリは、「今どうなっているか」「次に何をするか」をみんなで分かるようにするためのものです。迷ったら、まずカレンダーと日別タスクを確認してください。
          </p>
        </section>
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

const PartnerView = ({ partnerItems, partnerNames, addPartnerItem, updatePartnerItem, togglePartnerItem, deletePartnerItem, addPartnerName, updatePartnerName, deletePartnerName, currentUser, debugLog, sortedUsers }) => {
  const [date, setDate] = useState(formatDate(new Date()));
  const [timeHour, setTimeHour] = useState('');
  const [timeMinute, setTimeMinute] = useState('');
  const time = timeHour && timeMinute ? `${timeHour}:${timeMinute}` : '';
  const [endTime, setEndTime] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [subject, setSubject] = useState('');
  const [assigneeUid, setAssigneeUid] = useState('');
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
  const editingPartnerItem = editingItemId ? (partnerItems || []).find(item => item.id === editingItemId) : null;

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
    if (!partnerName || !subject.trim() || !assigneeUid || !date || !time || !content.trim()) {
      alert('パートナー名・件名・主担当者・日付・開始時間・内容を入力してください。');
      return;
    }

    setIsSaving(true);
    const action = editingItemId ? 'partner.edit.save' : 'partner.add.save';
    await debugLog?.('INFO', action + '.start', { itemId: editingItemId || '', partnerName, date, time, assigneeUid, hasImage: !!newPartnerImage });
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
      const currentItem = editingItemId ? (partnerItems || []).find(item => item.id === editingItemId) : null;
      const newUpdate = createPartnerUpdate(content.trim(), currentUser, null, editingItemId ? 'handoff' : 'initial');
      const updates = editingItemId ? [...getPartnerUpdates(currentItem), newUpdate] : [newUpdate];
      const itemData = { partnerName, subject: subject.trim(), assigneeUid, date, time, endTime, content: content.trim(), updates, createdByUid: editingItemId ? (currentItem?.createdByUid || '') : (currentUser?.id || ''), createdByName: editingItemId ? (currentItem?.createdByName || '') : (currentUser?.name || ''), ...(imageUrl ? { imageUrl, imageName, imagePublicId, imageBytes, imageUploadedAt: new Date().toISOString() } : {}) };
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
      setSubject('');
      setTimeHour(''); setTimeMinute(''); setEndTime('');
      setPartnerName('');
      setAssigneeUid('');
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
                setEditingItemId(null); setPartnerName(''); setSubject(''); setAssigneeUid(''); setDate(formatDate(new Date())); setTimeHour(''); setTimeMinute(''); setEndTime(''); setContent(''); setNewPartnerImage(null); setNewPartnerImagePreview('');
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

          <label className="block"><span className="text-[10px] font-bold text-gray-500">主担当者</span><select value={assigneeUid} onChange={(e) => setAssigneeUid(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-400"><option value="">主担当者を選択</option>{(sortedUsers || []).map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
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

          <label className="block"><span className="text-[10px] font-bold text-gray-500">終了予定時刻</span><div className="flex items-center gap-1"><select aria-label="終了予定時刻の時" value={endTime ? endTime.split(':')[0] : ''} onChange={e=>setEndTime(e.target.value ? e.target.value+':'+((endTime||'').split(':')[1]||'00') : '')} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" ><option value="">時</option>{Array.from({length:24},(_,i)=>String(i).padStart(2,'0')).map(v=><option key={v} value={v}>{v}</option>)}</select><span>:</span><select aria-label="終了予定時刻の分" value={endTime ? endTime.split(':')[1] : ''} onChange={e=>setEndTime(((endTime||'').split(':')[0]||'00')+':'+e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" ><option value="">分</option>{['00','15','30','45'].map(v=><option key={v} value={v}>{v}</option>)}</select></div></label>

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

          <div className="space-y-2">
            <label className="block"><span className="text-[10px] font-bold text-gray-500">件名</span><input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="パートナータスクの件名を入力" className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400" /></label>
            {editingItemId && <PartnerUpdateHistory item={editingPartnerItem}/>}
            <label className="block">
              <span className="text-[10px] font-bold text-gray-500">内容</span>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                placeholder={editingItemId ? '今回追加する申し送りを入力してください' : 'パートナーに関する内容を入力'}
                className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              />
            </label>
          </div>

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
                  <div className={`text-[11px] font-bold mt-0.5 ${item.completed ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{item.time || '--:--'}</div>{item.endTime&&<div className="text-[9px] text-orange-600 mt-0.5">終了予定 {item.endTime}</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-[10px] font-bold mb-0.5 ${item.completed ? 'text-gray-400 line-through' : 'text-purple-600'}`}>{item.partnerName || 'パートナー未設定'}</div>
                  <div className="text-xs text-blue-600 font-bold mb-1">主担当: {(sortedUsers || []).find(user => user.id === item.assigneeUid)?.name || '未設定'}</div>
                  <div className="text-sm font-bold text-gray-800 mb-1">{item.subject || (item.content || '').split(/\r?\n/)[0] || '件名未設定'}</div>
                  <div className="space-y-1.5">{getPartnerUpdates(item).slice(-3).map(update => <div key={update.id} className="text-xs text-gray-700 whitespace-pre-wrap break-words"><span className="text-[9px] font-bold text-gray-500">（{update.authorName || '不明なユーザー'}）</span> {update.text}</div>)}</div>
                  {item.completedAt && <div className="text-[8px] text-green-600 mt-0.5">終了 {new Date(item.completedAt).toLocaleString('ja-JP')}</div>}
                </div>
                <div className="shrink-0 flex gap-0.5">
                  <button type="button" onClick={() => {
                    setEditingItemId(item.id);
                    setPartnerName(item.partnerName || '');
                    setSubject(item.subject || (item.content || '').split(/\r?\n/)[0] || '');
                    setAssigneeUid(item.assigneeUid || '');
                    setDate(item.date || formatDate(new Date()));
                    const [editHour, editMinute] = (item.time || '').split(':');
                    setTimeHour(editHour || '');
                    setTimeMinute(editMinute || '');
                    setEndTime(item.endTime || '');
                    setContent('');
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

const CompletedTasksView = ({ teamData, partnerItems, sortedUsers, currentUserUid }) => {
  const [memberFilter, setMemberFilter] = useState('all');
  const [openMonths, setOpenMonths] = useState({});

  const members = Array.isArray(sortedUsers) ? sortedUsers : [];
  const memberMap = Object.fromEntries(members.map(member => [member.id, member]));
  const completedEntries = [];

  Object.entries(teamData?.tasks || {}).forEach(([dateStr, tasksByUser]) => {
    Object.entries(tasksByUser || {}).forEach(([ownerUid, tasks]) => {
      (tasks || []).filter(task => task?.completed).forEach(task => {
        completedEntries.push({
          type: 'member',
          id: task.id,
          date: dateStr,
          completedAt: task.completedAt || task.updatedAt || task.createdAt || null,
          ownerUid,
          ownerName: memberMap[ownerUid]?.name || '不明なメンバー',
          assigneeNames: (Array.isArray(task.assigneeIds) ? task.assigneeIds : [ownerUid])
            .map(uid => memberMap[uid]?.name)
            .filter(Boolean),
          title: task.subject || task.text || '内容なし',
          content: task.subject && task.text ? task.text : '',
          imageUrl: task.imageUrl || ''
        });
      });
    });
  });

  (partnerItems || []).filter(item => item?.completed).forEach(item => {
    const assigneeUid = item.assigneeUid || '';
    completedEntries.push({
      type: 'partner',
      id: item.id,
      date: item.date || String(item.completedAt || '').slice(0, 10),
      completedAt: item.completedAt || null,
      ownerUid: assigneeUid,
      ownerName: memberMap[assigneeUid]?.name || '未割り当て',
      assigneeNames: assigneeUid && memberMap[assigneeUid]?.name ? [memberMap[assigneeUid].name] : [],
      title: item.subject || item.partnerName || 'パートナータスク',
      content: item.content || '',
      partnerName: item.partnerName || '',
      imageUrl: item.imageUrl || ''
    });
  });

  const filteredEntries = memberFilter === 'all'
    ? completedEntries
    : completedEntries.filter(entry => entry.ownerUid === memberFilter);

  const monthGroups = filteredEntries.reduce((groups, entry) => {
    const monthKey = String(entry.date || entry.completedAt || '').slice(0, 7) || '日付未設定';
    if (!groups[monthKey]) groups[monthKey] = [];
    groups[monthKey].push(entry);
    return groups;
  }, {});

  const sortedMonthKeys = Object.keys(monthGroups).sort((a, b) => b.localeCompare(a));

  const formatMonth = (key) => {
    if (!/^\d{4}-\d{2}$/.test(key)) return key;
    const [year, month] = key.split('-');
    return year + '年' + Number(month) + '月';
  };

  const formatCompletedAt = (value) => {
    if (!value) return '終了日時不明';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '終了日時不明' : date.toLocaleString('ja-JP');
  };

  const toggleMonth = (monthKey) => {
    setOpenMonths(prev => ({ ...prev, [monthKey]: prev[monthKey] === false }));
  };

  useEffect(() => {
    if (sortedMonthKeys.length && Object.keys(openMonths).length === 0) {
      setOpenMonths({ [sortedMonthKeys[0]]: true });
    }
  }, [sortedMonthKeys.join('|')]);

  const formatDateKey = (key) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;
    const date = new Date(key + 'T12:00:00');
    return Number.isNaN(date.getTime())
      ? key
      : date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  };

  return <div className="flex-1 flex flex-col bg-gray-50 pb-[68px] overflow-hidden">
    <div className="bg-white px-4 py-3 border-b border-gray-100 shadow-sm shrink-0">
      <div className="flex items-center gap-2">
        <ClipboardList className="text-green-600" size={20}/>
        <div>
          <div className="text-sm font-black text-gray-800">終了したタスク</div>
          <div className="text-[10px] text-gray-400">月ごと・日ごとにメンバーとパートナーの完了履歴を確認できます</div>
        </div>
      </div>
      <div className="mt-3 overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          <button
            onClick={() => setMemberFilter('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold ${memberFilter === 'all' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'}`}
          >全員</button>
          {members.map(member => (
            <button
              key={member.id}
              onClick={() => setMemberFilter(member.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold ${memberFilter === member.id ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'}`}
            >{member.name?.split(' ')[0] || '名前未設定'}</button>
          ))}
        </div>
      </div>
    </div>

    <div className="flex-1 overflow-y-auto p-3 space-y-3">
      {!sortedMonthKeys.length ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
          終了したタスクはありません。
        </div>
      ) : sortedMonthKeys.map(monthKey => {
        const entries = [...monthGroups[monthKey]].sort((a, b) =>
          String(b.completedAt || b.date || '').localeCompare(String(a.completedAt || a.date || ''))
        );
        const dayGroups = entries.reduce((groups, entry) => {
          const dayKey = String(entry.date || entry.completedAt || '').slice(0, 10) || '日付未設定';
          if (!groups[dayKey]) groups[dayKey] = [];
          groups[dayKey].push(entry);
          return groups;
        }, {});
        const sortedDayKeys = Object.keys(dayGroups).sort((a, b) => b.localeCompare(a));
        const isOpen = openMonths[monthKey] !== false;

        const renderEntry = (entry) => (
          <div key={entry.type + '-' + entry.id} className="p-3">
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-bold text-gray-800 break-words">{entry.title}</div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black ${entry.type === 'partner' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                  {entry.type === 'partner' ? 'パートナー' : 'メンバー'}
                </span>
              </div>
              <div className="mt-1 text-[10px] text-gray-500">
                {entry.type === 'partner' && entry.partnerName ? entry.partnerName + ' ・ ' : ''}
                担当: {entry.ownerName}
                {entry.assigneeNames.length > 1 ? '（' + entry.assigneeNames.join('・') + '）' : ''}
              </div>
              <div className="text-[10px] text-gray-400">
                終了日時: {formatCompletedAt(entry.completedAt)}
              </div>
              {entry.content && (
                <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 whitespace-pre-wrap break-words">{entry.content}</div>
              )}
              {entry.imageUrl && <img src={entry.imageUrl} alt="添付画像" className="mt-2 max-h-40 max-w-full rounded-lg border object-contain"/>}
            </div>
          </div>
        );

        return <section key={monthKey} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleMonth(monthKey)}
            className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 border-b border-gray-100"
          >
            <span className="text-sm font-black text-gray-800">{formatMonth(monthKey)}</span>
            <span className="flex items-center gap-2 text-[10px] text-gray-500 font-bold">
              {entries.length}件 {isOpen ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}
            </span>
          </button>

          {isOpen && (
            <div className="divide-y divide-gray-100">
              {sortedDayKeys.map(dayKey => {
                const dayEntries = [...dayGroups[dayKey]].sort((a, b) =>
                  String(b.completedAt || '').localeCompare(String(a.completedAt || '')) ||
                  String(a.title || '').localeCompare(String(b.title || ''), 'ja')
                );
                return (
                  <section key={dayKey}>
                    <div className="px-4 py-2.5 bg-green-50 border-b border-green-100 flex items-center justify-between gap-2">
                      <div className="text-xs font-black text-green-800">{formatDateKey(dayKey)}</div>
                      <span className="shrink-0 rounded-full bg-green-100 text-green-800 px-2 py-0.5 text-[10px] font-black">{dayEntries.length}件</span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {dayEntries.map(renderEntry)}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </section>;
      })}
    </div>
  </div>
};

const BottomNav = ({ activeTab, setActiveTab, setSelectedDate, currentUser, roles }) => {
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
          onClick={() => { setSelectedDate(formatDate(new Date())); setActiveTab('daily'); }}
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

        <button
          onClick={() => setActiveTab('completed')}
          className={`flex-1 flex flex-col items-center justify-center space-y-1.5 relative ${activeTab === 'completed' ? 'text-green-600' : 'text-gray-400'}`}
        >
          <ClipboardList className="w-6 h-6"/>
          <span className="text-[10px] font-bold">終了履歴</span>
          {activeTab === 'completed' && <div className="absolute top-0 w-1/2 h-0.5 bg-green-600 rounded-b-full"></div>}
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
  // Firestoreのリアルタイム更新のたびに、現在の画面をログイン初期画面へ戻さないためのフラグ。
  const loginRestoreCompletedRef = useRef(false);
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
  // Firestoreの古いsnapshotで、直前に完了へ変更したタスクが一瞬未完了へ戻るのを防ぐ。
  const pendingTaskCompletionOverridesRef = useRef({});

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

        // タスク完了直後に届く古いsnapshotより、画面上で直前に変更した状態を優先する。
        Object.entries(pendingTaskCompletionOverridesRef.current).forEach(([key, override]) => {
          const { dateStr, ownerUid, taskId, completed, completedAt } = override;
          const ownerTasks = Array.isArray(currentTasks[dateStr]?.[ownerUid])
            ? currentTasks[dateStr][ownerUid]
            : [];
          const targetIndex = ownerTasks.findIndex(task => task?.id === taskId);
          if (targetIndex === -1) return;
          const firestoreTask = ownerTasks[targetIndex];
          if (!!firestoreTask.completed === completed && (firestoreTask.completedAt || null) === (completedAt || null)) {
            delete pendingTaskCompletionOverridesRef.current[key];
            return;
          }
          currentTasks[dateStr] = {
            ...(currentTasks[dateStr] || {}),
            [ownerUid]: ownerTasks.map((task, index) => index === targetIndex
              ? { ...task, completed, completedAt: completedAt || null }
              : task)
          };
        });
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
              // 初回のログイン復元時だけ初期画面を決める。
              // 以降のFirestore更新では、日別タスクの保存・削除などで
              // 現在の画面がカレンダーへ戻らないようにする。
              if (!loginRestoreCompletedRef.current) {
                setCurrentUser(restoredUser);
                setActiveTab(localStorage.getItem('teamshift_skip_help_on_login') === 'true' ? 'calendar' : 'help');
                loginRestoreCompletedRef.current = true;
              }
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
    setActiveTab(localStorage.getItem('teamshift_skip_help_on_login') === 'true' ? 'calendar' : 'help');
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
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('help')}
                  className="flex items-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-2 rounded-full transition-colors active:scale-95"
                  aria-label="使い方"
                >
                  <BookOpen size={17}/>
                  <span className="text-sm font-black">使い方</span>
                </button>
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
            </div>

            {activeTab === 'help' ? (
              <HelpView />
            ) : activeTab === 'partner' ? (
              <PartnerView
                currentUser={currentUser}
                debugLog={debugLog}
                partnerItems={partnerItems}
                partnerNames={partnerNames}
                sortedUsers={sortedUsers}
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
                  const updatedOwnerTasks = ownerTasks.map(t => t.id === taskId ? { ...t, ...(newText && typeof newText === 'object' ? newText : { text: newText }) } : t);
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
                  const nextCompletedAt = nextCompleted ? new Date().toISOString() : null;
                  const updatedOwnerTasks = ownerTasks.map(t =>
                    t.id === taskId
                      ? { ...t, completed: nextCompleted, completedAt: nextCompletedAt }
                      : t
                  );
                  pendingTaskCompletionOverridesRef.current[dateStr + '-' + ownerUid + '-' + taskId] = {
                    dateStr,
                    ownerUid,
                    taskId,
                    completed: nextCompleted,
                    completedAt: nextCompletedAt
                  };
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

                  const updatedShifts = {
                    ...teamData.shifts,
                    [dateStr]: { ...(teamData.shifts[dateStr] || {}), [targetUid]: shiftId }
                  };
                  const updatedTeamData = { ...teamData, shifts: updatedShifts };

                  const monthKey = dateStr.slice(0, 7).replace('-', '_');
                  const logEntry = {
                    id: `shiftlog_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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

                  // 画面を先に更新し、Firestoreにはシフト変更とログを同じ書き込みで保存する。
                  setTeamData(updatedTeamData);
                  setShiftLogs({ ...shiftLogs, [monthKey]: nextLogs });
                  try {
                    await updateDoc(doc(db, 'app_data', 'shared_state'), {
                      [`teamData.shifts.${dateStr}.${targetUid}`]: shiftId,
                      [`shiftLogs.${monthKey}`]: arrayUnion(logEntry)
                    });
                  } catch (error) {
                    console.error('シフト変更ログの保存に失敗しました:', error);
                    setTeamData(teamData);
                    setShiftLogs(shiftLogs);
                    alert('シフト変更を保存できませんでした。もう一度お試しください。');
                  }
                }} 
                sortedUsers={sortedUsers}
                bulkImportShifts={async (newShifts, changedCount) => {
                  if (!checkIsAdmin(currentUser, roles)) {
                    alert('シフトの一括取り込みは管理者のみ実行できます。');
                    return false;
                  }
                  const updatedTeamData = { ...teamData, shifts: newShifts };
                  const monthKey = `${currentDate.getFullYear()}_${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
                  const logEntry = {
                    id: `shiftlog_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    timestamp: new Date().toISOString(),
                    type: 'bulk',
                    actorUid: currentUser.id,
                    actorName: currentUser.name || '不明なユーザー',
                    monthKey,
                    monthLabel: `${currentDate.getMonth() + 1}月`,
                    changedCount: changedCount || 0
                  };
                  const nextLogs = [...(shiftLogs?.[monthKey] || []), logEntry];

                  setTeamData(updatedTeamData);
                  setShiftLogs({ ...shiftLogs, [monthKey]: nextLogs });
                  try {
                    await updateDoc(doc(db, 'app_data', 'shared_state'), {
                      teamData: updatedTeamData,
                      [`shiftLogs.${monthKey}`]: arrayUnion(logEntry)
                    });
                  } catch (error) {
                    console.error('一括取り込みログの保存に失敗しました:', error);
                    setTeamData(teamData);
                    setShiftLogs(shiftLogs);
                    alert('一括取り込みを保存できませんでした。もう一度お試しください。');
                    return false;
                  }
                  return true;
                }}
                updateShiftTypes={(newShiftTypes) => {
                  setShiftTypes(newShiftTypes);
                  saveToFirestore({ shiftTypes: newShiftTypes });
                }}
              />
            ) : activeTab === 'completed' ? (
              <CompletedTasksView
                teamData={teamData}
                partnerItems={partnerItems}
                sortedUsers={sortedUsers}
                currentUserUid={currentUser.id}
              />
            ) : activeTab === 'daily' ? (
              <DailyDetailView 
                addTask={(dateStr, targetUid, text, imageUrl = '', imageName = '', imagePublicId = '', imageBytes = 0, visibility = 'public', subject = '', endTime = '') => {
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
                            subject: subject || text,
                            endTime: endTime || '',
                            updates: [createPartnerUpdate(text, currentUser, imageUrl ? { imageUrl, imageName, imagePublicId, imageBytes } : null, 'initial')],
                            completed: false,
                            createdAt: new Date().toISOString(),
                            ownerUid: targetUid,
                            assigneeIds: [targetUid],
                            visibility: visibility === 'private' ? 'private' : 'public',
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
                deleteTask={async (dateStr, targetUid, taskId) => {
                  const dayTasks = teamData.tasks[dateStr] || {};
                  const updatedOwnerTasks = (dayTasks[targetUid] || []).filter(task => task.id !== taskId);
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
                  // 削除はFirestoreへの保存成功後に画面へ反映し、失敗時は詳細画面で再試行できるようにする。
                  await updateDoc(doc(db, 'app_data', 'shared_state'), {
                    [`teamData.tasks.${dateStr}.${targetUid}`]: updatedOwnerTasks
                  });
                  setTeamData(updatedTeamData);
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
                  const nextCompletedAt = nextCompleted ? new Date().toISOString() : null;
                  const updatedOwnerTasks = ownerTasks.map(t =>
                    t.id === taskId
                      ? { ...t, completed: nextCompleted, completedAt: nextCompletedAt }
                      : t
                  );
                  pendingTaskCompletionOverridesRef.current[dateStr + '-' + targetUid + '-' + taskId] = {
                    dateStr,
                    ownerUid: targetUid,
                    taskId,
                    completed: nextCompleted,
                    completedAt: nextCompletedAt
                  };
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
                    tasks: { ...teamData.tasks, [dateStr]: { ...(teamData.tasks[dateStr] || {}), [targetUid]: (teamData.tasks[dateStr]?.[targetUid] || []).map(t => t.id === taskId ? { ...t, ...(newText && typeof newText === 'object' ? newText : { text: newText }) } : t) } }
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

            <BottomNav activeTab={activeTab} currentUser={currentUser} roles={roles} setActiveTab={setActiveTab} setSelectedDate={setSelectedDate}/>
          </div>
        </div>
      )}
    </GoogleOAuthProvider>
  );
}