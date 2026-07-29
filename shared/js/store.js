import { DATA_FILES } from './config.js';
import { saveManifest, getManifest, savePage, getPage } from './db.js';

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
        // WordPress PWA: try network first, persist to IndexedDB, fall back to IndexedDB.
        let manifest;
        try {
            manifest = await loadJson(`${base}/manifest`);
            await saveManifest(manifest);
        } catch (e) {
            console.warn('[PWA] Manifest network failed, using IndexedDB', e);
            manifest = await getManifest();
        }

        if (!manifest || !manifest.pages) {
            throw new Error('No manifest available');
        }
        store.manifest = manifest;
        store.pages = manifest.pages;

        const slugs = manifest.pages.map(p => p.slug);
        await Promise.allSettled(slugs.map(async (slug) => {
            try {
                const data = await loadJson(`${base}/pages/${slug}`);
                await savePage(slug, data);
                store.pageData[slug] = data;
            } catch (e) {
                console.warn(`[PWA] Page ${slug} network failed, using IndexedDB`, e);
                const cached = await getPage(slug);
                if (cached) store.pageData[slug] = cached;
            }
        }));
        return;
    }

    // Standalone export: load local JSON files and persist them to IndexedDB too.
    for (const [slug, file] of Object.entries(DATA_FILES)) {
        try {
            const data = await loadJson(`data/${file}`);
            store.pageData[slug] = data;
            await savePage(slug, data);
        } catch (e) {
            console.warn(`[PWA] Failed to load ${file}, using IndexedDB`, e);
            const cached = await getPage(slug);
            if (cached) store.pageData[slug] = cached;
        }
    }

    // Standalone manifest
    try {
        const manifest = await loadJson('data/_manifest.json');
        store.manifest = manifest;
        store.pages = manifest.pages || [];
        await saveManifest(manifest);
    } catch (e) {
        const cached = await getManifest();
        if (cached) {
            store.manifest = cached;
            store.pages = cached.pages || [];
        }
    }
}

export async function loadManifest() {
    return store.manifest || getManifest();
}
