import CalendarBlocks from './components/CalendarBlocks';
import ViewerWorkspace from './components/ViewerWorkspace';
import { VIEWER_ROLE, withViewerRole, isReadOnlyUser, guardWrites } from './viewerPermission.mjs';
import SharedCalendarNote from './components/SharedCalendarNote';
import { planCalendarNote } from './calendarNote.mjs';
import ActionIconButton from './components/ActionIconButton';
import ImportantToggle, { ImportantBadge } from './components/ImportantToggle';
import CalendarDayPanel from './components/CalendarDayPanel';
import HelpView from './components/HelpView';
import AssigneePicker from './components/AssigneePicker';
import { partnerAssigneeIds } from './partnerAssignees.mjs';
import { newestPartnerUpdates } from './partnerUpdateOrder.mjs';
import { isPartnerOverdue } from './partnerOverdue.mjs';
import PartnerScheduleEditor from './components/PartnerScheduleEditor';
import { planPartnerSchedule } from './partnerSchedule.mjs';
import { canCompleteTask } from './taskCompletionPermission.mjs';
import QuarterHourTime from './components/QuarterHourTime';
import { newTaskAssignees } from './newTaskAssignees.mjs';
import QuickEntry from './components/QuickEntry';
import { establishReportSession, endReportSession } from './dailyReportApi.mjs';
import { planPartnerTaskAction } from './partnerTaskActions.mjs';
import DailyReportPanel from './components/DailyReportPanel';
import { parseInventoryCode, findModelProducts } from './inventoryQr.mjs';
import { planCompletedTaskDelete } from './completedTaskDelete.mjs';
import { confirmEditDiscard, confirmDiscardEdits, useEditGuard } from './editGuard';
import { sortInventoryItems } from './inventorySort.mjs';
import { planTaskDelete } from './taskDelete.mjs';
import { prepareTaskVideo } from './videoCompression.mjs';
import TaskSaveProgress from './components/TaskSaveProgress';
import { uploadWithProgress } from './uploadProgress.mjs';
import { ImagePicker, ImageGallery } from './components/TaskImages';
import { getTaskImages, mergeTaskImages, mergePartnerImageChanges, validateTaskImageFiles, isTaskVideo, validateTaskVideo, taskVideoPlaybackUrl } from './taskImages.mjs';
import { planTaskEdit } from './taskEdit.mjs';
import { prepareInventoryImage } from './inventoryImage.js';
import { hasInventoryProductDetails, inventoryProductLabel, validateInventoryReplacement } from './inventoryProduct.mjs';
import LabelOcrCapture from './components/LabelOcrCapture';
import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { GoogleOAuthProvider, GoogleLogin, googleLogout } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, onSnapshot, setDoc as firestoreSetDoc, updateDoc as firestoreUpdateDoc, deleteField, arrayUnion, runTransaction as firestoreRunTransaction } from 'firebase/firestore';

import { 
  Calendar as CalendarIcon, 
  CheckSquare, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  ChevronUp,
  ChevronDown,
  X, 
  Users, 
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
  Loader2,
  BookOpen,
  Package,
  Camera,
  History
} from 'lucide-react';

// Google OAuth Client ID
let writeIdentity = { user: null, roles: {} };
const { setDoc, updateDoc, runTransaction } = guardWrites(() => writeIdentity, { setDoc: firestoreSetDoc, updateDoc: firestoreUpdateDoc, runTransaction: firestoreRunTransaction });

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
const uploadTaskImageToCloudinary = async (file, resourceType = 'image', onProgress) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  const url = resourceType === 'video' ? CLOUDINARY_UPLOAD_URL.replace('/image/upload', '/video/upload') : CLOUDINARY_UPLOAD_URL;
  let response, result;
  if (onProgress) {
    response = await uploadWithProgress(url, formData, onProgress);
    result = response.result;
  } else {
    response = await fetch(url, { method: 'POST', body: formData });
    result = await response.json();
  }
  if (!response.ok || !result.secure_url) {
    throw new Error(resourceType === 'video' && /not allowed/i.test(result?.error?.message || '') ? '保存先でこの動画形式が許可されていません。管理者にCloudinaryの許可形式をご確認ください。' : result?.error?.message || '画像・動画のアップロードに失敗しました。');
  }
  return result;
};

const taskImageUploadCache = new WeakMap();
const uploadTaskImages = async (files, onProgress = () => {}) => {
  validateTaskImageFiles(files);
  onProgress({ stage: 'checking' });
  const videoDurations = new Map();
  for (const file of files.filter(isTaskVideo)) videoDurations.set(file, await validateTaskVideo(file));
  onProgress({ stage: 'preparing' });
  const preparedFiles = new Map();
  for (const file of files) if (!taskImageUploadCache.has(file)) preparedFiles.set(file, isTaskVideo(file) ? await prepareTaskVideo(file, videoDurations.get(file), onProgress) : await prepareInventoryImage(file));
  const pending = files.filter(file=>!taskImageUploadCache.has(file));
  const totalBytes = pending.reduce((sum,file)=>sum + preparedFiles.get(file).size,0);
  let completedBytes = 0;
  const images = [];
  for (const file of files) {
    let image = taskImageUploadCache.get(file);
    if (!image) {
      const video = isTaskVideo(file);
      const prepared = preparedFiles.get(file);
      const index = pending.indexOf(file) + 1;
      const base = { index, count: pending.length };
      onProgress({ ...base, stage: 'uploading', percent: totalBytes ? Math.round(completedBytes / totalBytes * 100) : null, remainingSeconds: null });
      const uploaded = await uploadTaskImageToCloudinary(prepared, video ? 'video' : 'image', event => {
        const fileRatio = event.stage === 'processing' ? 1 : event.total > 0 ? Math.min(1, event.loaded / event.total) : 0;
        const loaded = completedBytes + prepared.size * fileRatio;
        const speed = event.bytesPerSecond > 0 && event.total > 0 ? event.bytesPerSecond * prepared.size / event.total : 0;
        onProgress({ ...base, stage: event.stage, percent: totalBytes && (event.stage === 'processing' || event.total > 0) ? Math.round(loaded / totalBytes * 100) : null, remainingSeconds: speed > 0 ? Math.ceil((totalBytes - loaded) / speed) : null });
      });
      completedBytes += prepared.size;
      // Encoders may add a few milliseconds of audio padding to an already validated 30-second source.
      const durationLimit = prepared !== file ? 30.1 : 30;
      if (video && (!Number.isFinite(uploaded.duration) || uploaded.duration > durationLimit || uploaded.duration <= 0)) throw new Error('保存先で動画の長さを確認できませんでした。30秒以内の動画を選び直してください。');
      image = { imageUrl: uploaded.secure_url, imageName: prepared.name, imagePublicId: uploaded.public_id || '', imageBytes: Number(uploaded.bytes || prepared.size || 0), ...(video ? { mediaType: 'video', duration: uploaded.duration || videoDurations.get(file), playbackUrl: taskVideoPlaybackUrl(uploaded.secure_url) } : {}) };
      taskImageUploadCache.set(file, image);
    }
    images.push(image);
  }
  onProgress({ stage: 'saving' });
  return images;
};

const INITIAL_ROLES = {
  viewer: VIEWER_ROLE,
  admin: { level: 40, name: '管理者' },
  area_manager: { level: 30, name: 'エリアM' },
  manager: { level: 20, name: '店長' },
  staff: { level: 10, name: 'スタッフ' }
};

const INVENTORY_SEED_ITEMS = [
  { id: 'inventory_led_1', kind: '', name: 'LED電球１', usageLocation: '', stock: 0 },
  { id: 'inventory_led_2', kind: '', name: 'LED電球２', usageLocation: '', stock: 0 },
  { id: 'inventory_jr_35', kind: '', name: 'ＪＲ１２Ｖ３５Ｗ／Ｋ５ＳＥＺ／Ｎ', usageLocation: '', stock: 0 },
  { id: 'inventory_jr_50', kind: '', name: 'ＪＲ１２Ｖ５０ＷＫＷ５ＥＺＨ２', usageLocation: '', stock: 0 },
  { id: 'inventory_lds_36', kind: '', name: 'ＬＤＳ１１０Ｖ３６Ｗ・Ｗ・Ｋ', usageLocation: '', stock: 0 },
  { id: 'inventory_lds_54', kind: '', name: 'ＬＤＳ１１０Ｖ５４Ｗ・Ｗ・Ｋ', usageLocation: '', stock: 0 },
  { id: 'inventory_lds_90', kind: '', name: 'ＬＤＳ１１０Ｖ９０Ｗ・Ｗ・ＫＡ', usageLocation: '', stock: 0 }
];

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
  viewer: '閲覧のみ',
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
  ...(Array.isArray(image) ? { images: image } : image?.imageUrl ? { imageUrl: image.imageUrl, imageName: image.imageName || '', imagePublicId: image.imagePublicId || '', imageBytes: Number(image.imageBytes || 0) } : {})
});

const PartnerUpdateHistory = ({ item, onOpen }) => {
  const updates = newestPartnerUpdates(getPartnerUpdates(item)).reverse();
  const historyRef = useRef(null);
  const contentRef = useRef(null);
  const latestUpdateId = updates[updates.length - 1]?.id;
  useLayoutEffect(() => {
    const scroller = historyRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    let followBottom = true;
    const toBottom = () => { if (followBottom) scroller.scrollTop = scroller.scrollHeight; };
    const onScroll = () => { followBottom = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop < 12; };
    toBottom();
    scroller.addEventListener('scroll', onScroll);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(toBottom);
    observer?.observe(content);
    return () => { scroller.removeEventListener('scroll', onScroll); observer?.disconnect(); };
  }, [item?.id, latestUpdateId]);
  if (!updates.length) return null;
  const renderUpdate = update => <div key={update.id} className="rounded-xl border border-gray-200 bg-white p-3">
    <div className="text-sm font-bold text-gray-600">（{update.authorName || '不明なユーザー'}）{update.createdAt ? ' ・ ' + new Date(update.createdAt).toLocaleString('ja-JP') : ''}</div>
    <div className="text-base text-gray-800 whitespace-pre-wrap break-words mt-2">{update.text}</div><ImageGallery item={update} onOpen={onOpen}/>
  </div>;
  return <section className="space-y-2" aria-label="申し送り履歴">
    <h3 className="text-base font-bold text-blue-800">申し送り（古い順）</h3>
    <div ref={historyRef} className="max-h-64 overflow-y-auto space-y-2 pr-1" tabIndex={0} aria-label="申し送りをスクロール">
      <div ref={contentRef} className="space-y-2">{updates.map(update => renderUpdate(update))}</div>
    </div>
  </section>;
};

