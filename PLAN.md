# Festival PWA WordPress Plugin — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build a WordPress plugin that provides an offline-capable PWA for festival timetables — installable, cached, day-navigable, with personal scheduling.

**Architecture:** WordPress plugin with a Custom Post Type for events, REST API endpoints for data, and a self-contained PWA frontend (vanilla JS, no build step) served at `/pwa/` via the plugin. A Service Worker caches all assets and data for offline use.

**Tech Stack:** PHP (WordPress), Vanilla JS ES modules, CSS custom properties, Cache API + IndexedDB, no build step.

---

## Task 1: Create Plugin Bootstrap File

**Objective:** Register the plugin header and basic lifecycle hooks.

**Files:**
- Create: `festival-pwa.php` (plugin root)

**Step 1: Write plugin bootstrap**

```php
<?php
/**
 * Plugin Name: Festival PWA
 * Description: Offline-capable festival timetable PWA
 * Version: 1.0.0
 * Author: Deus
 * Text Domain: festival-pwa
 */

if (!defined('ABSPATH')) exit;

define('FESTIVAL_PWA_VERSION', '1.0.0');
define('FESTIVAL_PWA_DIR', plugin_dir_path(__FILE__));
define('FESTIVAL_PWA_URL', plugin_dir_url(__FILE__));

require_once FESTIVAL_PWA_DIR . 'includes/class-post-type.php';
require_once FESTIVAL_PWA_DIR . 'includes/class-rest-api.php';
require_once FESTIVAL_PWA_DIR . 'includes/class-pwa-frontend.php';

add_action('init', ['Festival_Post_Type', 'register']);
add_action('rest_api_init', ['Festival_REST_API', 'register']);
add_action('template_redirect', ['Festival_PWA_Frontend', 'serve']);
```

**Step 2: Verify** — File exists with correct header and constants.

**Step 3: Commit**

---

## Task 2: Create Custom Post Type for Festival Events

**Objective:** Register `festival_event` post type with custom fields for stage, day, times, category.

**Files:**
- Create: `includes/class-post-type.php`
- Create: `includes/class-meta-boxes.php`

**Step 1: Register post type**

```php
<?php
class Festival_Post_Type {
    public static function register() {
        register_post_type('festival_event', [
            'labels' => [
                'name' => 'Festival Events',
                'singular_name' => 'Event',
            ],
            'public' => false,
            'show_ui' => true,
            'supports' => ['title', 'editor', 'thumbnail'],
            'menu_icon' => 'dashicons-calendar-alt',
            'has_archive' => false,
        ]);
    }
}
```

**Step 2: Register taxonomy for Stages**

```php
register_taxonomy('festival_stage', 'festival_event', [
    'labels' => ['name' => 'Stages', 'singular_name' => 'Stage'],
    'hierarchical' => false,
    'show_ui' => true,
]);
```

**Step 3: Add meta boxes for day/time/category**

