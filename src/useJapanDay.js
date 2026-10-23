import { useEffect, useState } from 'react';
import { japanToday } from './japanTime.mjs';
// Follow the new day only when the user was viewing today, preserving historical selections.
export default function useJapanDay(followSelectedDate) {
  const [day, setDay] = useState(japanToday);
  useEffect(() => {
    let previous = japanToday();
    const refresh = () => {
      const next = japanToday();
      setDay(next);
      if (next !== previous) {
        const old = previous;
        previous = next;
        followSelectedDate?.(selected => selected === old ? next : selected);
      }
    };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [followSelectedDate]);
  return day;
}
