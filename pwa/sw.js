const CACHE_NAME = 'bucht-v3-fragment';
const SHELL_ASSETS = [
    '/pwa/',
    '/pwa/index.html',
    '/pwa/js/app.js',
    '/pwa/js/db.js',
    '/pwa/js/raw-timetable.js',
    '/pwa/sw.js',
    '/pwa/manifest.json',
    '/pwa/icons/icon-192.png',
    '/pwa/icons/icon-512.png',
    '/pwa/images/bg.jpg',
    '/pwa/images/datum.png',
    'https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&family=Space+Grotesk:wght@500;700&display=swap'
];

async function precacheDynamic() {
    const cache = await caches.open(CACHE_NAME);

    try {
        const res = await fetch('/pwa/data/_manifest.json');
        if (!res.ok) throw new Error('manifest fetch failed');
        const manifest = await res.json();

        const dataFiles = (manifest.pages || []).map(p => `/pwa/data/${p.slug}.json`);
        const toCache = [...SHELL_ASSETS, '/pwa/data/_manifest.json', ...dataFiles];

        const rawExtras = [];
        const snapshotFiles = [];

        for (const slug of (manifest.pages || []).map(p => p.slug)) {
            try {
                const pr = await fetch(`/pwa/data/${slug}.json`);
                if (!pr.ok) continue;
                const data = await pr.json();

                if (data.type === 'snapshot') {
                    const fragmentUrl = data.fragment_url || `/pwa/snapshots/${slug}.fragment.html`;
                    snapshotFiles.push(fragmentUrl);
                    if (Array.isArray(data.cached_assets)) {
                        data.cached_assets.forEach(url => {
                            if (!rawExtras.includes(url)) rawExtras.push(url);
                        });
                    }
                }

                if (data.type === 'raw' && Array.isArray(data.styles)) {
                    data.styles.forEach(s => {
                        if (s.type === 'link' && s.href && !rawExtras.includes(s.href)) rawExtras.push(s.href);
                    });
                    if (data.html) {
                        const imgMatches = data.html.match(/https?:\/\/[^"'\s)]+\.(?:jpg|jpeg|png|webp|gif)/gi) || [];
                        imgMatches.slice(0, 20).forEach(url => {
                            if (!rawExtras.includes(url)) rawExtras.push(url);
                        });
                    }
                }
            } catch (e) {
                // ignore per-page extra discovery errors
            }
        }

        // Cache shell + data + snapshots + same-origin cache assets
        await cache.addAll([...toCache, ...snapshotFiles]);

        // Cache cross-origin extras with no-cors so they can be stored as opaque responses.
        for (const url of rawExtras) {
            try {
                const res = await fetch(url, { mode: 'no-cors' });
                if (res) await cache.put(url, res);
            } catch (e) {
                console.log('[SW] Failed to precache raw extra', url, e.message);
            }
        }
        console.log('[SW] Precached', toCache.length, 'core +', snapshotFiles.length, 'snapshots +', rawExtras.length, 'extras');
    } catch (e) {
        console.log('[SW] Dynamic precache failed, falling back to shell only', e);
        await cache.addAll(SHELL_ASSETS);
    }
}

self.addEventListener('install', e => {
    e.waitUntil(precacheDynamic());
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

async function getShellResponse() {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match('/pwa/index.html');
    return cached || fetch('/pwa/index.html');
}

function emptyResponse() {
    return new Response('', { status: 204, statusText: 'No Content' });
}

self.addEventListener('fetch', e => {
    const { request } = e;
    const url = new URL(request.url);

    // Cache-first for our assets, fonts, snapshots and cached page assets
    if (url.pathname.startsWith('/pwa/') || url.hostname === 'fonts.googleapis.com') {
        e.respondWith(
            caches.match(request).then(async cached => {
                if (cached) return cached;
                try {
                    const res = await fetch(request);
                    if (res && res.ok && res.status !== 206) {
                        try {
                            const clone = res.clone();
                            const cache = await caches.open(CACHE_NAME);
                            await cache.put(request, clone);
                        } catch (cacheErr) {
                            console.log('[SW] cache put failed', request.url, cacheErr.message);
                        }
                    }
                    return res || emptyResponse();
                } catch (err) {
                    console.log('[SW] fetch failed', request.url, err.message);
                    return cached || emptyResponse();
                }
            })
        );
        return;
    }

    // Network-first for API calls
    if (url.pathname.startsWith('/wp-json/')) {
        e.respondWith(
            fetch(request).then(async res => {
                try {
                    const clone = res.clone();
                    const cache = await caches.open(CACHE_NAME);
                    await cache.put(request, clone);
                } catch (cacheErr) {
                    // ignore cache errors for API responses
                }
                return res;
            }).catch(async () => {
                const cached = await caches.match(request);
                return cached || new Response(
                    JSON.stringify({ error: 'Offline and not cached' }),
                    { status: 503, headers: { 'Content-Type': 'application/json' } }
                );
            })
        );
        return;
    }

    // For cross-origin assets referenced by raw/snapshot pages: cache on demand.
    // Do NOT force no-cors here: use the request's original mode so the response
    // can legally be returned to the page (opaque responses are only valid for no-cors requests).
    if (url.origin !== self.location.origin) {
        e.respondWith(
            caches.match(request).then(async cached => {
                if (cached) return cached;
                try {
                    const res = await fetch(request);
                    if (res) {
                        // Only cache same-origin-equivalent or no-cors opaque responses.
                        if (res.type === 'basic' || res.type === 'cors' || res.type === 'opaque') {
                            try {
                                const clone = res.clone();
                                const cache = await caches.open(CACHE_NAME);
                                await cache.put(request, clone);
                            } catch (cacheErr) {
                                console.log('[SW] cross-origin cache put failed', request.url, cacheErr.message);
                            }
                        }
                    }
                    return res || emptyResponse();
                } catch (err) {
                    console.log('[SW] cross-origin fetch failed', request.url, err.message);
                    return cached || emptyResponse();
                }
            })
        );
        return;
    }

    // Default: network with cache fallback
    e.respondWith(
        fetch(request).catch(async () => {
            const cached = await caches.match(request);
            return cached || getShellResponse();
        })
    );
});
