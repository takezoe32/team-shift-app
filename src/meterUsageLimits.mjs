// Daily usage (the 前日比 on the 毎朝検針 map = today's reading − the previous day's) that colors the 前日比:
// above the median → yellow, at or above 90% of the maximum → red. Color only, no warning dialog.
// Medians and maxima are from the 毎朝検針 book, 2026/1/1–11/7 (311 days; usage = next day's reading − that day's,
// days with a negative difference left out). Units are the meter's own (electricity before the ×120 factor:
// 54.4 = 6,528 kWh, 122.9 = 14,748 kWh). Items that are not a usage (demand, temperatures, chlorine, bubbles) have none.
export const METER_USAGE_STATS = {
 'electric-reading': {median:54.4, max:122.9},
 'gas-main': {median:40, max:80},
 'gas-banquet': {median:0, max:2},
 'water-hotel': {median:75, max:453},
 'water-banquet': {median:1, max:5},
 'hot-water': {median:13, max:28},
 'gas-boiler': {median:74, max:113},
 'gas-kitchen': {median:2, max:4},
 'h-light': {median:11.7, max:37.6},
 'h-power': {median:26, max:75},
 'h-water': {median:0, max:0.7}
};
export const ALERT_RATIO = 0.9;
// What the map page receives: {id:{warn,alert}} — yellow when usage > warn, red when usage >= alert.
export const meterUsageLimits = (stats=METER_USAGE_STATS) => Object.fromEntries(Object.entries(stats).map(([id,s])=>[id,{warn:s.median,alert:Number((s.max*ALERT_RATIO).toFixed(8))}]));
// How many days in a row, ending with the previous day, were red (0–2): readings = [previous, the day before, the day before that].
export function priorAlertDays(readings,limit){
 let days=0;
 for(let i=0;i+1<readings.length&&days<2;i++){const a=readings[i],b=readings[i+1];if(typeof a!=='number'||typeof b!=='number'||meterUsageLevel(Number((a-b).toFixed(8)),limit)!=='alert')break;days++;}
 return days;
}
// For the map page: {id:days} for the items whose previous day(s) were red. Red today with 2 → 「3日連続」 popup.
export function meterAlertStreaks(snapshot,limits=meterUsageLimits()){
 const days=Object.keys(snapshot?.earlier||{}).sort().reverse(),out={};
 for(const [id,limit] of Object.entries(limits)){const n=priorAlertDays([snapshot?.previous?.[id],...days.map(d=>snapshot.earlier[d]?.[id])],limit);if(n)out[id]=n;}
 return out;
}
// The same rule the map page applies ('' = no color).
export function meterUsageLevel(usage,limit){
 if(!limit||typeof usage!=='number'||!Number.isFinite(usage))return '';
 return usage>=limit.alert?'alert':usage>limit.warn?'warn':'';
}
