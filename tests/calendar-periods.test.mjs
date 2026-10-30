import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarPeriods, periodWeekRows } from '../src/calendarPeriods.mjs';
const period={id:'p',periodStartDate:'2026-10-30',periodEndDate:'2026-11-03'};
test('collects open public periods of both types without private or complete tasks',()=>{
 const rows=calendarPeriods({tasks:{'2026-10-01':{u:[period,{...period,id:'private',visibility:'private'},{...period,id:'done',completed:true},{id:'single'}]}}},[{...period,id:'partner'}]);
 assert.equal(rows.length,2);assert.deepEqual(rows.map(x=>x.kind),['member','partner']);
});
test('aligned week rows include placeholders and arrows across week/month boundaries',()=>{
 const tasks=calendarPeriods({},[period]);
 assert.equal(periodWeekRows(tasks,'2026-10-29')[0].active,false);
 const first=periodWeekRows(tasks,'2026-10-30')[0];assert.equal(first.fromBefore,false);assert.equal(first.continues,true);
 const next=periodWeekRows(tasks,'2026-11-01')[0];assert.equal(next.active,true);assert.equal(next.fromBefore,true);assert.equal(next.continues,true);
 const end=periodWeekRows(tasks,'2026-11-03')[0];assert.equal(end.active,true);assert.equal(end.continues,false);
 assert.deepEqual(periodWeekRows(tasks,'2026-11-08'),[]);
});
