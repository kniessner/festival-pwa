import { FAV_KEY } from './config.js';
import { store } from './store.js';
import { getEffectiveFestivalDay } from './festival.js';
import { safeGetJSON, safeSetJSON } from './helpers/safe-storage.js';

// Matches the rollover used for the "JETZT" badges and grid now-line: hours
// before this belong to the previous festival night, not a new calendar day.
const DAY_ROLLOVER_HOUR = 6;

function continuousMinutes(hour, minute) {
    if (hour < DAY_ROLLOVER_HOUR) hour += 24;
    return hour * 60 + minute;
}

// Same rollover-aware minute count, but from an event's start_time string —
// exported so views/favorites.js can sort a day's favorited events into the
// right order (a naive string/lexicographic sort on "01:00" vs "23:00" would
// wrongly put the after-midnight act first, even though it's later in the
// same festival night).
export function eventStartMinutes(ev) {
    if (!ev.start_time) return Infinity;
    const [h, m] = ev.start_time.split(':').map(Number);
    return continuousMinutes(h, m);
}

export function getFavorites() {
    return safeGetJSON(FAV_KEY, []);
}

// Timetable events are keyed by their own `id` (see scripts/_build_timetable.py's
// stable_event_id — derived from day/time/stage/title) rather than their
// array position: update.sh re-scrapes and rebuilds timetable.json from
// scratch on every content update, and js/music.js's mergeMusicIntoTimetable()
// re-splices music.json's events into that same array on every load and
// periodic refresh too — either can reorder/insert/remove events, which
// would silently repoint an index-based favorite at a different event.
// Notifications/info items don't come from a pipeline that reorders them
// the same way, so those stay index-based.
function timetableEventId(itemIndex) {
    return store.pageData.timetable?.events?.[itemIndex]?.id;
}

function favMatches(f, pageSlug, itemIndex) {
    if (f.page !== pageSlug) return false;
    if (pageSlug === 'timetable') {
        const id = timetableEventId(itemIndex);
        return id !== undefined && f.id === id;
    }
    return f.index === itemIndex;
}

export function toggleFavorite(pageSlug, itemIndex) {
    const favs = getFavorites();
    const idx = favs.findIndex(f => favMatches(f, pageSlug, itemIndex));
    if (idx >= 0) {
        favs.splice(idx, 1);
    } else if (pageSlug === 'timetable') {
        const id = timetableEventId(itemIndex);
        if (id === undefined) return false; // nothing loaded at this index to favorite
        favs.push({ page: pageSlug, id });
    } else {
        favs.push({ page: pageSlug, index: itemIndex });
    }
    // safeSetJSON swallows write failures (Safari private mode / quota) —
    // matches the read side above and every other localStorage caller
    // in the app.
    safeSetJSON(FAV_KEY, favs);
    return idx < 0;
}

export function isFavorite(pageSlug, itemIndex) {
    return getFavorites().some(f => favMatches(f, pageSlug, itemIndex));
}

// Stored favorites can outlive the item they pointed to — e.g. a favorite
// was saved while viewing the other language's (differently-indexed) info/
// notifications data, or (for the timetable) an event was dropped from a
// later scrape entirely. getFavorites() itself doesn't know about that;
// this filters to entries that still resolve to a real event/item in the
// *currently loaded* data, which is what the nav badge and the My Plan
// page should both be counting instead of the raw, possibly-stale
// localStorage entry count.
export function countValidFavorites() {
    let count = 0;
    for (const f of getFavorites()) {
        if (f.page === 'timetable') {
            if (store.pageData.timetable?.events?.some(e => e.id === f.id)) count++;
        } else if (f.page === 'notifications') {
            if (store.pageData.notifications?.items?.[f.index]) count++;
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
        // ui.js's nextEventCardHtml needs the event's *current* array
        // index (to jump to it in the live-rendered list) — separate
        // concern from f.id, which is how the favorite is matched.
        const index = events.findIndex(e => e.id === f.id);
        const ev = events[index];
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
        if (!best || startAbs < best.startAbs) best = { ev, index, startAbs, running: startAbs <= nowAbs };
    }
    return best;
}