const checkCanManageShift = (user, roles) => {
  if (!user || !roles[user.role] || isReadOnlyUser(user, roles)) return false;
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
      <a href="/privacy.html" className="block text-xs text-blue-700 underline">プライバシーポリシー</a>
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

const CalendarView = ({ calendarNote, saveCalendarNote, currentDate, changeMonth, teamData, partnerItems, partnerNames, currentUserUid, shiftTypes, sortedUsers, roles, currentUser, updateTaskAssignees, updateTaskText, deleteTask, toggleTask, updatePartnerItem, completePartnerItem, reschedulePartnerItem, deletePartnerItem }) => {
  const readOnly = isReadOnlyUser(currentUser, roles);
  const partnerDetailBodyRef = useRef(null);
  const [calendarDay, setCalendarDay] = useState(null);
  const [detailTask, setDetailTask] = useState(null);
  const [detailPartner, setDetailPartner] = useState(null);
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState([]);
  const [isUpdatingAssignees, setIsUpdatingAssignees] = useState(false);
  const [assigneeUpdateMessage, setAssigneeUpdateMessage] = useState('');
  const [editingTaskText, setEditingTaskText] = useState('');
  const [editingTaskImportant, setEditingTaskImportant] = useState(false);
  const [calendarTaskImages, setCalendarTaskImages] = useState([]);
  const calendarSavingRef = useRef(false);
  const [calendarUploadProgress, setCalendarUploadProgress] = useState(null);
  const [isEditingTask, setIsEditingTask] = useState(false);
  const [isEditingPartner, setIsEditingPartner] = useState(false);
  useEffect(() => { partnerDetailBodyRef.current?.scrollTo({ top: 0 }); }, [detailPartner?.id, isEditingPartner]);
  const [partnerEditName, setPartnerEditName] = useState('');
  const [partnerEditSubject, setPartnerEditSubject] = useState('');
  const [partnerEditImportant, setPartnerEditImportant] = useState(false);
  const [partnerEditAssigneeIds, setPartnerEditAssigneeIds] = useState([]);
  const partnerEditAssigneeUid = partnerEditAssigneeIds[0] || '';
  const [partnerEditDate, setPartnerEditDate] = useState('');
  const [partnerEditHour, setPartnerEditHour] = useState('');
  const [partnerEditMinute, setPartnerEditMinute] = useState('');
  const [partnerEditEndTime, setPartnerEditEndTime] = useState('');
  const [partnerEditNote, setPartnerEditNote] = useState('');
  const [partnerEditImages, setPartnerEditImages] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedPartnerImage, setSelectedPartnerImage] = useState(null);
  const [partnerImageScale, setPartnerImageScale] = useState(1);
  const [partnerImagePosition, setPartnerImagePosition] = useState({ x: 0, y: 0 });
  const partnerPinchRef = useRef(null);
  const partnerPanRef = useRef(null);
  const isAdmin = currentUser?.role === 'admin' || (roles?.[currentUser?.role]?.level || 0) >= 40;
  const canEditTask = !readOnly && detailTask && (isAdmin || detailTask.ownerUid === currentUserUid);
  const canFinishTask = !readOnly && canCompleteTask(detailTask, detailTask?.ownerUid, currentUserUid, isAdmin);
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
    const dayOfWeek=new Date(year,month,i).getDay();
    const dayBgClass=isPastDate?'bg-gray-200':isHoliday?'bg-rose-50':'';
    const dateTextClass=isHoliday||dayOfWeek===0?'text-red-600':dayOfWeek===6?'text-blue-600':isPastDate?'text-gray-400':'text-gray-700';
    days.push(<button type="button" aria-label={dateStr.replace(/-/g, '/') + 'の予定を開く'} key={i} onClick={()=>{setSelectedCalendarTaskDate(dateStr);setCalendarDay(dateStr);}} className={`p-1 border-b border-r border-gray-100 min-h-[80px] cursor-pointer active:bg-gray-50 flex flex-col ${dayBgClass}`}>
      <div className="flex justify-between items-start p-1"><div className="flex items-baseline gap-1 min-w-0"><span className={`text-sm font-bold shrink-0 ${new Date().getDate()===i&&new Date().getMonth()===month?'bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center':dateTextClass}`}>{i}</span></div>{hasMyTask&&<div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5"></div>}</div>
      <div className="mt-1 flex-1 px-1">{myShift.id!=='none'&&<div className={`text-[10px] font-bold px-1.5 py-0.5 rounded truncate ${myShift.color}`}>{myShift.label}</div>}</div>
    </button>);
  }
  const activePartnerItems=(partnerItems||[]).filter(i=>!i.completed).sort((a,b)=>`${a.date||''}T${a.time||'00:00'}`.localeCompare(`${b.date||''}T${b.time||'00:00'}`));
  const datesToShow=Array.from(new Set([...Object.keys(teamData.tasks||{}).filter(d=>d<todayStr),selectedCalendarTaskDate])).sort();
  const selectedTasks=datesToShow.flatMap(taskDate=>(sortedUsers||[]).flatMap(member=>(teamData.tasks[taskDate]?.[member.id]||[]).filter(t=>t.visibility!=='private'&&!t.completed).map(task=>({...task,ownerUid:member.id,member,taskDate,assigneeIds:Array.isArray(task.assigneeIds)&&task.assigneeIds.length?task.assigneeIds:[member.id]}))));
  const startPartnerEdit=()=>{const [h='',m='']=String(detailPartner?.time||'').split(':');setPartnerEditName(detailPartner?.partnerName||'');setPartnerEditSubject(detailPartner?.subject||'');setPartnerEditImportant(detailPartner?.important === true);setPartnerEditAssigneeIds(partnerAssigneeIds(detailPartner));setPartnerEditDate(detailPartner?.date||'');setPartnerEditHour(h);setPartnerEditMinute(m);setPartnerEditEndTime(detailPartner?.endTime||'');setPartnerEditNote('');setPartnerEditImages([]);setCalendarUploadProgress(null);setIsEditingPartner(true);};
  useEditGuard(isEditingTask || isEditingPartner, isSaving);
  const closeTaskDetail = () => { if (confirmEditDiscard(isEditingTask, isSaving)) { setDetailTask(null); setIsEditingTask(false); } };
  const closePartnerDetail = () => { if (confirmEditDiscard(isEditingPartner, isSaving)) { setDetailPartner(null); setIsEditingPartner(false); } };
  const clearPartnerEditImage=()=>setPartnerEditImages([]);
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
  const savePartnerEdit=async()=>{if(!detailPartner||!updatePartnerItem||calendarSavingRef.current)return;if(!partnerEditName||!partnerEditSubject.trim()||!partnerEditAssigneeUid||!partnerEditDate||!partnerEditHour||!partnerEditMinute){alert('パートナー名・件名・担当者・日付・時間を入力してください。');return;}const noteText=partnerEditNote.trim();calendarSavingRef.current=true;setCalendarUploadProgress({stage:'checking'});setIsSaving(true);try{const changes={partnerName:partnerEditName,subject:partnerEditSubject.trim(),important:partnerEditImportant,assigneeUid:partnerEditAssigneeUid,assigneeIds:partnerEditAssigneeIds,date:partnerEditDate,time:`${partnerEditHour}:${partnerEditMinute}`,endTime:partnerEditEndTime};const imageData=await uploadTaskImages(partnerEditImages, setCalendarUploadProgress);if(noteText||imageData.length){const updates=[...getPartnerUpdates(detailPartner),createPartnerUpdate(noteText,currentUser,imageData)];changes.updates=updates;changes.content=noteText||detailPartner.content||'';}await updatePartnerItem(detailPartner.id,changes);setDetailPartner(p=>p?{...p,...changes}:p);setCalendarUploadProgress({stage:'done'});setIsEditingPartner(false);setPartnerEditNote('');clearPartnerEditImage();}catch(e){setCalendarUploadProgress({stage:'error',message:e.message});console.error('パートナー申し送り画像の保存に失敗しました:',e);alert(`パートナータスクの更新に失敗しました。\n${e?.message||'画像のアップロードに失敗しました。'}`);}finally{calendarSavingRef.current=false;setIsSaving(false);}};
  const saveTaskEdit=async()=>{if(!detailTask||!canEditTask||calendarSavingRef.current)return;calendarSavingRef.current=true;setCalendarUploadProgress({stage:'checking'});setIsSaving(true);try{const text=editingTaskText.trim();const newImages=await uploadTaskImages(calendarTaskImages, setCalendarUploadProgress);await updateTaskText(detailTask.taskDate,detailTask.ownerUid,detailTask.id,{text,newImages,important:editingTaskImportant});setDetailTask(p=>p?{...p,text,important:editingTaskImportant,images:mergeTaskImages(p,newImages)}:p);setCalendarTaskImages([]);setCalendarUploadProgress({stage:'done'});setIsEditingTask(false);}catch{setCalendarUploadProgress({stage:'error'});alert('タスクの更新に失敗しました。');}finally{calendarSavingRef.current=false;setIsSaving(false);}};
  const removeTask=async()=>{if(!detailTask||!canEditTask||calendarSavingRef.current)return;if(!window.confirm('このタスクを削除してもよろしいですか？\n使用済みの商品がある場合は在庫へ戻します。'))return;calendarSavingRef.current=true;setIsSaving(true);try{await deleteTask(detailTask.taskDate,detailTask.ownerUid,detailTask.id);setDetailTask(null);}catch(error){alert(`タスクを削除できませんでした。\n${error.message||'もう一度お試しください。'}`);}finally{calendarSavingRef.current=false;setIsSaving(false);}};
  const runPartnerAction = async (action) => {
    if (!detailPartner || calendarSavingRef.current) return;
    const title = detailPartner.subject || detailPartner.partnerName || 'パートナータスク';
    const message = action === 'complete'
      ? `「${title}」を終了しますか？\n終了履歴に移動します。`
      : `「${title}」を削除しますか？\n申し送り・添付の記録も一覧から削除され、元に戻せません。`;
    if (!window.confirm(message)) return;
    calendarSavingRef.current = true;
    setIsSaving(true);
    try {
      if (action === 'complete') await completePartnerItem(detailPartner.id);
      else await deletePartnerItem(detailPartner.id);
      setDetailPartner(null);
    } catch (error) {
      alert(`パートナータスクを${action === 'complete' ? '終了' : '削除'}できませんでした。\n${error.message || 'もう一度お試しください。'}`);
    } finally {
      calendarSavingRef.current = false;
      setIsSaving(false);
    }
  };
  const finishTask=async()=>{if(!detailTask||!canFinishTask)return;await toggleTask(detailTask.taskDate,detailTask.ownerUid,detailTask.id);setDetailTask(null);};

  return <div className="flex-1 flex flex-col bg-gray-50 pb-[68px] overflow-hidden">
    <div className="bg-white px-4 py-3 flex items-center justify-between shadow-sm z-10 shrink-0 md:border-b md:border-gray-200"><button onClick={()=>changeMonth(-1)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full"><ChevronLeft className="w-5 h-5"/></button><h2 className="text-base font-bold text-gray-800">{year}年 {month+1}月</h2><button onClick={()=>changeMonth(1)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full"><ChevronRight className="w-5 h-5"/></button></div>
    <div data-calendar-scroll className="flex-1 overflow-y-auto bg-white"><CalendarBlocks key={currentUserUid} userKey={currentUserUid} blocks={{ memo: (<SharedCalendarNote readOnly={readOnly} note={calendarNote} onSave={saveCalendarNote}/>), calendar: (<div className="min-w-0 md:border md:border-gray-200 md:rounded-xl md:overflow-hidden"><div className="grid grid-cols-7 border-b border-gray-200 sticky top-0 bg-white z-10 shadow-sm">{DAYS_OF_WEEK.map((d,i)=><div key={d} className={`py-2 text-center text-[10px] font-bold ${i===0?'text-red-500':i===6?'text-blue-500':'text-gray-500'}`}>{d}</div>)}</div><div className="grid grid-cols-7 border-l border-gray-100">{days}</div></div>), partner: (<div className="border-t border-gray-200 bg-blue-50/40 px-3 py-2"><div className="flex items-center justify-between mb-1.5"><h3 className="text-[11px] font-bold text-gray-600">パートナータスク</h3><span className="text-[9px] text-gray-400">{activePartnerItems.length}件</span></div>{activePartnerItems.length===0?<p className="text-[10px] text-gray-400 py-1">登録されている未終了のパートナータスクはありません</p>:<div className="space-y-1.5">{activePartnerItems.map(item=><button type="button" key={item.id} onClick={async ()=>{setDetailPartner(item);setIsEditingPartner(false);const handoffs=getPartnerHandoffUpdates(item);const latest=handoffs[handoffs.length-1];if(!readOnly&&latest?.id&&item?.handoffReadBy?.[currentUserUid]!==latest.id){try{await updatePartnerItem(item.id,{handoffReadBy:{...(item.handoffReadBy||{}),[currentUserUid]:latest.id}});}catch(e){console.error("申し送り確認状態の保存に失敗しました:",e);}}}} className={`w-full text-left min-w-0 transition-colors ${item.important === true ? '!border-red-500 !border-2' : ''} ${item.date === todayStr ? 'bg-white min-h-[88px] border-2 border-blue-500 rounded-2xl p-2 shadow-sm hover:bg-blue-50' : 'bg-white min-h-11 border border-blue-100 rounded-md px-2 py-1.5 flex items-center gap-2 hover:border-blue-300 active:bg-blue-50'}`}>{item.date === todayStr ? <div className="space-y-1">
  <div className="flex flex-wrap items-center justify-between gap-1"><span className="rounded-full bg-blue-600 text-white px-2 py-0.5 text-xs font-bold">今日</span><span className="text-xs font-bold text-blue-700">{item.date.replace(/-/g, '/')}</span><span className="text-lg font-bold text-gray-900">{item.time || '--:--'}{item.endTime && <span className="ml-1 text-sm text-gray-600">〜 {item.endTime}</span>}</span><ImportantBadge important={item.important}/></div>
  <div className="text-base font-bold text-gray-900 whitespace-pre-wrap break-words"><span className="text-sm text-purple-700">{item.partnerName || 'パートナー未設定'} ／ </span>{item.subject || (item.content || '').split(/\r?\n/)[0] || '件名未設定'}</div>
  <div className="flex flex-wrap justify-between gap-1 text-xs text-gray-600"><span>担当：{partnerAssigneeIds(item).map(id => (sortedUsers || []).find(user => user.id === id)?.name).filter(Boolean).join('・') || '未設定'}</span><span className="font-bold text-blue-700">詳細を開く ›</span>{hasUnreadPartnerHandoff(item,currentUserUid) && <span className="font-bold text-orange-800">申し送りあり</span>}</div>
</div> : <>{item.date&&item.date<todayStr?<span className="shrink-0 text-[8px] font-bold text-red-500 whitespace-nowrap">未終了 {item.date.replace(/-/g,'/')}</span>:<span className="shrink-0 text-[8px] font-bold text-blue-600 whitespace-nowrap">{item.date?item.date.replace(/-/g,'/'):'日付なし'}</span>}<span className="shrink-0 text-[8px] text-gray-500">{item.time||'--:--'}</span><ImportantBadge important={item.important}/><span className="shrink-0 max-w-24 text-[9px] font-bold text-purple-600 truncate">{item.partnerName||'パートナー未設定'}</span><span className="min-w-0 flex-1 text-[10px] font-bold text-gray-800 truncate">{item.subject||(item.content||'').split(/\r?\n/)[0]||'件名未設定'}</span>{hasUnreadPartnerHandoff(item,currentUserUid)&&<span className="shrink-0 w-1.5 h-1.5 bg-blue-500 rounded-full shrink-0 mt-1" title="申し送りあり" aria-label="申し送りあり"></span>}</>}</button>)}</div>}</div>), member: (<div className="border-t border-gray-200 bg-gray-50 px-3 py-2"><div className="flex items-center justify-between mb-1.5"><h3 className="text-[11px] font-bold text-gray-600">本日のタスク（全員）</h3><span className="text-[9px] text-gray-400">{selectedCalendarTaskDate.replace(/-/g,'/')}・{selectedTasks.length}件</span></div>{selectedTasks.length===0?<p className="text-[10px] text-gray-400 py-1">本日までに終了していないタスクはありません</p>:<div className="space-y-1.5">{[...selectedTasks].sort((a, b) => a.taskDate.localeCompare(b.taskDate) || String(a.createdAt || '').localeCompare(String(b.createdAt || ''))).map(task=><button type="button" key={`${task.taskDate}-${task.ownerUid}-${task.id}`} onClick={()=>{setDetailTask(task);setSelectedAssigneeIds(task.assigneeIds);setAssigneeUpdateMessage('');setIsEditingTask(false);}} className={`w-full text-left bg-white min-w-0 transition-colors ${task.important === true ? '!border-red-500 !border-2' : ''} ${task.taskDate === todayStr ? 'min-h-[88px] border-2 border-blue-500 rounded-2xl p-2 shadow-sm hover:bg-blue-50' : 'min-h-11 border border-blue-100 rounded-md px-2 py-1.5 flex items-center gap-2 hover:border-blue-300 active:bg-blue-50'}`}>{task.taskDate === todayStr ? <div className="space-y-1">
  <div className="flex flex-wrap items-center justify-between gap-1"><span className="rounded-full bg-blue-600 text-white px-2 py-0.5 text-xs font-bold">今日</span><span className="text-xs font-bold text-blue-700">{task.taskDate.replace(/-/g, '/')}</span><ImportantBadge important={task.important}/><span className="text-sm font-bold text-orange-700">終了予定 {task.endTime || '未設定'}</span></div>
  <div className="text-base font-bold text-gray-900 whitespace-pre-wrap break-words">{task.subject || task.text || '📷 画像タスク'}</div>
  {task.subject && task.text && <div className="text-sm text-gray-600 whitespace-pre-wrap break-words line-clamp-2">{task.text}</div>}
  <div className="flex flex-wrap justify-between gap-1 text-xs text-gray-600"><span>担当：{task.assigneeIds.map(id => sortedUsers.find(user => user.id === id)?.name?.split(' ')[0] || '').filter(Boolean).join('・') || '未設定'}</span><span className="font-bold text-blue-700">詳細を開く ›</span></div>
</div> : <><span className={`shrink-0 text-[8px] font-bold whitespace-nowrap ${task.taskDate < todayStr ? 'text-red-500' : 'text-gray-600'}`}>対象日 {task.taskDate.replace(/-/g,'/')}</span><ImportantBadge important={task.important}/><span className="min-w-0 flex-1 text-[10px] truncate text-gray-700"><span className="font-bold">{task.subject||task.text||'📷 画像タスク'}</span>{task.subject&&task.text&&<span className="ml-1 text-gray-500">{task.text}</span>}</span><span className="shrink-0 text-[8px] text-orange-600">終了予定 {task.endTime||'未設定'}</span><span className="shrink-0 max-w-32 text-[8px] text-purple-600 truncate">担当: {task.assigneeIds.map(id=>sortedUsers.find(u=>u.id===id)?.name?.split(' ')[0]||'').filter(Boolean).join('・')}</span><span className="shrink-0 text-[8px] text-gray-400">開始 {task.createdAt?new Date(task.createdAt).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'}):'--:--'}</span></>}</button>)}</div>}</div>) }}/>
    {calendarDay && !detailTask && !detailPartner && <CalendarDayPanel date={calendarDay} today={todayStr} teamData={teamData} partnerItems={partnerItems || []} users={sortedUsers || []} shiftTypes={shiftTypes} onClose={() => setCalendarDay(null)} onDateChange={date => { setCalendarDay(date); setSelectedCalendarTaskDate(date); }} onTask={task => { setDetailTask(task); setSelectedAssigneeIds(task.assigneeIds); setAssigneeUpdateMessage(''); setIsEditingTask(false); }} onPartner={async item => { setDetailPartner(item); setIsEditingPartner(false); const updates = getPartnerHandoffUpdates(item); const latest = updates[updates.length - 1]; if (!readOnly && latest?.id && item.handoffReadBy?.[currentUserUid] !== latest.id) { try { await updatePartnerItem(item.id, { handoffReadBy: { ...(item.handoffReadBy || {}), [currentUserUid]: latest.id } }); } catch (error) { console.error('申し送り確認状態の保存に失敗しました:', error); } } }}/>}
    {detailPartner&&<div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-2 sm:p-4" onClick={closePartnerDetail}><div className="w-full max-w-md max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col" onClick={e=>e.stopPropagation()}><div className="px-4 py-3 border-b flex items-center justify-between shrink-0"><div><div className="text-sm font-bold text-gray-800">パートナータスク詳細</div><div className="text-[10px] text-gray-400">{detailPartner.date?.replace(/-/g,'/')} {detailPartner.time||'--:--'} ・ 終了予定 {detailPartner.endTime||'未設定'}</div></div><button onClick={closePartnerDetail} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-full"><X size={18}/></button></div><div ref={partnerDetailBodyRef} className="p-4 space-y-3 overflow-y-auto min-h-0 flex-1">{isEditingPartner && !readOnly?<><select value={partnerEditName} onChange={e=>setPartnerEditName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm"><option value="">パートナーを選択</option>{(partnerNames||[]).map(n=><option key={n} value={n}>{n}</option>)}</select><input type="text" value={partnerEditSubject} onChange={e=>setPartnerEditSubject(e.target.value)} placeholder="件名" className="w-full border rounded-lg px-3 py-2 text-sm"/><ImportantToggle value={partnerEditImportant} onChange={setPartnerEditImportant} disabled={isSaving}/><AssigneePicker users={sortedUsers} value={partnerEditAssigneeIds} onChange={setPartnerEditAssigneeIds} disabled={isSaving}/><div className="grid grid-cols-2 gap-2"><input type="date" value={partnerEditDate} onChange={e=>setPartnerEditDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm"/><div className="flex gap-1"><select value={partnerEditHour} onChange={e=>setPartnerEditHour(e.target.value)} className="w-1/2 border rounded-lg px-1 py-2 text-sm"><option value="">時</option>{Array.from({length:24},(_,i)=>String(i).padStart(2,'0')).map(v=><option key={v} value={v}>{v}</option>)}</select><select value={partnerEditMinute} onChange={e=>setPartnerEditMinute(e.target.value)} className="w-1/2 border rounded-lg px-1 py-2 text-sm"><option value="">分</option>{['00','15','30','45'].map(v=><option key={v} value={v}>{v}</option>)}</select></div><label className="block"><span className="text-[10px] font-bold text-gray-500">終了予定時刻</span><div className="flex items-center gap-1"><select aria-label="終了予定時刻の時" value={partnerEditEndTime ? partnerEditEndTime.split(':')[0] : ''} onChange={e=>setPartnerEditEndTime(e.target.value ? e.target.value+':'+((partnerEditEndTime||'').split(':')[1]||'00') : '')} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" ><option value="">時</option>{Array.from({length:24},(_,i)=>String(i).padStart(2,'0')).map(v=><option key={v} value={v}>{v}</option>)}</select><span>:</span><select aria-label="終了予定時刻の分" value={partnerEditEndTime ? partnerEditEndTime.split(':')[1] : ''} onChange={e=>setPartnerEditEndTime(((partnerEditEndTime||'').split(':')[0]||'00')+':'+e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" ><option value="">分</option>{['00','15','30','45'].map(v=><option key={v} value={v}>{v}</option>)}</select></div></label></div><div className="space-y-2"><PartnerUpdateHistory item={detailPartner} onOpen={openPartnerImage}/><div><div className="text-[10px] font-bold text-gray-500 mb-1">今回の申し送り・追記</div><textarea value={partnerEditNote} onChange={e=>setPartnerEditNote(e.target.value)} rows={5} placeholder="今回追加する申し送りを入力" className="w-full border rounded-lg px-3 py-2 text-sm resize-y"/><ImagePicker files={partnerEditImages} onChange={setPartnerEditImages} disabled={isSaving}/><TaskSaveProgress progress={calendarUploadProgress}/><p className="text-[9px] text-gray-400 mt-1">画像は各10MB以下。動画は30秒以内。20MBを超える動画は自動圧縮します。添付だけでも保存できます。</p></div></div><div className="flex gap-2 sticky bottom-0 bg-white pt-2 pb-1 border-t border-gray-100"><button type="button" onClick={()=>{if(confirmEditDiscard(true,isSaving))setIsEditingPartner(false);}} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold">キャンセル</button><button type="button" disabled={isSaving} onClick={savePartnerEdit} className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold"><span>{isSaving?'保存中…':'変更を保存'}</span></button></div></>:<><div className="text-xs font-bold text-purple-600">{detailPartner.partnerName||'パートナー未設定'}</div><div className="text-base font-bold text-gray-800">{detailPartner.subject||(detailPartner.content||'').split(/\r?\n/)[0]||'件名未設定'}</div>{((detailPartner.updates||[]).some(u=>u?.kind==='handoff')||(detailPartner.updates||[]).length>1)&&<div className="inline-flex px-2 py-1 rounded-full bg-orange-50 text-orange-700 text-[10px] font-bold">申し送りあり</div>}<div className="text-xs font-bold text-blue-600">担当: {partnerAssigneeIds(detailPartner).map(id => (sortedUsers || []).find(user => user.id === id)?.name).filter(Boolean).join('・') || '未設定'}</div>{!readOnly && !detailPartner.completed && <PartnerScheduleEditor item={detailPartner} disabled={isSaving} onSave={async (id, schedule) => { await reschedulePartnerItem(id, schedule); setDetailPartner(item => item?.id === id ? { ...item, ...schedule } : item); }}/>}<PartnerUpdateHistory item={detailPartner} onOpen={openPartnerImage}/><ImageGallery item={detailPartner} onOpen={openPartnerImage}/>{!readOnly && !detailPartner.completed && <div className="sticky bottom-0 bg-white pt-3 border-t border-gray-100 space-y-2">
<div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-stretch gap-2">
<ActionIconButton action="edit" type="button" disabled={isSaving} onClick={startPartnerEdit} className=""/>
<button type="button" disabled={isSaving} onClick={() => runPartnerAction('complete')} className="min-h-11 flex items-center justify-center gap-2 rounded-xl border border-green-600 bg-green-600 px-2 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-40"><CheckSquare size={20} className="shrink-0" aria-hidden="true"/><span>タスクを終了</span></button>
<ActionIconButton action="delete" type="button" disabled={isSaving} onClick={() => runPartnerAction('delete')} className=""/>
</div>{isSaving && <p role="status" className="text-xs text-gray-500">処理中…</p>}</div>}{detailPartner.completed && <p className="font-bold text-green-700">終了済み</p>}</>}</div></div></div>}
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
    {detailTask&&<div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={closeTaskDetail}><div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden" onClick={e=>e.stopPropagation()}><div className="px-4 py-3 border-b flex items-center justify-between"><div><div className="text-sm font-bold text-gray-800">タスク詳細</div><div className="text-[10px] text-gray-400">登録者: {detailTask.member.name}</div>{!canEditTask&&<div className="text-[9px] text-gray-400">他のメンバーのタスクは操作できません</div>}</div><button onClick={closeTaskDetail} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-full"><X size={18}/></button></div><div className="p-4 space-y-3">{isEditingTask && !readOnly?<><ImageGallery item={detailTask}/><ImagePicker files={calendarTaskImages} onChange={setCalendarTaskImages} disabled={isSaving}/><TaskSaveProgress progress={calendarUploadProgress}/><ImportantToggle value={editingTaskImportant} onChange={setEditingTaskImportant} disabled={isSaving}/><textarea value={editingTaskText} onChange={e=>setEditingTaskText(e.target.value)} rows={5} className="w-full border rounded-xl px-3 py-2.5 text-sm resize-y"/><div className="flex gap-2"><button type="button" onClick={()=>{if(confirmEditDiscard(true,isSaving))setIsEditingTask(false);}} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold">キャンセル</button><button type="button" disabled={isSaving} onClick={saveTaskEdit} className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold"><span>{isSaving?'保存中…':'変更を保存'}</span></button></div></>:<><div className="text-base font-bold text-gray-800 whitespace-pre-wrap break-words">{detailTask.subject||detailTask.text||'📷 画像タスク'}</div>{detailTask.subject&&detailTask.text&&<div className="text-sm text-gray-700 whitespace-pre-wrap break-words">{detailTask.text}</div>}<div className="text-xs text-orange-600 font-bold">終了予定: {detailTask.endTime||'未設定'}</div><ImageGallery item={detailTask}/><div className="grid grid-cols-2 gap-2 text-[10px] text-gray-500"><div className="bg-gray-50 rounded-lg p-2">開始<br/><span className="font-bold text-gray-700">{detailTask.createdAt?new Date(detailTask.createdAt).toLocaleString('ja-JP'):'--'}</span></div><div className="bg-gray-50 rounded-lg p-2">終了<br/><span className="font-bold text-gray-700">{detailTask.completedAt?new Date(detailTask.completedAt).toLocaleString('ja-JP'):'--'}</span></div></div><div><div className="text-xs font-bold text-gray-600 mb-2">担当者（複数選択可）</div><div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">{(sortedUsers||[]).map(member=>{const checked=selectedAssigneeIds.includes(member.id);return <label key={member.id} className={`flex items-center gap-2 p-2 rounded-lg border ${canEditTask?'cursor-pointer':'cursor-not-allowed opacity-70'} ${checked?'border-purple-400 bg-purple-50':'border-gray-200'}`}><input type="checkbox" disabled={!canEditTask} checked={checked} onChange={()=>setSelectedAssigneeIds(p=>checked?p.filter(id=>id!==member.id):[...p,member.id])}/><span className="text-xs font-bold text-gray-700 truncate">{member.name.split(' ')[0]}</span></label>})}</div></div>{canEditTask&&<><button type="button" disabled={!selectedAssigneeIds.length||isUpdatingAssignees} onClick={async()=>{setIsUpdatingAssignees(true);setAssigneeUpdateMessage('');try{await updateTaskAssignees(detailTask.ownerUid,detailTask.taskDate,detailTask.id,selectedAssigneeIds);setDetailTask(p=>p?{...p,assigneeIds:[...selectedAssigneeIds]}:p);setAssigneeUpdateMessage('担当者を更新しました');}catch{setAssigneeUpdateMessage('担当者の更新に失敗しました。')}finally{setIsUpdatingAssignees(false);}}} className="w-full py-2.5 rounded-xl bg-purple-600 text-white text-xs font-bold disabled:opacity-40"><span>{isUpdatingAssignees?'更新中…':'担当者を更新'}</span></button><div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-stretch gap-2"><ActionIconButton action="edit" type="button" disabled={isSaving} onClick={()=>{setEditingTaskText(detailTask.text||'');setEditingTaskImportant(detailTask.important === true);setCalendarTaskImages([]);setIsEditingTask(true);}} className=""/><button type="button" disabled={!canFinishTask || isSaving} onClick={finishTask} className="min-h-11 flex items-center justify-center gap-2 rounded-xl border border-green-600 bg-green-600 px-2 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-40"><CheckSquare size={20} className="shrink-0" aria-hidden="true"/><span>{detailTask.completed ? '未終了に戻す' : 'タスクを終了'}</span></button><ActionIconButton action="delete" type="button" disabled={isSaving} aria-label="タスクを削除" onClick={removeTask} className=""/></div></>}{!canEditTask && canFinishTask && <button type="button" disabled={isSaving} onClick={finishTask} className="w-full min-h-12 rounded-xl bg-green-600 text-white text-base font-bold">{detailTask.completed ? '未終了に戻す' : "タスクを終了"}</button>}{assigneeUpdateMessage&&<div className="text-[10px] text-green-600 font-bold">{assigneeUpdateMessage}</div>}</>}</div></div></div>}
    </div>
  </div>;
};

const TeamShiftView = ({ currentDate, changeMonth, teamData, shiftTypes, updateUserShift, sortedUsers, roles, bulkImportShifts, updateShiftTypes, currentUser, shiftLogs }) => {
  const readOnly = isReadOnlyUser(currentUser, roles);
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const shiftScrollRef = useRef(null);
  const shiftNameHeaderRef = useRef(null);
  
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
  useLayoutEffect(() => {
    if (!window.matchMedia('(max-width: 767px)').matches) return;
    const container = shiftScrollRef.current;
    const nameHeader = shiftNameHeaderRef.current;
    if (!container || !nameHeader) return;
    // Keep yesterday beside the pinned names; other months start at day one.
    const [todayYear, todayMonth, todayDay] = todayStr.split('-').map(Number);
    const day = year === todayYear && month === todayMonth - 1 ? Math.max(1, todayDay - 1) : 1;
    const target = container.querySelector('[data-shift-day="' + day + '"]');
    if (target) container.scrollLeft = Math.max(0, target.getBoundingClientRect().left - container.getBoundingClientRect().left + container.scrollLeft - nameHeader.getBoundingClientRect().width);
  }, [year, month, todayStr]);
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
      
      <div ref={shiftScrollRef} className="flex-1 overflow-auto bg-white relative">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-gray-50 shadow-sm">
            <tr>
              <th ref={shiftNameHeaderRef} className="sticky left-0 bg-gray-50 z-20 min-w-[100px] p-2 border-r border-b border-gray-200 text-left font-bold text-gray-600 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                メンバー
              </th>
              {days.map(d => (
                <th key={d.day} data-shift-day={d.day} title={d.holiday || undefined} className={`min-w-[48px] p-1.5 border-r border-b border-gray-200 text-center font-medium ${d.dateStr < todayStr ? (d.holiday ? 'bg-gray-200 text-red-600' : 'bg-gray-200 text-gray-400') : d.holiday ? 'bg-rose-50 text-red-600' : d.weekDay === '日' ? 'text-red-500' : d.weekDay === '土' ? 'text-blue-500' : 'text-gray-500'}`}>
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
                         onClick={() => { if (!readOnly) setEditingCell({ dateStr: d.dateStr, uid: u.id, userName: u.name }); }}
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
      
      {editingCell && !readOnly && (
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

// A stable component keeps edit state when another task or the shared snapshot changes.
const DailyTaskItem = ({ task, selectedDate, selectedUserUid, currentUserUid, currentUser, isAdmin, selectedTaskId, setSelectedTaskId, setPastFinishConfirmTaskKey, updateTaskAssignees, updateTaskText, toggleTask, sortedUsers, inventoryItems, users, pastFinishConfirmTaskKey, deletingTaskId, handleDeleteDailyTask }) => {
    const completionRef = useRef(false);
    const [completing, setCompleting] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editVal, setEditVal] = useState(task.text || '');
    const [editImportant, setEditImportant] = useState(task.important === true);
    const [editSubject, setEditSubject] = useState(task.subject || task.text || '');
    const [editEndTime, setEditEndTime] = useState(task.endTime || '');
    const [editTaskImages, setEditTaskImages] = useState([]);
    const [editUploadProgress, setEditUploadProgress] = useState(null);
    const [editDate, setEditDate] = useState(task.taskDate || selectedDate);
    const [isSavingEdit, setIsSavingEdit] = useState(false);
    const savingEditRef = useRef(false);
    const [selectedAssigneeIds, setSelectedAssigneeIds] = useState(
      Array.isArray(task.assigneeIds) && task.assigneeIds.length ? task.assigneeIds : [task.ownerUid || selectedUserUid]
    );
    const [isUpdatingAssignees, setIsUpdatingAssignees] = useState(false);
    const [assigneeUpdateMessage, setAssigneeUpdateMessage] = useState('');
    const isSelected = selectedTaskId === task.id;
    const canEditTask = isAdmin || task.ownerUid === currentUserUid;
    const canFinishTask = canCompleteTask(task, task.ownerUid || selectedUserUid, currentUserUid, isAdmin);
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

    useEditGuard(isEditing, isSavingEdit);
    if (isEditing) {
      return (
        <div className="bg-white p-3 rounded-xl border border-blue-400 shadow-sm space-y-2">
          <ImageGallery item={task}/><ImagePicker files={editTaskImages} onChange={setEditTaskImages} disabled={isSavingEdit}/><TaskSaveProgress progress={editUploadProgress}/>
          <label className="block text-xs font-bold text-gray-600">タスクの日付<input type="date" value={editDate} disabled={isSavingEdit} onChange={e=>setEditDate(e.target.value)} className="mt-1 min-h-11 w-full border border-gray-300 rounded-lg px-3 text-sm"/></label>
          <ImportantToggle value={editImportant} onChange={setEditImportant} disabled={isSavingEdit}/>
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
              disabled={isSavingEdit || !editDate}
              onClick={async () => {
                if (savingEditRef.current) return;
                savingEditRef.current = true;
                setIsSavingEdit(true);
                try {
                  const newImages = await uploadTaskImages(editTaskImages, setEditUploadProgress);
                  await updateTaskText(task.taskDate || selectedDate, task.ownerUid || selectedUserUid, task.id, { newImages, targetDate: editDate, subject: editSubject.trim(), text: editVal.trim(), endTime: editEndTime, important: editImportant, updates: [...(Array.isArray(task.updates) ? task.updates : []), createPartnerUpdate(editVal.trim(), currentUser, null, 'handoff')] });
                  setEditUploadProgress({stage:'done'});
                  setIsEditing(false);
                } catch (error) { setEditUploadProgress({stage:'error',message:error.message}); alert(error.message || 'タスクの保存に失敗しました。'); }
                finally { savingEditRef.current = false; setIsSavingEdit(false); }
              }}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg h-fit"
              title="保存"
            >
              <Save size={18}/>
            </button>
          </div>
          <p className="text-[10px] text-gray-400">Enterで改行できます。保存は右のボタンを押してください。</p>
          <button type="button" disabled={isSavingEdit} onClick={() => { if (confirmEditDiscard(true, isSavingEdit)) setIsEditing(false); }} className="min-h-10 px-3 text-xs font-bold text-gray-600">キャンセル</button>
        </div>
      );
    }

    return (
      <div
        onClick={() => setSelectedTaskId(isSelected ? null : task.id)}
        className={`bg-white p-3 rounded-xl border transition-all cursor-pointer ${task.important === true ? '!border-red-500 !border-2' : ''} ${
          isSelected
            ? 'border-purple-400 bg-purple-50/20 ring-2 ring-purple-400/20 shadow-md'
            : task.completed ? 'border-green-200 bg-green-50/60' : 'border-gray-200 shadow-sm hover:border-gray-300'
        } flex items-start gap-3`}
      >
        <button
          type="button"
          disabled={completing}
          aria-label={task.completed ? 'タスクを未完了に戻す' : 'タスクを完了にする'}
          title={canFinishTask ? (task.completed ? '未完了に戻す' : "タスクを終了") : '担当者または管理者が終了できます'}
          onClick={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (completionRef.current) return;
            completionRef.current = true; setCompleting(true);
            try {
            const taskDate = task.taskDate || selectedDate;
            const ownerUid = task.ownerUid || selectedUserUid;

            if (!canFinishTask) {
              alert('担当者または管理者が終了できます。');
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
            } finally { completionRef.current = false; setCompleting(false); }
          }}
          className={`relative z-20 shrink-0 mt-0.5 min-w-16 min-h-12 px-3 rounded-xl border-2 flex items-center justify-center cursor-pointer touch-manipulation transition-colors ${
            task.completed
              ? 'bg-green-500 border-green-500 text-white'
              : canFinishTask
                ? 'bg-green-600 border-green-600 text-white hover:bg-green-700'
                : 'bg-gray-100 border-gray-300 text-gray-400'
          }`}
        >
          <span className="text-sm font-bold">{task.completed ? '✓ 終了済' : "タスクを終了"}</span>
        </button>
        <div className="flex-1 min-w-0">
          <ImportantBadge important={task.important}/>{task.completed && <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-[9px] font-black mb-1"><CheckSquare size={11}/>終了済み</span>}
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
          {task.productName && <div className={`mt-1 text-xs font-bold ${Number(inventoryItems.find(item=>item.id===task.productId)?.stock ?? 0)<=2 ? 'text-red-600' : 'text-emerald-700'}`}>使用商品: {task.productName}</div>}
          <div className="mt-1 text-[9px] text-purple-600">担当: {selectedAssigneeIds.map(id => users[id]?.name?.split(' ')[0] || '').filter(Boolean).join('・') || '未設定'}</div>

          {pastFinishConfirmTaskKey === `${taskDate}-${task.ownerUid || selectedUserUid}-${task.id}` && isPastTask && !task.completed && canFinishTask && (
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
              {Array.isArray(task.updates) && task.updates.length > 0 && <div className="mb-3 space-y-2"><div className="text-[10px] font-bold text-gray-600">申し送り履歴</div>{task.updates.map(update=><div key={update.id} className="rounded-lg bg-gray-50 border border-gray-100 p-2"><div className="text-[9px] text-gray-500 font-bold">{update.authorName||'不明なユーザー'}{update.createdAt?' ・ '+new Date(update.createdAt).toLocaleString('ja-JP'):''}</div><div className="text-xs text-gray-700 whitespace-pre-wrap break-words">{update.text}</div><ImageGallery item={update}/></div>)}</div>}
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
          <ImageGallery item={task}/>
        </div>

        <div className="shrink-0 flex gap-1" onClick={(e) => e.stopPropagation()}>
          <ActionIconButton action="edit" type="button" disabled={!canEditTask || deletingTaskId !== null} onClick={() => { setEditImportant(task.important === true); setEditVal(task.text || ''); setEditSubject(task.subject || task.text || ''); setEditEndTime(task.endTime || ''); setEditDate(task.taskDate || selectedDate); setEditTaskImages([]); setEditUploadProgress(null); setIsEditing(true); }} title="編集" className=""/>
          <ActionIconButton action="delete" type="button" disabled={!canEditTask || deletingTaskId !== null} onClick={() => handleDeleteDailyTask(task)} title="削除" className=""/>
        </div>
      </div>
    );
  };

const DailyDetailView = ({
  selectedDate, changeDay, teamData, currentUserUid, shiftTypes, inventoryItems = [],
  addTask, toggleTask, deleteTask, updateTaskText, updateTaskAssignees, users, roles, sortedUsers
}) => {
  const [newAssigneeIds, setNewAssigneeIds] = useState(null);
  const [quickTaskOpen, setQuickTaskOpen] = useState(true);
  const [newTaskSubject, setNewTaskSubject] = useState('');
  const [newTaskImportant, setNewTaskImportant] = useState(false);
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskEndTime, setNewTaskEndTime] = useState('');
  const [newTaskProductId, setNewTaskProductId] = useState('');
  const [newTaskProductQuantity, setNewTaskProductQuantity] = useState('1');
  const [productScannerOpen, setProductScannerOpen] = useState(false);
  const [productScanMessage, setProductScanMessage] = useState('');
  const [newTaskVisibility, setNewTaskVisibility] = useState('public');
  const [selectedUserUid, setSelectedUserUid] = useState(currentUserUid);
  const taskAssigneeIds = newAssigneeIds || [selectedUserUid];
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [pastFinishConfirmTaskKey, setPastFinishConfirmTaskKey] = useState(null);
  const [newTaskImages, setNewTaskImages] = useState([]);
  const newTaskImage = newTaskImages[0] || null;
  const [isUploading, setIsUploading] = useState(false);
  const addTaskSavingRef = useRef(false);
  const [taskUploadProgress, setTaskUploadProgress] = useState(null);
  const [selectedPersonalMemoKey, setSelectedPersonalMemoKey] = useState('');
  const [isEditingPersonalMemo, setIsEditingPersonalMemo] = useState(false);
  const [personalMemoEditText, setPersonalMemoEditText] = useState('');
  const [personalMemoEditImage, setPersonalMemoEditImage] = useState(null);
  const [isSavingPersonalMemo, setIsSavingPersonalMemo] = useState(false);
  const [isDeletingPersonalMemo, setIsDeletingPersonalMemo] = useState(false);

  const currentUser = users[currentUserUid];
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

  useEditGuard(isEditingPersonalMemo, isSavingPersonalMemo);
  const resetPersonalMemoDetail = () => {
    setSelectedPersonalMemoKey(''); setIsEditingPersonalMemo(false); setPersonalMemoEditImage(null);
  };
  const closePersonalMemoDetail = () => {
    if (confirmEditDiscard(isEditingPersonalMemo, isSavingPersonalMemo || isDeletingPersonalMemo)) resetPersonalMemoDetail();
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
      resetPersonalMemoDetail();
    } catch (error) {
      console.error('個人メモの削除に失敗しました:', error);
      alert(`個人メモを削除できませんでした。\n${error?.message || 'もう一度お試しください。'}`);
    } finally {
      setIsDeletingPersonalMemo(false);
    }
  };

  const clearNewTaskImage = () => setNewTaskImages([]);

  const handleProductBarcodeDetected = (code) => {
    setProductScannerOpen(false);
    const barcode = normalizeInventoryName(code);
    const product = inventoryItems.find(item => normalizeInventoryName(item.barcode) === barcode);
    if (!product) { setProductScanMessage('このバーコードの商品は未登録です。在庫管理で商品登録してください。'); return; }
    if (Number(product.stock || 0) <= 0) { setProductScanMessage('この商品の在庫がありません。'); return; }
    setNewTaskProductId(product.id);
    setProductScanMessage('選択しました：' + inventoryProductLabel(product));
  };

  const handleAddTask = async () => {
    if (newTaskVisibility === 'private' ? (!newTaskText.trim() && !newTaskImage) : !newTaskSubject.trim()) { alert(newTaskVisibility === 'private' ? '内容または画像を追加してください。' : 'どこで？どんな内容？を入力してください。'); return; }
    if (addTaskSavingRef.current) return;
    addTaskSavingRef.current = true;
    setIsUploading(true);
    try {
      const assignees = newTaskAssignees(taskAssigneeIds, selectedUserUid, newTaskVisibility, sortedUsers.map(user => user.id));
      const images = await uploadTaskImages(newTaskImages, setTaskUploadProgress);
      const { imageUrl = '', imageName = '', imagePublicId = '', imageBytes = 0 } = images.find(media=>media.mediaType !== 'video') || {};
      if (newTaskVisibility === 'private' && selectedUserUid !== currentUserUid) {
        alert('個人メモは、自分の名前を選んでいるときだけ登録できます。');
        return;
      }
      const productQuantity = Number(newTaskProductQuantity);
      if (newTaskProductId && (!Number.isInteger(productQuantity) || productQuantity < 1)) { alert('使用数量は1以上の整数を入力してください。'); return; }
      await addTask(selectedDate, selectedUserUid, newTaskText.trim(), imageUrl, imageName, imagePublicId, imageBytes, newTaskVisibility, newTaskVisibility === 'private' ? '' : newTaskSubject.trim(), newTaskVisibility === 'private' ? '' : newTaskEndTime, newTaskVisibility === 'private' ? '' : newTaskProductId, newTaskProductId ? productQuantity : 1, images, assignees, newTaskVisibility !== 'private' && newTaskImportant);
      setTaskUploadProgress({stage:'done'});
      setNewAssigneeIds(null);
      setNewTaskVisibility('public');
      setNewTaskSubject('');
      setNewTaskImportant(false);
      setNewTaskText('');
      setNewTaskEndTime('');
      setNewTaskProductId('');
      setNewTaskProductQuantity('1');
      setProductScanMessage('');
      clearNewTaskImage();
      return true;
    } catch (error) {
      setTaskUploadProgress({stage:'error',message:error.message});
      console.error('画像のアップロードに失敗しました:', error);
      alert(`タスクの保存に失敗しました。\n${error?.message || 'もう一度お試しください。'}`);
    } finally {
      addTaskSavingRef.current = false;
      setIsUploading(false);
    }
  };

  const deletingTaskRef = useRef(false);
  const [deletingTaskId, setDeletingTaskId] = useState(null);
  const handleDeleteDailyTask = async (task) => {
    if (deletingTaskRef.current || (!isAdmin && (task.ownerUid || selectedUserUid) !== currentUserUid)) return;
    if (!window.confirm(`「${task.subject || task.text || 'このタスク'}」を削除しますか？\n使用済みの商品がある場合は在庫へ戻します。`)) return;
    deletingTaskRef.current = true;
    setDeletingTaskId(task.id);
    try { await deleteTask(task.taskDate || selectedDate, task.ownerUid || selectedUserUid, task.id); }
    catch (error) { alert(`タスクを削除できませんでした。\n${error.message || 'もう一度お試しください。'}`); }
    finally { deletingTaskRef.current = false; setDeletingTaskId(null); }
  };

  const taskItemProps = { selectedDate, selectedUserUid, currentUserUid, currentUser, isAdmin, selectedTaskId, setSelectedTaskId, setPastFinishConfirmTaskKey, updateTaskAssignees, updateTaskText, toggleTask, sortedUsers, inventoryItems, users, pastFinishConfirmTaskKey, deletingTaskId, handleDeleteDailyTask };

  return (
    <div className="flex-1 flex flex-col bg-gray-50 pb-[68px] h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto flex flex-col relative">
        <div className="bg-white px-4 py-2 flex items-center justify-between border-b border-gray-100 shrink-0 sticky top-0 z-20 shadow-sm">
          <button type="button" onClick={() => { if(confirmDiscardEdits()) changeDay(-1); }} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full active:scale-95"><ChevronLeft className="w-5 h-5"/></button>
          <h2 className="text-sm font-bold text-gray-800">{selectedDate.replace(/-/g, '/')}</h2>
          <button type="button" onClick={() => { if(confirmDiscardEdits()) changeDay(1); }} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full active:scale-95"><ChevronRight className="w-5 h-5"/></button>
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
                  onClick={() => { if(member.id !== selectedUserUid && !confirmDiscardEdits())return; setSelectedUserUid(member.id); setSelectedTaskId(null); }}
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
<button type="button" disabled={isUploading} onClick={() => setQuickTaskOpen(true)} className="w-full min-h-14 mb-4 rounded-xl bg-blue-50 border-2 border-blue-500 text-blue-700 text-lg font-bold">かんたん入力（タスク）</button>
{quickTaskOpen && <QuickEntry hasDraft={!!(newTaskImportant || newTaskSubject.trim() || newTaskText.trim() || newTaskEndTime || newTaskProductId || newTaskImages.length)} tasksContent={<div className="space-y-3">{[...unfinishedPastTasks, ...selectedDateActiveTasks].length ? [...unfinishedPastTasks, ...selectedDateActiveTasks].map(task => <DailyTaskItem key={`${task.taskDate}-${task.ownerUid}-${task.id}`} {...taskItemProps} task={task}/>) : <p className="rounded-xl bg-white border p-5">この担当者の未終了タスクはありません。</p>}</div>} tasksDescription={`${selectedDate} ／ ${users[selectedUserUid]?.name || ''} のタスクと過去の未終了タスクです。終わった作業の「タスクを終了」を押してください。`} title="タスクのかんたん入力" onClose={() => setQuickTaskOpen(false)} onSave={handleAddTask}
steps={[
{title:'何をしますか？何をしましたか？', content:<>
<p>登録日：{selectedDate}</p>
<p>{newTaskVisibility === 'private' ? '自分だけの個人メモ' : 'みんなに公開するタスク'}</p>
{newTaskVisibility !== 'private' && <ImportantToggle value={newTaskImportant} onChange={setNewTaskImportant} disabled={isUploading}/>}
{newTaskVisibility !== 'private' && <label className="block font-bold">どこで？どんな内容？（必須）<input type="text" value={newTaskSubject} onChange={e => setNewTaskSubject(e.target.value)} placeholder="例：1階ロビーの電球交換" className="w-full min-h-14 mt-2 border border-gray-300 rounded-xl p-3 text-base bg-white"/></label>}
<label className="block font-bold">{newTaskVisibility === 'private' ? '個人メモ（内容か写真が必要）' : '詳しい内容（任意）'}<textarea rows={4} value={newTaskText} onChange={e => setNewTaskText(e.target.value)} placeholder="例：1階ロビーの電球を交換する" className="w-full mt-2 border border-gray-300 rounded-xl p-3 text-base"/></label>
{newTaskVisibility !== 'private' && <fieldset className="my-4"><legend className="font-bold text-base">担当者（複数選べます）</legend><p className="text-sm text-gray-500 my-2">担当する人の名前をすべて選んでください。</p><div className="flex flex-wrap gap-2">{sortedUsers.map(user => <label key={user.id} className={`flex items-center gap-2 min-h-12 px-3 border-2 rounded-xl text-base ${taskAssigneeIds.includes(user.id) ? 'bg-blue-50 border-blue-500' : 'border-gray-200'}`}><input type="checkbox" checked={taskAssigneeIds.includes(user.id)} onChange={e => setNewAssigneeIds(e.target.checked ? [...taskAssigneeIds, user.id] : taskAssigneeIds.filter(id => id !== user.id))}/>{user.name}</label>)}</div></fieldset>}
{newTaskVisibility !== 'private' && <QuarterHourTime label="終了予定時間" value={newTaskEndTime} onChange={setNewTaskEndTime} disabled={isUploading}/>}
<ImagePicker files={newTaskImages} onChange={setNewTaskImages} disabled={isUploading}/>
</>, validate:() => newTaskVisibility !== 'private' && !taskAssigneeIds.length ? '担当者を1人以上選んでください。' : newTaskVisibility !== 'private' && !newTaskSubject.trim() ? 'どこで？どんな内容？を入力してください。' : newTaskVisibility === 'private' && !newTaskText.trim() && !newTaskImage ? '個人メモか写真を追加してください。' : ''}
]}
summary={[[ '重要', newTaskVisibility !== 'private' && newTaskImportant ? '重要' : 'なし' ], [ '登録日', selectedDate ], ['担当', newTaskVisibility === 'private' ? users[selectedUserUid]?.name : taskAssigneeIds.map(id => users[id]?.name).filter(Boolean).join('・')], ['公開範囲', newTaskVisibility === 'private' ? '自分だけの個人メモ' : 'みんなに公開'], ['どこで？どんな内容？', newTaskSubject], ['内容', newTaskText], ['終了予定', newTaskEndTime], ['使用する商品', newTaskProductId ? inventoryProductLabel(inventoryItems.find(item => item.id === newTaskProductId) || {}) + ' × ' + newTaskProductQuantity : 'なし'], ['写真・動画', newTaskImages.length + '件']]}
/>}
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-black text-gray-600">このタスクを</span>
              <button type="button" onClick={() => setNewTaskVisibility('public')} className={`px-3 py-1.5 rounded-full text-xs font-black border transition-all ${newTaskVisibility === 'public' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200'}`}>👥 みんなに公開</button>
              <button type="button" onClick={() => { setNewTaskVisibility('private'); setNewTaskSubject(''); setNewTaskEndTime(''); }} disabled={selectedUserUid !== currentUserUid} className={`px-3 py-1.5 rounded-full text-xs font-black border transition-all ${newTaskVisibility === 'private' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-500 border-gray-200'} ${selectedUserUid !== currentUserUid ? 'opacity-40 cursor-not-allowed' : ''}`}>🔒 個人メモ</button>
              {newTaskVisibility === 'private' && <span className="text-[10px] font-bold text-purple-600">自分だけに表示されます</span>}
            </div>

            <div className="space-y-2 mb-2">
              {newTaskVisibility !== 'private' && <ImportantToggle value={newTaskImportant} onChange={setNewTaskImportant} disabled={isUploading}/>}
              {newTaskVisibility !== 'private' && <label className="block text-sm font-bold">どこで？どんな内容？（必須）<input type="text" value={newTaskSubject} onChange={e=>setNewTaskSubject(e.target.value)} placeholder="例：1階ロビーの電球交換" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm" disabled={isUploading}/></label>}
              {newTaskVisibility !== 'private' && <label className="flex items-center gap-2 text-xs text-gray-600"><span className="font-bold">終了予定時刻</span><div className="flex items-center gap-1"><select aria-label="終了予定時刻の時" value={newTaskEndTime ? newTaskEndTime.split(':')[0] : ''} onChange={e=>setNewTaskEndTime(e.target.value ? e.target.value+':'+((newTaskEndTime||'').split(':')[1]||'00') : '')} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" disabled={isUploading}><option value="">時</option>{Array.from({length:24},(_,i)=>String(i).padStart(2,'0')).map(v=><option key={v} value={v}>{v}</option>)}</select><span>:</span><select aria-label="終了予定時刻の分" value={newTaskEndTime ? newTaskEndTime.split(':')[1] : ''} onChange={e=>setNewTaskEndTime(((newTaskEndTime||'').split(':')[0]||'00')+':'+e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" disabled={isUploading}><option value="">分</option>{['00','15','30','45'].map(v=><option key={v} value={v}>{v}</option>)}</select></div></label>}
              {newTaskVisibility !== 'private' && <div className="space-y-2"><label className="block text-xs text-gray-600"><span className="block font-bold mb-1">使用する商品（任意）</span><select value={newTaskProductId} onChange={e=>setNewTaskProductId(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white" disabled={isUploading}><option value="">商品を選択しない</option>{inventoryItems.map(item=><option key={item.id} value={item.id} disabled={Number(item.stock||0)<=0}>{item.kind ? item.kind + '：' : ''}{inventoryProductLabel(item)}{item.usageLocation ? '／使用箇所：' + item.usageLocation : ''}（在庫 {Number(item.stock||0)} 個）</option>)}</select></label><div className="flex gap-2"><button type="button" onClick={()=>setProductScannerOpen(true)} disabled={isUploading} className="min-h-10 px-3 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-bold inline-flex items-center gap-1"><Camera size={15}/>バーコード読取</button><label className="flex-1 text-xs text-gray-600 flex items-center gap-2">使用数量<input type="number" min="1" step="1" value={newTaskProductQuantity} onChange={e=>setNewTaskProductQuantity(e.target.value)} className="min-h-10 w-20 rounded-lg border border-gray-200 px-2 text-center text-sm"/></label></div>{productScanMessage && <p className="text-xs text-blue-700">{productScanMessage}</p>}</div>}
            </div>
            <div className="flex flex-col gap-2 items-stretch">
              <label className="block text-sm font-bold">{newTaskVisibility === 'private' ? '個人メモ' : '詳しい内容（任意）'}<textarea
                value={newTaskText}
                onChange={(e) => setNewTaskText(e.target.value)}
                placeholder={newTaskVisibility === 'private' ? '個人メモを入力' : '内容・申し送りを入力'}
                className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-shadow resize-y"
                rows={2}
                style={{ minHeight: '52px', maxHeight: '160px' }}
                disabled={isUploading}
              /></label>
{newTaskVisibility !== 'private' && <fieldset className="my-4"><legend className="font-bold text-base">担当者（複数選べます）</legend><p className="text-sm text-gray-500 my-2">担当する人の名前をすべて選んでください。</p><div className="flex flex-wrap gap-2">{sortedUsers.map(user => <label key={user.id} className={`flex items-center gap-2 min-h-12 px-3 border-2 rounded-xl text-base ${taskAssigneeIds.includes(user.id) ? 'bg-blue-50 border-blue-500' : 'border-gray-200'}`}><input type="checkbox" checked={taskAssigneeIds.includes(user.id)} onChange={e => setNewAssigneeIds(e.target.checked ? [...taskAssigneeIds, user.id] : taskAssigneeIds.filter(id => id !== user.id))}/>{user.name}</label>)}</div></fieldset>}
              <button type="button"
                onClick={handleAddTask}
                disabled={isUploading || (newTaskVisibility === 'private' ? (!newTaskText.trim() && !newTaskImage) : !newTaskSubject.trim())}
                className="shrink-0 bg-blue-600 text-white px-4 py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:bg-gray-400 transition-colors shadow-sm active:scale-95 font-bold text-sm flex items-center gap-1.5"
              >
                {isUploading ? <Loader2 size={18} className="animate-spin"/> : <Save size={18}/>} 保存
              </button>
            </div>
            <ImagePicker files={newTaskImages} onChange={setNewTaskImages} disabled={isUploading}/><TaskSaveProgress progress={taskUploadProgress}/>
            <p className="text-[10px] text-gray-400 mt-1.5">Enterで改行。保存は「保存」ボタン。画像・動画を追加できます。</p>
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
                  <DailyTaskItem task={task} {...taskItemProps}/>
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
          ) : selectedDateActiveTasks.map(task => <DailyTaskItem key={task.id} task={task} {...taskItemProps}/>)}

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
                    <ImageGallery item={selectedPersonalMemo}/>
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
                  <ImageGallery item={selectedPersonalMemo}/>
                  {selectedPersonalMemo.createdAt && <p className="text-[10px] text-gray-400">登録日時：{new Date(selectedPersonalMemo.createdAt).toLocaleString('ja-JP')}</p>}
                </>
              )}
            </div>
            <div className="border-t p-3 flex gap-2 shrink-0">
              {isEditingPersonalMemo ? (
                <>
                  <button type="button" onClick={() => { if (!confirmEditDiscard(true, isSavingPersonalMemo)) return; setIsEditingPersonalMemo(false); setPersonalMemoEditImage(null); }} disabled={isSavingPersonalMemo} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold">キャンセル</button>
                  <button type="button" onClick={savePersonalMemo} disabled={isSavingPersonalMemo} className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold disabled:opacity-50">{isSavingPersonalMemo ? '保存中…' : '変更を保存'}</button>
                </>
              ) : (
                <>
                  <button type="button" onClick={closePersonalMemoDetail} disabled={isDeletingPersonalMemo} className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold disabled:opacity-50">閉じる</button>
                  <ActionIconButton action="delete" type="button" onClick={deletePersonalMemo} disabled={isDeletingPersonalMemo} className="flex-1"/>
                  <ActionIconButton action="edit" type="button" onClick={startPersonalMemoEdit} disabled={isDeletingPersonalMemo} className="flex-1"/>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {productScannerOpen && <BarcodeScannerModal onDetected={handleProductBarcodeDetected} onClose={()=>setProductScannerOpen(false)}/>}
    </div>
  );
};


const SettingsView = ({ shiftTypes, updateShiftTypes, users, updateUsers, currentUserUid, roleNames, updateRoleNames, roles, updateRoles, deleteUserCompletely, sortedUsers, userOrder, updateUserOrder, debugLogs }) => {
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState((roles.staff ? 'staff' : Object.keys(roles).find(key => key !== 'viewer')) || 'viewer');
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
        shiftEligible: newUserRole === 'viewer' ? false : newUserShiftEligible 
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
                <ActionIconButton action="delete" onClick={() => handleDeleteShift(shift.id)} title="シフトを削除" className=""/>
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
                    disabled={key === 'viewer'}
                    value={roleNames[key] || ''}
                    onChange={(e) => handleRoleNameChange(key, e.target.value)}
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-bold text-gray-800"
                    placeholder={roleInfo.name}
                  />
                  <ActionIconButton action="delete" disabled={key === 'viewer'} onClick={() => handleDeleteRole(key)} title="役職を削除" className=""/>
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
                            <ActionIconButton action="edit" onClick={() => handleStartRename(u)} title="編集" className=""/>
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

                    {roleLevel < 40 && !isReadOnlyUser(u, roles) && (
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

                    <ActionIconButton action="delete" aria-label={`${u.name}さんを削除`} onClick={() => handleDeleteUser(u.id)} disabled={isMe} className=""/>
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

const PartnerView = ({ partnerItems, partnerNames, addPartnerItem, updatePartnerItem, togglePartnerItem, completePartnerItem, reschedulePartnerItem, deletePartnerItem, addPartnerName, updatePartnerName, deletePartnerName, currentUser, debugLog, sortedUsers }) => {
  const [scheduleNow, setScheduleNow] = useState(Date.now);
  useEffect(() => {
    const refresh = () => setScheduleNow(Date.now());
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  const [quickPartnerOpen, setQuickPartnerOpen] = useState(true);
  const [date, setDate] = useState(formatDate(new Date()));
  const [timeHour, setTimeHour] = useState('');
  const [timeMinute, setTimeMinute] = useState('');
  const time = timeHour && timeMinute ? `${timeHour}:${timeMinute}` : '';
  const [endTime, setEndTime] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [subject, setSubject] = useState('');
  const [partnerImportant, setPartnerImportant] = useState(false);
  const [partnerAssignees, setPartnerAssignees] = useState([]);
  const assigneeUid = partnerAssignees[0] || '';
  const [content, setContent] = useState('');
  const [newPartnerName, setNewPartnerName] = useState('');
  const [newPartnerImages, setNewPartnerImages] = useState([]);
  const newPartnerImage = newPartnerImages[0] || null;
  const partnerSavingRef = useRef(false);
  const [partnerUploadProgress, setPartnerUploadProgress] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingName, setIsAddingName] = useState(false);
  const [showPartnerNameMenu, setShowPartnerNameMenu] = useState(false);
  const [editingPartnerName, setEditingPartnerName] = useState(null);
  const [editingPartnerNameValue, setEditingPartnerNameValue] = useState('');
  const [editingItemId, setEditingItemId] = useState(null);
  const editingPartnerItem = editingItemId ? (partnerItems || []).find(item => item.id === editingItemId) : null;

  const partnerFormRef = useRef(null);
  const deletingPartnerRef = useRef(false);
  const [deletingPartnerId, setDeletingPartnerId] = useState(null);
  useEditGuard(!!editingItemId || !!editingPartnerName, isSaving);
  const revealPartnerForm = () => requestAnimationFrame(() => {
    partnerFormRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    partnerFormRef.current?.focus({ preventScroll: true });
  });
  const handleDeletePartnerItem = async (item) => {
    if (partnerSavingRef.current || deletingPartnerRef.current) return;
    if (!window.confirm(`「${item.subject || item.partnerName || 'パートナータスク'}」を削除しますか？\n申し送り・添付の記録も一覧から削除されます。`)) return;
    deletingPartnerRef.current = true;
    setDeletingPartnerId(item.id);
    try {
      await deletePartnerItem(item.id);
      if (editingItemId === item.id) {
        setEditingItemId(null); setPartnerName(''); setSubject(''); setPartnerImportant(false); setContent(''); setNewPartnerImages([]);
      }
    } catch (error) {
      alert(`削除できませんでした。\n${error.message || 'もう一度お試しください。'}`);
    } finally { deletingPartnerRef.current = false; setDeletingPartnerId(null); }
  };

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
    if (!partnerName || !subject.trim() || !assigneeUid || !date || !time) {
      alert('パートナー名・件名・担当者・日付・開始時間を入力してください。');
      return;
    }

    if (partnerSavingRef.current || deletingPartnerRef.current) return;
    partnerSavingRef.current = true;
    setIsSaving(true);
    const action = editingItemId ? 'partner.edit.save' : 'partner.add.save';
    await debugLog?.('INFO', action + '.start', { itemId: editingItemId || '', partnerName, date, time, assigneeUid, hasImage: !!newPartnerImage });
    try {
      const addedImages = await uploadTaskImages(newPartnerImages, setPartnerUploadProgress);
      const currentItem = editingItemId ? (partnerItems || []).find(item => item.id === editingItemId) : null;
      const images = mergeTaskImages(currentItem, addedImages);
      const { imageUrl = '', imageName = '', imagePublicId = '', imageBytes = 0 } = images.find(media=>media.mediaType !== 'video') || {};
      const hasNewUpdate = !!(content.trim() || addedImages.length);
      const newUpdate = hasNewUpdate ? createPartnerUpdate(content.trim(), currentUser, addedImages, editingItemId ? 'handoff' : 'initial') : null;
      const updates = editingItemId ? [...getPartnerUpdates(currentItem), ...(newUpdate ? [newUpdate] : [])] : (newUpdate ? [newUpdate] : []);
      const itemData = { images, partnerName, important: partnerImportant, subject: subject.trim(), assigneeUid, assigneeIds: partnerAssignees, date, time, endTime, content: content.trim() || currentItem?.content || '', updates, createdByUid: editingItemId ? (currentItem?.createdByUid || '') : (currentUser?.id || ''), createdByName: editingItemId ? (currentItem?.createdByName || '') : (currentUser?.name || ''), ...(imageUrl ? { imageUrl, imageName, imagePublicId, imageBytes, imageUploadedAt: new Date().toISOString() } : {}) };
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
      setPartnerUploadProgress({stage:'done'});
      setContent('');
      setSubject(''); setPartnerImportant(false);
      setTimeHour(''); setTimeMinute(''); setEndTime('');
      setPartnerName('');
      setPartnerAssignees([]);
      setNewPartnerImages([]);
      return true;

    } catch (error) {
      setPartnerUploadProgress({stage:'error',message:error.message});
      await debugLog?.('ERROR', action + '.error', { itemId: editingItemId || '', name: error?.name || '', message: error?.message || String(error), stack: error?.stack || '' });
      console.error('パートナー予定の保存に失敗しました:', error);
      alert('保存に失敗しました。もう一度お試しください。');
    } finally {
      partnerSavingRef.current = false;
      setIsSaving(false);
    }
  };

  const partnerActionRef = useRef(false);
  const [changingPartnerId, setChangingPartnerId] = useState(null);
  const finishPartner = async item => {
    if (partnerActionRef.current) return;
    partnerActionRef.current = true; setChangingPartnerId(item.id);
    try { if (item.completed) await togglePartnerItem(item.id); else await completePartnerItem(item.id); }
    catch (error) { alert('終了状態を保存できませんでした。' + (error.message || 'もう一度お試しください。')); }
    finally { partnerActionRef.current = false; setChangingPartnerId(null); }
  };
  const [showCompletedPartnerItems, setShowCompletedPartnerItems] = useState(false);
  const sortedItems = [...(partnerItems || [])].sort((a, b) => {
    const aKey = `${a.date || ''}T${a.time || '00:00'}`;
    const bKey = `${b.date || ''}T${b.time || '00:00'}`;
    return aKey.localeCompare(bKey);
  });
  const activePartnerItems = sortedItems.filter(item => !item.completed);
  const completedPartnerItems = sortedItems.filter(item => item.completed).sort((a, b) => String(b.completedAt || '').localeCompare(String(a.completedAt || '')));
  const renderPartnerItem = (item) => (
              <div key={item.id} className={`bg-white rounded-xl border ${item.completed ? 'border-green-200' : 'border-gray-200'} px-3 py-3 flex flex-wrap items-start gap-2`}>
                <button type="button" disabled={changingPartnerId !== null} onClick={() => finishPartner(item)}
                  className={`shrink-0 mt-0.5 min-w-16 min-h-12 px-3 rounded-xl border-2 flex items-center justify-center ${item.completed ? 'border-green-500 bg-green-500 text-white' : 'border-green-600 bg-green-600 text-white hover:bg-green-700'}`}
                  title={item.completed ? '未完了に戻す' : "タスクを終了"}>
                  <span className="text-sm font-bold">{item.completed ? '✓ 終了済' : "タスクを終了"}</span>
                </button>
                <div className="shrink-0 text-center min-w-[68px]">
                  <div className={`text-[10px] font-bold ${item.completed ? 'text-gray-400 line-through' : 'text-blue-600'}`}>{item.date?.replace(/-/g, '/')}</div>
                  <div className={`text-[11px] font-bold mt-0.5 ${item.completed ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{item.time || '--:--'}</div>{item.endTime&&<div className="text-[9px] text-orange-600 mt-0.5">終了予定 {item.endTime}</div>}
                </div>
                <div className="flex-1 min-w-0">
                  <ImportantBadge important={item.important}/>{(item.completed || isPartnerOverdue(item, scheduleNow)) && <span className={`inline-flex rounded-full px-3 py-1 mb-2 text-sm font-bold ${item.completed ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>{item.completed ? '終了済み' : '未終了'}</span>}
                  <div className={`text-[10px] font-bold mb-0.5 ${item.completed ? 'text-gray-400 line-through' : 'text-purple-600'}`}>{item.partnerName || 'パートナー未設定'}</div>
                  <div className="text-xs text-blue-600 font-bold mb-1">担当: {partnerAssigneeIds(item).map(id => (sortedUsers || []).find(user => user.id === id)?.name).filter(Boolean).join('・') || '未設定'}</div>
                  <div className="text-sm font-bold text-gray-800 mb-1">{item.subject || (item.content || '').split(/\r?\n/)[0] || '件名未設定'}</div>
                  <div className="space-y-1.5">{newestPartnerUpdates(getPartnerUpdates(item)).slice(0, 3).map(update => <div key={update.id} className="text-xs text-gray-700 whitespace-pre-wrap break-words"><span className="text-[9px] font-bold text-gray-500">（{update.authorName || '不明なユーザー'}）</span> {update.text}<ImageGallery item={update}/></div>)}</div>
                  <ImageGallery item={item}/>
                  {item.completedAt && <div className="text-[8px] text-green-600 mt-0.5">終了 {new Date(item.completedAt).toLocaleString('ja-JP')}</div>}
                </div>
                <div className="shrink-0 flex gap-0.5">
                  <ActionIconButton action="edit" type="button" disabled={isSaving || deletingPartnerId !== null} aria-label={`${item.subject || 'パートナータスク'}を編集`} onClick={() => {
                    if (editingItemId && editingItemId !== item.id && !confirmEditDiscard(true, isSaving)) return;
                    setEditingItemId(item.id);
                    setPartnerName(item.partnerName || '');
                    setPartnerImportant(item.important === true);
                    setSubject(item.subject || (item.content || '').split(/\r?\n/)[0] || '');
                    setPartnerAssignees(partnerAssigneeIds(item));
                    setDate(item.date || formatDate(new Date()));
                    const [editHour, editMinute] = (item.time || '').split(':');
                    setTimeHour(editHour || '');
                    setTimeMinute(editMinute || '');
                    setEndTime(item.endTime || '');
                    setContent('');
                    setNewPartnerImages([]);
                    setPartnerUploadProgress(null);
                    revealPartnerForm();
                  }} title="編集" className=""/>
                  <ActionIconButton action="delete" type="button" disabled={isSaving || deletingPartnerId !== null} aria-label={`${item.subject || 'パートナータスク'}を削除`} onClick={() => handleDeletePartnerItem(item)} title="削除" className=""/>
                </div>
                {!item.completed && <PartnerScheduleEditor item={item} onSave={reschedulePartnerItem} disabled={isSaving || !!editingItemId || deletingPartnerId !== null || changingPartnerId !== null}/>}
              </div>
  );

  return (
    <div className="flex-1 bg-gray-50 pb-[68px] overflow-y-auto">
      <div className="bg-white px-4 py-3 border-b border-gray-100 shadow-sm">
        <h2 className="text-base font-bold text-gray-800">パートナー</h2>
        <p className="text-[10px] text-gray-400 mt-0.5">日付・時間・内容を登録できます</p>
      </div>

      <div className="p-4 max-w-2xl mx-auto space-y-4">
        <div ref={partnerFormRef} tabIndex={-1} role="region" aria-label={editingItemId ? "パートナータスク編集フォーム" : "パートナータスク登録フォーム"} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3 scroll-mt-4">
{!editingItemId && <button type="button" disabled={isSaving} onClick={() => setQuickPartnerOpen(true)} className="w-full min-h-14 mb-4 rounded-xl bg-blue-50 border-2 border-blue-500 text-blue-700 text-lg font-bold">かんたん入力（パートナータスク）</button>}
{quickPartnerOpen && <QuickEntry hasDraft={!!(partnerImportant || partnerName || subject.trim() || content.trim() || timeHour || assigneeUid || newPartnerImages.length)} tasksContent={<div className="space-y-3">{activePartnerItems.length ? activePartnerItems.map(renderPartnerItem) : <p className="rounded-xl bg-white border p-5">未終了のパートナータスクはありません。</p>}</div>} tasksDescription="終わった作業の「タスクを終了」を押してください。" title="パートナータスクのかんたん入力" onClose={() => setQuickPartnerOpen(false)} onSave={handleSave}
steps={[
{title:'どの会社に、何をお願いしますか？', content:<>
<ImportantToggle value={partnerImportant} onChange={setPartnerImportant} disabled={isSaving}/>
<label className="block font-bold">パートナー名（必須）<input list="quick-partner-names" value={partnerName} onChange={e => setPartnerName(e.target.value)} placeholder="例：〇〇設備" className="w-full min-h-14 mt-2 border border-gray-300 rounded-xl p-3 text-base"/><datalist id="quick-partner-names">{(partnerNames || []).map(name => <option key={name} value={name}/>)}</datalist></label>
<label className="block font-bold">どこ？で何を？（必須）<input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="例：1階ロビーでエアコン点検" className="w-full min-h-14 mt-2 border border-gray-300 rounded-xl p-3 text-base bg-white"/></label>
</>, validate:() => !partnerName.trim() || !subject.trim() ? 'パートナー名と「どこ？で何を？」を入力してください。' : ''},
{title:'いつ、誰が担当しますか？', content:<>
<label className="block font-bold">日付（必須）<input type="date" value={date} onChange={e => setDate(e.target.value)} placeholder="" className="w-full min-h-14 mt-2 border border-gray-300 rounded-xl p-3 text-base bg-white"/></label>
<fieldset><legend className="font-bold">開始時間（必須・15分刻み）</legend><div className="flex items-center gap-2 mt-2"><select aria-label="開始時間の時" value={timeHour} onChange={e => setTimeHour(e.target.value)} className="flex-1 min-h-14 border border-gray-300 rounded-xl p-3 text-base bg-white"><option value="">時を選択</option>{Array.from({length:24}, (_, h) => String(h).padStart(2, '0')).map(h => <option key={h} value={h}>{h}時</option>)}</select><select aria-label="開始時間の分" value={timeMinute} onChange={e => setTimeMinute(e.target.value)} className="flex-1 min-h-14 border border-gray-300 rounded-xl p-3 text-base bg-white"><option value="">分を選択</option>{['00', '15', '30', '45'].map(m => <option key={m} value={m}>{m}分</option>)}</select></div></fieldset>
<AssigneePicker users={sortedUsers} value={partnerAssignees} onChange={setPartnerAssignees} disabled={isSaving}/>
<QuarterHourTime label="終了予定時間" value={endTime} onChange={setEndTime}/>
</>,validate:() => !date || !time || !assigneeUid ? '日付・開始時間・担当者を選んでください。' : ''},
{title:'お願いする内容を教えてください', content:<><label className="block font-bold">詳しい内容（任意）<textarea rows={4} value={content} onChange={e => setContent(e.target.value)} placeholder="例：1階ロビーの電球を交換する" className="w-full mt-2 border border-gray-300 rounded-xl p-3 text-base"/></label><ImagePicker files={newPartnerImages} onChange={setNewPartnerImages} disabled={isSaving}/></>}
]}
summary={[[ '重要', partnerImportant ? '重要' : 'なし' ], [ 'パートナー名', partnerName ], ['どこ？で何を？', subject], ['日付', date], ['開始時間', time], ['終了予定', endTime], ['担当者', partnerAssignees.map(id => (sortedUsers || []).find(user => user.id === id)?.name).filter(Boolean).join('・')], ['内容', content], ['写真・動画', newPartnerImages.length + '件']]}
/>}
          {editingItemId && (
            <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
              <span className="text-[10px] font-bold text-blue-700">パートナー予定を編集中</span>
              <button type="button" onClick={() => {
                if (!confirmEditDiscard(true, isSaving)) return;
                setEditingItemId(null); setPartnerName(''); setSubject(''); setPartnerImportant(false); setPartnerAssignees([]); setDate(formatDate(new Date())); setTimeHour(''); setTimeMinute(''); setEndTime(''); setContent(''); setNewPartnerImages([]);
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
                          {editingPartnerName === name ? (
                            <div className="flex-1 min-w-0 flex flex-col gap-2 p-2">
                              <input
                                autoFocus
                                type="text"
                                value={editingPartnerNameValue}
                                onChange={(e) => setEditingPartnerNameValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') { e.preventDefault(); handleSavePartnerName(); }
                                  if (e.key === 'Escape') { setEditingPartnerName(null); setEditingPartnerNameValue(''); }
                                }}
                                aria-label="パートナー名を編集"
                                className="w-full min-h-11 border border-blue-300 rounded-lg px-3 py-3 text-base outline-none focus:ring-2 focus:ring-blue-200"
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={handleSavePartnerName}
                                  disabled={!editingPartnerNameValue.trim()}
                                  className="flex-1 min-h-11 px-4 py-3 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
                                  title="変更を保存"
                                >
                                  保存
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setEditingPartnerName(null); setEditingPartnerNameValue(''); }}
                                  className="flex-1 min-h-11 px-4 py-3 text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
                                  title="編集をキャンセル"
                                >
                                  取消
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => { setPartnerName(name); setShowPartnerNameMenu(false); }}
                                className="min-w-0 min-h-12 flex-1 text-left px-3 py-3 text-base text-gray-700 hover:bg-blue-50 truncate"
                              >
                                {name}
                              </button>
                              <ActionIconButton action="edit" type="button" onClick={() => handleStartEditPartnerName(name)} aria-label={`パートナー名「${name}」を編集`} title="パートナー名を編集" className=""/>
                              <ActionIconButton action="delete" type="button" onClick={() => handleDeletePartnerName(name)} aria-label={`パートナー名「${name}」を削除`} title="パートナー名を削除" className=""/>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <AssigneePicker users={sortedUsers} value={partnerAssignees} onChange={setPartnerAssignees} disabled={isSaving}/>
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

          <ImagePicker files={newPartnerImages} onChange={setNewPartnerImages} disabled={isSaving}/><TaskSaveProgress progress={partnerUploadProgress}/>
          {editingItemId && <ImageGallery item={(partnerItems || []).find(item=>item.id===editingItemId)}/>}

          <div className="space-y-2">
            <ImportantToggle value={partnerImportant} onChange={setPartnerImportant} disabled={isSaving}/>
            <label className="block"><span className="text-[10px] font-bold text-gray-500">件名</span><input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="パートナータスクの件名を入力" className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400" /></label>

            {editingItemId && <PartnerUpdateHistory item={editingPartnerItem}/>}
            <label className="block">
              <span className="text-[10px] font-bold text-gray-500">{editingItemId ? '今回の申し送り・追記（任意）' : '詳しい内容（任意）'}</span>
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
          {activePartnerItems.length === 0 && completedPartnerItems.length === 0 ? (
            <div className="text-center text-[11px] text-gray-400 py-8">登録された内容はありません</div>
          ) : (
            <>
              {completedPartnerItems.length > 0 && (
              <div className="rounded-xl border border-green-200 bg-green-50/60 overflow-hidden">
                <button type="button" onClick={() => setShowCompletedPartnerItems(value => !value)} className="w-full flex items-center justify-between gap-2 px-3 py-3 text-left hover:bg-green-100/70">
                  <span className="flex items-center gap-2 min-w-0"><CheckSquare size={16} className="text-green-600 shrink-0"/><span className="text-sm font-bold text-green-800">終了したタスク</span><span className="text-xs text-green-700">（{completedPartnerItems.length}件）</span></span>
                  {showCompletedPartnerItems ? <ChevronUp size={18} className="text-green-700 shrink-0"/> : <ChevronDown size={18} className="text-green-700 shrink-0"/>}
                </button>
                {showCompletedPartnerItems && <div className="border-t border-green-200 p-2 space-y-2">{completedPartnerItems.map(renderPartnerItem)}</div>}
              </div>
            )}
{activePartnerItems.length > 0 && <div className="space-y-2"><div className="text-xs font-bold text-gray-500 px-1">対応中・予定（{activePartnerItems.length}件）</div>{activePartnerItems.map(renderPartnerItem)}</div>}

            </>
          )}
        </div>
      </div>
    </div>
  );
};

const CompletedTasksView = ({ teamData, partnerItems, sortedUsers, currentUserUid, currentUserEmail, isAdmin, deleteCompletedTask }) => {
  const deletingRef = useRef(false);
  const [deletingKey, setDeletingKey] = useState(null);
  const handleDelete = async (entry) => {
    if (deletingRef.current) return;
    if (!window.confirm(`「${entry.title}」の終了履歴を削除しますか？\n元の完了タスク・申し送り・添付の記録も一覧から削除され、元に戻せません。使用済み商品の在庫数は変わりません。`)) return;
    deletingRef.current = true;
    setDeletingKey(`${entry.type}-${entry.date}-${entry.ownerUid}-${entry.id}`);
    try { await deleteCompletedTask(entry); }
    catch (error) { alert(`終了履歴を削除できませんでした。\n${error.message || 'もう一度お試しください。'}`); }
    finally { deletingRef.current = false; setDeletingKey(null); }
  };
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
          imageUrl: task.imageUrl || '', images: getTaskImages(task)
        });
      });
    });
  });

  (partnerItems || []).filter(item => item?.completed).forEach(item => {
    const assigneeIds = partnerAssigneeIds(item);
    const assigneeUid = assigneeIds[0] || '';
    completedEntries.push({
      type: 'partner',
      id: item.id,
      date: item.date || String(item.completedAt || '').slice(0, 10),
      completedAt: item.completedAt || null,
      ownerUid: assigneeUid,
      ownerName: assigneeIds.map(id => memberMap[id]?.name).filter(Boolean).join('・') || '未割り当て',
      assigneeIds,
      assigneeNames: assigneeIds.map(id => memberMap[id]?.name).filter(Boolean),
      title: item.subject || item.partnerName || 'パートナータスク',
      content: item.content || '',
      partnerName: item.partnerName || '',
      imageUrl: item.imageUrl || '', images: mergeTaskImages(item, getPartnerUpdates(item).flatMap(getTaskImages))
    });
  });

  const filteredEntries = memberFilter === 'all'
    ? completedEntries
    : completedEntries.filter(entry => entry.ownerUid === memberFilter || entry.assigneeIds?.includes(memberFilter));

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
    setOpenMonths(prev => ({ ...prev, [monthKey]: !prev[monthKey] }));
  };


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
      {String(currentUserEmail || '').trim().toLowerCase() === 'mitsutake.takezoe@plandosee.co.jp' && <DailyReportPanel/>}
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
        const isOpen = openMonths[monthKey] === true;

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
                担当: {entry.assigneeNames.length ? entry.assigneeNames.join('・') : entry.ownerName}
              </div>
              <div className="text-[10px] text-gray-400">
                終了日時: {formatCompletedAt(entry.completedAt)}
              </div>
              {entry.content && (
                <div className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 whitespace-pre-wrap break-words">{entry.content}</div>
              )}
              <ImageGallery item={entry}/>
              {(entry.type === 'partner' || isAdmin || entry.ownerUid === currentUserUid) && (
                <ActionIconButton action="delete" type="button" onClick={() => handleDelete(entry)} disabled={deletingKey !== null} aria-label={`${entry.title}の終了履歴を削除`} className=""/>
              )}
            </div>
          </div>
        );

        return <section key={monthKey} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleMonth(monthKey)}
            aria-expanded={isOpen}
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


const normalizeInventoryName = (value) => String(value ?? '').normalize('NFKC').trim();

const BarcodeScannerModal = ({ onDetected, onClose }) => {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const [status, setStatus] = useState('カメラを準備しています…');
  const [manualCode, setManualCode] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let reader = null;
    const start = async () => {
      try {
        setStatus('カメラを起動しています…');
        const ZXing = await import(/* @vite-ignore */ 'https://esm.sh/@zxing/browser@0.2.1');
        if (cancelled) return;
        reader = new ZXing.BrowserMultiFormatReader();
        controlsRef.current = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } }, audio: false },
          videoRef.current,
          (result) => {
            if (!result || cancelled) return;
            cancelled = true;
            controlsRef.current?.stop();
            onDetected(String(result.getText?.() || result.text || '').trim());
          }
        );
        if (!cancelled) setStatus('バーコードまたはQRコードを映してください。');
      } catch (error) {
        console.error('バーコードスキャナーを起動できません:', error);
        if (!cancelled) setStatus('カメラを起動できませんでした。カメラの許可とHTTPS接続を確認するか、番号を手入力してください。');
      }
    };
    void start();
    return () => { cancelled = true; controlsRef.current?.stop(); reader?.reset?.(); };
  }, [onDetected]);
  const submitManual = () => {
    const code = manualCode.trim();
    if (!code) return;
    setBusy(true);
    onDetected(code);
  };
  return <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="バーコード・QRコード読み取り">
    <div className="w-full max-w-md rounded-2xl bg-white p-4 space-y-3 shadow-xl">
      <div className="flex items-center justify-between"><h3 className="font-black text-gray-800">バーコード・QRコード読取</h3><button type="button" onClick={onClose} className="p-2 rounded-lg border border-gray-200" aria-label="閉じる">×</button></div>
      <video ref={videoRef} muted playsInline className="w-full aspect-[4/3] bg-black rounded-xl object-cover" />
      <p className="text-xs text-gray-600">{status}</p>
      <div className="border-t pt-3 space-y-2"><label className="block text-xs font-bold text-gray-600">カメラで読めない場合は番号を入力<input value={manualCode} onChange={e=>setManualCode(e.target.value)} inputMode="numeric" autoComplete="off" placeholder="バーコード番号" className="mt-1 w-full min-h-11 rounded-xl border border-gray-300 px-3 text-base"/></label><button type="button" disabled={!manualCode.trim()||busy} onClick={submitManual} className="w-full min-h-11 rounded-xl bg-blue-600 text-white font-bold disabled:opacity-50">番号を使用</button></div>
    </div>
  </div>;
};

const InventoryView = ({ inventoryItems = [], inventoryMovements = [], addInventoryItem, adjustInventoryStock, editInventoryItem, deleteInventoryItem, updateInventoryImage }) => {
  const [sortOrder, setSortOrder] = useState(() => localStorage.getItem('inventory_sort_order') || 'name');
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [unbarcodedOpen, setUnbarcodedOpen] = useState(false);
  const [registeredOpen, setRegisteredOpen] = useState(false);
  const [replenishmentOpen, setReplenishmentOpen] = useState(false);
  const [newKind, setNewKind] = useState('');
  const [newName, setNewName] = useState('');
  const [newManufacturer, setNewManufacturer] = useState('');
  const [newModelNumber, setNewModelNumber] = useState('');
  const [ocrOpen, setOcrOpen] = useState(false);
  const [newProductPhoto, setNewProductPhoto] = useState(null);
  const [newProductPhotoPreview, setNewProductPhotoPreview] = useState('');
  const [selectedYahooImage, setSelectedYahooImage] = useState(null);
  const uploadedProductPhotoRef = useRef(null);
  const registrationSaveRef = useRef(false);
  useEffect(() => () => { if (newProductPhotoPreview) URL.revokeObjectURL(newProductPhotoPreview); }, [newProductPhotoPreview]);
  const selectProductPhoto = file => {
    if (registrationSaveRef.current) return;
    uploadedProductPhotoRef.current = null;
    setSelectedYahooImage(null);
    setNewProductPhoto(file);
    setNewProductPhotoPreview(file ? URL.createObjectURL(file) : '');
  };
  const [newDiscontinued, setNewDiscontinued] = useState(false);
  const [newReplacementId, setNewReplacementId] = useState('');
  const [newReplacementNote, setNewReplacementNote] = useState('');
  const [newShelfNumber, setNewShelfNumber] = useState('');
  const [newUsageLocation, setNewUsageLocation] = useState('');
  const [newBarcode, setNewBarcode] = useState('');
  const [newMinStock, setNewMinStock] = useState('2');
  const [newStock, setNewStock] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanQuantity, setScanQuantity] = useState('1');
  const [scanDirection, setScanDirection] = useState('in');
  const stockSaveRef = useRef(false);
  const [qrModelCandidates, setQrModelCandidates] = useState([]);
  const [scannedStockItemId, setScannedStockItemId] = useState('');
  const [barcodeLookupMessage, setBarcodeLookupMessage] = useState('');
  const [productLookupCandidates, setProductLookupCandidates] = useState([]);
  const [productLookupSource, setProductLookupSource] = useState('');
  const [isLookingUpProduct, setIsLookingUpProduct] = useState(false);
  const lookupRequestRef = useRef(0);

  const changeBarcode = (code) => {
    setQrModelCandidates([]);
    ++lookupRequestRef.current;
    const barcode = normalizeInventoryName(code);
    if (registrationSaveRef.current) return;
    selectProductPhoto(null);
    setNewBarcode(barcode);
    setNewName('');
    setNewManufacturer('');
    setNewModelNumber('');
    setNewDiscontinued(false);
    setNewReplacementId('');
    setNewReplacementNote('');
    setProductLookupCandidates([]);
    setProductLookupSource('');
    setIsLookingUpProduct(false);
    const existing = barcode && inventoryItems.find(item => normalizeInventoryName(item.barcode) === barcode);
    setScannedStockItemId(existing?.id || '');
    setRegistrationOpen(!!barcode && !existing);
    setScanQuantity('1');
    setBarcodeLookupMessage(existing ? '登録済み商品：' + inventoryProductLabel(existing) + '。入出庫数を入力できます。' : '未登録商品はGoogle検索で確認し、商品名を手入力できます。');
  };
  useEffect(() => () => { ++lookupRequestRef.current; }, []);
  const [editingId, setEditingId] = useState(null);
  const [editingKind, setEditingKind] = useState('');
  const [editingName, setEditingName] = useState('');
  const [editingManufacturer, setEditingManufacturer] = useState('');
  const [editingModelNumber, setEditingModelNumber] = useState('');
  const [editingDiscontinued, setEditingDiscontinued] = useState(false);
  const [editingReplacementId, setEditingReplacementId] = useState('');
  const [editingReplacementNote, setEditingReplacementNote] = useState('');
  const [editingShelfNumber, setEditingShelfNumber] = useState('');
  const [editingUsageLocation, setEditingUsageLocation] = useState('');
  const [editingBarcode, setEditingBarcode] = useState('');
  const [editingMinStock, setEditingMinStock] = useState('0');
  const [editingOcrOpen, setEditingOcrOpen] = useState(false);
  const [editingPhoto, setEditingPhoto] = useState(null);
  const [editingPhotoPreview, setEditingPhotoPreview] = useState('');
  const [editingImageRemoved, setEditingImageRemoved] = useState(false);
  const editingPhotoUploadRef = useRef(null);
  const editingSaveRef = useRef(false);
  useEffect(() => () => { if (editingPhotoPreview) URL.revokeObjectURL(editingPhotoPreview); }, [editingPhotoPreview]);
  const selectEditingPhoto = file => {
    if (editingSaveRef.current) return;
    editingPhotoUploadRef.current = null;
    setEditingPhoto(file);
    setEditingPhotoPreview(file ? URL.createObjectURL(file) : '');
    setEditingImageRemoved(false);
  };
  const cancelEdit = () => {
    if (!confirmEditDiscard(true, editingSaveRef.current)) return;
    setEditingId(null);
    setEditingOcrOpen(false);
    selectEditingPhoto(null);
  };
  const removeEditingImage = () => {
    if (editingSaveRef.current) return;
    if (!window.confirm('商品画像を削除しますか？「保存」を押すと反映されます。')) return;
    selectEditingPhoto(null);
    setEditingImageRemoved(true);
  };
  const [stockDrafts, setStockDrafts] = useState({});
  const [uploadingImageId, setUploadingImageId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  useEditGuard(editingId !== null, isSaving);

  const handleAdd = async () => {
    if (isSaving || registrationSaveRef.current) return;
    ++lookupRequestRef.current;
    setIsLookingUpProduct(false);
    const kind = normalizeInventoryName(newKind);
    const name = normalizeInventoryName(newName);
    const usageLocation = normalizeInventoryName(newUsageLocation);
    const barcode = normalizeInventoryName(newBarcode);
    const minStock = Number(newMinStock);
    const stock = Number(newStock);
    if (!hasInventoryProductDetails({ kind, name, manufacturer: newManufacturer, modelNumber: newModelNumber })) { alert('種類・商品名・メーカー・型番のいずれかを入力してください。'); return; }
    if (!Number.isInteger(stock) || stock < 0) { alert('在庫数は0以上の整数を入力してください。'); return; }
    if (!Number.isInteger(minStock) || minStock < 0) { alert('発注基準数は0以上の整数を入力してください。'); return; }
    if (barcode && inventoryItems.some(item => normalizeInventoryName(item.barcode) === barcode)) { alert('同じバーコードがすでに登録されています。'); return; }
    if (name && inventoryItems.some(item => normalizeInventoryName(item.name).toLowerCase() === name.toLowerCase())) {
      alert('同じ商品名がすでに登録されています。'); return;
    }
    registrationSaveRef.current = true;
    setIsSaving(true);
    try {
      let imageData = selectedYahooImage || {};
      if (newProductPhoto) {
        if (uploadedProductPhotoRef.current?.file !== newProductPhoto) {
          const prepared = await prepareInventoryImage(newProductPhoto);
          const uploaded = await uploadTaskImageToCloudinary(prepared);
          uploadedProductPhotoRef.current = { file: newProductPhoto, data: {
            imageUrl: uploaded.secure_url, imageName: prepared.name || '',
            imagePublicId: uploaded.public_id || '', imageBytes: Number(uploaded.bytes || prepared.size || 0)
          } };
        }
        imageData = uploadedProductPhotoRef.current.data;
      }
      await addInventoryItem({ id: 'inventory_' + Date.now(), kind, name, manufacturer: normalizeInventoryName(newManufacturer), modelNumber: normalizeInventoryName(newModelNumber), shelfNumber: normalizeInventoryName(newShelfNumber), discontinued: newDiscontinued, replacementProductId: newReplacementId, replacementNote: newReplacementNote.trim(), usageLocation, barcode, minStock, stock, ...imageData });
      setNewProductPhoto(null);
      setSelectedYahooImage(null);
      setNewProductPhotoPreview('');
      uploadedProductPhotoRef.current = null;
      setRegistrationOpen(false);
      setNewKind('');
      setNewName('');
      setNewManufacturer('');
      setNewModelNumber('');
      setOcrOpen(false);
      setNewDiscontinued(false);
      setNewReplacementId('');
      setNewReplacementNote('');
      setNewShelfNumber('');
      setNewUsageLocation('');
      setNewBarcode('');
      setNewMinStock('2');
      setNewStock('');
      setBarcodeLookupMessage('');
      setProductLookupCandidates([]);
      setProductLookupSource('');
    } catch (error) {
      console.error('商品の登録に失敗しました:', error);
      alert(error.message || '商品を登録できませんでした。入力内容を確認して再試行してください。');
    } finally { registrationSaveRef.current = false; setIsSaving(false); }
  };

  const startEdit = (item) => {
    if (isSaving || uploadingImageId) return false;
    if (editingId === item.id) return true;
    if (editingId && !confirmEditDiscard(true)) return false;
    selectEditingPhoto(null);
    setEditingOcrOpen(false);
    setEditingId(item.id);
    setEditingKind(normalizeInventoryName(item.kind));
    setEditingName(normalizeInventoryName(item.name));
    setEditingManufacturer(normalizeInventoryName(item.manufacturer));
    setEditingModelNumber(normalizeInventoryName(item.modelNumber));
    setEditingDiscontinued(!!item.discontinued);
    setEditingReplacementId(item.replacementProductId || '');
    setEditingReplacementNote(item.replacementNote || '');
    setEditingShelfNumber(normalizeInventoryName(item.shelfNumber));
    setEditingUsageLocation(normalizeInventoryName(item.usageLocation));
    setEditingBarcode(normalizeInventoryName(item.barcode));
    setEditingMinStock(String(Math.max(0, Number(item.minStock) || 0)));
    return true;
  };

  const handleEdit = async (item) => {
    if (isSaving || editingSaveRef.current) return;
    const kind = normalizeInventoryName(editingKind);
    const name = normalizeInventoryName(editingName);
    const usageLocation = normalizeInventoryName(editingUsageLocation);
    const barcode = normalizeInventoryName(editingBarcode);
    const minStock = Number(editingMinStock);
    if (!hasInventoryProductDetails({ kind, name, manufacturer: editingManufacturer, modelNumber: editingModelNumber })) { alert('種類・商品名・メーカー・型番のいずれかを入力してください。'); return; }
    if (!Number.isInteger(minStock) || minStock < 0) { alert('発注基準数は0以上の整数を入力してください。'); return; }
    if (barcode && inventoryItems.some(other => other.id !== item.id && normalizeInventoryName(other.barcode) === barcode)) { alert('同じバーコードがすでに登録されています。'); return; }
    if (name && inventoryItems.some(other => other.id !== item.id && normalizeInventoryName(other.name).toLowerCase() === name.toLowerCase())) {
      alert('同じ商品名がすでに登録されています。'); return;
    }
    editingSaveRef.current = true;
    setIsSaving(true);
    try {
      let imageChanges = {};
      if (editingPhoto) {
        if (editingPhotoUploadRef.current?.file !== editingPhoto) {
          const prepared = await prepareInventoryImage(editingPhoto);
          const uploaded = await uploadTaskImageToCloudinary(prepared);
          editingPhotoUploadRef.current = { file: editingPhoto, data: {
            imageUrl: uploaded.secure_url, imageName: prepared.name || '',
            imagePublicId: uploaded.public_id || '', imageBytes: Number(uploaded.bytes || prepared.size || 0)
          } };
        }
        imageChanges = editingPhotoUploadRef.current.data;
      } else if (editingImageRemoved) {
        imageChanges = { imageUrl: '', imageName: '', imagePublicId: '', imageBytes: 0 };
      }
      await editInventoryItem(item.id, { kind, name, manufacturer: normalizeInventoryName(editingManufacturer), modelNumber: normalizeInventoryName(editingModelNumber), shelfNumber: normalizeInventoryName(editingShelfNumber), discontinued: editingDiscontinued, replacementProductId: editingReplacementId, replacementNote: editingReplacementNote.trim(), usageLocation, barcode, minStock, ...imageChanges });
      setEditingPhoto(null);
      setEditingPhotoPreview('');
      setEditingImageRemoved(false);
      setEditingOcrOpen(false);
      editingPhotoUploadRef.current = null;
      setEditingId(null);
      setEditingKind('');
      setEditingName('');
      setEditingUsageLocation('');
      setEditingBarcode('');
    } catch (error) {
      console.error('商品情報の更新に失敗しました:', error);
      alert('商品情報を更新できませんでした。入力内容・画像を確認して再試行してください。');
    } finally { editingSaveRef.current = false; setIsSaving(false); }
  };

  const applyProductCandidate = candidate => {
    if (registrationSaveRef.current) return;
    setNewName(candidate.productName || candidate.title);
    if (candidate.fieldsInferred) { setNewManufacturer(candidate.manufacturer || ''); setNewModelNumber(candidate.modelNumber || ''); }
    selectProductPhoto(null);
    setProductLookupSource(candidate.url);
    setBarcodeLookupMessage('商品情報の候補を入力しました。メーカー・商品名・型番の分離は推定です。取得元のページ・セット数量と照合し、修正して登録してください。');
    setProductLookupCandidates([]);
  };
  const selectYahooProductImage = candidate => {
    if (registrationSaveRef.current || !candidate.imageUrl) return;
    applyProductCandidate(candidate);
    setSelectedYahooImage({ imageUrl: candidate.imageUrl, imageName: 'Yahoo!ショッピング：' + candidate.title, imagePublicId: '', imageBytes: 0 });
    setNewProductPhotoPreview(candidate.imageUrl);
  };

  const lookupProductByBarcode = async (barcode, provider = 'official') => {
    const normalizedBarcode = normalizeInventoryName(barcode);
    if (!/^\d{8,14}$/.test(normalizedBarcode)) {
      setBarcodeLookupMessage('JANコードを8〜14桁の数字で入力してください。');
      return;
    }
    const requestId = ++lookupRequestRef.current;
    const existing = inventoryItems.find(item => normalizeInventoryName(item.barcode) === normalizedBarcode);
    if (existing) {
      setScannedStockItemId(existing.id);
      setProductLookupCandidates([]);
      setProductLookupSource('');
      setIsLookingUpProduct(false);
      setBarcodeLookupMessage('登録済み商品：' + inventoryProductLabel(existing) + '。入出庫数を入力できます。');
      return;
    }
    setIsLookingUpProduct(true);
    setProductLookupCandidates([]);
    setProductLookupSource('');
    setBarcodeLookupMessage(provider === 'yahoo' ? 'Yahoo!ショッピングでJANコードが一致する候補を検索しています…' : 'メーカー公式サイトでJANコードと日本語の商品名を確認しています…');
    try {
      const response = await fetch((provider === 'yahoo' ? '/api/yahoo-product-lookup?jan=' : '/api/product-lookup?jan=') + encodeURIComponent(normalizedBarcode));
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '商品情報を検索できませんでした。');
      if (requestId !== lookupRequestRef.current) return;
      const candidates = (Array.isArray(result.candidates) ? result.candidates : []).filter(candidate => candidate.exactCodeMatch === true && (provider === 'yahoo' ? candidate.sourceType === 'Yahoo!ショッピング' && candidate.jan === normalizedBarcode : candidate.officialSource === true && !candidate.likelyCommerce) && /[ぁ-んァ-ヶ一-龠]/.test(candidate.title || ''));
      setProductLookupCandidates(candidates);
      const exactCandidate = candidates.find(candidate => candidate.officialSource === true && candidate.exactCodeMatch === true && !candidate.likelyCommerce);
      if (provider === 'yahoo') {
        setBarcodeLookupMessage(result.message || 'Yahoo!ショッピングの商品候補を確認してください。');
      } else if (exactCandidate) {
        // A page may list multiple products; require an explicit candidate selection.
        setBarcodeLookupMessage((exactCandidate.manufacturer || 'メーカー') + '公式サイトでJANコードを確認しました。登録前に商品名を確認してください。');
      } else if (candidates.length) {
        setBarcodeLookupMessage('メーカー公式サイトで確認できた候補があります。商品名と型番を確認して選択してください。');
      } else {
        setBarcodeLookupMessage(result.message || '商品情報が見つかりませんでした。Google検索または手入力をお試しください。');
      }
    } catch (error) {
      if (requestId !== lookupRequestRef.current) return;
      console.error('商品情報の自動取得に失敗しました:', error);
      setBarcodeLookupMessage(provider === 'yahoo' ? (error.message || 'Yahoo検索に失敗しました。Google検索または手入力をご利用ください。') : '商品情報を自動取得できませんでした。Google検索または手入力をお試しください。');
    } finally {
      if (requestId === lookupRequestRef.current) setIsLookingUpProduct(false);
    }
  };

  const handleBarcodeDetected = (value) => {
    if (isSaving || editingSaveRef.current || registrationSaveRef.current) return;
    setScannerOpen(false);
    const code = parseInventoryCode(value);
    if (code.type === 'unsupported') {
      setQrModelCandidates([]);
      setScannedStockItemId('');
      setBarcodeLookupMessage('このQRコードからは型番を取得できません。商品ラベルの文字読み取り、または手入力を利用してください。');
      return;
    }
    if (code.type === 'barcode') { changeBarcode(code.barcode); return; }
    changeBarcode('');
    setNewModelNumber(code.modelNumber);
    setNewManufacturer(code.manufacturer);
    const matches = findModelProducts(inventoryItems, code);
    setRegistrationOpen(matches.length === 0);
    if (matches.length === 1) {
      setScannedStockItemId(matches[0].id);
      setBarcodeLookupMessage('QRから型番 ' + code.modelNumber + ' を取得しました。登録済み商品の入出庫・編集ができます。');
    } else if (matches.length > 1) {
      setQrModelCandidates(matches.map(item => item.id));
      setBarcodeLookupMessage('型番 ' + code.modelNumber + ' に一致する商品が複数あります。対象の商品を選んでください。');
    } else {
      setBarcodeLookupMessage('QRからメーカー ' + code.manufacturer + '・型番 ' + code.modelNumber + ' を取得しました。未登録のため商品追加欄に反映しました。');
    }
  };

  const handleScannedStockAdd = async () => {
    if (stockSaveRef.current || isSaving) return;
    const quantity = Number(scanQuantity);
    if (!Number.isInteger(quantity) || quantity < 1) { alert('入出庫数は1以上の整数を入力してください。'); return; }
    if (!scannedStockItemId) return;
    stockSaveRef.current = true;
    setIsSaving(true);
    try {
      await adjustInventoryStock(scannedStockItemId, scanDirection === 'out' ? -quantity : quantity);
      setBarcodeLookupMessage(quantity + '個の' + (scanDirection === 'out' ? '出庫' : '入庫') + 'を記録しました。');
      setScannedStockItemId('');
      setScanQuantity('1');
    } catch (error) {
      alert(error.message || '在庫の更新に失敗しました。');
    } finally { stockSaveRef.current = false; setIsSaving(false); }
  };

  const handleImageUpload = async (item, file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('画像ファイルを選択してください。'); return; }
    if (file.size > 10 * 1024 * 1024) { alert('画像は10MB以下のファイルを選択してください。'); return; }
    setUploadingImageId(item.id);
    try {
      const prepared = await prepareInventoryImage(file);
      const uploaded = await uploadTaskImageToCloudinary(prepared);
      await updateInventoryImage(item.id, {
        imageUrl: uploaded.secure_url,
        imageName: prepared.name || '',
        imagePublicId: uploaded.public_id || '',
        imageBytes: Number(uploaded.bytes || prepared.size || 0)
      });
    } catch (error) {
      console.error('在庫商品の画像保存に失敗しました:', error);
      alert('画像を保存できませんでした。もう一度お試しください。');
    } finally {
      setUploadingImageId(null);
    }
  };

  const handleStockSave = async (item) => {
    const raw = stockDrafts[item.id] ?? String(Math.max(0, Number(item.stock) || 0));
    const stock = Number(raw);
    if (raw.trim() === '' || !Number.isInteger(stock) || stock < 0) {
      alert('在庫数は0以上の整数を入力してください。');
      return;
    }
    setIsSaving(true);
    try {
      await adjustInventoryStock(item.id, stock, true);
      setStockDrafts(current => { const next = { ...current }; delete next[item.id]; return next; });
    } catch (error) {
      console.error('在庫数の保存に失敗しました:', error);
      alert('在庫数を保存できませんでした。もう一度お試しください。');
    } finally { setIsSaving(false); }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`「${inventoryProductLabel(item)}」を在庫一覧から削除しますか？\\n関連する過去のタスク記録は残ります。`)) return;
    setIsSaving(true);
    try {
      await deleteInventoryItem(item.id);
    } catch (error) {
      console.error('商品の削除に失敗しました:', error);
      alert('商品を削除できませんでした。もう一度お試しください。');
    } finally { setIsSaving(false); }
  };

  const sortedItems = sortInventoryItems(inventoryItems, sortOrder);
  const needsReplenishment = item => Math.max(0, Number(item.stock) || 0) <= Math.max(0, item.minStock === undefined ? 2 : Number(item.minStock) || 0);
  const replenishmentItems = sortedItems.filter(needsReplenishment);
  const remainingItems = sortedItems.filter(item=>!needsReplenishment(item));
  const barcodedItems = remainingItems.filter(item=>normalizeInventoryName(item.barcode));
  const unbarcodedItems = remainingItems.filter(item=>!normalizeInventoryName(item.barcode));
  const openRelatedProduct = id => {
    setReplenishmentOpen(true); setRegisteredOpen(true); setUnbarcodedOpen(true);
    requestAnimationFrame(()=>document.getElementById('inventory-product-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };
  const editScannedProduct = () => {
    const item = inventoryItems.find(product => product.id === scannedStockItemId);
    if (!item || !startEdit(item)) return;
    if (needsReplenishment(item)) setReplenishmentOpen(true);
    else setRegisteredOpen(true);
    requestAnimationFrame(() => document.getElementById('inventory-product-' + item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const renderReplacementInfo = item => {
    if (!item) return null;
    const replacement = inventoryItems.find(other=>other.id===item.replacementProductId);
    const originals = inventoryItems.filter(other=>other.replacementProductId===item.id);
    return <div className="space-y-1 text-xs">
      {item.discontinued && <span className="inline-block rounded bg-amber-100 px-2 py-1 font-bold text-amber-900">生産終了</span>}
      {item.replacementProductId && <div className="text-blue-800">代替品：{replacement ? <button type="button" onClick={()=>openRelatedProduct(replacement.id)} className="font-bold underline">{inventoryProductLabel(replacement)}（商品を開く）</button> : '登録商品が見つかりません。編集で選び直してください。'}</div>}
      {item.replacementNote && <div className="whitespace-pre-wrap break-words text-amber-900">代替時の注意：{item.replacementNote}</div>}
      {originals.map(original=><div key={original.id} className="text-blue-800"><button type="button" onClick={()=>openRelatedProduct(original.id)} className="font-bold underline">{inventoryProductLabel(original)}</button>の代替品</div>)}
    </div>;
  };
  const renderInventoryItem = item => {
        const kind = normalizeInventoryName(item.kind);
        const name = inventoryProductLabel(item);
        const usageLocation = normalizeInventoryName(item.usageLocation);
        const stock = Math.max(0, Number(item.stock) || 0);
        const minStock = Math.max(0, item.minStock === undefined ? 2 : Number(item.minStock) || 0);
        const low = stock <= minStock;
        const stockValue = stockDrafts[item.id] ?? String(stock);
        return <div key={item.id} id={'inventory-product-' + item.id} className={`rounded-xl border p-3 sm:p-4 space-y-3 ${low?'border-red-300 bg-red-50':'border-gray-200 bg-white'}`}>
          <div className="flex items-start gap-2">
            <div className={`min-w-0 flex-1 ${low?'text-red-700':'text-gray-800'}`}>
              {editingId === item.id ? <div className="space-y-2">
                <div className="rounded-xl border border-indigo-200 bg-white p-3 space-y-2">
                  <div className="text-xs font-bold text-gray-700">商品画像・ラベル</div>
                  {(editingPhotoPreview || (!editingImageRemoved && item.imageUrl)) && <img src={editingPhotoPreview || item.imageUrl} alt="編集中の商品画像" className="max-h-48 w-full rounded-lg object-contain"/>}
                  {editingPhotoPreview && <p className="text-xs text-blue-700">この写真を商品画像として保存します。</p>}
                  {editingImageRemoved && <p className="text-xs text-red-600">商品画像を削除します。保存するまでは反映されません。</p>}
                  <button type="button" disabled={isSaving} onClick={()=>setEditingOcrOpen(open=>!open)} className="min-h-11 w-full rounded-lg border border-indigo-300 bg-indigo-50 px-3 text-sm font-bold text-indigo-900 disabled:opacity-50">{editingOcrOpen ? 'ラベル読み取りを閉じる' : 'ラベルを撮影・追加する'}</button>
                  {(editingPhoto || (!editingImageRemoved && item.imageUrl)) && <ActionIconButton action="delete" type="button" disabled={isSaving} onClick={removeEditingImage} className=""/>}
                  {editingImageRemoved && <button type="button" disabled={isSaving} onClick={()=>setEditingImageRemoved(false)} className="min-h-11 text-sm font-bold text-gray-600">画像の削除を取り消す</button>}
                  {editingOcrOpen && <LabelOcrCapture key={item.id} onUseImage={selectEditingPhoto} disabled={isSaving} onApply={(field,value)=>{const text=normalizeInventoryName(value).slice(0,120);if(field==='name')setEditingName(text);if(field==='manufacturer')setEditingManufacturer(text);if(field==='modelNumber')setEditingModelNumber(text);}}/>}
                </div>
                <label className="block text-xs font-bold text-gray-600">種類（任意）<input value={editingKind} onChange={e=>setEditingKind(e.target.value)} maxLength={80} placeholder="種類（省略可）" className="mt-1 w-full min-h-10 border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white text-gray-800"/></label>
                <label className="block text-xs font-bold text-gray-600">商品名（任意）<input autoFocus value={editingName} onChange={e=>setEditingName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void handleEdit(item);}if(e.key==='Escape'){cancelEdit();}}} maxLength={120} className="mt-1 w-full min-h-10 border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white text-gray-800"/></label>
                <label className="block text-xs font-bold text-gray-600">メーカー（任意）<input value={editingManufacturer} onChange={e=>setEditingManufacturer(e.target.value)} maxLength={120} className="mt-1 w-full min-h-10 border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"/></label>
                <label className="block text-xs font-bold text-gray-600">型番（任意）<input value={editingModelNumber} onChange={e=>setEditingModelNumber(e.target.value)} maxLength={120} className="mt-1 w-full min-h-10 border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"/></label>
                <label className="block text-xs font-bold text-gray-600">棚番号（任意）<input value={editingShelfNumber} onChange={e=>setEditingShelfNumber(e.target.value)} maxLength={80} placeholder="例：A-01" className="mt-1 w-full min-h-10 border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white text-gray-800"/></label>
        <label className="block text-xs font-bold text-gray-600">使用箇所（任意）<input value={editingUsageLocation} onChange={e=>setEditingUsageLocation(e.target.value)} maxLength={120} placeholder="使用箇所（省略可）" className="mt-1 w-full min-h-10 border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white text-gray-800"/></label>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2"><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={editingDiscontinued} onChange={e=>setEditingDiscontinued(e.target.checked)}/>生産終了</label><label className="block text-xs font-bold">代替品（1商品・任意）<select value={editingReplacementId} onChange={e=>setEditingReplacementId(e.target.value)} className="mt-1 min-h-11 w-full border border-gray-300 rounded-lg bg-white px-2"><option value="">代替品を指定しない</option>{inventoryItems.filter(other=>other.id!==item.id).map(other=><option key={other.id} value={other.id}>{inventoryProductLabel(other)}{other.modelNumber ? '／' + other.modelNumber : ''}</option>)}</select></label><label className="block text-xs font-bold">代替時の注意事項（任意）<textarea value={editingReplacementNote} onChange={e=>setEditingReplacementNote(e.target.value)} maxLength={500} rows={2} placeholder="口金・寸法・明るさなど" className="mt-1 w-full border border-gray-300 rounded-lg bg-white p-2 text-sm"/></label><p className="text-xs text-gray-600">代替品は先に商品登録してください。旧商品の残り在庫も入出庫できます。</p></div>
                <label className="block text-xs font-bold text-gray-600">バーコード番号<input value={editingBarcode} onChange={e=>setEditingBarcode(e.target.value)} maxLength={80} className="mt-1 w-full min-h-10 border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white text-gray-800"/></label>
                <label className="block text-xs font-bold text-gray-600">発注基準数<input type="number" min="0" step="1" value={editingMinStock} onChange={e=>setEditingMinStock(e.target.value)} className="mt-1 w-full min-h-10 border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white text-gray-800"/></label>
              </div> : <div>
                <div className="text-xs text-gray-500">{kind || '種類未設定'}</div>
                <div className="font-bold text-sm break-words">{name}</div>
                {item.manufacturer && <div className="mt-1 text-xs text-gray-600">メーカー：{item.manufacturer}</div>}
                {item.modelNumber && <div className="mt-1 text-xs text-gray-600">型番：{item.modelNumber}</div>}
                {item.shelfNumber && <div className="mt-1 text-xs text-gray-600">棚番号：{item.shelfNumber}</div>}
                {usageLocation && <div className="mt-1 text-xs text-gray-600">使用箇所：{usageLocation}</div>}
                {item.barcode && <div className="mt-1 text-[11px] text-gray-500">バーコード：{item.barcode}</div>}
                <div className="mt-1 text-[11px] text-gray-500">発注基準：{minStock}個</div>
                {renderReplacementInfo(item)}
              </div>}
              {low && <div className="mt-1 text-[11px] font-black text-red-600">在庫わずか・補充してください</div>}
            </div>
            {editingId === item.id ? <div className="flex gap-1 shrink-0"><button type="button" disabled={isSaving} onClick={()=>void handleEdit(item)} className="min-h-10 px-3 rounded-lg bg-blue-600 text-white text-xs font-bold disabled:opacity-50">保存</button><button type="button" disabled={isSaving} onClick={cancelEdit} className="min-h-10 px-3 rounded-lg border border-gray-300 bg-white text-xs font-bold">取消</button></div> : <div className="flex gap-1 shrink-0">
              <label title="商品画像を保存" aria-label={name+'の画像を保存'} className={`w-10 h-10 rounded-lg border border-blue-200 bg-white text-blue-600 flex items-center justify-center cursor-pointer ${uploadingImageId===item.id?'opacity-50 pointer-events-none':''}`}>
                {uploadingImageId===item.id ? <Loader2 size={16} className="animate-spin"/> : <ImageIcon size={16}/>}
                <input type="file" accept="image/*" className="hidden" disabled={uploadingImageId===item.id || isSaving} onChange={e=>{const file=e.target.files?.[0];if(file)void handleImageUpload(item,file);e.target.value='';}}/>
              </label>
              <ActionIconButton action="edit" type="button" disabled={isSaving || !!uploadingImageId} onClick={()=>startEdit(item)} aria-label={name+'の商品情報を編集'} className=""/>
              <ActionIconButton action="delete" type="button" onClick={()=>void handleDelete(item)} disabled={isSaving || uploadingImageId===item.id} aria-label={name+'を削除'} className=""/>
            </div>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" aria-label={name+'の在庫を1個減らす'} disabled={stock<=0 || isSaving} onClick={()=>void adjustInventoryStock(item.id,-1)} className="w-10 h-10 rounded-xl border border-gray-300 bg-white text-xl font-bold disabled:opacity-30">−</button>
            <input aria-label={name+'の在庫数'} type="number" inputMode="numeric" min="0" step="1" value={stockValue} onChange={e=>setStockDrafts(current=>({...current,[item.id]:e.target.value}))} className={`w-24 h-10 rounded-lg border px-2 text-center text-base font-black tabular-nums bg-white ${low?'border-red-300 text-red-600':'border-gray-300 text-gray-800'}`}/>
            <span className={`text-sm font-bold ${low?'text-red-600':'text-gray-600'}`}>個</span>
            <button type="button" aria-label={name+'の在庫を1個増やす'} disabled={isSaving} onClick={()=>void adjustInventoryStock(item.id,1)} className="w-10 h-10 rounded-xl border border-gray-300 bg-white text-xl font-bold disabled:opacity-50">＋</button>
            <button type="button" disabled={isSaving || (stockDrafts[item.id] === undefined || stockDrafts[item.id] === String(stock))} onClick={()=>void handleStockSave(item)} className="min-h-10 px-3 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-40">個数を保存</button>
            {item.imageUrl && <a href={item.imageUrl} target="_blank" rel="noreferrer" title="商品画像を拡大表示" className="inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-300 bg-white"><img src={item.imageUrl} alt={name+'の商品画像'} className="h-full w-full object-cover"/></a>}
          </div>
        </div>;
      };
  return <div className="flex-1 overflow-y-auto bg-gray-50 pb-[84px]">
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-center gap-3"><div className="w-11 h-11 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center"><Package size={24}/></div><div><h2 className="text-xl font-black text-gray-800">在庫管理</h2><p className="text-xs text-gray-500">日別タスクで商品を選ぶと在庫が1個減ります。</p></div></div>
      <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-black text-gray-700">バーコード・QRコードで商品を確認</h3><button type="button" disabled={isSaving} onClick={()=>setScannerOpen(true)} className="shrink-0 inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-indigo-600 px-3 text-xs font-bold text-white"><Camera size={16}/>カメラで読取</button></div>
        <label className="block text-xs font-bold text-gray-600">バーコード番号（任意）<input value={newBarcode} onChange={e=>changeBarcode(e.target.value)} inputMode="numeric" placeholder="バーコードを読み取るか入力" className="mt-1 w-full min-h-11 border border-gray-300 rounded-xl px-3 py-2.5 text-base" maxLength={80}/></label>
        {scannedStockItemId && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-2"><div className="text-sm font-bold text-emerald-800">登録済み商品の入出庫：{inventoryProductLabel(inventoryItems.find(item=>item.id===scannedStockItemId))}</div>{renderReplacementInfo(inventoryItems.find(item=>item.id===scannedStockItemId))}<div className="flex gap-2"><select aria-label="入出庫区分" value={scanDirection} onChange={e=>setScanDirection(e.target.value)} className="rounded-lg border border-emerald-300"><option value="in">入庫</option><option value="out">出庫</option></select><input type="number" min="1" step="1" value={scanQuantity} onChange={e=>setScanQuantity(e.target.value)} aria-label="入出庫数量" className="min-h-11 w-24 rounded-lg border border-emerald-300 px-2 text-center text-base"/><button type="button" onClick={()=>void handleScannedStockAdd()} disabled={isSaving} className="flex-1 min-h-11 rounded-lg bg-emerald-600 px-3 text-sm font-bold text-white disabled:opacity-50">この数量の入出庫を保存</button></div></div>}
        {scannedStockItemId && <ActionIconButton action="edit" type="button" onClick={editScannedProduct} disabled={isSaving || !!uploadingImageId || !inventoryItems.some(item => item.id === scannedStockItemId)} className="w-full"/>}
        {qrModelCandidates.length > 0 && <div className="space-y-2">{qrModelCandidates.map(id => inventoryItems.find(item => item.id === id)).filter(Boolean).map(item => <button type="button" key={item.id} disabled={isSaving} onClick={() => { setScannedStockItemId(item.id); setQrModelCandidates([]); setBarcodeLookupMessage('登録済み商品：' + inventoryProductLabel(item) + '。入出庫・編集ができます。'); }} className="min-h-11 w-full rounded-lg border border-blue-300 p-2 text-left text-sm font-bold text-blue-800">{inventoryProductLabel(item)} ・ 棚番号：{item.shelfNumber || '未設定'}</button>)}</div>}
        {!scannedStockItemId && barcodeLookupMessage && <p className="text-xs text-blue-800">{barcodeLookupMessage}</p>}
        {scannedStockItemId && barcodeLookupMessage && <p className="text-xs text-emerald-800">{barcodeLookupMessage}</p>}
      </section>
      <button type="button" aria-expanded={registrationOpen} aria-controls="inventory-registration" disabled={isSaving || !!scannedStockItemId} onClick={()=>setRegistrationOpen(open=>!open)} className="w-full min-h-11 rounded-xl border border-blue-200 bg-white px-3 text-left text-sm font-bold text-blue-800">商品を追加・バーコード登録 {registrationOpen ? '▲ 閉じる' : '▼ 開く'}</button>
      {registrationOpen && !scannedStockItemId && <form id="inventory-registration" onSubmit={e => { e.preventDefault(); void handleAdd(); }} className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3 shadow-sm">
        {newBarcode && !scannedStockItemId && <button type="button" onClick={() => void lookupProductByBarcode(newBarcode, 'yahoo')} disabled={isLookingUpProduct} className="w-full min-h-10 rounded-lg border border-blue-300 text-blue-800 text-xs font-bold disabled:opacity-50">Yahoo!ショッピングで商品候補を検索</button>}
        {newBarcode && !scannedStockItemId && <button type="button" onClick={() => void lookupProductByBarcode(newBarcode)} disabled={isLookingUpProduct} className="w-full min-h-10 rounded-lg border border-blue-300 text-blue-800 text-xs font-bold disabled:opacity-50">{isLookingUpProduct ? '商品情報を検索中…' : 'メーカー公式サイトで候補を検索（任意）'}</button>}
        {barcodeLookupMessage && <div className="rounded-lg bg-blue-50 border border-blue-100 p-2 text-xs text-blue-800 space-y-2"><div>{barcodeLookupMessage}</div>{isLookingUpProduct && <div className="flex items-center gap-2"><Loader2 size={14} className="animate-spin"/>商品候補を検索中…</div>}{productLookupSource && <a href={productLookupSource} target="_blank" rel="noopener noreferrer" className="block underline break-all">取得元の商品ページを確認 ↗</a>}{productLookupCandidates.length > 0 && !productLookupSource && <div className="space-y-2"><div className="font-bold">商品候補（選択すると各入力欄に反映します）</div>{productLookupCandidates.map((candidate) => <div key={candidate.url} className="rounded-lg border border-blue-200 bg-white p-2 space-y-1">{candidate.imageUrl && <div className="space-y-1"><img src={candidate.imageUrl} alt={candidate.title + 'のYahoo商品画像'} loading="lazy" referrerPolicy="no-referrer" className="h-32 w-full rounded-lg bg-white object-contain"/><button type="button" disabled={isSaving} onClick={()=>selectYahooProductImage(candidate)} className="min-h-11 rounded-lg bg-blue-600 px-3 text-sm font-bold text-white disabled:opacity-50">この商品情報と画像を使う</button></div>}<button type="button" onClick={() => applyProductCandidate(candidate)} className="text-left font-bold underline">{candidate.title}</button><div className="text-[11px] text-gray-600">{candidate.manufacturer ? candidate.manufacturer + '・' : ''}{candidate.sourceType || 'メーカー公式サイト'}{candidate.description ? '：' + candidate.description : ''}</div>{candidate.fieldsInferred && <div className="text-xs text-gray-700 space-y-1"><div>メーカー候補：{candidate.manufacturer || '判別できません'}</div><div>商品名候補：{candidate.productName || candidate.title}</div><div>型番候補：{candidate.modelNumber || '判別できません'}</div>{candidate.brand && <div>Yahooブランド：{candidate.brand}</div>}<div className="text-amber-800">分離結果は推定です。選択後に各欄を確認・修正してください。</div></div>}<a href={candidate.url} target="_blank" rel="noopener noreferrer" className="break-all underline">ページを確認 ↗</a>{candidate.exactCodeMatch && <span className="inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">JANコード一致</span>}</div>)}</div>}</div>}
        {!scannedStockItemId && <div className="space-y-3">
          <p className="text-xs text-gray-600">未登録商品はGoogle検索・ラベル撮影・手入力で確認できます。入力した商品情報を確認してから登録してください。</p>
          {newBarcode && <a href={`https://www.google.com/search?q=${encodeURIComponent(normalizeInventoryName(newBarcode) + ' 商品')}`} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-3 text-sm font-bold text-white">JANコードをGoogleで検索 ↗</a>}
          <button type="button" onClick={()=>setOcrOpen(open=>!open)} className="block min-h-11 w-full rounded-lg border border-indigo-300 bg-indigo-50 px-3 text-sm font-bold text-indigo-900">{ocrOpen ? 'ラベル読み取りを閉じる' : '商品ラベルを撮影して文字を読み取る'}</button>
          {ocrOpen && <LabelOcrCapture key={newBarcode} onUseImage={selectProductPhoto} disabled={isSaving} onApply={(field, value)=>{ const text = normalizeInventoryName(value); if(field==='name')setNewName(text.slice(0,120)); if(field==='manufacturer')setNewManufacturer(text.slice(0,120)); if(field==='modelNumber')setNewModelNumber(text.slice(0,120)); }}/>}
        </div>}
        {newProductPhotoPreview && <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-2"><div className="text-xs font-bold text-blue-800">登録する商品画像</div><img src={newProductPhotoPreview} alt="登録する商品画像のプレビュー" className="max-h-48 w-full rounded-lg bg-white object-contain"/><button type="button" disabled={isSaving} onClick={()=>selectProductPhoto(null)} className="min-h-11 text-sm font-bold text-red-600 disabled:opacity-50">商品画像を外す</button><p className="text-xs text-gray-600">{selectedYahooImage ? 'Yahooの商品画像URLを保存します。写真のアップロードは不要です。販売店による画像変更・削除で表示できなくなる場合があります。' : '商品を追加すると、この写真も保存します。'}</p></div>}
        <label className="block text-xs font-bold text-gray-600">種類（任意）<input value={newKind} onChange={e=>setNewKind(e.target.value)} placeholder="種類を入力（省略可）" className="mt-1 w-full min-h-11 border border-gray-300 rounded-xl px-3 py-2.5 text-base" maxLength={80}/></label>
        <label className="block text-xs font-bold text-gray-600">商品名（任意）<input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="商品名を入力" className="mt-1 w-full min-h-11 border border-gray-300 rounded-xl px-3 py-2.5 text-base" maxLength={120}/></label>
        <label className="block text-xs font-bold text-gray-600">メーカー（任意）<input value={newManufacturer} onChange={e=>setNewManufacturer(e.target.value)} maxLength={120} className="mt-1 w-full min-h-11 border border-gray-300 rounded-xl px-3 py-2.5 text-base"/></label>
        <label className="block text-xs font-bold text-gray-600">型番（任意）<input value={newModelNumber} onChange={e=>setNewModelNumber(e.target.value)} maxLength={120} className="mt-1 w-full min-h-11 border border-gray-300 rounded-xl px-3 py-2.5 text-base"/></label>
        <label className="block text-xs font-bold text-gray-600">棚番号（任意）<input value={newShelfNumber} onChange={e=>setNewShelfNumber(e.target.value)} maxLength={80} placeholder="例：A-01" className="mt-1 w-full min-h-11 border border-gray-300 rounded-xl px-3 py-2.5 text-base"/></label>
        <label className="block text-xs font-bold text-gray-600">使用箇所（任意）<input value={newUsageLocation} onChange={e=>setNewUsageLocation(e.target.value)} placeholder="使用箇所を入力（省略可）" className="mt-1 w-full min-h-11 border border-gray-300 rounded-xl px-3 py-2.5 text-base" maxLength={120}/></label>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2"><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={newDiscontinued} onChange={e=>setNewDiscontinued(e.target.checked)}/>生産終了</label><label className="block text-xs font-bold">代替品（1商品・任意）<select value={newReplacementId} onChange={e=>setNewReplacementId(e.target.value)} className="mt-1 min-h-11 w-full border border-gray-300 rounded-lg bg-white px-2"><option value="">代替品を指定しない</option>{inventoryItems.map(other=><option key={other.id} value={other.id}>{inventoryProductLabel(other)}{other.modelNumber ? '／' + other.modelNumber : ''}</option>)}</select></label><label className="block text-xs font-bold">代替時の注意事項（任意）<textarea value={newReplacementNote} onChange={e=>setNewReplacementNote(e.target.value)} maxLength={500} rows={2} placeholder="口金・寸法・明るさなど" className="mt-1 w-full border border-gray-300 rounded-lg bg-white p-2 text-sm"/></label><p className="text-xs text-gray-600">代替品は先に商品登録してください。旧商品の残り在庫も入出庫できます。</p></div>
        <div className="flex items-center gap-3"><label className="text-sm font-bold text-gray-600 flex-1" htmlFor="inventory-new-min-stock">発注基準数</label><input id="inventory-new-min-stock" type="number" min="0" step="1" value={newMinStock} onChange={e=>setNewMinStock(e.target.value)} className="w-28 min-h-11 border border-gray-300 rounded-xl px-3 py-2 text-base text-right"/></div>
        <div className="flex items-center gap-3"><label className="text-sm font-bold text-gray-600 flex-1" htmlFor="inventory-new-stock">初期在庫数</label><input id="inventory-new-stock" type="number" inputMode="numeric" min="0" step="1" value={newStock} onChange={e=>setNewStock(e.target.value)} className="w-28 min-h-11 border border-gray-300 rounded-xl px-3 py-2 text-base text-right"/></div>
        <button type="submit" disabled={isSaving || !hasInventoryProductDetails({ kind: newKind, name: newName, manufacturer: newManufacturer, modelNumber: newModelNumber })} className="w-full min-h-11 rounded-xl bg-blue-600 text-white font-bold text-sm disabled:opacity-50">{isSaving?'登録中…':'商品を追加'}</button>
        <p className="text-[11px] text-gray-500">種類・商品名・メーカー・型番のいずれか1つを入力すると登録できます。JANコード・使用箇所だけでは登録できません。</p>
      </form>}
      {sortedItems.length===0 && <div className="rounded-xl bg-white border border-gray-200 p-6 text-center text-sm text-gray-500">商品が登録されていません。</div>}
      <label className="flex flex-wrap items-center gap-2 text-sm font-bold text-gray-700">各一覧の並び順<select aria-label="商品の並び順" value={sortOrder} onChange={e=>{setSortOrder(e.target.value);localStorage.setItem('inventory_sort_order',e.target.value);}} className="min-h-11 rounded-lg border border-gray-300 bg-white px-3"><option value="name">種類・商品名順</option><option value="shelf-asc">棚番号順（昇順）</option><option value="shelf-desc">棚番号順（降順）</option></select><span className="text-xs font-normal text-gray-500">棚番号が空欄の商品は末尾</span></label>
      <section className="space-y-2"><button type="button" aria-expanded={replenishmentOpen} aria-controls="inventory-replenishment" disabled={isSaving} onClick={()=>setReplenishmentOpen(open=>!open)} className="w-full min-h-11 rounded-xl border border-red-300 bg-red-50 px-3 text-left text-sm font-bold text-red-800">補充商品（{replenishmentItems.length}件） {replenishmentOpen ? '▲ 閉じる' : '▼ 開く'}</button>{replenishmentOpen && <div id="inventory-replenishment" className="space-y-2">{replenishmentItems.length ? replenishmentItems.map(renderInventoryItem) : <p className="p-3 text-xs text-gray-500">補充が必要な商品はありません。</p>}</div>}</section>
      <section className="space-y-2"><button type="button" aria-expanded={registeredOpen} aria-controls="inventory-registered" disabled={isSaving} onClick={()=>setRegisteredOpen(open=>!open)} className="w-full min-h-11 rounded-xl border border-gray-300 bg-white px-3 text-left text-sm font-bold text-gray-700">登録商品（{barcodedItems.length}件） {registeredOpen ? '▲ 閉じる' : '▼ 開く'}</button>{registeredOpen && <div id="inventory-registered" className="space-y-2">{barcodedItems.length ? barcodedItems.map(renderInventoryItem) : <p className="p-3 text-xs text-gray-500">補充商品以外のバーコード登録済み商品はありません。</p>}</div>}</section>
      {unbarcodedItems.length > 0 && <section className="space-y-2"><button type="button" aria-expanded={unbarcodedOpen} aria-controls="inventory-unbarcoded" disabled={isSaving} onClick={()=>setUnbarcodedOpen(open=>!open)} className="w-full min-h-11 rounded-xl border border-gray-300 bg-white px-3 text-left text-sm font-bold text-gray-700">バーコード未登録の商品（{unbarcodedItems.length}件） {unbarcodedOpen ? '▲ 閉じる' : '▼ 開く'}</button>{unbarcodedOpen && <div id="inventory-unbarcoded" className="space-y-2">{unbarcodedItems.map(renderInventoryItem)}</div>}</section>}
      <section className="rounded-2xl border border-gray-200 bg-white p-4 space-y-2"><div className="flex items-center gap-2"><History size={17} className="text-gray-500"/><h3 className="text-sm font-black text-gray-700">在庫変動履歴</h3></div><p className="text-[11px] text-gray-500">入庫・在庫調整・タスク使用・タスク削除による戻しを記録します。月末の実在庫との差異は「在庫数を保存」で調整し、履歴を確認してください。</p>{inventoryMovements.length ? <div className="max-h-72 overflow-y-auto divide-y divide-gray-100">{[...inventoryMovements].sort((a,b)=>String(b.timestamp||'').localeCompare(String(a.timestamp||''))).slice(0,50).map(entry=><div key={entry.id} className="py-2 text-xs"><div className="flex items-start justify-between gap-2"><span className="font-bold text-gray-700">{entry.productName || '商品'}</span><span className={`font-black tabular-nums ${Number(entry.delta||0)<0?'text-red-600':'text-emerald-700'}`}>{Number(entry.delta||0)>0?'+':''}{Number(entry.delta||0)}個</span></div><div className="mt-0.5 text-gray-500">{entry.typeLabel || entry.type || '在庫変更'} ・ {entry.timestamp ? new Date(entry.timestamp).toLocaleString('ja-JP') : ''}</div>{entry.stockBefore !== undefined && <div className="mt-0.5 text-gray-600">在庫：{entry.stockBefore} → {entry.stockAfter}個</div>}{entry.actorName && <div className="mt-0.5 text-gray-600">操作：{entry.actorName}</div>}{entry.reason && <div className="mt-0.5 text-gray-600">理由：{entry.reason}</div>}</div>)}</div> : <p className="py-2 text-xs text-gray-400">まだ履歴はありません。今後の在庫変更から記録されます。</p>}</section>
      <div><span style={{ margin: '15px 15px 15px 15px' }}><a href="https://developer.yahoo.co.jp/sitemap/">Webサービス by Yahoo! JAPAN</a></span></div>
      <p className="text-[11px] text-gray-500">在庫が商品ごとの発注基準数以下になると赤く表示されます。登録済み商品はJANコードで表示します。未登録商品はYahoo検索・Google検索・手入力を利用できます。販売店の情報はメーカー公式確認済みではありません。商品名・型番・セット数量を確認して保存してください。</p>
    </div>
    {scannerOpen && <BarcodeScannerModal onDetected={handleBarcodeDetected} onClose={()=>setScannerOpen(false)}/>}
  </div>;
};

const BottomNav = ({ activeTab, setActiveTab, setSelectedDate, currentUser, roles }) => {
  const canManageShift = checkCanManageShift(currentUser, roles) || isReadOnlyUser(currentUser, roles);
  const userRoleObj = roles[currentUser.role] || { level: 10 };
  const canManageSettings = userRoleObj.level >= 30;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 pb-safe z-20 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
      <div className="flex h-[68px] w-full max-w-full">
        <button 
          onClick={() => {if(confirmDiscardEdits()) setActiveTab('calendar');}}
          className={`flex-1 flex flex-col items-center justify-center space-y-1.5 relative ${activeTab === 'calendar' ? 'text-blue-600' : 'text-gray-400'}`}
        >
          <CalendarIcon className="w-6 h-6"/>
          <span className="text-[10px] font-bold">カレンダー</span>
          {activeTab === 'calendar' && <div className="absolute top-0 w-1/2 h-0.5 bg-blue-600 rounded-b-full"></div>}
        </button>
        
        {canManageShift && (
          <button 
            onClick={() => {if(confirmDiscardEdits()) setActiveTab('team-shift');}}
            className={`flex-1 flex flex-col items-center justify-center space-y-1.5 relative ${activeTab === 'team-shift' ? 'text-purple-600' : 'text-gray-400'}`}
          >
            <Table className="w-6 h-6"/>
            <span className="text-[10px] font-bold">シフト管理</span>
            {activeTab === 'team-shift' && <div className="absolute top-0 w-1/2 h-0.5 bg-purple-600 rounded-b-full"></div>}
          </button>
        )}

        <button 
          onClick={() => { if(!confirmDiscardEdits())return; setSelectedDate(formatDate(new Date())); setActiveTab('daily'); }}
          className={`flex-1 flex flex-col items-center justify-center space-y-1.5 relative ${activeTab === 'daily' ? 'text-blue-600' : 'text-gray-400'}`}
        >
          <CheckSquare className="w-6 h-6"/>
          <span className="text-[10px] font-bold">日別タスク</span>
          {activeTab === 'daily' && <div className="absolute top-0 w-1/2 h-0.5 bg-blue-600 rounded-b-full"></div>}
        </button>

        <button
          onClick={() => {if(confirmDiscardEdits()) setActiveTab('partner');}}
          className={`flex-1 flex flex-col items-center justify-center space-y-1.5 relative ${activeTab === 'partner' ? 'text-blue-600' : 'text-gray-400'}`}
        >
          <Handshake className="w-6 h-6"/>
          <span className="text-[10px] font-bold">パートナー</span>
          {activeTab === 'partner' && <div className="absolute top-0 w-1/2 h-0.5 bg-blue-600 rounded-b-full"></div>}
        </button>

        <button
          onClick={() => {if(confirmDiscardEdits()) setActiveTab('completed');}}
          className={`flex-1 flex flex-col items-center justify-center space-y-1.5 relative ${activeTab === 'completed' ? 'text-green-600' : 'text-gray-400'}`}
        >
          <ClipboardList className="w-6 h-6"/>
          <span className="text-[10px] font-bold">終了履歴</span>
          {activeTab === 'completed' && <div className="absolute top-0 w-1/2 h-0.5 bg-green-600 rounded-b-full"></div>}
        </button>

        <button
          onClick={() => {if(confirmDiscardEdits()) setActiveTab('inventory');}}
          className={`flex-1 flex flex-col items-center justify-center space-y-1.5 relative ${activeTab === 'inventory' ? 'text-emerald-600' : 'text-gray-400'}`}
        >
          <Package className="w-6 h-6"/>
          <span className="text-[10px] font-bold">在庫管理</span>
          {activeTab === 'inventory' && <div className="absolute top-0 w-1/2 h-0.5 bg-emerald-600 rounded-b-full"></div>}
        </button>

        {canManageSettings && (
          <button 
            onClick={() => {if(confirmDiscardEdits()) setActiveTab('settings');}}
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
  const [calendarNote, setCalendarNote] = useState(null);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [inventoryMovements, setInventoryMovements] = useState([]);
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
        let savedIdentity = currentUserRef.current;
        if (!savedIdentity) { try { savedIdentity = JSON.parse(localStorage.getItem('google_user') || 'null'); } catch { /* No restored session. */ } }
        writeIdentity = { user: (savedIdentity?.email ? Object.values(data.users || {}).find(user => user.email?.toLowerCase() === savedIdentity.email.toLowerCase()) : null) || savedIdentity, roles: withViewerRole(data.roles || INITIAL_ROLES) };
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
        let currentInventoryItems = (Array.isArray(data.inventoryItems) ? data.inventoryItems : INVENTORY_SEED_ITEMS).map(item => ({ ...item, kind: normalizeInventoryName(item.kind), name: normalizeInventoryName(item.name), usageLocation: normalizeInventoryName(item.usageLocation), barcode: normalizeInventoryName(item.barcode), minStock: Math.max(0, item.minStock === undefined ? 2 : Number(item.minStock) || 0) }));
        if (!Array.isArray(data.inventoryItems)) {
          updateDoc(doc(db, 'app_data', 'shared_state'), { inventoryItems: currentInventoryItems }).catch(error => console.error('初期在庫商品の保存に失敗しました:', error));
        } else if (currentInventoryItems.some((item, index) => item.name !== data.inventoryItems[index]?.name || item.kind !== data.inventoryItems[index]?.kind || item.usageLocation !== data.inventoryItems[index]?.usageLocation || item.barcode !== (data.inventoryItems[index]?.barcode || '') || item.minStock !== (data.inventoryItems[index]?.minStock === undefined ? 2 : (Number(data.inventoryItems[index]?.minStock) || 0)))) {
          updateDoc(doc(db, 'app_data', 'shared_state'), { inventoryItems: currentInventoryItems }).catch(error => console.error('在庫商品情報の正規化に失敗しました:', error));
        }
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
        setCalendarNote(data.calendarNote || null);
        setPartnerNames(currentPartnerNames);
        setInventoryItems(currentInventoryItems);
        setInventoryMovements(Array.isArray(data.inventoryMovements) ? data.inventoryMovements : []);
        setDebugLogs(currentDebugLogs);
        setShiftLogs(currentShiftLogs);
        if (data.shiftTypes) setShiftTypes(data.shiftTypes);
        setRoles(withViewerRole(data.roles || INITIAL_ROLES));
        setRoleNames({ ...(data.roleNames || DEFAULT_ROLE_NAMES), viewer: '閲覧のみ' });

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
              setCurrentUser(restoredUser);
              currentUserRef.current = restoredUser;
              if (!loginRestoreCompletedRef.current) {
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

    void establishReportSession(credentialResponse.credential).catch(() => {});
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
      writeIdentity = { user: loggedInUser, roles };
      if (!isReadOnlyUser(loggedInUser, roles)) saveUsersToFirestore(updatedUsers, users);
    }

    writeIdentity = { user: loggedInUser, roles };
    setCurrentUser(loggedInUser);
    setActiveTab(localStorage.getItem('teamshift_skip_help_on_login') === 'true' ? 'calendar' : 'help');
    currentUserRef.current = loggedInUser;
    lastDebugActionRef.current = 'login.success';
    void writeDebugLog({ level: 'INFO', event: 'login.success', user: loggedInUser, details: { matchedUserId: loggedInUser.id } });
    localStorage.setItem('google_user', JSON.stringify(loggedInUser));
  };

  const handleLogout = () => {
    if (!confirmDiscardEdits()) return;
    void endReportSession().catch(() => {});
    googleLogout();
    setCurrentUser(null);
    currentUserRef.current = null;
    writeIdentity = { user: null, roles: {} };
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

  const deleteSharedTask = async (dateStr, ownerUid, taskId) => {
    if (ownerUid !== currentUser.id && (roles[currentUser.role]?.level || 0) < 40) throw new Error('このタスクを削除する権限がありません。');
    const ref = doc(db, 'app_data', 'shared_state');
    const movement = { id: 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), timestamp: new Date().toISOString(), actorUid: currentUser.id, actorName: currentUser.name || '' };
    const plan = await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw new Error('共有データが見つかりません。');
      const next = planTaskDelete(snapshot.data(), dateStr, ownerUid, taskId, movement);
      if (next) transaction.update(ref, next.updates);
      return next;
    });
    if (!plan) return;
    setTeamData(plan.teamData);
    if (plan.restocked) { setInventoryItems(plan.inventoryItems); setInventoryMovements(plan.inventoryMovements); }
  };

  const changeCalendarPartnerTask = async (itemId, action) => {
    const ref = doc(db, 'app_data', 'shared_state');
    const updatedItems = await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw new Error('共有データが見つかりません。');
      const next = planPartnerTaskAction(snapshot.data().partnerItems || [], itemId, action, new Date().toISOString());
      if (next) transaction.update(ref, { partnerItems: next });
      return next;
    });
    if (updatedItems) setPartnerItems(updatedItems);
  };

  const reschedulePartnerTask = async (itemId, schedule) => {
    const next = await runTransaction(db, async transaction => {
      const ref = doc(db, 'app_data', 'shared_state');
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw new Error('共有データが見つかりません。');
      const items = planPartnerSchedule(snapshot.data().partnerItems || [], itemId, schedule);
      transaction.update(ref, { partnerItems: items });
      return items;
    });
    setPartnerItems(next);
  };

  const deleteCompletedTask = async (entry) => {
    if (entry.type === 'member' && entry.ownerUid !== currentUser.id && (roles[currentUser.role]?.level || 0) < 40) throw new Error('この終了履歴を削除する権限がありません。');
    const ref = doc(db, 'app_data', 'shared_state');
    const plan = await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) throw new Error('共有データが見つかりません。');
      const next = planCompletedTaskDelete(snapshot.data(), entry);
      if (next) transaction.update(ref, next.updates);
      return next;
    });
    if (plan?.teamData) setTeamData(plan.teamData);
    if (plan?.partnerItems) setPartnerItems(plan.partnerItems);
  };

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      {!currentUser ? (
        <LoginScreen onGoogleLoginSuccess={handleGoogleLoginSuccess} authError={authError} />
      ) : (
        <div className="app-shell min-h-screen bg-gray-100 flex flex-col w-full">
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
                  onClick={() => {if(confirmDiscardEdits()) setActiveTab('help');}}
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
                  <span className="text-xs font-bold text-gray-800">{currentUser.name.split(' ')[0]}</span>
                </div>
                  <LogOut className="text-gray-500 ml-1" size={15}/>
                </button>
              </div>
            </div>

            {activeTab === 'help' ? (
              <HelpView currentUser={currentUser}/>
            ) : isReadOnlyUser(currentUser, roles) && !['calendar', 'team-shift'].includes(activeTab) ? (
              <ViewerWorkspace tab={activeTab} teamData={teamData} partnerItems={partnerItems} inventoryItems={inventoryItems} users={sortedUsers} date={selectedDate} onDate={setSelectedDate}/>
            ) : activeTab === 'partner' ? (
              <PartnerView
                currentUser={currentUser}
                debugLog={debugLog}
                partnerItems={partnerItems}
                partnerNames={partnerNames}
                sortedUsers={sortedUsers}
                updatePartnerItem={async (itemId, changes) => {
                  const updatedItems = await runTransaction(db, async transaction => {
                    const ref = doc(db, 'app_data', 'shared_state');
                    const snapshot = await transaction.get(ref);
                    if (!snapshot.exists()) throw new Error('共有データが見つかりません。');
                    const items = snapshot.data().partnerItems || [];
                    if (!items.some(item=>item.id===itemId)) throw new Error('対象のパートナー予定が見つかりません。');
                    const next = items.map(item=>item.id===itemId ? mergePartnerImageChanges(item, changes) : item);
                    transaction.update(ref, { partnerItems: next });
                    return next;
                  });
                  setPartnerItems(updatedItems);
                }}
                completePartnerItem={(itemId) => changeCalendarPartnerTask(itemId, 'complete')}
                reschedulePartnerItem={reschedulePartnerTask}
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
                  const ref = doc(db, 'app_data', 'shared_state');
                  const updatedItems = await runTransaction(db, async transaction => {
                    const snapshot = await transaction.get(ref);
                    if (!snapshot.exists()) throw new Error('共有データが見つかりません。');
                    const items = snapshot.data().partnerItems || [];
                    const next = items.filter(item => item.id !== itemId);
                    transaction.update(ref, { partnerItems: next });
                    return next;
                  });
                  setPartnerItems(updatedItems);
                }}
              />
            ) : activeTab === 'inventory' ? (
              <InventoryView
                inventoryItems={inventoryItems}
                inventoryMovements={inventoryMovements}
                addInventoryItem={async (item) => {
                  const normalizedItem = { ...item, shelfNumber: normalizeInventoryName(item.shelfNumber), name: normalizeInventoryName(item.name), barcode: normalizeInventoryName(item.barcode), minStock: Math.max(0, Number(item.minStock) || 0), stock: Math.max(0, Number(item.stock) || 0) };
                  if (!hasInventoryProductDetails(normalizedItem)) throw new Error('種類・商品名・メーカー・型番のいずれかを入力してください。');
                  const movement = { id: crypto.randomUUID(), timestamp: new Date().toISOString(), type: 'register', typeLabel: '商品登録・初期在庫', productId: normalizedItem.id, productName: inventoryProductLabel(normalizedItem), delta: normalizedItem.stock, stockBefore: 0, stockAfter: normalizedItem.stock, reason: 'バーコードまたは手入力で商品登録', actorUid: currentUser.id, actorName: currentUser.name || '' };
                  const updatedItems = await runTransaction(db, async transaction => {
                    const ref = doc(db, 'app_data', 'shared_state');
                    const snapshot = await transaction.get(ref);
                    if (!snapshot.exists()) throw new Error('共有データがありません。');
                    const items = snapshot.data().inventoryItems || [];
                    if (items.some(existing => (normalizedItem.barcode && normalizeInventoryName(existing.barcode) === normalizedItem.barcode) || (normalizedItem.name && normalizeInventoryName(existing.name).toLowerCase() === normalizedItem.name.toLowerCase()))) {
                      throw new Error('同じ商品名またはバーコードがすでに登録されています。');
                    }
                    validateInventoryReplacement(items, normalizedItem.id, normalizedItem.replacementProductId);
                    const nextItems = [...items, normalizedItem];
                    transaction.update(ref, { inventoryItems: nextItems, inventoryMovements: arrayUnion(movement) });
                    return nextItems;
                  });
                  setInventoryItems(updatedItems);
                  setInventoryMovements(current => current.some(entry => entry.id === movement.id) ? current : [movement, ...current]);
                }}
                editInventoryItem={async (itemId, changes) => {
                  const normalizedChanges = { kind: normalizeInventoryName(changes.kind), name: normalizeInventoryName(changes.name), manufacturer: normalizeInventoryName(changes.manufacturer), modelNumber: normalizeInventoryName(changes.modelNumber), shelfNumber: normalizeInventoryName(changes.shelfNumber), usageLocation: normalizeInventoryName(changes.usageLocation), barcode: normalizeInventoryName(changes.barcode), minStock: Math.max(0, Number(changes.minStock) || 0) };
                  if (Object.hasOwn(changes, 'discontinued')) normalizedChanges.discontinued = !!changes.discontinued;
                  if (Object.hasOwn(changes, 'replacementProductId')) normalizedChanges.replacementProductId = changes.replacementProductId || '';
                  if (Object.hasOwn(changes, 'replacementNote')) normalizedChanges.replacementNote = String(changes.replacementNote || '').trim().slice(0, 500);
                  if (Object.prototype.hasOwnProperty.call(changes, 'imageUrl')) {
                    Object.assign(normalizedChanges, { imageUrl: changes.imageUrl || '', imageName: changes.imageName || '', imagePublicId: changes.imagePublicId || '', imageBytes: Number(changes.imageBytes || 0) });
                  }
                  if (!hasInventoryProductDetails(normalizedChanges)) throw new Error('種類・商品名・メーカー・型番のいずれかを入力してください。');
                  const { updatedItems, updatedTeamData } = await runTransaction(db, async transaction => {
                    const ref = doc(db, 'app_data', 'shared_state');
                    const snapshot = await transaction.get(ref);
                    if (!snapshot.exists()) throw new Error('共有データがありません。');
                    const data = snapshot.data();
                    const items = data.inventoryItems || [];
                    if (!items.some(item => item.id === itemId)) throw new Error('商品が見つかりません。');
                    if (items.some(item => item.id !== itemId && ((normalizedChanges.barcode && normalizeInventoryName(item.barcode) === normalizedChanges.barcode) || (normalizedChanges.name && normalizeInventoryName(item.name).toLowerCase() === normalizedChanges.name.toLowerCase())))) throw new Error('同じ商品名またはバーコードがすでに登録されています。');
                    validateInventoryReplacement(items, itemId, normalizedChanges.replacementProductId ?? items.find(item=>item.id===itemId).replacementProductId);
                    const updatedItems = items.map(item => item.id === itemId ? { ...item, ...normalizedChanges } : item);
                    const currentTeamData = data.teamData || {};
                    const updatedTasks = Object.fromEntries(Object.entries(currentTeamData.tasks || {}).map(([dateStr, owners]) => [dateStr, Object.fromEntries(Object.entries(owners || {}).map(([ownerUid, tasks]) => [ownerUid, (tasks || []).map(task => task.productId === itemId ? { ...task, productName: inventoryProductLabel(normalizedChanges) } : task)]))]));
                    const updatedTeamData = { ...currentTeamData, tasks: updatedTasks };
                    transaction.update(ref, { inventoryItems: updatedItems, teamData: updatedTeamData });
                    return { updatedItems, updatedTeamData };
                  });
                  setInventoryItems(updatedItems);
                  setTeamData(updatedTeamData);
                }}
                deleteInventoryItem={async (itemId) => {
                  const updatedItems = inventoryItems.filter(item => item.id !== itemId);
                  await updateDoc(doc(db, 'app_data', 'shared_state'), { inventoryItems: updatedItems });
                  setInventoryItems(updatedItems);
                }}
                updateInventoryImage={async (itemId, imageData) => {
                  const updatedItems = inventoryItems.map(item => item.id === itemId ? { ...item, ...imageData } : item);
                  await updateDoc(doc(db, 'app_data', 'shared_state'), { inventoryItems: updatedItems });
                  setInventoryItems(updatedItems);
                }}
                adjustInventoryStock={async (itemId, value, setExact = false) => {
                  const quantity = Number(value);
                  if (!Number.isInteger(quantity) || (setExact && quantity < 0)) throw new Error('数量が不正です。');
                  const movementId = crypto.randomUUID();
                  const { updatedItems, movement } = await runTransaction(db, async transaction => {
                    const ref = doc(db, 'app_data', 'shared_state');
                    const snapshot = await transaction.get(ref);
                    if (!snapshot.exists()) throw new Error('共有データがありません。');
                    const items = snapshot.data().inventoryItems || [];
                    const currentItem = items.find(item => item.id === itemId);
                    if (!currentItem) throw new Error('商品が見つかりません。');
                    const oldStock = Math.max(0, Number(currentItem.stock) || 0);
                    const nextStock = setExact ? quantity : oldStock + quantity;
                    if (nextStock < 0) throw new Error('在庫数が不足しています。');
                    const updatedItems = items.map(item => item.id === itemId ? { ...item, stock: nextStock } : item);
                    const movement = { id: movementId, timestamp: new Date().toISOString(), type: setExact ? 'stocktake_adjustment' : (quantity >= 0 ? 'stock_in' : 'stock_out'), typeLabel: setExact ? '棚卸し調整' : (quantity >= 0 ? '入庫' : '出庫'), productId: itemId, productName: inventoryProductLabel(currentItem), delta: nextStock - oldStock, stockBefore: oldStock, stockAfter: nextStock, reason: setExact ? '入力した実在庫数へ調整' : '在庫管理画面から入出庫', actorUid: currentUser.id, actorName: currentUser.name || '' };
                    transaction.update(ref, { inventoryItems: updatedItems, inventoryMovements: arrayUnion(movement) });
                    return { updatedItems, movement };
                  });
                  setInventoryItems(updatedItems);
                  setInventoryMovements(current => current.some(entry => entry.id === movement.id) ? current : [movement, ...current]);
                }}
              />
            ) : activeTab === 'calendar' ? (
              <CalendarView
                calendarNote={calendarNote}
                saveCalendarNote={async (text, expectedVersion) => {
                  const saved = await runTransaction(db, async transaction => {
                    const ref = doc(db, 'app_data', 'shared_state');
                    const snapshot = await transaction.get(ref);
                    if (!snapshot.exists()) throw new Error('共有データが見つかりません。');
                    const next = planCalendarNote(snapshot.data().calendarNote, text, expectedVersion, currentUser);
                    transaction.update(ref, { calendarNote: next });
                    return next;
                  });
                  setCalendarNote(saved);
                  return saved;
                }}
                completePartnerItem={(itemId) => changeCalendarPartnerTask(itemId, 'complete')}
                reschedulePartnerItem={reschedulePartnerTask}
                deletePartnerItem={(itemId) => changeCalendarPartnerTask(itemId, 'delete')}
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
                  const updatedItems = await runTransaction(db, async transaction => {
                    const ref = doc(db, 'app_data', 'shared_state');
                    const snapshot = await transaction.get(ref);
                    if (!snapshot.exists()) throw new Error('共有データが見つかりません。');
                    const items = snapshot.data().partnerItems || [];
                    if (!items.some(item=>item.id===itemId)) throw new Error('対象のパートナー予定が見つかりません。');
                    const next = items.map(item=>item.id===itemId ? mergePartnerImageChanges(item, changes) : item);
                    transaction.update(ref, { partnerItems: next });
                    return next;
                  });
                  setPartnerItems(updatedItems);
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
                  const updated = await runTransaction(db, async transaction => {
                    const ref = doc(db, 'app_data', 'shared_state');
                    const snapshot = await transaction.get(ref);
                    if (!snapshot.exists()) throw new Error('共有データが見つかりません。');
                    const plan = planTaskEdit(snapshot.data().teamData || {}, dateStr, ownerUid, taskId, newText);
                    transaction.update(ref, plan.updates);
                    return plan.teamData;
                  });
                  setTeamData(updated);
                }}
                deleteTask={deleteSharedTask}
                toggleTask={async (dateStr, ownerUid, taskId) => {
                  const dayTasks = teamData.tasks[dateStr] || {};
                  const ownerTasks = dayTasks[ownerUid] || [];
                  const targetTask = ownerTasks.find(t => t.id === taskId);
                  if (!targetTask) return;
                  if (!canCompleteTask(targetTask, ownerUid, currentUser.id, checkIsAdmin(currentUser, roles))) {
                    alert('担当者または管理者が終了できます。');
                    return;
                  }
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
                currentUserEmail={currentUser?.email}
                teamData={teamData}
                partnerItems={partnerItems}
                sortedUsers={sortedUsers}
                currentUserUid={currentUser.id}
                isAdmin={(roles[currentUser.role]?.level || 0) >= 40}
                deleteCompletedTask={deleteCompletedTask}
              />
            ) : activeTab === 'daily' ? (
              <DailyDetailView 
                inventoryItems={inventoryItems}
                addTask={async (dateStr, targetUid, text, imageUrl = '', imageName = '', imagePublicId = '', imageBytes = 0, visibility = 'public', subject = '', endTime = '', productId = '', productQuantity = 1, images = [], assigneeIds = [targetUid], important = false) => {
                  const selectedAssignees = newTaskAssignees(assigneeIds, targetUid, visibility, sortedUsers.map(user => user.id));
                  const product = productId ? inventoryItems.find(item => item.id === productId) : null;
                  const quantity = Math.max(1, Number(productQuantity) || 1);
                  if (productId && (!product || Number(product.stock || 0) < quantity)) {
                    alert('選択した商品の在庫がありません。在庫管理ページで確認してください。');
                    throw new Error('選択した商品の在庫がありません。');
                  }
                  const updatedInventoryItems = product ? inventoryItems.map(item => item.id === productId ? { ...item, stock: Math.max(0, Number(item.stock || 0) - quantity) } : item) : inventoryItems;
                  const inventoryMovement = product ? { id: 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2,7), timestamp: new Date().toISOString(), type: 'task_use', typeLabel: '日別タスク登録時の使用', productId: product.id, productName: inventoryProductLabel(product), delta: -quantity, stockBefore: Number(product.stock || 0), stockAfter: Math.max(0, Number(product.stock || 0) - quantity), reason: 'タスク：' + (subject || text || '') } : null;
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
                            important: visibility !== 'private' && important === true,
                            endTime: endTime || '',
                            images,
                            updates: [createPartnerUpdate(text, currentUser, images.length ? images : imageUrl ? { imageUrl, imageName, imagePublicId, imageBytes } : null, 'initial')],
                            completed: false,
                            createdAt: new Date().toISOString(),
                            ownerUid: targetUid,
                            assigneeIds: selectedAssignees,
                            visibility: visibility === 'private' ? 'private' : 'public',
                            ...(product ? { productId: product.id, productName: inventoryProductLabel(product), productModelNumber: String(product.modelNumber || '').trim(), inventoryQuantity: quantity, inventoryDeducted: true } : {}),
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
                  if (product) setInventoryItems(updatedInventoryItems);
                  await updateDoc(doc(db, 'app_data', 'shared_state'), product ? { teamData: updatedTeamData, inventoryItems: updatedInventoryItems, inventoryMovements: arrayUnion(inventoryMovement) } : { teamData: updatedTeamData });
                  if (inventoryMovement) setInventoryMovements(current => [inventoryMovement, ...current]);
                }} 
                changeDay={(offset) => {
                  const d = new Date(selectedDate);
                  d.setDate(d.getDate() + offset);
                  const newDateStr = formatDate(d);
                  setSelectedDate(newDateStr);
                  setCurrentDate(new Date(d.getFullYear(), d.getMonth(), 1));
                }} 
                currentUserUid={currentUser.id} 
                deleteTask={deleteSharedTask}
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
                  if (!canCompleteTask(targetTask, targetUid, currentUser.id, isAdmin)) {
                    alert('担当者または管理者が終了できます。');
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
                updateTaskText={async (dateStr, targetUid, taskId, newText) => {
                  if (targetUid !== currentUser.id && (roles[currentUser.role]?.level || 0) < 40) throw new Error('このタスクを編集する権限がありません。');
                  const latestTeamData = await runTransaction(db, async transaction => {
                    const ref = doc(db, 'app_data', 'shared_state');
                    const snapshot = await transaction.get(ref);
                    if (!snapshot.exists()) throw new Error('共有データが見つかりません。');
                    const plan = planTaskEdit(snapshot.data().teamData || {}, dateStr, targetUid, taskId, newText);
                    transaction.update(ref, plan.updates);
                    return plan.teamData;
                  });
                  setTeamData(latestTeamData);
                  if (newText?.targetDate && newText.targetDate !== dateStr) setSelectedDate(newText.targetDate);
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