```php
class Festival_Meta_Boxes {
    public static function init() {
        add_action('add_meta_boxes', [__CLASS__, 'add']);
        add_action('save_post', [__CLASS__, 'save']);
    }

    public static function add() {
        add_meta_box('festival_event_details', 'Event Details', [__CLASS__, 'render'], 'festival_event');
    }

    public static function render($post) {
        $day = get_post_meta($post->ID, '_festival_day', true);
        $start = get_post_meta($post->ID, '_festival_start', true);
        $end = get_post_meta($post->ID, '_festival_end', true);
        $category = get_post_meta($post->ID, '_festival_category', true);
        wp_nonce_field('festival_event_nonce', 'festival_event_nonce');
        ?>
        <p><label>Day: <select name="festival_day">
            <option value="mi" <?php selected($day, 'mi'); ?>>Mi</option>
            <option value="do" <?php selected($day, 'do'); ?>>Do</option>
            <option value="fr" <?php selected($day, 'fr'); ?>>Fr</option>
            <option value="sa" <?php selected($day, 'sa'); ?>>Sa</option>
            <option value="so" <?php selected($day, 'so'); ?>>So</option>
            <option value="mo" <?php selected($day, 'mo'); ?>>Mo</option>
        </select></label></p>
        <p><label>Start: <input type="time" name="festival_start" value="<?php echo esc_attr($start); ?>"></label></p>
        <p><label>End: <input type="time" name="festival_end" value="<?php echo esc_attr($end); ?>"></label></p>
        <p><label>Category: <input type="text" name="festival_category" value="<?php echo esc_attr($category); ?>" placeholder="DJ, Live, Workshop..."></label></p>
        <?php
    }

    public static function save($post_id) {
        if (!wp_verify_nonce($_POST['festival_event_nonce'] ?? '', 'festival_event_nonce')) return;
        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
        update_post_meta($post_id, '_festival_day', sanitize_text_field($_POST['festival_day'] ?? ''));
        update_post_meta($post_id, '_festival_start', sanitize_text_field($_POST['festival_start'] ?? ''));
        update_post_meta($post_id, '_festival_end', sanitize_text_field($_POST['festival_end'] ?? ''));
        update_post_meta($post_id, '_festival_category', sanitize_text_field($_POST['festival_category'] ?? ''));
    }
}
Festival_Meta_Boxes::init();
```

**Step 4: Commit**

---

## Task 3: Create REST API Endpoints

**Objective:** Expose events as JSON at `/wp-json/festival/v1/events` for the PWA to fetch.

**Files:**
- Create: `includes/class-rest-api.php`

**Step 1: Register REST route**

```php
<?php
class Festival_REST_API {
    public static function register() {
        register_rest_route('festival/v1', '/events', [
            'methods' => 'GET',
            'callback' => [__CLASS__, 'get_events'],
            'permission_callback' => '__return_true',
        ]);
        register_rest_route('festival/v1', '/events/(?P<day>[a-z]+)', [
            'methods' => 'GET',
            'callback' => [__CLASS__, 'get_events_by_day'],
            'permission_callback' => '__return_true',
        ]);
    }

    public static function get_events($request) {
        $events = get_posts([
            'post_type' => 'festival_event',
            'posts_per_page' => -1,
            'post_status' => 'publish',
        ]);
        return array_map([__CLASS__, 'format_event'], $events);
    }

    public static function get_events_by_day($request) {
        $day = $request['day'];
        $events = get_posts([
            'post_type' => 'festival_event',
            'posts_per_page' => -1,
            'post_status' => 'publish',
            'meta_key' => '_festival_day',
            'meta_value' => $day,
        ]);
        return array_map([__CLASS__, 'format_event'], $events);
    }

    private static function format_event($post) {
        $stage_terms = get_the_terms($post->ID, 'festival_stage');
        $stage = $stage_terms && !is_wp_error($stage_terms) ? $stage_terms[0]->name : '';
        return [
            'id' => $post->ID,
            'title' => get_the_title($post),
            'description' => apply_filters('the_content', $post->post_content),
            'day' => get_post_meta($post->ID, '_festival_day', true),
            'start' => get_post_meta($post->ID, '_festival_start', true),
            'end' => get_post_meta($post->ID, '_festival_end', true),
            'category' => get_post_meta($post->ID, '_festival_category', true),
            'stage' => $stage,
            'image' => get_the_post_thumbnail_url($post->ID, 'medium'),
        ];
    }
}
```

**Step 2: Verify** — Test via `curl /wp-json/festival/v1/events` after activating plugin.

**Step 3: Commit**

---

## Task 4: Create PWA Frontend Structure

**Objective:** Build the PWA HTML shell, CSS theme (dark earthy like Fusion), and basic JS app shell.

**Files:**
- Create: `pwa/index.html`
- Create: `pwa/css/app.css`
- Create: `pwa/js/app.js`
- Create: `pwa/js/db.js` (IndexedDB wrapper)

**Step 1: Write index.html**

