import { useEffect, useState } from 'react';
import { Gauge } from 'lucide-react';
import { japanTime } from '../japanTime.mjs';
import { todayMeterSaves, msUntilJapanMidnight } from '../meterSaveStatus.mjs';

const TITLES = { daily: '毎朝検針 保存完了', monthly: '毎月検針 保存完了' };
// Under 「みんなの連絡メモ」: today's completed meter saves and who saved them; gone at 0:00 (Japan time).
export default function MeterSaveStatus({ saves }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setTimeout(() => setNow(Date.now()), msUntilJapanMidnight(now)); return () => clearTimeout(timer); }, [now]);
  const groups = todayMeterSaves(saves, now);
  if (!groups.length) return null;
  return <section aria-label="今日の検針保存" className="mt-1 space-y-0.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-900">
    {groups.map(({ kind, rows }) => <p key={kind} className="flex flex-wrap items-center gap-x-2"><span className="inline-flex items-center gap-1 font-black"><Gauge size={14} aria-hidden="true"/>{TITLES[kind]}</span><span>{rows.map(row => `${row.name} ${japanTime(row.at)}`).join('、')}</span></p>)}
  </section>;
}
