import { store, fetchLocalized } from './store.js';
import { DATA_FILES } from './config.js';

// Music events are authored via the WP plugin's "Music" post type and
// synced into music.json — separate from timetable.json (which comes from
// scripts/_build_timetable.py's scrape) for the same reason notifications.json
// is separate from news.json: two independent pipelines writing the same
// file would clobber each other on the next scrape/deploy.
//
// Unlike notifications, music.json isn't its own page — its events and
// stages get merged into store.pageData.timetable right here, since that's
// the one array both the Program list (views/timetable.js) and the grid
// Timetable (views/timetable-grid.js) already read from. There's no
// server-side equivalent of this merge (the WP plugin has no access to
// _build_timetable.py, which runs locally during scripts/update.sh), so it
// has to happen client-side, every time music.json is fetched.

export function mergeMusicIntoTimetable() {
    const music = store.pageData.music;
    const timetable = store.pageData.timetable;
    if (!music || !timetable) return;

    // Re-merge cleanly each time instead of accumulating duplicates across
    // repeated calls (e.g. the foreground-refresh re-fetch below).
    const nonMusicEvents = (timetable.events || []).filter(ev => ev.category !== 'Music');
    timetable.events = [...nonMusicEvents, ...(music.events || [])];

    const existingStages = new Set((timetable.filters.stages || []).map(s => s.value));
    const newStages = (music.stages || []).filter(s => !existingStages.has(s.value));
    if (newStages.length) {
        timetable.filters.stages = [...(timetable.filters.stages || []), ...newStages];
    }

    ['categories', 'genres'].forEach(facet => {
        if (!(timetable.filters[facet] || []).some(c => c.value === 'music')) {
            timetable.filters[facet] = [...(timetable.filters[facet] || []), { value: 'music', label: 'Music' }];
        }
    });
}

// Re-fetches just music.json (not the whole page data) and re-merges — the
// service worker serves this one network-first, same as notifications.json,
// so this actually gets whatever was most recently published.
export async function refreshMusic() {
    try {
        store.pageData.music = await fetchLocalized(DATA_FILES.music, store.lang);
        mergeMusicIntoTimetable();
        return true;
    } catch (e) {
        console.error('Failed to refresh music', e);
        return false;
    }
}