```html
<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#1a0f0a">
<title>Festival Timetable</title>
<link rel="manifest" href="manifest.json">
<link rel="stylesheet" href="css/app.css">
</head>
<body>
<div id="app">
    <header class="app-header">
        <h1>Festival</h1>
        <div class="day-nav" id="dayNav"></div>
    </header>
    <main class="timetable" id="timetable"></main>
    <div class="fab-menu" id="fabMenu">
        <button class="fab" id="btnFilter" aria-label="Filter">☰</button>
        <button class="fab" id="btnMyPlan" aria-label="My Plan">★</button>
    </div>
</div>
<script type="module" src="js/app.js"></script>
</body>
</html>
```

**Step 2: Write CSS (dark earthy theme, Fusion-style)**

```css
:root {
    --bg-dark: #1a0f0a;
    --bg-card: #2a1a12;
    --accent: #c4703a;
    --text: #f5e6d3;
    --text-muted: #a08070;
    --border: #3a2a20;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: var(--bg-dark);
    color: var(--text);
    min-height: 100vh;
    padding-bottom: 80px;
}

.app-header {
    position: sticky;
    top: 0;
    background: var(--bg-dark);
    padding: 12px 16px;
    z-index: 10;
    border-bottom: 1px solid var(--border);
}

.app-header h1 {
    font-size: 1.2rem;
    margin-bottom: 8px;
}

.day-nav {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 4px;
}

.day-nav button {
    width: 40px; height: 40px;
    border-radius: 50%;
    border: 2px solid var(--accent);
    background: transparent;
    color: var(--text);
    font-weight: 600;
    cursor: pointer;
    flex-shrink: 0;
}

.day-nav button.active {
    background: var(--accent);
    color: var(--bg-dark);
}

.time-header {
    position: sticky;
    top: 72px;
    background: var(--bg-dark);
    padding: 8px 16px;
    font-size: 0.85rem;
    color: var(--accent);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    border-bottom: 1px solid var(--border);
    z-index: 5;
}

.event-card {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    gap: 12px;
}

.event-card .info { flex: 1; }

.event-card h3 {
    font-size: 1rem;
    margin-bottom: 4px;
}

.event-card .meta {
    font-size: 0.8rem;
    color: var(--text-muted);
    display: flex;
    gap: 12px;
    align-items: center;
}

.event-card .meta .dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: var(--accent);
}

.event-actions {
    display: flex;
    gap: 8px;
}

.event-actions button {
    width: 36px; height: 36px;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: var(--bg-card);
    color: var(--text);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
}

.event-actions button.saved {
    background: var(--accent);
    border-color: var(--accent);
}

.fab-menu {
    position: fixed;
    bottom: 20px;
    right: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    z-index: 20;
}

.fab {
    width: 56px; height: 56px;
    border-radius: 50%;
    border: none;
    background: var(--accent);
    color: var(--bg-dark);
    font-size: 1.3rem;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
}

/* Offline indicator */
.offline-badge {
    position: fixed;
    top: 0; left: 0; right: 0;
    background: var(--accent);
    color: var(--bg-dark);
    text-align: center;
    padding: 4px;
    font-size: 0.8rem;
    font-weight: 600;
    z-index: 100;
}
```

**Step 3: Write IndexedDB wrapper**

