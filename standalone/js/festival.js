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

// The festival's overrun Monday has two different date tokens in the wild:
// _build_timetable.py's scraper writes it as '2026-06-15' (a wrong-year
// placeholder baked into timetable.json's filters.days and DAY_ABBREV
// above), while music.json (authored separately, straight from the WP
// "Music" post type) correctly dates it '2026-08-17'. Since the day tabs
// and all day-filtering only recognize the scraper's placeholder, any event
// genuinely dated '2026-08-17' needs translating to match — done once here
// (music.js's mergeMusicIntoTimetable() calls toDayTabValue when merging)
// rather than touching the scraper output or hardcoding a second "Monday"
// token throughout the UI.
//
// toRealDate is the inverse — needed by the grid Timetable's day-rollover
// math (timetable-grid.js), which does real calendar arithmetic (subtract
// a day) and can't operate on a placeholder: it de-aliases first, does the
// arithmetic, then re-aliases the result via toDayTabValue.
const MONDAY_ALIAS = { real: '2026-08-17', placeholder: '2026-06-15' };

export function toDayTabValue(realDay) {
    return realDay === MONDAY_ALIAS.real ? MONDAY_ALIAS.placeholder : realDay;
}

export function toRealDate(dayTabValue) {
    return dayTabValue === MONDAY_ALIAS.placeholder ? MONDAY_ALIAS.real : dayTabValue;
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
