/*
 * Festival PWA Service Worker — production-hardened offline caching.
 *
 * Strategy:
 *   - App shell / static assets  → Cache-First
 *   - Manifest + page JSON data  → Stale-While-Revalidate (fast, then refresh)
 *   - REST API calls             → Network-First with cache fallback
 *   - Same-origin assets         → Cache-First with runtime cache update
 *   - Cross-origin assets        → Cache-First only if CORS/basic; no no-cors opaque caching
 */

const CACHE_VERSION = '1.3.1';
const APP_NAME = 'bucht-pwa';
const CACHE_NAME = `${APP_NAME}-v${CACHE_VERSION}`;

// Minimal shell that must always be available offline.
const SHELL_ASSETS = [
    '/pwa/',
    '/pwa/index.html',
    '/pwa/manifest.json',
    '/pwa/shared/css/tokens.css',
    '/pwa/shared/css/base.css',
    '/pwa/shared/css/components.css',
    '/pwa/shared/css/views.css',
    '/pwa/shared/js/app.js',
    '/pwa/shared/js/store.js',
    '/pwa/shared/js/router.js',
    '/pwa/shared/js/search.js',
    '/pwa/shared/js/config.js',
    '/pwa/shared/js/ui.js',
    '/pwa/shared/js/festival.js',
    '/pwa/shared/js/favorites.js',
    '/pwa/shared/js/install.js',
    '/pwa/shared/js/db.js',
    '/pwa/data/_manifest.json',
    '/pwa/shared/js/views/home.js',
    '/pwa/shared/js/views/timetable.js',
    '/pwa/shared/js/views/info.js',
    '/pwa/shared/js/views/favorites.js',
    '/pwa/icons/icon-192.png',
    '/pwa/icons/icon-512.png',
    '/pwa/images/bg.jpg',
    '/pwa/images/datum.png'
];

const FONT_URL = 'https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&family=Space+Grotesk:wght@500;700&display=swap';

// ── Helpers ───────────────────────────────────────────────────────────────

function isSameOrigin(url) {
    return url.origin === self.location.origin;
}

function isPwaAsset(url) {
    return url.pathname.startsWith('/pwa/') ||
           url.hostname === 'fonts.googleapis.com' ||
           url.hostname === 'fonts.gstatic.com';
}

function isSyncEndpoint(url) {
    return url.pathname === '/wp-json/festival/v1/sync-batch';
}

function isApi(url) {
    return url.pathname.startsWith('/wp-json/');
}

function isDataFile(url) {
    return url.pathname.startsWith('/pwa/data/');
}

function fetchWithTimeout(request, ms = 10000) {
    return fetch(request, {
        cache: 'no-cache',
        signal: AbortSignal.timeout(ms)
    });
}

async function putCache(request, response) {
    if (!response || !response.ok || response.status === 206) return;
    try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
    } catch (err) {
        console.log('[SW] cache put failed', request.url, err.message);
    }
}

// ── Install: cache shell atomically, then data files best-effort ──────────

async function precacheShell() {
    const cache = await caches.open(CACHE_NAME);

    // Shell must all cache; if any fails, installation fails.
    await cache.addAll(SHELL_ASSETS);

    // Google Fonts CSS is optional but highly desirable.
    try {
        const fontRes = await fetchWithTimeout(FONT_URL, 10000);
        if (fontRes.ok) await cache.put(FONT_URL, fontRes);
    } catch (e) {
        console.log('[SW] Font CSS precache failed', e.message);
    }
}

async function precacheData() {
    const cache = await caches.open(CACHE_NAME);

    // Fetch manifest with no-cache so we always get the latest version.
    let manifest;
    try {
        const res = await fetchWithTimeout('/pwa/data/_manifest.json', 10000);
        if (!res.ok) throw new Error('manifest fetch failed');
        manifest = await res.json();
        await cache.put('/pwa/data/_manifest.json', res.clone());
    } catch (e) {
        console.log('[SW] Manifest precache failed', e.message);
        return;
    }

    const dataFiles = (manifest.pages || []).map(p => `/pwa/data/${p.slug}.json`);
    const results = await Promise.allSettled(
        dataFiles.map(async (url) => {
            try {
                const res = await fetchWithTimeout(url, 10000);
                if (res.ok) {
                    await cache.put(url, res.clone());
                    return { ok: true, url };
                }
                return { ok: false, url, status: res.status };
            } catch (e) {
                return { ok: false, url, error: e.message };
            }
        })
    );

    let cached = 0, failed = 0;
    results.forEach(r => {
        if (r.value?.ok) cached++;
        else {
            failed++;
            console.log('[SW] Failed to precache', r.value?.url || r.reason, r.value?.status || r.reason);
        }
    });
    console.log(`[SW] Precached ${cached}/${dataFiles.length} data files, ${failed} failed`);
}