```javascript
// js/db.js
const DB_NAME = 'FestivalPWA';
const DB_VERSION = 1;

export async function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => resolve(req.result);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('events')) {
                db.createObjectStore('events', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('saved')) {
                db.createObjectStore('saved', { keyPath: 'id' });
            }
        };
    });
}

export async function saveEvents(events) {
    const db = await openDB();
    const tx = db.transaction('events', 'readwrite');
    const store = tx.objectStore('events');
    for (const ev of events) store.put(ev);
    return tx.complete || new Promise(r => tx.oncomplete = r);
}

export async function getEvents() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('events', 'readonly');
        const store = tx.objectStore('events');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function toggleSaved(id) {
    const db = await openDB();
    const tx = db.transaction('saved', 'readwrite');
    const store = tx.objectStore('saved');
    const existing = await new Promise((r, rej) => {
        const q = store.get(id);
        q.onsuccess = () => r(q.result);
        q.onerror = () => rej(q.error);
    });
    if (existing) {
        store.delete(id);
        return false;
    } else {
        store.put({ id, savedAt: Date.now() });
        return true;
    }
}

export async function getSavedIds() {
    const db = await openDB();
    const saved = await new Promise((resolve, reject) => {
        const tx = db.transaction('saved', 'readonly');
        const store = tx.objectStore('saved');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return saved.map(s => s.id);
}
```

**Step 4: Write app.js (main controller)**

```javascript
// js/app.js
import { saveEvents, getEvents, toggleSaved, getSavedIds } from './db.js';

const API_BASE = '/wp-json/festival/v1';
const DAYS = ['mi','do','fr','sa','so','mo'];
const DAY_LABELS = { mi:'Mi', do:'Do', fr:'Fr', sa:'Sa', so:'So', mo:'Mo' };

let currentDay = 'fr';
let allEvents = [];
let savedIds = [];
let showOnlySaved = false;

async function init() {
    renderDayNav();
    await loadEvents();
    setupOfflineIndicator();
    setupInstallPrompt();
}

function renderDayNav() {
    const nav = document.getElementById('dayNav');
    nav.innerHTML = DAYS.map(d =>
        `<button class="${d === currentDay ? 'active' : ''}" data-day="${d}">${DAY_LABELS[d]}</button>`
    ).join('');
    nav.addEventListener('click', (e) => {
        if (e.target.dataset.day) {
            currentDay = e.target.dataset.day;
            showOnlySaved = false;
            renderDayNav();
            renderTimetable();
        }
    });
}

async function loadEvents() {
    try {
        const res = await fetch(`${API_BASE}/events`);
        allEvents = await res.json();
        await saveEvents(allEvents);
    } catch (err) {
        console.log('Offline mode — loading from cache');
        allEvents = await getEvents();
    }
    savedIds = await getSavedIds();
    renderTimetable();
}

function renderTimetable() {
    const container = document.getElementById('timetable');
    let events = allEvents.filter(e => e.day === currentDay);
    if (showOnlySaved) events = events.filter(e => savedIds.includes(e.id));

    const grouped = groupByTime(events);

    container.innerHTML = Object.entries(grouped).map(([time, evs]) => `
        <div class="time-header">${time}</div>
        ${evs.map(renderEventCard).join('')}
    `).join('');

    container.addEventListener('click', handleEventClick);
}

function groupByTime(events) {
    return events.sort((a,b) => a.start.localeCompare(b.start))
        .reduce((acc, ev) => {
            const t = ev.start || '??';
            (acc[t] = acc[t] || []).push(ev);
            return acc;
        }, {});
}

function renderEventCard(ev) {
    const saved = savedIds.includes(ev.id);
    return `
    <div class="event-card" data-id="${ev.id}">
        <div class="info">
            <h3>${escapeHtml(ev.title)}</h3>
            <div class="meta">
                <span class="dot"></span>
                <span>${escapeHtml(ev.category)}</span>
                <span>${escapeHtml(ev.start)}–${escapeHtml(ev.end)}</span>
                <span>${escapeHtml(ev.stage)}</span>
            </div>
        </div>
        <div class="event-actions">
            <button class="btn-save ${saved ? 'saved' : ''}" data-id="${ev.id}">${saved ? '✓' : '+'}</button>
        </div>
    </div>`;
}

async function handleEventClick(e) {
    const btn = e.target.closest('.btn-save');
    if (!btn) return;
    const id = parseInt(btn.dataset.id);
    const saved = await toggleSaved(id);
    savedIds = await getSavedIds();
    renderTimetable();
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[m]));
}

function setupOfflineIndicator() {
    const update = () => {
        document.body.classList.toggle('is-offline', !navigator.onLine);
        if (!navigator.onLine) {
            const badge = document.createElement('div');
            badge.className = 'offline-badge';
            badge.textContent = 'Offline — cached data';
            if (!document.querySelector('.offline-badge')) document.body.appendChild(badge);
        } else {
            document.querySelector('.offline-badge')?.remove();
        }
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
}

function setupInstallPrompt() {
    let deferredPrompt;
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        // Could show an "Install" FAB here
    });
}

document.getElementById('btnMyPlan').addEventListener('click', () => {
    showOnlySaved = !showOnlySaved;
    renderTimetable();
});

init();
```

