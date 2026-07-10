const CACHE_NAME = 'bucht-v3-dynamic';
const SHELL_ASSETS = [
    '/pwa/',
    '/pwa/index.html',
    '/pwa/js/app.js',
    '/pwa/sw.js',
    '/pwa/manifest.json',
    '/pwa/icons/icon-192.png',
    '/pwa/icons/icon-512.png',
    '/pwa/images/bg.jpg',
    '/pwa/images/datum.png',
    'https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&family=Space+Grotesk:wght@500;700&display=swap'
];

// Fetch manifest to know which pages are included
async function precacheDynamic() {
    try {
        const res = await fetch('/pwa/data/_manifest.json');
        if (res.ok) {
            const manifest = await res.json();
            const dataFiles = (manifest.pages || []).map(p => `/pwa/data/${p.slug}.json`);
            const allAssets = [...SHELL_ASSETS, '/pwa/data/_manifest.json', ...dataFiles];
            const cache = await caches.open(CACHE_NAME);
            await cache.addAll(allAssets);
            console.log('[SW] Precached', allAssets.length, 'assets');
        }
    } catch (e) {
        console.log('[SW] Dynamic precache failed, falling back to shell only');
        const cache = await caches.open(CACHE_NAME);
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

self.addEventListener('fetch', e => {
    const { request } = e;
    const url = new URL(request.url);

    // Cache-first for our assets and fonts
    if (url.pathname.startsWith('/pwa/') || url.hostname === 'fonts.googleapis.com') {
        e.respondWith(
            caches.match(request).then(cached => {
                if (cached) return cached;
                return fetch(request).then(res => {
                    if (res.ok) {
                        const clone = res.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                    }
                    return res;
                }).catch(() => cached);
            })
        );
        return;
    }

    // Network-first for API calls
    if (url.pathname.startsWith('/wp-json/')) {
        e.respondWith(
            fetch(request).then(res => {
                const clone = res.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                return res;
            }).catch(() => caches.match(request))
        );
        return;
    }

    // Default: network with cache fallback
    e.respondWith(
        fetch(request).catch(() => caches.match(request))
    );
});
