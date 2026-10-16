export default function QuarterHourTime({ value, onChange, label, disabled = false }) {
  const [hour = '', minute = ''] = (value || '').split(':');
  const style = 'flex-1 min-h-12 border border-gray-300 rounded-xl p-3 text-base bg-white';
  return <fieldset disabled={disabled}>
    <legend className="font-bold">{label}（15分刻み・任意）</legend>
    <div className="flex items-center gap-2 mt-2">
      <select aria-label={`${label}の時`} value={hour} onChange={e => onChange(e.target.value ? `${e.target.value}:${minute || '00'}` : '')} className={style}>
        <option value="">指定なし</option>
        {Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')).map(h => <option key={h} value={h}>{h}時</option>)}
      </select>
      <select aria-label={`${label}の分`} value={minute} onChange={e => onChange(e.target.value ? `${hour || '00'}:${e.target.value}` : '')} className={style}>
        <option value="">分を選択</option>
        {['00', '15', '30', '45'].map(m => <option key={m} value={m}>{m}分</option>)}
      </select>
    </div>
  </fieldset>;
}
