import React, { useState, useEffect } from 'react';
import { GoogleOAuthProvider, GoogleLogin, googleLogout } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, onSnapshot, setDoc } from 'firebase/firestore';
import { 
  Calendar as CalendarIcon, 
  CheckSquare, 
  Plus, 
  Trash2, 
  ChevronLeft, 
  ChevronRight, 
  X, 
  Users, 
  Edit2, 
  Save, 
  LogOut, 
  ClipboardList, 
  Settings, 
  Table, 
  UserPlus,
  ShieldAlert
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

const INITIAL_ROLES = {
  admin: { level: 40, name: '管理者' },
  area_manager: { level: 30, name: 'エリアM' },
  manager: { level: 20, name: '店長' },
  staff: { level: 10, name: 'スタッフ' }
};

const DEFAULT_SHIFT_TYPES = [
  { id: 'early', label: '早番', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { id: 'day', label: '日勤', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { id: 'late', label: '遅番', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { id: 'night', label: '夜勤', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  { id: 'off', label: '休み', color: 'bg-red-50 text-red-600 border-red-100' },
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

const LoginScreen = ({ onGoogleLoginSuccess, authError }) => (
  <div className="flex-1 flex flex-col items-center justify-center bg-gray-50 p-6 min-h-screen">
    <div className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-lg text-center space-y-6">
      <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto">
        <Users size={32}/>
      </div>
      <div>
        <h1 className="text-xl font-bold text-gray-800">TeamShift App</h1>
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

const CalendarView = ({ currentDate, changeMonth, teamData, onDateClick, currentUserUid, shiftTypes }) => {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  const days = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    days.push(<div key={`empty-${i}`} className="p-2 border-b border-r border-gray-100 bg-gray-50/50 min-h-[80px]"></div>);
  }

  for (let i = 1; i <= daysInMonth; i++) {
    const dateStr = formatDate(new Date(year, month, i));
    const dayShifts = teamData.shifts[dateStr] || {};
    const myShiftId = dayShifts[currentUserUid] || 'none';
    const myShift = shiftTypes.find(s => s.id === myShiftId) || shiftTypes.find(s => s.id === 'none');
    
    const hasMyTask = teamData.tasks[dateStr]?.[currentUserUid]?.length > 0;

    days.push(
      <div 
        key={i} 
        onClick={() => onDateClick(dateStr)}
        className="p-1 border-b border-r border-gray-100 min-h-[80px] cursor-pointer active:bg-gray-50 flex flex-col transition-colors"
      >
        <div className="flex justify-between items-start p-1">
          <span className={`text-sm font-bold ${
            new Date().getDate() === i && new Date().getMonth() === month ? 'bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center' : 'text-gray-700'
          }`}>
            {i}
          </span>
          {hasMyTask && <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-1.5"></div>}
        </div>
        
        <div className="mt-1 flex-1 flex flex-col gap-1 px-1">
          {myShift.id !== 'none' && (
            <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded truncate ${myShift.color}`}>
              {myShift.label}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-50 pb-[68px] overflow-hidden">
      <div className="bg-white px-4 py-3 flex items-center justify-between shadow-sm z-10 shrink-0">
        <button onClick={() => changeMonth(-1)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full active:scale-95"><ChevronLeft className="w-5 h-5"/></button>
        <h2 className="text-base font-bold text-gray-800">{year}年 {month + 1}月</h2>
        <button onClick={() => changeMonth(1)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full active:scale-95"><ChevronRight className="w-5 h-5"/></button>
      </div>
      <div className="flex-1 overflow-y-auto bg-white">
        <div className="grid grid-cols-7 border-b border-gray-200 sticky top-0 bg-white z-10 shadow-sm">
          {DAYS_OF_WEEK.map((day, idx) => (
            <div key={day} className={`py-2 text-center text-[10px] font-bold ${idx === 0 ? 'text-red-500' : idx === 6 ? 'text-blue-500' : 'text-gray-500'}`}>
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 border-l border-gray-100">
          {days}
        </div>
      </div>
    </div>
  );
};

const TeamShiftView = ({ currentDate, changeMonth, teamData, shiftTypes, updateUserShift, users, roleNames, roles }) => {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  
  const [editingCell, setEditingCell] = useState(null);

  const days = [];
  for(let i=1; i<=daysInMonth; i++) {
     const d = new Date(year, month, i);
     days.push({ day: i, dateStr: formatDate(d), weekDay: DAYS_OF_WEEK[d.getDay()] });
  }

  const sortedUsers = Object.values(users).sort((a,b) => {
    const levelA = roles[a.role]?.level || 0;
    const levelB = roles[b.role]?.level || 0;
    return levelB - levelA || a.id.localeCompare(b.id);
  });

  return (
    <div className="flex-1 flex flex-col bg-gray-50 pb-[68px] overflow-hidden relative">
      <div className="bg-white px-4 py-3 flex items-center justify-between sticky top-0 z-20 border-b border-gray-100 shadow-sm">
        <button onClick={() => changeMonth(-1)} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors active:scale-95"><ChevronLeft className="w-5 h-5"/></button>
        <h2 className="text-base font-bold text-purple-700 flex items-center">
          <Table className="w-5 h-5 mr-1.5"/>
          シフト管理 ({year}年{month + 1}月)
        </h2>
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
            {sortedUsers.map(u => {
              const roleObj = roles[u.role] || { level: 10, name: '' };
              return (
                <tr key={u.id}>
                  <td className="sticky left-0 bg-white z-10 p-2 border-r border-b border-gray-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                    <div className="font-bold text-gray-800 truncate">{u.name.split(' ')[0]}</div>
                    <div className={`text-[9px] mt-0.5 font-bold ${roleObj.level >= 40 ? 'text-red-600' : roleObj.level >= 30 ? 'text-purple-600' : 'text-gray-400'}`}>
                      {roleNames[u.role] || roleObj.name}
                    </div>
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
    </div>
  );
};

const DailyDetailView = ({ 
  selectedDate, changeDay, teamData, currentUserUid, shiftTypes,
  addTask, toggleTask, deleteTask, updateTaskText, users, roles
}) => {
  const [newTaskText, setNewTaskText] = useState('');
  const [selectedUserUid, setSelectedUserUid] = useState(currentUserUid);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  
  const currentUser = users[currentUserUid];
  const viewUser = users[selectedUserUid] || currentUser;

  const canManageShift = checkCanManageShift(currentUser, roles);

  const selectedDateTasks = teamData.tasks[selectedDate]?.[selectedUserUid] || [];
  const selectedDateShifts = teamData.shifts[selectedDate] || {};
  const myCurrentShift = selectedDateShifts[currentUserUid] || 'none';

  const shiftOrder = ['early', 'day', 'late', 'night', 'off', 'none'];
  const teamMembers = Object.values(users).sort((a, b) => {
    const shiftA = selectedDateShifts[a.id] || 'none';
    const shiftB = selectedDateShifts[b.id] || 'none';
    const orderA = shiftOrder.indexOf(shiftA) !== -1 ? shiftOrder.indexOf(shiftA) : 99;
    const orderB = shiftOrder.indexOf(shiftB) !== -1 ? shiftOrder.indexOf(shiftB) : 99;
    
    if(orderA === orderB) {
      const levelA = roles[a.role]?.level || 0;
      const levelB = roles[b.role]?.level || 0;
      return levelB - levelA || a.id.localeCompare(b.id);
    }
    return orderA - orderB;
  });

  const handleAddTask = () => {
    if (newTaskText.trim()) {
      addTask(selectedDate, selectedUserUid, newTaskText.trim());
      setNewTaskText('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddTask();
    }
  };

  const TaskItem = ({ task }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editVal, setEditVal] = useState(task.text);
    const isSelected = selectedTaskId === task.id;

    if (isEditing) {
      return (
        <div className="bg-white p-3 rounded-xl border border-blue-400 shadow-sm flex gap-2">
          <textarea
            className="flex-1 bg-blue-50/50 p-2 text-sm rounded outline-none resize-none"
            value={editVal}
            onChange={(e) => setEditVal(e.target.value)}
            onKeyDown={(e) => {
              if(e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                updateTaskText(selectedDate, selectedUserUid, task.id, editVal);
                setIsEditing(false);
              }
            }}
            rows={3}
            autoFocus
          />
          <button 
            onClick={() => {
              updateTaskText(selectedDate, selectedUserUid, task.id, editVal);
              setIsEditing(false);
            }}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg h-fit"
          >
            <Save size={18}/>
          </button>
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
        <button 
          onClick={(e) => {
            e.stopPropagation();
            toggleTask(selectedDate, selectedUserUid, task.id);
          }}
          className={`shrink-0 mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
            task.completed ? 'border-green-500 bg-green-500 text-white' : 'border-gray-300 hover:border-blue-400'
          }`}
        >
          {task.completed && <CheckSquare className="stroke-[3]" size={14}/>}
        </button>
        
        <div className="flex-1 min-w-0">
          <span className={`text-sm block whitespace-pre-wrap leading-tight ${
            task.completed ? 'text-gray-400 line-through' : 'text-gray-700'
          } ${
            isSelected 
              ? '' 
              : 'overflow-hidden max-h-[2.8em] line-clamp-2'
          }`}>
            {task.text}
          </span>
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
            onClick={() => deleteTask(selectedDate, selectedUserUid, task.id)}
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
              <div key={shift.id} className={`px-3 py-1 rounded-md border text-xs font-bold ${shift.color}`}>
                {shift.label}
              </div>
            ))}
            {myCurrentShift === 'none' && <span className="text-xs text-gray-400">未定</span>}
          </div>
          {!canManageShift && (
            <p className="text-[10px] text-gray-400 mt-1">※シフトの編集は管理者および権限を付与されたメンバーのみ可能です</p>
          )}
        </div>

        <div className="bg-white px-3 py-2 border-b border-gray-200 flex overflow-x-auto gap-2 no-scrollbar shadow-sm shrink-0 items-center min-h-[56px] sticky top-[53px] z-10">
          <div className="flex items-center gap-2 pr-4">
            {teamMembers.map(member => {
              const isSelected = selectedUserUid === member.id;
              const shiftId = selectedDateShifts[member.id] || 'none';
              const shiftObj = shiftTypes.find(s => s.id === shiftId) || shiftTypes.find(s => s.id === 'none');

              return (
                <button
                  key={member.id}
                  onClick={() => {
                    setSelectedUserUid(member.id);
                    setSelectedTaskId(null);
                  }}
                  className={`flex flex-col items-center px-3 py-1.5 rounded-xl border transition-all shrink-0 active:scale-95
                    ${isSelected ? 'bg-purple-50 border-purple-400 ring-2 ring-purple-400/20 shadow-sm' : 'bg-white border-gray-200 hover:bg-gray-50'}`}
                >
                  <div className={`text-xs font-bold ${isSelected ? 'text-purple-700' : 'text-gray-700'}`}>
                    {member.name.split(' ')[0]}
                  </div>
                  <div className={`text-[9px] mt-0.5 px-1.5 rounded-sm ${shiftObj.id !== 'none' ? shiftObj.color : 'text-gray-400'}`}>
                    {shiftObj.label.substring(0, 2)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 relative max-w-3xl mx-auto w-full">
          {selectedDateTasks.length === 0 ? (
            <div className="text-center py-10">
              <ClipboardList className="mx-auto text-gray-300 mb-3" size={48}/>
              <p className="text-gray-400 text-sm">タスクはありません</p>
            </div>
          ) : (
            selectedDateTasks.map(task => (
              <TaskItem key={task.id} task={task}/>
            ))
          )}
        </div>
      </div>

      <div className="bg-white p-3 border-t border-gray-200 shrink-0 sticky bottom-0 z-10 pb-safe shadow-[0_-4px_10px_rgba(0,0,0,0.03)]">
        <div className="flex gap-2 max-w-3xl mx-auto">
          <textarea
            value={newTaskText}
            onChange={(e) => setNewTaskText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`${viewUser.name.split(' ')[0]}さんのタスクを追加 (Shift+Enterで改行)`}
            className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-shadow resize-none"
            rows={1}
            style={{ minHeight: '44px', maxHeight: '100px' }}
          />
          <button 
            onClick={handleAddTask}
            disabled={!newTaskText.trim()}
            className="bg-blue-600 text-white p-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:bg-gray-400 transition-colors shadow-sm active:scale-95 h-fit"
          >
            <Plus size={24}/>
          </button>
        </div>
      </div>
    </div>
  );
};

const SettingsView = ({ shiftTypes, updateShiftTypes, users, updateUsers, currentUserUid, roleNames, updateRoleNames, roles, updateRoles }) => {
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState(Object.keys(roles)[0] || 'staff');
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

  const handleDeleteUser = (uid) => {
    if(uid === currentUserUid) return;
    if(window.confirm(`${users[uid].name}さんを削除してもよろしいですか？`)) {
      const newUsers = { ...users };
      delete newUsers[uid];
      updateUsers(newUsers);
    }
  };

  const handleAddUser = () => {
    if(!newUserName.trim() || !newUserEmail.trim()) {
      alert('名前とメールアドレスの両方を入力してください。');
      return;
    }
    const newId = `u_${Date.now()}`;
    const defaultRole = Object.keys(roles)[0] || 'staff';
    updateUsers({
      ...users,
      [newId]: { 
        id: newId, 
        name: newUserName.trim(), 
        email: newUserEmail.trim().toLowerCase(),
        role: newUserRole || defaultRole, 
        canManageShift: false 
      }
    });
    setNewUserName('');
    setNewUserEmail('');
    setNewUserRole(defaultRole);
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
        name: editingName.trim(),
        email: editingEmail.trim().toLowerCase()
      }
    });
    setEditingUserId(null);
  };

  const sortedRoleKeys = Object.keys(roles).sort((a,b) => roles[b].level - roles[a].level);

  const sortedUsers = Object.values(users).sort((a,b) => {
    const levelA = roles[a.role]?.level || 0;
    const levelB = roles[b.role]?.level || 0;
    return levelB - levelA || a.id.localeCompare(b.id);
  });

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
              <p className="text-[11px] text-gray-400 mt-0.5">ここに登録されたメールアドレスのみがログインできます</p>
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
                <div className="flex gap-2">
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value)}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {sortedRoleKeys.map((key) => (
                      <option key={key} value={key}>{roleNames[key] || roles[key].name}</option>
                    ))}
                  </select>
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
            {sortedUsers.map(u => {
              const isMe = u.id === currentUserUid;
              const isEditingThisUser = editingUserId === u.id;
              const userRoleObj = roles[u.role] || { level: 10, name: '' };
              const roleLevel = userRoleObj.level;

              return (
                <div key={u.id} className="flex flex-col md:flex-row md:items-center justify-between p-3 hover:bg-gray-50 rounded-xl border border-gray-100 gap-2">
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
                  
                  <div className="flex items-center gap-2 shrink-0 justify-end border-t md:border-t-0 pt-2 md:pt-0 border-gray-100">
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
  const [teamData, setTeamData] = useState({ shifts: {}, tasks: {} });
  const [isLoaded, setIsLoaded] = useState(false);

  // Firestore Realtime Listener
  useEffect(() => {
    const docRef = doc(db, 'app_data', 'shared_state');
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.teamData) setTeamData(data.teamData);
        if (data.shiftTypes) setShiftTypes(data.shiftTypes);
        if (data.roles) setRoles(data.roles);
        if (data.roleNames) setRoleNames(data.roleNames);
        if (data.users) setUsers(data.users);
      }
      setIsLoaded(true);
    }, (error) => {
      console.error("Firestore Listen Error:", error);
      setIsLoaded(true);
    });

    const savedUser = localStorage.getItem('google_user');
    if (savedUser) {
      setCurrentUser(JSON.parse(savedUser));
    }

    return () => unsubscribe();
  }, []);

  const saveToFirestore = async (updates) => {
    try {
      const docRef = doc(db, 'app_data', 'shared_state');
      await setDoc(docRef, updates, { merge: true });
    } catch (error) {
      console.error("Firestore Save Error:", error);
    }
  };

  const handleGoogleLoginSuccess = (credentialResponse) => {
    setAuthError('');
    const decoded = jwtDecode(credentialResponse.credential);
    const loginEmail = (decoded.email || '').toLowerCase();

    const userList = Object.values(users);
    const isFirstUser = userList.length === 0;

    // ホワイトリスト判定: 登録済みユーザーの中に一致するメールアドレスがあるか検索
    const matchedUser = userList.find(u => (u.email || '').toLowerCase() === loginEmail);

    if (!isFirstUser && !matchedUser) {
      setAuthError(`メールアドレス (${loginEmail}) は登録されていません。管理者に登録を依頼してください。`);
      return;
    }

    let loggedInUser;

    if (isFirstUser) {
      // 最初のユーザーは自動で管理者登録
      loggedInUser = {
        id: decoded.sub,
        name: decoded.name,
        email: loginEmail,
        picture: decoded.picture,
        role: 'admin',
        canManageShift: true
      };
      const updatedUsers = { [loggedInUser.id]: loggedInUser };
      setUsers(updatedUsers);
      saveToFirestore({ users: updatedUsers });
    } else {
      // 既存ユーザーID（シフトデータ等に繋がっているID）をそのまま維持
      loggedInUser = {
        ...matchedUser,
        picture: decoded.picture
      };
      
      const updatedUsers = { ...users, [matchedUser.id]: loggedInUser };

      setUsers(updatedUsers);
      saveToFirestore({ users: updatedUsers });
    }

    setCurrentUser(loggedInUser);
    localStorage.setItem('google_user', JSON.stringify(loggedInUser));
  };

  const handleLogout = () => {
    googleLogout();
    setCurrentUser(null);
    setAuthError('');
    localStorage.removeItem('google_user');
  };

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
                <h1 className="text-xl font-black text-gray-900 tracking-tight flex items-center">
                  TeamShift <span className="text-blue-600 ml-1.5">App</span>
                </h1>
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

            {activeTab === 'calendar' ? (
              <CalendarView 
                changeMonth={(offset) => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1))} 
                currentDate={currentDate} 
                currentUserUid={currentUser.id} 
                onDateClick={(dateStr) => { setSelectedDate(dateStr); setActiveTab('daily'); }} 
                shiftTypes={shiftTypes} 
                teamData={teamData} 
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
                updateUserShift={(dateStr, targetUid, shiftId) => {
                  const updatedTeamData = {
                    ...teamData,
                    shifts: { ...teamData.shifts, [dateStr]: { ...(teamData.shifts[dateStr] || {}), [targetUid]: shiftId } }
                  };
                  setTeamData(updatedTeamData);
                  saveToFirestore({ teamData: updatedTeamData });
                }} 
                users={users}
              />
            ) : activeTab === 'daily' ? (
              <DailyDetailView 
                addTask={(dateStr, targetUid, text) => {
                  const dayTasks = teamData.tasks[dateStr] || {};
                  const userTasks = dayTasks[targetUid] || [];
                  const updatedTeamData = {
                    ...teamData,
                    tasks: { ...teamData.tasks, [dateStr]: { ...dayTasks, [targetUid]: [...userTasks, { id: Date.now().toString(), text, completed: false }] } }
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
                roleNames={roleNames} 
                roles={roles} 
                selectedDate={selectedDate} 
                shiftTypes={shiftTypes} 
                teamData={teamData} 
                toggleTask={(dateStr, targetUid, taskId) => {
                  const updatedTeamData = {
                    ...teamData,
                    tasks: { ...teamData.tasks, [dateStr]: { ...(teamData.tasks[dateStr] || {}), [targetUid]: (teamData.tasks[dateStr]?.[targetUid] || []).map(t => t.id === taskId ? { ...t, completed: !t.completed } : t) } }
                  };
                  setTeamData(updatedTeamData);
                  saveToFirestore({ teamData: updatedTeamData });
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
              />
            ) : (
              <SettingsView 
                currentUserUid={currentUser.id} 
                roleNames={roleNames} 
                roles={roles} 
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
                  setUsers(newUsers);
                  saveToFirestore({ users: newUsers });
                }} 
                shiftTypes={shiftTypes} 
                users={users}
              />
            )}

            <BottomNav activeTab={activeTab} currentUser={currentUser} roles={roles} setActiveTab={setActiveTab}/>
          </div>
        </div>
      )}
    </GoogleOAuthProvider>
  );
}