**Step 5: Commit**

---

## Task 5: Create Service Worker for Offline Caching

**Objective:** Cache the PWA shell, assets, and event data so the app works offline.

**Files:**
- Create: `pwa/sw.js`

**Step 1: Write Service Worker**

```javascript
const CACHE_NAME = 'festival-pwa-v1';
const STATIC_ASSETS = [
    '/pwa/',
    '/pwa/index.html',
    '/pwa/css/app.css',
    '/pwa/js/app.js',
    '/pwa/js/db.js',
    '/pwa/manifest.json'
];

// Install: cache static shell
self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activate: clean old caches
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// Fetch: cache-first for static, network-first for API with fallback
self.addEventListener('fetch', (e) => {
    const { request } = e;
    const url = new URL(request.url);

    // API requests: network first, then cache
    if (url.pathname.startsWith('/wp-json/festival/v1/')) {
        e.respondWith(
            fetch(request)
                .then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                    return response;
                })
                .catch(() => caches.match(request))
        );
        return;
    }

    // Static assets: cache first
    e.respondWith(
        caches.match(request).then(cached => {
            if (cached) return cached;
            return fetch(request).then(response => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                return response;
            });
        })
    );
});
```

**Step 2: Register SW in app.js** — Add to bottom of `js/app.js`:

```javascript
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/pwa/sw.js')
        .then(reg => console.log('SW registered'))
        .catch(err => console.log('SW failed', err));
}
```

**Step 3: Commit**

---

## Task 6: Create Web App Manifest

**Objective:** Make the app installable with a proper manifest.json.

**Files:**
- Create: `pwa/manifest.json`

```json
{
    "name": "Festival Timetable",
    "short_name": "Festival",
    "start_url": "/pwa/",
    "display": "standalone",
    "background_color": "#1a0f0a",
    "theme_color": "#c4703a",
    "orientation": "portrait",
    "icons": [
        { "src": "/pwa/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
        { "src": "/pwa/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
    ]
}
```

**Step 2: Commit**

---

## Task 7: Create PWA Frontend Router (PHP)

**Objective:** Serve the PWA at `/pwa/` from WordPress without conflicting with other routes.

**Files:**
- Create: `includes/class-pwa-frontend.php`

```php
<?php
class Festival_PWA_Frontend {
    public static function serve() {
        $uri = $_SERVER['REQUEST_URI'];
        if (strpos($uri, '/pwa/') !== 0 && $uri !== '/pwa') return;

        // Don't let WordPress template system interfere
        remove_all_actions('template_redirect');

        $file = FESTIVAL_PWA_DIR . 'pwa' . str_replace('/pwa', '', $uri);
        if (is_file($file) && is_readable($file)) {
            $ext = pathinfo($file, PATHINFO_EXTENSION);
            $mime = ['css'=>'text/css','js'=>'application/javascript','json'=>'application/json','png'=>'image/png'][ $ext ] ?? 'text/html';
            header('Content-Type: ' . $mime);
            readfile($file);
            exit;
        }

        // Default: serve index.html (SPA behavior)
        if ($uri === '/pwa/' || $uri === '/pwa') {
            header('Content-Type: text/html');
            readfile(FESTIVAL_PWA_DIR . 'pwa/index.html');
            exit;
        }
    }
}
```

