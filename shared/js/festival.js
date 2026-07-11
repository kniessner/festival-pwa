import { FESTIVAL_DATES, WEEKDAY_MAP } from './config.js';

// Which festival date "today" maps to (real date during festival, else weekday-mapped, else day 1)
export function getEffectiveFestivalDay() {
    const now = new Date();
    const todayStr = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')
    ].join('-');
    if (FESTIVAL_DATES.includes(todayStr)) return todayStr;
    return WEEKDAY_MAP[now.getDay()] || FESTIVAL_DATES[0];
}

export function isEventRunning(ev, selectedDay) {
    if (selectedDay !== getEffectiveFestivalDay()) return false;
    if (!ev.start_time) return false;
    const [sh, sm] = ev.start_time.split(':').map(Number);
    const startMinutes = sh * 60 + sm;
    let endMinutes;
    if (ev.end_time) {
        const [eh, em] = ev.end_time.split(':').map(Number);
        endMinutes = eh * 60 + em;
    } else {
        endMinutes = startMinutes + 90;
    }
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
}
