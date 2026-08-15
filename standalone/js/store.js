import { DATA_FILES } from './config.js';
import { getLang } from './i18n.js';

export const store = {
    currentPage: 0,
    pageData: {},
    lang: getLang(),
    ttFilters: { stage: 'all', category: 'all', day: 'all' },
    // Shared across the Program list and grid Timetable views — picking
    // Music in one keeps it selected when switching to the other, since
    // both read this same field fresh at render time.
    eventTypeFilter: 'music',
    ttPendingDay: null,
    gridDay: null,
    // True while gridDay was auto-assigned (from getEffectiveFestivalDay
    // on mount).  Flipped to false by setGridDay() the moment the user
    // taps a day pill.  renderGridTimetable only auto-advances to
    // today if this flag is still true, so a manual pick survives
    // background/foreground cycles.
    gridDayIsAuto: true,
    gridScrollMode: 'horizontal',
    favTab: 'program',
    // Populated by js/location.js after the user grants location permission.
    // Always an object once populated: { longitude, latitude, accuracy, error }.
    // longitude/latitude/accuracy are numbers on a successful fix, null on
    // error. error is null on success, 'denied' | 'unsupported' | a message
    // string on failure. Stays null before the first fix / error arrives.
    userLocation: null,
    // Populated by the stage-hysteresis in js/views/timetable-grid.js after
    // a GPS fix resolves to a polygon in stages.geojson. Stage slug or null.
    userStage: null
};

export async function fetchLocalized(file, lang, { forceRefresh = false } = {}) {
    // The service worker only takes its networkOnly() bypass path (see
    // sw.js) when it sees this query param on the request URL — plain
    // `{cache: 'no-store'}` here wouldn't reach past the SW's own fetch
    // interception.
    const suffix = forceRefresh ? '?forceRefresh=1' : '';
    if (lang !== 'de') {
        try {
            const res = await fetch(`data/${lang}/${file}${suffix}`);
            if (res.ok) return await res.json();
        } catch (e) {
            // fall through to German
        }
    }
    const res = await fetch(`data/${file}${suffix}`);
    // The service worker's networkFirst() returns a plain-text 503 (not
    // JSON) when both the network and its cache come up empty — check
    // res.ok so that surfaces as a clear "fetch failed" error to callers
    // instead of a confusing JSON-parse exception.
    if (!res.ok) throw new Error(`Fetch failed for ${file}: HTTP ${res.status}`);
    return res.json();
}

export async function loadData() {
    // Fetch every data file in parallel instead of one at a time — on a
    // language switch this halves the wait (previously info.json and
    // timetable.json were awaited sequentially, adding their round-trips
    // together instead of overlapping them).
    await Promise.all(Object.entries(DATA_FILES).map(async ([slug, file]) => {
        try {
            // music.json is never localized (music events aren't
            // translated — see class-music.php), so requesting it with
            // 'de' skips fetchLocalized's en/ attempt, which would only
            // ever 404 and fall back anyway. Same file for every language.
            const lang = slug === 'music' ? 'de' : store.lang;
            store.pageData[slug] = await fetchLocalized(file, lang);
        } catch (e) {
            console.error('Failed to load', file, e);
        }
    }));
}

// Re-fetches just timetable.json and swaps it in — mirrors music.js's
// refreshMusic() (same networkFirst SW strategy, see sw.js) so the Program
// list / grid Timetable pick up edits made to the underlying JSON while the
// app is sitting open in the background, not just on next full reload.
// Callers must re-run mergeMusicIntoTimetable() afterwards, since this
// replaces store.pageData.timetable wholesale (losing any previously merged
// music.json events) and re-render whatever page is currently visible.
export async function refreshTimetableData() {
    try {
        store.pageData.timetable = await fetchLocalized(DATA_FILES.timetable, store.lang);
        return true;
    } catch (e) {
        console.error('Failed to refresh timetable', e);
        return false;
    }
}

// Manual "refresh" action, triggered from the drop-up menu. Bypasses the
// service worker's caching entirely (see fetchLocalized's forceRefresh
// param / sw.js's networkOnly()) so a stale offline cache can't silently
// mask new data. store.pageData[slug] is only overwritten inside the try —
// a slug that fails to refresh keeps whatever data it already had, per the
// requirement that a failed refresh must never blank out the current view.
export async function refreshAllData() {
    const failed = [];
    await Promise.all(Object.entries(DATA_FILES).map(async ([slug, file]) => {
        try {
            const lang = slug === 'music' ? 'de' : store.lang;
            store.pageData[slug] = await fetchLocalized(file, lang, { forceRefresh: true });
        } catch (e) {
            console.error('Failed to refresh', file, e);
            failed.push(slug);
        }
    }));
    return { failed };
}

export async function loadManifest() {
    try { return await (await fetch('data/_manifest.json')).json(); }
    catch { return null; }
}
