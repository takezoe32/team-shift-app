import test from 'node:test';
import assert from 'node:assert/strict';
import { compareCalendarPartners } from '../src/calendarPartnerSort.mjs';
const items = [
  { id: '1', partnerName: 'B社', date: '2026-10-28', time: '10:00' },
  { id: '2', partnerName: 'A社', date: '2026-10-29', time: '09:00' },
  { id: '3', partnerName: 'B社', date: '2026-10-28', time: '09:00' },
];
test('time order uses date then start time, without mutating source', () => {
 assert.deepEqual([...items].sort((a,b)=>compareCalendarPartners(a,b)).map(x=>x.id), ['3','1','2']);
 assert.deepEqual(items.map(x=>x.id), ['1','2','3']);
});
test('company order groups company then orders its schedule', () => {
 assert.deepEqual([...items].sort((a,b)=>compareCalendarPartners(a,b,'company')).map(x=>x.id), ['2','3','1']);
});
test('missing companies and start times sort last; width variants compare equally', () => {
 assert.ok(compareCalendarPartners({partnerName:''},{partnerName:'A'},'company')>0);
 assert.ok(compareCalendarPartners({date:'2026-10-28'},{date:'2026-10-28',time:'09:00'})>0);
 assert.equal(compareCalendarPartners({partnerName:'Ａ社'},{partnerName:'A社'},'company'),0);
});
