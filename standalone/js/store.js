import { DATA_FILES } from './config.js';
import { getLang } from './i18n.js';

export const store = {
    currentPage: 0,
    pageData: {},
    lang: getLang(),
    ttFilters: { stage: 'all', category: 'all', genre: 'all', day: 'all' },
    ttPendingDay: null,
    gridDay: null,
    gridScrollMode: 'vertical'
};

async function fetchLocalized(file, lang) {
    if (lang !== 'de') {
        try {
            const res = await fetch(`data/${lang}/${file}`);
            if (res.ok) return await res.json();
        } catch (e) {
            // fall through to German
        }
    }
    const res = await fetch(`data/${file}`);
    return res.json();
}

export async function loadData() {
    for (const [slug, file] of Object.entries(DATA_FILES)) {
        try {
            store.pageData[slug] = await fetchLocalized(file, store.lang);
        } catch (e) {
            console.error('Failed to load', file, e);
        }
    }
}

export async function loadManifest() {
    try { return await (await fetch('data/_manifest.json')).json(); }
    catch { return null; }
}
