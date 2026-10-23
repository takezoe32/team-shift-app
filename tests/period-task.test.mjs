import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodTaskChanges, taskOnDay } from '../src/periodTask.mjs';
import { planTaskEdit } from '../src/taskEdit.mjs';
import { calendarDayData } from '../src/calendarDay.mjs';
import { collectDailyReport } from '../src/dailyReport.mjs';
import { reportWorkText } from '../src/dailyReportWork.mjs';
const actor = { id:'u', name:'竹添 三剛', role:'staff' };
const day='2026-10-22', nextDay='2026-10-23', now='2026-10-22T08:05:00Z';
const task = { id:'job', subject:'217号室の防水調査', text:'登録した内容', completed:false, assigneeIds:['u'], images:[{imageUrl:'photo'}], periodStartDate:day, periodEndDate:'2026-10-24' };
const source = item => ({ users:{u:{...actor}}, teamData:{tasks:{[day]:{u:[item]}}}, partnerItems:[] });
test('daily completion preserves the open task and appends a handoff and actor without losing attachments',()=>{
 const before={...task,updates:[{id:'old',text:'以前の申し送り'}]};
 const changes=periodTaskChanges(before,{action:'daily',note:'防水下地まで施工。明日は仕上げ。'},actor,day,'u',now);
 assert.equal(changes.completed,undefined);assert.equal(changes.dailyWork[day].actorUid,'u');
 assert.equal(changes.dailyWork[day].note,'防水下地まで施工。明日は仕上げ。');
 assert.equal(changes.updates[0].id,'old');assert.match(changes.updates[1].text,/10月22日 作業終了/);assert.equal(before.updates.length,1);
 const result=planTaskEdit(source(before).teamData,day,'u','job',{periodOperation:{action:'set',startDate:day,endDate:'2026-10-25'}},actor);
 assert.equal(result.teamData.tasks[day].u[0].images[0].imageUrl,'photo');assert.equal(result.teamData.tasks[day].u[0].periodEndDate,'2026-10-25');
});
test('one record per Japan day, next-day completion, range and permissions are enforced',()=>{
 const saved={...task,...periodTaskChanges(task,{action:'daily',note:'初日'},actor,day,'u',now)};
 assert.throws(()=>periodTaskChanges(saved,{action:'daily'},actor,day,'u',now),/登録済み/);
 const changes=periodTaskChanges(saved,{action:'daily',note:'2日目'},actor,day,'u','2026-10-22T15:01:00Z');
 assert.equal(Object.keys(changes.dailyWork).length,2);assert.equal(changes.dailyWork[nextDay].note,'2日目');
 assert.throws(()=>periodTaskChanges(task,{action:'daily'},actor,day,'u','2026-10-25T08:00:00Z'),/期間/);
 assert.throws(()=>periodTaskChanges(task,{action:'daily'},{id:'x',role:'viewer'},day,'u',now),/変更できません/);
 assert.throws(()=>periodTaskChanges(task,{action:'daily'},{id:'x',role:'staff'},day,'u',now),/担当者/);
 assert.throws(()=>periodTaskChanges(saved,{action:'set',startDate:nextDay,endDate:'2026-10-24'},actor,day,'u',now),/期間から外す/);
 assert.throws(()=>periodTaskChanges(task,{action:'set',startDate:day,endDate:'2026-10-21'},actor,day,'u',now),/終了日/);
 assert.throws(()=>periodTaskChanges({...task,completed:true},{action:'daily'},actor,day,'u',now),/全体が終了/);
});
test('calendar shows a single stored task across the inclusive range, without affecting single-day tasks',()=>{
 const state=source(task);assert.equal(calendarDayData(nextDay,state.teamData,[],[actor]).tasks[0].taskDate,day);
 assert.equal(calendarDayData('2026-10-24',state.teamData).tasks.length,1);
 assert.equal(calendarDayData('2026-10-25',state.teamData).tasks.length,0);
 assert.equal(taskOnDay({id:'single'},day,nextDay),false);
});
test('member daily work appears in that day report with title, work date and surname while remaining unfinished',()=>{
 const saved={...task,...periodTaskChanges(task,{action:'daily',note:'今日の引継'},actor,day,'u',now)};
 const report=collectDailyReport(source(saved),day);
 assert.equal(report.entries.length,1);assert.match(reportWorkText(report.entries[0]),/217号室の防水調査.*10月22日 作業終了.*竹添/);
 assert.equal(report.handoff.length,1);
 const next=collectDailyReport(source(saved),nextDay);assert.equal(next.entries.length,0);assert.equal(next.handoff.length,1);
 const completed={...saved,completed:true,completedAt:'2026-10-24T08:00:00Z'};
 assert.equal(collectDailyReport(source(completed),day).entries.length,1);
});
test('partner daily work preserves old initial content and appears in visitors even before overall completion',()=>{
 const item={...task,partnerName:'山下健装',date:day,content:'最初の作業内容'};
 const saved={...item,...periodTaskChanges(item,{action:'daily',note:'調査終了'},actor,day,null,now)};
 assert.equal(saved.updates[0].kind,'initial');assert.equal(saved.updates[0].text,'最初の作業内容');
 const state=source(null);state.teamData.tasks={};state.partnerItems=[saved];
 const report=collectDailyReport(state,day);assert.equal(report.visitors.length,1);
 assert.match(report.visitors[0].text,/山下健装.*217号室.*10月22日 作業終了.*竹添/);
 assert.equal(calendarDayData(nextDay,{},state.partnerItems).partners.length,1);
});

test('active periods remain today through the final day, and become overdue the following Japan day', async()=>{
 const {taskDisplayDay,isTaskPast}=await import('../src/periodTask.mjs');
 const {isPartnerOverdue}=await import('../src/partnerOverdue.mjs');
 const item={...task,date:day,time:'09:00',endTime:'10:00'};
 for(const today of [day,nextDay,'2026-10-24']){
  assert.equal(taskDisplayDay(item,day,today),today);
  assert.equal(isTaskPast(item,day,today),false);
  assert.equal(isPartnerOverdue(item,Date.parse(today+'T23:59:59+09:00')),false);
 }
 assert.equal(isTaskPast(item,day,'2026-10-25'),true);
 assert.equal(isPartnerOverdue(item,Date.parse('2026-10-25T00:00:00+09:00')),true);
 assert.equal(taskDisplayDay(item,day,'2026-10-21'),day);
 assert.equal(isTaskPast({...item,completed:true},day,'2026-10-25'),false);
});

test('daily-finished member and partner tasks hide only for the recorded day without ending the task',async()=>{
 const {isDailyWorkFinished}=await import('../src/periodTask.mjs');
 for(const item of [task,{...task,partnerName:'試験パートナー',date:day}]){
  const saved={...item,...periodTaskChanges(item,{action:'daily',note:'本日の作業記録'},actor,day,'u',now)};
  assert.equal(isDailyWorkFinished(saved,day),true);
  assert.equal(isDailyWorkFinished(saved,nextDay),false);
  assert.equal(!!saved.completed,false);
  assert.equal(taskOnDay(saved,day,nextDay),true);
  assert.ok(saved.updates.some(update=>update.workDate===day));
 }
 assert.equal(isDailyWorkFinished({...task,dailyWork:{[nextDay]:{actorName:'翌日の記録'}}},day),false);
 assert.equal(isDailyWorkFinished({dailyWork:{[day]:{}}},day),false);
});
