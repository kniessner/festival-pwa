import { DATA_FILES } from './config.js';

export const store = {
    currentPage: 0,
    pageData: {},
    ttFilters: { stage: 'all', category: 'all', genre: 'all', day: 'all' },
    ttPendingDay: null
};

export async function loadData() {
    for (const [slug, file] of Object.entries(DATA_FILES)) {
        try {
            const res = await fetch(`data/${file}`);
            store.pageData[slug] = await res.json();
        } catch (e) {
            console.error('Failed to load', file, e);
        }
    }
}

export async function loadManifest() {
    try { return await (await fetch('data/_manifest.json')).json(); }
    catch { return null; }
}
