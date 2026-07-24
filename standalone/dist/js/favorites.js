import { FAV_KEY } from './config.js';
import { store } from './store.js';

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

// Scheduled favorites (timetable events) that haven't ended yet, soonest first.
// Events without a day/start_time have no schedule to compare against and are skipped.
export function getNextUpcomingFavorite() {
    const events = store.pageData.timetable?.events;
    if (!events) return null;
    const now = new Date();
    let best = null;
    for (const f of getFavorites()) {
        if (f.page !== 'timetable') continue;
        const ev = events[f.index];
        if (!ev || !ev.day || !ev.start_time) continue;
        const start = new Date(`${ev.day}T${ev.start_time}:00`);
        let end;
        if (ev.end_time) {
            end = new Date(`${ev.day}T${ev.end_time}:00`);
            if (end <= start) end.setDate(end.getDate() + 1); // event runs past midnight
        } else {
            end = new Date(start.getTime() + 90 * 60000);
        }
        if (end < now) continue;
        if (!best || start < best.start) best = { ev, index: f.index, start, running: start <= now };
    }
    return best;
}
