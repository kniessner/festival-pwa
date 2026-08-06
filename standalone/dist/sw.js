/*
 * Festival PWA Standalone Service Worker — hardened offline caching.
 *
 * Strategy:
 *   - App shell / static assets  → Cache-First
 *   - Manifest + page JSON data  → Stale-While-Revalidate
 *   - Cross-origin assets        → Cache-First only for CORS/basic responses
 */

const CACHE_VERSION = '1785992256';
const APP_NAME = 'bucht-standalone';
const CACHE_NAME = `${APP_NAME}-v${CACHE_VERSION}`;

// All local assets required for the app shell to work offline.
//
// MAINTENANCE: when adding a new source file (js/*.js, css/*.css, images/*,
// data/*.json), also list it here so it precaches on install — otherwise a
// user who installs the PWA and then goes offline will see a broken app the
// first time that file is requested. Bump CACHE_VERSION above (fresh Unix
// timestamp) on the same commit so the service worker rebuilds its cache
// instead of serving the stale list. scripts/build.js reminds you about
// CACHE_VERSION but does not touch this list.
const SHELL_ASSETS = [
    './',
    './index.html',
    './css/tokens.css',
    './css/base.css',
    './css/components.css',
    './css/views.css',
    './fonts/InstrumentSans-Variable.ttf',
    './fonts/InstrumentSans-Italic-Variable.ttf',
    './fonts/Lato-Regular.ttf',
    './fonts/Lato-Bold.ttf',
    './fonts/Megan-Display.otf',
    './fonts/Sunday-Regular.ttf',
    './fonts/JosefinSans-SemiBold.woff2',
    './js/app.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-180.png',
    './images/frame.png',
    './images/datum.png',
    './data/info.json',
    './data/timetable.json',
    './data/stages.geojson',
    './data/en/timetable.json',
    './data/_manifest.json'
];

const FONT_URL = 'https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&family=Space+Grotesk:wght@500;700&display=swap';

// ── Helpers ───────────────────────────────────────────────────────────────

function isSameOrigin(url) {
    return url.origin === self.location.origin;
}

