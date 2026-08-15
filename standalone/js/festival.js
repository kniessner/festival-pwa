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
//
// Uses raw local calendar day (no 6am rollover) — the day-tab UI matches
// wall-clock intuition (Sat 02:00 → Saturday tab). The 6am rollover only
// applies to EVENT bucketing (see eventPlayingRange below and
// timetable-grid.js's blockDayFor).
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

// Compute an event's actual wall-clock playing window as two Date objects.
//
// Two subtleties the naive "hh*60+mm" comparison gets wrong — both were
// silently breaking the "playing now" pulse for late-night sets:
//
//   1. ev.day is the LITERAL calendar date the event starts on (matches
//      the invariant asserted in timetable-grid.js's blockDayFor: the
//      scraper writes the physical calendar date, not the festival-day
//      alias).  So no per-event day-anchor shift is needed — just parse
//      ev.day as local midnight and set the wall-clock hours.
//
//   2. Events crossing midnight in wall-clock time (start >= end).
//      e.g. Cuddle Poodle 09:30 → 03:30 the next day.  Without the
//      end-past-midnight fix, endAt lands BEFORE startAt and no time
//      ever falls inside the range — which is why the old
//      isEventRunning gave a false negative for Cuddle Poodle after
//      wall-clock midnight even though it was clearly still on stage.
//
// Returns { startAt, endAt } as real Date objects; caller compares to
// `new Date()` directly.  Returns null for events without a start_time
// or with unparseable time strings.
export function eventPlayingRange(ev) {
    if (!ev || !ev.start_time) return null;
    const [sh, sm] = ev.start_time.split(':').map(Number);
    if (!Number.isFinite(sh) || !Number.isFinite(sm)) return null;

    // Anchor on ev.day parsed as local midnight (T00:00:00, no Z suffix,
    // so Date parses it as local time — toISOString-style UTC parsing
    // silently shifts the date on any timezone ahead of UTC).  Use the
    // real Monday date rather than the placeholder alias so setDate
    // arithmetic stays sane.
    const startAt = new Date(toRealDate(ev.day) + 'T00:00:00');
    if (isNaN(startAt.getTime())) return null;
    startAt.setHours(sh, sm, 0, 0);

    let endAt;
    if (ev.end_time) {
        const [eh, em] = ev.end_time.split(':').map(Number);
        if (!Number.isFinite(eh) || !Number.isFinite(em)) return null;
        endAt = new Date(startAt);
        endAt.setHours(eh, em, 0, 0);
        // Event crosses midnight in wall-clock (end <= start): bump 24h.
        // Equality is treated as crossing too because a 0-length event
        // would never match anyway; better to bias to "still playing".
        if (endAt <= startAt) endAt.setDate(endAt.getDate() + 1);
    } else {
        // No end_time — assume 90 min (matches the old isEventRunning
        // fallback, and roughly one grid block-height).
        endAt = new Date(startAt.getTime() + 90 * 60 * 1000);
    }
    return { startAt, endAt };
}

// True iff `now` (defaults to real clock) falls inside the event's actual
// wall-clock playing window.  Independent of which day tab is currently
// selected — callers who need a tab-scoped answer should compose:
//   ev.day === selectedDay && isEventPlayingAt(ev)
export function isEventPlayingAt(ev, now = new Date()) {
    const range = eventPlayingRange(ev);
    if (!range) return false;
    return now >= range.startAt && now <= range.endAt;
}

export function isEventRunning(ev, selectedDay) {
    // Tab-scoped: only paint the "running" class on events currently
    // visible on the selected day tab.  ev.day matches the tab value.
    if (ev.day !== selectedDay) return false;
    return isEventPlayingAt(ev);
}
