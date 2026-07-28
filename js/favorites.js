import { FAV_KEY } from './config.js';
import { store } from './store.js';
import { getEffectiveFestivalDay } from './festival.js';

// Matches the rollover used for the "JETZT" badges and grid now-line: hours
// before this belong to the previous festival night, not a new calendar day.
const DAY_ROLLOVER_HOUR = 6;

function continuousMinutes(hour, minute) {
    if (hour < DAY_ROLLOVER_HOUR) hour += 24;
    return hour * 60 + minute;
}

export function getFavorites() {
    try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; }
    catch { return []; }
}

export function toggleFavorite(pageSlug, itemIndex) {
    const favs = getFavorites();
    const idx = favs.findIndex(f => f.page === pageSlug && f.index === itemIndex);
    if (idx >= 0) { favs.splice(idx, 1); }
    else { favs.push({ page: pageSlug, index: itemIndex }); }
    localStorage.setItem(FAV_KEY, JSON.stringify(favs));
    return idx < 0;
}

export function isFavorite(pageSlug, itemIndex) {
    return getFavorites().some(f => f.page === pageSlug && f.index === itemIndex);
}

// Stored favorites can outlive the item they pointed to — e.g. a re-scrape
// reshuffles the timetable's event order, or a favorite was saved while
// viewing the other language's (differently-indexed) data. getFavorites()
// itself doesn't know about that; this filters to entries that still
// resolve to a real event/item in the *currently loaded* data, which is
// what the nav badge and the My Plan page should both be counting instead
// of the raw, possibly-stale localStorage entry count.
export function countValidFavorites() {
    let count = 0;
    for (const f of getFavorites()) {
        if (f.page === 'timetable') {
            if (store.pageData.timetable?.events?.[f.index]) count++;
        } else if (f.page.startsWith('info-')) {
            const sub = f.page.replace('info-', '');
            if (store.pageData.info?.[sub]?.items?.[f.index]) count++;
        }
    }
    return count;
}

// Scheduled favorites (timetable events) that haven't ended yet, soonest first.
// Events without a day/start_time have no schedule to compare against and are skipped.
//
// "Now" is the app's current festival day (getEffectiveFestivalDay — mapped to a
// real weekday outside the festival window) combined with the real clock time,
// not the true calendar date. This keeps the home screen consistent with the
// JETZT badges and grid now-line, which use the same effective-day concept.
export function getNextUpcomingFavorite() {
    const data = store.pageData.timetable;
    const events = data?.events;
    if (!events) return null;

    const dayOrder = data.filters.days.map(d => d.value);
    const dayIndex = dayOrder.indexOf(getEffectiveFestivalDay());
    if (dayIndex === -1) return null;

    const now = new Date();
    const nowAbs = dayIndex * 1440 + continuousMinutes(now.getHours(), now.getMinutes());

    let best = null;
    for (const f of getFavorites()) {
        if (f.page !== 'timetable') continue;
        const ev = events[f.index];
        if (!ev || !ev.day || !ev.start_time) continue;
        const evDayIndex = dayOrder.indexOf(ev.day);
        if (evDayIndex === -1) continue;

        const [sh, sm] = ev.start_time.split(':').map(Number);
        const startAbs = evDayIndex * 1440 + continuousMinutes(sh, sm);
        let endAbs;
        if (ev.end_time) {
            const [eh, em] = ev.end_time.split(':').map(Number);
            endAbs = evDayIndex * 1440 + continuousMinutes(eh, em);
            if (endAbs <= startAbs) endAbs += 24 * 60; // runs past midnight
        } else {
            endAbs = startAbs + 90;
        }

        if (endAbs < nowAbs) continue;
        if (!best || startAbs < best.startAbs) best = { ev, index: f.index, startAbs, running: startAbs <= nowAbs };
    }
    return best;
}
