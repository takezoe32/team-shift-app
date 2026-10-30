import test from 'node:test';
import assert from 'node:assert/strict';
import { compareCalendarTasks } from '../src/calendarTaskSort.mjs';
import { compareCalendarPartners } from '../src/calendarPartnerSort.mjs';
const today='2026-10-30';
const items=[
 {id:'period',taskDate:'2026-10-15',date:'2026-10-15',periodStartDate:'2026-10-25',periodEndDate:'2026-10-31',createdAt:'1',partnerName:'A'},
 {id:'past',taskDate:'2026-10-27',date:'2026-10-27',partnerName:'Z'},
 {id:'today',taskDate:today,date:today,createdAt:'2',partnerName:'B'},
 {id:'future',taskDate:'2026-11-02',date:'2026-11-02',partnerName:'A'},
];
test('past tasks precede contiguous current tasks and future tasks follow',()=>{
 assert.deepEqual([...items].sort((a,b)=>compareCalendarTasks(a,b,today)).map(x=>x.id),['past','period','today','future']);
});
test('inclusive period bounds are treated as today on every active day',()=>{
 for(const day of ['2026-10-25','2026-10-30','2026-10-31']) {
  const past={id:'past',taskDate:day.slice(0,8)+'24'};
  assert.ok(compareCalendarTasks(past,items[0],day)<0);
 }
 const notStarted={...items[0],taskDate:'2026-10-01',periodStartDate:'2026-11-01',periodEndDate:'2026-11-02'};
 assert.ok(compareCalendarTasks(items[2],notStarted,today)<0);
});
test('both partner sort modes preserve past/current/future groups',()=>{
 for(const mode of ['time','company']) assert.deepEqual([...items].sort((a,b)=>compareCalendarPartners(a,b,mode,today)).map(x=>x.id),['past','period','today','future']);
});