self.addEventListener('install', e => {
    e.waitUntil(
        precacheShell()
            .then(() => precacheData())
            .then(() => self.skipWaiting())
            .catch(err => {
                console.error('[SW] Install failed', err);
                throw err;
            })
    );
});

// ── Activate: delete old caches, take control ───────────────────────────

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.map(key => {
                if (key !== CACHE_NAME) {
                    console.log('[SW] Deleting old cache', key);
                    return caches.delete(key);
                }
            }))
        ).then(() => self.clients.claim())
    );
});

// ── Fetch strategies ────────────────────────────────────────────────────────

// Cache-First for shell/static assets.
async function cacheFirst(request, fallbackToNetwork = true) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    if (!fallbackToNetwork) {
        return new Response('Offline asset not cached', { status: 503 });
    }

    try {
        const res = await fetchWithTimeout(request, 10000);
        await putCache(request, res);
        return res.clone();
    } catch (err) {
        return new Response('Network error and asset not cached', { status: 503 });
    }
}

// Stale-While-Revalidate for JSON data files / manifest.
// The `event` parameter is used to keep the SW alive for background refresh.
async function staleWhileRevalidate(request, event) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);

    const networkPromise = fetchWithTimeout(request, 10000)
        .then(async res => {
            if (res.ok) await putCache(request, res.clone());
            return res;
        })
        .catch(err => {
            console.log('[SW] SWR network failed', request.url, err.message);
            return undefined;
        });

    if (cached) {
        // Trigger background refresh but don't await it.
        if (event) event.waitUntil(networkPromise);
        return cached;
    }

    const fresh = await networkPromise;
    return fresh || new Response('Offline and not cached', { status: 503 });
}

// Network-First for REST API.
async function networkFirst(request) {
    try {
        const res = await fetchWithTimeout(request, 10000);
        await putCache(request, res.clone());
        return res;
    } catch (err) {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(request);
        if (cached) return cached;
        return new Response(
            JSON.stringify({ error: 'Offline and not cached' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
    }
}

// Cross-origin asset: cache if response type allows inspection.
async function crossOriginAsset(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
        const res = await fetch(request); // keep original mode (cors/no-cors)
        if (res && (res.type === 'basic' || res.type === 'cors')) {
            await putCache(request, res.clone());
        }
        return res;
    } catch (err) {
        return cached || new Response('Cross-origin asset unavailable offline', { status: 503 });
    }
}

self.addEventListener('fetch', e => {
    const { request } = e;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // Same-origin PWA assets (shell, CSS, JS, images, data)
    if (isPwaAsset(url)) {
        if (isDataFile(url)) {
            e.respondWith(staleWhileRevalidate(request, e));
        } else {
            e.respondWith(cacheFirst(request));
        }
        return;
    }

    // REST API (including external sync push)
    if (isApi(url)) {
        // Sync push should always try network and never cache the request body.
        if (isSyncEndpoint(url) && request.method === 'POST') {
            e.respondWith(
                fetchWithTimeout(request, 30000)
                    .then(res => res.clone())
                    .catch(err => new Response(JSON.stringify({ error: err.message }), { status: 503, headers: { 'Content-Type': 'application/json' } }))
            );
            return;
        }
        e.respondWith(networkFirst(request));
        return;
    }

    // Cross-origin assets referenced by raw/snapshot pages.
    if (!isSameOrigin(url)) {
        e.respondWith(crossOriginAsset(request));
        return;
    }

    // Default: network with cache fallback.
    e.respondWith(
        fetchWithTimeout(request, 10000)
            .then(async res => {
                await putCache(request, res.clone());
                return res;
            })
            .catch(async () => {
                const cache = await caches.open(CACHE_NAME);
                return cache.match(request)
                    .then(cached => cached || cacheFirst('/pwa/index.html', false));
            })
    );
});

// ── Message handling: skip-waiting / update checks ───────────────────────

self.addEventListener('message', e => {
    if (!e.data) return;
    if (e.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