function isLocalAsset(url) {
    // In standalone all requests are relative to the deployment folder.
    // We treat same-origin requests + Google Fonts as app assets.
    return isSameOrigin(url) ||
           url.hostname === 'fonts.googleapis.com' ||
           url.hostname === 'fonts.gstatic.com';
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

// ── Install: shell atomically, then data + fonts best-effort ──────────────

async function precacheShell() {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(SHELL_ASSETS);

    try {
        const fontRes = await fetchWithTimeout(FONT_URL, 10000);
        if (fontRes.ok) await cache.put(FONT_URL, fontRes);
    } catch (e) {
        console.log('[SW] Font CSS precache failed', e.message);
    }
}

async function precacheData() {
    const cache = await caches.open(CACHE_NAME);

    let manifest;
    try {
        const res = await fetchWithTimeout('./data/_manifest.json', 10000);
        if (!res.ok) throw new Error('manifest fetch failed');
        manifest = await res.json();
        await cache.put('./data/_manifest.json', res.clone());
    } catch (e) {
        console.log('[SW] Manifest precache failed', e.message);
        return;
    }

    // Discover any additional data files referenced by the manifest pages.
    const dataFiles = new Set(['./data/_manifest.json']);
    (manifest.pages || []).forEach(p => {
        if (!p.slug) return;
        dataFiles.add(`./data/${p.slug}.json`);
        dataFiles.add(`./data/en/${p.slug}.json`);
    });

    const results = await Promise.allSettled(
        Array.from(dataFiles).map(async (url) => {
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
    console.log(`[SW] Precached ${cached}/${dataFiles.size} data files, ${failed} failed`);
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

// ── Activate: delete old caches, take control ─────────────────────────────

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

// ── Fetch strategies ─────────────────────────────────────────────────────

async function cacheFirst(request, fallbackToNetwork = true) {
    const cache = await caches.open(CACHE_NAME);
    // ignoreSearch: the precached shell entries have no query string, but
    // real requests do (?v=... cache-busting, and now start_url's
    // ?page=favorites for the installed-app launch) — without this, an
    // offline launch from the home-screen icon would miss the cache and
    // fail instead of falling back to network.
    const cached = await cache.match(request, { ignoreSearch: true });
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

// Notifications and music are both meant to feel current — new lineup
// announcements and alerts are exactly the content where staleness is most
// noticeable. Stale-while-revalidate would show last visit's list first and
// only pick up changes on the visit *after* that. Try the network first
// instead; fall back to cache only when actually offline.
// 12s, not the 6s this started as — cellular round-trips (no wifi, weak
// signal) routinely exceeded a shorter timeout, silently falling back to
// stale cache instead of showing what was actually just published.
async function networkFirst(request, ms = 12000) {
    const cache = await caches.open(CACHE_NAME);
    try {
        const res = await fetchWithTimeout(request, ms);
        if (res.ok) await putCache(request, res.clone());
        return res;
    } catch (err) {
        const cached = await cache.match(request, { ignoreSearch: true });
        return cached || new Response('Offline and not cached', { status: 503 });
    }
}

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
        if (event) event.waitUntil(networkPromise);
        return cached;
    }

    const fresh = await networkPromise;
    return fresh || new Response('Offline and not cached', { status: 503 });
}

// Manual "refresh" action (js/store.js's refreshAllData()) — deliberately
// bypasses every strategy above, including their cache-on-failure fallback.
// A user tapping refresh wants to know whether it actually worked; silently
// handing back stale cache on failure (like staleWhileRevalidate/
// networkFirst do for the ambient background case) would look like success
// when it wasn't. Returning a clear failure here lets the client decide to
// keep showing its current in-memory data instead — see refreshAllData()'s
// per-slug try/catch in store.js.
async function networkOnly(request) {
    try {
        const res = await fetchWithTimeout(request, 12000);
        if (res.ok) {
            // Cache under the canonical URL (no ?forceRefresh param), not
            // the request's actual URL — otherwise this lands in a cache
            // entry a later plain reload never looks up (staleWhileRevalidate
            // does an exact cache.match(), no ignoreSearch), so the reload
            // would miss and fall back to whatever was cached before this
            // refresh instead of showing the data it just fetched.
            const canonicalUrl = new URL(request.url);
            canonicalUrl.searchParams.delete('forceRefresh');
            await putCache(new Request(canonicalUrl.toString()), res.clone());
        }
        return res;
    } catch (err) {
        return new Response('Refresh failed — network unavailable', { status: 503 });
    }
}

async function crossOriginAsset(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
        const res = await fetch(request);
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

    // Local app assets + Google Fonts
    if (isLocalAsset(url)) {
        if (url.pathname.includes('/data/') && url.searchParams.has('forceRefresh')) {
            e.respondWith(networkOnly(request));
        } else if (url.pathname.endsWith('notifications.json') || url.pathname.endsWith('music.json')) {
            e.respondWith(networkFirst(request));
        } else if (url.pathname.includes('/data/')) {
            e.respondWith(staleWhileRevalidate(request, e));
        } else {
            e.respondWith(cacheFirst(request));
        }
        return;
    }

    // Cross-origin assets referenced by content (images, CSS, fonts).
    e.respondWith(crossOriginAsset(request));
});

// ── Push notifications ──────────────────────────────────────────────────────
//
// Payload shape is set server-side by class-push.php's send_to_all():
// {title, body, url}. url is optional (defaults to the app root below);
// class-notifications.php doesn't currently set one, but the shape leaves
// room for a future deep link (e.g. straight to the News tab).

self.addEventListener('push', e => {
    let payload = { title: 'Bucht der Träumer', body: '' };
    try {
        if (e.data) payload = { ...payload, ...e.data.json() };
    } catch (err) {
        console.log('[SW] Push payload parse failed', err.message);
    }

    e.waitUntil(
        self.registration.showNotification(payload.title, {
            body: payload.body,
            icon: './icons/icon-192.png',
            badge: './icons/icon-192.png',
            data: { url: payload.url || './' },
        })
    );
});

self.addEventListener('notificationclick', e => {
    e.notification.close();
    const targetUrl = e.notification.data?.url || './';

    e.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            // Prefer focusing an already-open tab over stacking a new one —
            // most opens will be someone re-opening the installed app they
            // already have running/backgrounded. That tab is already on
            // whatever page it was on, though, so it needs telling where to
            // go (app.js's message listener reads targetUrl's ?notif= param
            // and routes there) — openWindow's fresh document load reads
            // the same param straight off location.search instead, no
            // message needed.
            for (const client of clientList) {
                if (client.url.includes(self.registration.scope) && 'focus' in client) {
                    client.postMessage({ type: 'notification-click', url: targetUrl });
                    return client.focus();
                }
            }
            return self.clients.openWindow(targetUrl);
        })
    );
});

// ── Message handling ──────────────────────────────────────────────────────

self.addEventListener('message', e => {
    if (!e.data) return;
    if (e.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
