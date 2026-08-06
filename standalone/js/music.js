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

// The festival's overrun Monday has two different date tokens in the wild:
// _build_timetable.py's scraper writes it as '2026-06-15' (a wrong-year
// placeholder baked into timetable.json's filters.days and festival.js's
// DAY_ABBREV table), while music.json (authored separately, straight from
// the WP "Music" post type) correctly dates it '2026-08-17'. Since the day
// tabs and all day-filtering only know about the scraper's placeholder, any
// music event dated the real '2026-08-17' had no matching tab and could
// never be selected into view — e.g. Bayawaka's second (Monday) set existed
// in the data but was permanently unreachable. Remapped here, at the merge
// boundary, instead of touching the scraper output or hardcoding a second
// "Monday" token throughout the UI.
const MONDAY_DATE_ALIASES = { '2026-08-17': '2026-06-15' };

export function mergeMusicIntoTimetable() {
    const music = store.pageData.music;
    const timetable = store.pageData.timetable;
    if (!music || !timetable) return;

    // Re-merge cleanly each time instead of accumulating duplicates across
    // repeated calls (e.g. the foreground-refresh re-fetch below).
    const nonMusicEvents = (timetable.events || []).filter(ev => ev.category !== 'Music');
    const musicEvents = (music.events || []).map(ev => {
        const day = MONDAY_DATE_ALIASES[ev.day] || ev.day;
        return day === ev.day ? ev : { ...ev, day };
    });
    timetable.events = [...nonMusicEvents, ...musicEvents];

    const existingStages = new Set((timetable.filters.stages || []).map(s => s.value));
    const newStages = (music.stages || []).filter(s => !existingStages.has(s.value));
    if (newStages.length) {
        timetable.filters.stages = [...(timetable.filters.stages || []), ...newStages];
    }
    // No 'music' pill injected into categories/genres facets anymore — the
    // Music/Culture tab (event-type-filter.js) supersedes it.
}

// Re-fetches just music.json (not the whole page data) and re-merges — the
// service worker serves this one network-first, same as notifications.json,
// so this actually gets whatever was most recently published.
export async function refreshMusic() {
    try {
        // Always the unlocalized file — see loadData()'s matching comment
        // in store.js. music.json has no en/ variant by design.
        store.pageData.music = await fetchLocalized(DATA_FILES.music, 'de');
        mergeMusicIntoTimetable();
        return true;
    } catch (e) {
        console.error('Failed to refresh music', e);
        return false;
    }
}
