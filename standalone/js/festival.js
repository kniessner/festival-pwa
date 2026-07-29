import { FESTIVAL_DATES } from './config.js';

// Which festival date "today" maps to: the real date during the festival,
// the first day before it starts, the last day after it ends.
export function getEffectiveFestivalDay() {
    const now = new Date();
    const todayStr = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')
    ].join('-');
    if (todayStr < FESTIVAL_DATES[0]) return FESTIVAL_DATES[0];
    if (todayStr > FESTIVAL_DATES[FESTIVAL_DATES.length - 1]) return FESTIVAL_DATES[FESTIVAL_DATES.length - 1];
    return FESTIVAL_DATES.includes(todayStr) ? todayStr : FESTIVAL_DATES[0];
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
