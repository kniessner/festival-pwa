import { FESTIVAL_DATES } from './config.js';
import { getLang } from './i18n.js';

// Matches the scraper's own day_short convention (_extract_program.py) —
// German day names abbreviate to 2 letters (DO/FR/SA/SO/MO), not a generic
// 3-char slice of the full label, which gave "DON"/"FRE"/"SON" instead.
const DAY_ABBREV = {
    de: { '2026-08-13': 'DO', '2026-08-14': 'FR', '2026-08-15': 'SA', '2026-08-16': 'SO', '2026-06-15': 'MO' },
    en: { '2026-08-13': 'THU', '2026-08-14': 'FRI', '2026-08-15': 'SAT', '2026-08-16': 'SUN', '2026-06-15': 'MON' }
};

// Falls back to a 3-char slice of the given label for any day not in the
// table above (e.g. a new festival edition's dates before this table is
// updated) rather than showing nothing.
export function dayAbbrev(dayValue, fallbackLabel) {
    return DAY_ABBREV[getLang()]?.[dayValue] || (fallbackLabel || '').slice(0, 3).toUpperCase();
}

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
