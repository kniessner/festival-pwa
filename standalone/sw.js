const CACHE_NAME = 'bucht-standalone-v2';
const SHELL_ASSETS = [
    './',
    './index.html',
    './css/tokens.css',
    './css/base.css',
    './css/components.css',
    './css/views.css',
    './js/app.js',
    './js/config.js',
    './js/store.js',
    './js/favorites.js',
    './js/festival.js',
    './js/ui.js',
    './js/router.js',
    './js/search.js',
    './js/install.js',
    './js/views/home.js',
    './js/views/timetable.js',
    './js/views/info.js',
    './js/views/favorites.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './images/bg.jpg',
    './images/datum.png',
    './data/info.json',
    './data/timetable.json',
    './data/_manifest.json',
    'https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&family=Space+Grotesk:wght@500;700&display=swap'
];

self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_ASSETS))
    );
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

    // Cache-first for our assets
    if (url.origin === self.location.origin || url.hostname === 'fonts.googleapis.com') {
        e.respondWith(
            caches.match(request).then(cached =>
                cached || fetch(request).then(res => {
                    if (res.ok) {
                        const clone = res.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                    }
                    return res;
                }).catch(() => cached)
            )
        );
        return;
    }

    // Network-first for everything else
    e.respondWith(
        fetch(request).catch(() => caches.match(request))
    );
});