**Step 2: Commit**

---

## Task 8: Add Admin Settings Page

**Objective:** Allow admins to configure the PWA name, colors, and push urgent announcements.

**Files:**
- Create: `includes/class-admin.php`
- Modify: `festival-pwa.php` — add `require_once`

**Step 1: Admin page with settings**

```php
<?php
class Festival_Admin {
    public static function init() {
        add_action('admin_menu', [__CLASS__, 'menu']);
        add_action('admin_init', [__CLASS__, 'settings']);
    }

    public static function menu() {
        add_submenu_page('edit.php?post_type=festival_event', 'PWA Settings', 'PWA Settings', 'manage_options', 'festival-pwa-settings', [__CLASS__, 'page']);
    }

    public static function settings() {
        register_setting('festival_pwa', 'festival_pwa_name');
        register_setting('festival_pwa', 'festival_pwa_announcement');
    }

    public static function page() {
        ?>
        <div class="wrap"><h1>Festival PWA Settings</h1>
        <form method="post" action="options.php">
            <?php settings_fields('festival_pwa'); do_settings_sections('festival_pwa'); ?>
            <table class="form-table">
                <tr><th>PWA Name</th><td><input type="text" name="festival_pwa_name" value="<?php echo esc_attr(get_option('festival_pwa_name', 'Festival')); ?>"></td></tr>
                <tr><th>Urgent Announcement</th><td><textarea name="festival_pwa_announcement" rows="3" cols="50"><?php echo esc_textarea(get_option('festival_pwa_announcement', '')); ?></textarea></td></tr>
            </table>
            <?php submit_button(); ?>
        </form>
        </div>
        <?php
    }
}
Festival_Admin::init();
```

**Step 2: Wire into REST API** — Add `/announcement` endpoint in `class-rest-api.php` that returns `get_option('festival_pwa_announcement')`.

**Step 3: Show announcement in PWA** — In `js/app.js`, fetch `/wp-json/festival/v1/announcement` on init and display as overlay modal if non-empty.

**Step 4: Commit**

---

## Task 9: Generate Placeholder Icons

**Objective:** Create 192x192 and 512x512 placeholder icons for the manifest.

**Files:**
- Create: `pwa/icons/icon-192.png`
- Create: `pwa/icons/icon-512.png`

Use the `image_generate` skill to create a dark, earthy festival-themed icon. Prompt: "Minimalist dark brown and copper festival icon, geometric stage silhouette, square format, no text, high contrast, suitable for app icon"

**Step 2: Commit**

---

## Task 10: End-to-End Testing Checklist

**Objective:** Verify everything works together.

**Verify:**
1. Activate plugin in WordPress admin
2. Create 3+ test events across different days/stages
3. Visit `/pwa/` — timetable loads with day selector
4. Tap + on events — saved state persists on reload
5. Switch to My Plan — only saved events shown
6. Go offline (DevTools → Network → Offline) — page still works, shows offline badge
7. Install prompt appears (or simulate with DevTools → Application → Manifest)
8. Admin settings page saves name and announcement
9. Announcement appears as overlay on PWA load

**Step 2: Document any fixes needed, commit final changes**

---

## Summary

| Task | File(s) | What |
|------|---------|------|
| 1 | `festival-pwa.php` | Plugin bootstrap |
| 2 | `includes/class-post-type.php`, `class-meta-boxes.php` | Custom post type + fields |
| 3 | `includes/class-rest-api.php` | JSON API for events |
| 4 | `pwa/index.html`, `css/app.css`, `js/app.js`, `js/db.js` | PWA frontend |
| 5 | `pwa/sw.js` | Offline caching |
| 6 | `pwa/manifest.json` | Installability |
| 7 | `includes/class-pwa-frontend.php` | Route `/pwa/` |
| 8 | `includes/class-admin.php` | Admin settings + announcements |
| 9 | `pwa/icons/*.png` | App icons |
| 10 | — | E2E testing |
