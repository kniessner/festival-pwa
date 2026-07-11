import { DATA_FILES } from './config.js';

export const store = {
    currentPage: 0,
    pageData: {},
    ttFilters: { stage: 'all', category: 'all', genre: 'all', day: 'all' },
    manifest: null,
    pages: []
};

function isWordPressPWA() {
    return location.pathname.startsWith('/pwa/') ||
           document.querySelector('link[rel="manifest"]')?.getAttribute('href')?.startsWith('/pwa/');
}

function apiBase() {
    return isWordPressPWA() ? (window.location.origin + '/wp-json/festival/v1') : null;
}

async function loadJson(path) {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}

export async function loadData() {
    const base = apiBase();

    if (base) {
        await loadManifest();
        const pageSlugs = store.pages.map(p => p.slug);
        const results = await Promise.allSettled(pageSlugs.map(async (slug) => {
            try {
                store.pageData[slug] = await loadJson(`${base}/pages/${slug}`);
            } catch (e) {
                console.error('[PWA] Failed to load page', slug, e);
            }
        }));
        return results;
    }

    for (const [slug, file] of Object.entries(DATA_FILES)) {
        try {
            store.pageData[slug] = await loadJson(`data/${file}`);
        } catch (e) {
            console.error('Failed to load', file, e);
        }
    }
}

export async function loadManifest() {
    const base = apiBase();
    try {
        const data = base
            ? await loadJson(`${base}/manifest`)
            : await loadJson('data/_manifest.json');
        store.manifest = data;
        store.pages = data.pages || [];
        return data;
    } catch (e) {
        console.error('Failed to load manifest', e);
        return null;
    }
}
