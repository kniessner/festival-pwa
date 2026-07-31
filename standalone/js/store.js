import { DATA_FILES } from './config.js';
import { getLang } from './i18n.js';

export const store = {
    currentPage: 0,
    pageData: {},
    lang: getLang(),
    ttFilters: { stage: 'all', category: 'all', genre: 'all', day: 'all' },
    ttPendingDay: null,
    gridDay: null,
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

export async function fetchLocalized(file, lang) {
    if (lang !== 'de') {
        try {
            const res = await fetch(`data/${lang}/${file}`);
            if (res.ok) return await res.json();
        } catch (e) {
            // fall through to German
        }
    }
    const res = await fetch(`data/${file}`);
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
            store.pageData[slug] = await fetchLocalized(file, store.lang);
        } catch (e) {
            console.error('Failed to load', file, e);
        }
    }));
}

export async function loadManifest() {
    try { return await (await fetch('data/_manifest.json')).json(); }
    catch { return null; }
}
