import { test } from 'node:test';
import assert from 'node:assert/strict';
import { periodTaskChanges, taskOnDay, isPeriodTask, isRecurringTask, isTaskPast, taskDisplayDay, nextOccurrence, repeatMatches, repeatLabel, normalizeRepeat } from '../src/periodTask.mjs';
import { calendarDayData } from '../src/calendarDay.mjs';
import { calendarPeriods } from '../src/calendarPeriods.mjs';
import { collectDailyReport } from '../src/dailyReport.mjs';
import { isPartnerOverdue } from '../src/partnerOverdue.mjs';
import { taskHistoryEntries } from '../src/taskHistory.mjs';
const actor = { id:'u', name:'竹添 三剛', role:'staff' };
// 2026-11-02 is a Monday.
const start='2026-11-02';
const weekly = { id:'w', subject:'屋上点検', completed:false, assigneeIds:['u'], periodStartDate:start, periodEndDate:'', repeat:{ type:'weekly', weekdays:[1,5] } };
const monthly = { id:'m', subject:'消防設備の確認', completed:false, assigneeIds:['u'], periodStartDate:start, periodEndDate:'', repeat:{ type:'monthly', day:31 } };
const source = item => ({ users:{u:{...actor}}, teamData:{tasks:{[start]:{u:[item]}}}, partnerItems:[] });
test('weekly tasks appear only on the chosen weekdays from the start date, with no end',()=>{
 assert.equal(isRecurringTask(weekly),true);assert.equal(isPeriodTask(weekly),true);
 assert.deepEqual(['2026-11-02','2026-11-03','2026-11-06','2026-11-09','2027-11-05','2026-10-30'].map(day=>taskOnDay(weekly,start,day)),[true,false,true,true,true,false]);
 assert.equal(isTaskPast(weekly,start,'2030-01-01'),false);
 assert.equal(calendarDayData('2026-11-06',source(weekly).teamData).tasks.length,1);
 assert.equal(calendarDayData('2026-11-04',source(weekly).teamData).tasks.length,0);
});
test('monthly tasks use the last day of shorter months',()=>{
 assert.deepEqual(['2026-11-30','2026-12-31','2027-02-28','2027-02-27','2028-02-29','2026-12-30'].map(day=>repeatMatches(monthly.repeat,day)),[true,true,true,false,true,false]);
 assert.equal(repeatMatches({type:'monthly',day:15},'2026-11-15'),true);
 assert.equal(taskOnDay({...monthly,repeat:{type:'monthly',day:1}},start,'2026-11-01'),false);
});
test('the next occurrence is today on a matching day, otherwise the coming one',()=>{
 assert.equal(nextOccurrence(weekly,'2026-11-06'),'2026-11-06');assert.equal(nextOccurrence(weekly,'2026-11-07'),'2026-11-09');
 assert.equal(nextOccurrence(weekly,'2026-10-01'),'2026-11-02');assert.equal(nextOccurrence(monthly,'2027-02-01'),'2027-02-28');
 assert.equal(taskDisplayDay(weekly,start,'2026-11-06'),'2026-11-06');assert.equal(taskDisplayDay(weekly,start,'2026-11-07'),'2026-11-09');
});
test('repeat rules are validated, normalized and labelled',()=>{
 assert.deepEqual(normalizeRepeat({type:'weekly',weekdays:[5,1,5]}),{type:'weekly',weekdays:[1,5]});
 for(const bad of [{type:'weekly',weekdays:[]},{type:'weekly',weekdays:[7]},{type:'monthly',day:0},{type:'monthly',day:32},{type:'yearly'},null])assert.equal(normalizeRepeat(bad),null);
 assert.equal(repeatLabel(weekly.repeat),'毎週 月・金曜日');assert.equal(repeatLabel(monthly.repeat),'毎月31日（ない月は月末）');assert.equal(repeatLabel({type:'monthly',day:5}),'毎月5日');
});
test('daily work is recorded only on an occurrence and the series continues until ended',()=>{
 const changes=periodTaskChanges(weekly,{action:'daily',note:'異常なし'},actor,start,'u','2026-11-06T01:00:00Z');
 assert.equal(changes.dailyWork['2026-11-06'].note,'異常なし');assert.equal(changes.completed,undefined);
 assert.throws(()=>periodTaskChanges(weekly,{action:'daily'},actor,start,'u','2026-11-04T01:00:00Z'),/対象日/);
 assert.throws(()=>periodTaskChanges({...weekly,completed:true},{action:'daily'},actor,start,'u','2026-11-06T01:00:00Z'),/終了/);
});
test('setting a repeat clears the end date, and switching back to a period clears the repeat',()=>{
 const single={id:'s',subject:'x',assigneeIds:['u']};
 assert.deepEqual(periodTaskChanges(single,{action:'set',startDate:start,repeat:{type:'weekly',weekdays:[3]}},actor,start,'u'),{periodStartDate:start,periodEndDate:'',repeat:{type:'weekly',weekdays:[3]}});
 assert.throws(()=>periodTaskChanges(single,{action:'set',startDate:start,repeat:{type:'weekly',weekdays:[]}},actor,start,'u'),/繰り返し/);
 assert.deepEqual(periodTaskChanges(weekly,{action:'set',startDate:start,endDate:'2026-11-10'},actor,start,'u'),{periodStartDate:start,periodEndDate:'2026-11-10',repeat:null});
 const worked={...weekly,dailyWork:{'2026-11-06':{}}};
 assert.throws(()=>periodTaskChanges(worked,{action:'set',startDate:'2026-11-09',repeat:weekly.repeat},actor,start,'u'),/期間から外す/);
});
test('repeating tasks never draw period bars, never become overdue and are labelled as a repeat in history',()=>{
 assert.equal(calendarPeriods(source(weekly).teamData).length,0);
 assert.equal(isPartnerOverdue({...weekly,date:start,partnerName:'A'},Date.parse('2030-01-01T00:00:00Z')),false);
 const history=taskHistoryEntries({date:start,completedAt:'2026-11-20T01:00:00Z'},{...weekly,completed:true});
 assert.equal(history[0].historyLabel,'繰り返し終了');
});
test('the daily report lists an unfinished repeating task only on its occurrence days',()=>{
 const state=source({...weekly,createdAt:'2026-11-01T00:00:00Z'});
 const on=collectDailyReport(state,'2026-11-06'),off=collectDailyReport(state,'2026-11-04');
 assert.equal(JSON.stringify(on).includes('屋上点検'),true);assert.equal(JSON.stringify(off).includes('屋上点検'),false);
});
