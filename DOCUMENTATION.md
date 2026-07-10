# 📘 Bucht der Träumer* — Festival PWA

## Complete Documentation

**Version:** 1.2.0  
**Last updated:** 2026-07-10  
**Authors:** Festival Tech

---

## Table of Contents

1. [What is this?](#what-is-this)
2. [Architecture Overview](#architecture-overview)
3. [The Preview / Standalone System](#the-preview--standalone-system)
4. [WordPress Plugin (Production)](#wordpress-plugin-production)
5. [Data Flow](#data-flow)
6. [Design System](#design-system)
7. [File Reference](#file-reference)
8. [Setup & Configuration](#setup--configuration)
9. [Troubleshooting](#troubleshooting)
10. [Deployment Checklist](#deployment-checklist)

---

## What is this?

A Progressive Web App (PWA) for festival websites that works **offline** on mobile phones. Guests can install it to their home screen and access the festival guide, timetable, FAQ, and other info even in areas with no internet.

Built for **Bucht der Träumer*** — a music festival on the countryside with poor mobile coverage. The PWA fetches content from the main WordPress site, caches it locally, and serves it as an installable app.

### Key Features

- **Offline-first** — works without internet after first visit
- **Home screen install** — "Add to Home Screen" on Android + iOS
- **Dynamic page selector** — admin chooses which WP pages to include
- **Auto-sync** — fetches fresh content every 6 hours
- **Real design match** — downloads background + design tokens from source site
- **Zero build step** — pure vanilla JS, no webpack/vite/npm
- **Preview mode** — standalone HTML for testing without WordPress

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    WORDPRESS (Source)                    │
│         https://bucht-der-traeumer.de                    │
│              ↓ HTML pages (public)                      │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼ wp_remote_get()
┌─────────────────────────────────────────────────────────┐
│              FESTIVAL PWA PLUGIN (Host WP)                │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Admin Page  │  │ Content Sync │  │ REST API      │  │
│  │ (settings)  │  │ (fetch+parse)│  │ (serve JSON)  │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
│              ↓ writes JSON to disk                        │
│         pwa/data/{slug}.json                              │
│         pwa/data/_manifest.json                           │
│              ↓ serves at /pwa/                            │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼ fetch()
┌─────────────────────────────────────────────────────────┐
│              BROWSER (Guest phone)                       │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ App Shell   │  │ app.js       │  │ Service Worker│  │
│  │ (index.html)│  │ (controller) │  │ (cache layer) │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
│              ↑ reads from Cache Storage                   │
│              ↑ reads from _manifest.json                  │
└─────────────────────────────────────────────────────────┘
```

**Three layers:**

| Layer | Role | Tech |
|-------|------|------|
| **Source** | Main festival website | WordPress (any host) |
| **Plugin** | Fetches, caches, serves content | PHP + WP REST API |
| **PWA** | Offline app on guest phone | Vanilla JS + Service Worker |

---

## The Preview / Standalone System

### What is it?

The `preview/` folder is a **self-contained, standalone version** of the PWA that runs without WordPress, PHP, or a database. You open `preview/index.html` in any browser and it works immediately.

This is essential for:
- **Design iteration** — tweak CSS/JS and see results instantly
- **Client demos** — show the app to stakeholders before deployment
- **Offline development** — work on a plane, no WP server needed
- **Bug reproduction** — isolate frontend issues from backend problems
- **A/B testing** — duplicate `preview/`, change one thing, compare side-by-side

### How it differs from Production

| Aspect | Preview | Production |
|--------|---------|------------|
| Data source | Static JSON files in `preview/data/` | Fetched from WP REST API |
| Pages | Hardcoded in `js/app-v3.js` | Dynamic from `_manifest.json` |
| Content | Mock / scraped data | Live from source WP site |
| Install prompt | Same JS logic | Same JS logic |
| Service Worker | `preview/sw.js` | `pwa/sw.js` |
| Hosting | Any static server | WordPress plugin |

### Preview File Structure

```
preview/
├── index.html              ← App shell (cosmic design, inline CSS)
├── manifest.json           ← PWA manifest for standalone install
├── sw.js                   ← Service Worker (caches preview assets)
├── js/
│   ├── app-v3.js          ← Main controller (hardcoded PAGES array)
│   ├── app-v2.js          ← Previous version (page-based, local JSON)
│   ├── app-preview.js     ← Original timetable version (day nav, My Plan)
│   ├── db.js              ← IndexedDB wrapper (legacy timetable)
│   └── app-live.js        ← Connects to live WP REST API
├── data/
│   ├── _manifest.json      ← Static manifest with 4 demo pages
│   ├── events.json         ← Mock timetable events
│   ├── cashless.json       ← Scraped FAQ from real site (14 items)
│   ├── performances.json   ← Scraped acts from real site (22 items)
│   └── workshops.json      ← Scraped workshops from real site (38 items)
├── images/
│   ├── bg.jpg              ← Cosmic nebula background
│   └── datum.png           ← Festival date logo
└── css/
    └── app.css              ← Original earthy timetable styles
```

### Running the Preview

**Option 1: Python HTTP server (recommended)**

```bash
cd preview/
python3 -m http.server 8767
# Open http://localhost:8767/ in browser
```

**Option 2: PHP built-in server**

```bash
cd preview/
php -S localhost:8767
```

**Option 3: Direct file open (limited)**

```bash
# Just open the file — Service Worker won't work on file:// URLs
open preview/index.html   # macOS
xdg-open preview/index.html  # Linux
```

> ⚠️ **Service Workers require `http://` or `https://`.** They do NOT work on `file://`. Use a local server for full offline testing.

### Preview Data Format

Each `.json` file in `preview/data/` follows a typed structure:

**FAQ type** (`cashless.json`):
```json
{
  "type": "faq",
  "slug": "cashless",
  "title": "Cashless",
  "intro": "Wichtige Infos zum bargeldlosen Bezahlen...",
  "items": [
    {
      "question": "Wie funktioniert das Cashless-System?",
      "answer": "Du erhältst ein RFID-Bändchen..."
    }
  ]
}
```

**Grid type** (`performances.json`, `workshops.json`):
```json
{
  "type": "grid",
  "slug": "performances",
  "title": "Performances",
  "intro": "Unsere Acts für 2026",
  "items": [
    {
      "title": "Shenanigames",
      "desc": "Interaktives Theater im Wald..."
    }
  ]
}
```

**Home type** (rendered dynamically in JS):
```javascript
// Built from the PAGES array + countdown
renderHome(container)  // in app-v3.js
```

### Adding New Preview Pages

1. Create JSON file: `preview/data/mynewpage.json`
2. Add to manifest: edit `preview/data/_manifest.json`
3. Add to controller: edit `js/app-v3.js` PAGES array:
   ```javascript
   const PAGES = [
     { slug: 'home', label: 'Home', icon: '🏠' },
     { slug: 'cashless', label: 'Cashless', icon: '💳' },
     { slug: 'mynewpage', label: 'My Page', icon: '✨', dataFile: 'mynewpage.json' },
   ];
   ```
4. Add render handler in `loadPage()` if it's a new type

### Preview Versions Explained

| File | Purpose | Status |
|------|---------|--------|
| `app-v3.js` | Current preview — cosmic design, 4 pages | **Active** |
| `app-v2.js` | Page-based controller with local JSON | Legacy |
| `app-preview.js` | Original timetable (day nav, My Plan, IndexedDB) | Legacy |
| `app-live.js` | Connects to live WP REST API for testing | Dev tool |

To switch versions, edit `preview/index.html`:
```html
<!-- Change this line -->
<script src="js/app-v3.js"></script>
<!-- To: -->
<script src="js/app-live.js"></script>
```

---

## WordPress Plugin (Production)

### Installation

1. **Upload** the `festival-pwa/` folder to `wp-content/plugins/`
2. **Activate** in WP Admin → Plugins
3. **Configure** at Settings → Festival PWA
4. **Select pages** you want in the PWA
5. **Click "Sync Content Now"**
6. **Visit** `https://yoursite.com/pwa/` on a phone
7. **Add to Home Screen** when prompted

### Plugin File Structure

```
festival-pwa/                    ← Plugin root
├── festival-pwa.php             ← Bootstrap: constants, class, hooks
├── admin/
│   ├── admin.css                ← Settings page styles (page selector grid)
│   └── admin.js                 ← Checkbox toggle behavior
├── includes/
│   ├── class-content-sync.php   ← Fetches HTML, extracts content, saves JSON
│   ├── class-rest-api.php       ← WP REST endpoints (/manifest, /pages/{slug})
│   ├── class-pwa-frontend.php   ← Intercepts /pwa/ route, serves app shell
│   ├── class-admin.php          ← Extended admin (legacy announcements)
│   ├── class-post-type.php      ← Legacy: festival_event CPT + taxonomy
│   └── class-meta-boxes.php     ← Legacy: event meta fields
├── pwa/                         ← Frontend assets (served at /pwa/)
│   ├── index.html               ← App shell with cosmic design
│   ├── js/app.js                ← Dynamic controller (fetches manifest)
│   ├── js/db.js                 ← IndexedDB wrapper (legacy timetable)
│   ├── sw.js                    ← Service Worker (dynamic caching)
│   ├── manifest.json            ← PWA install config
│   ├── css/app.css              ← Original timetable styles (unused)
│   ├── data/                    ← Cached JSON (auto-generated)
│   │   ├── _manifest.json       ← Page list + app config
│   │   ├── cashless.json
│   │   ├── performances.json
│   │   └── workshops.json
│   ├── images/                  ← Downloaded design assets
│   │   ├── bg.jpg               ← Cosmic background
│   │   └── datum.png            ← Festival logo
│   └── icons/
│       ├── icon-192.png         ← App icon (small)
│       └── icon-512.png         ← App icon (large)
└── preview/                     ← Standalone preview (see above)
```

### Admin Settings Page

Located at **WP Admin → Settings → Festival PWA**

| Setting | Purpose | Default |
|---------|---------|---------|
| Source Website URL | The WP site to scrape | `https://bucht-der-traeumer.de` |
| App Name | PWA title bar text | `Bucht der Träumer*` |
| Select Pages | Checkbox grid of 8 pages | (none selected) |
| Urgent Announcement | Banner on PWA load | (empty) |
| Sync Now | Manual refresh button | — |

### How Page Selection Works

1. Admin ticks checkboxes → saves as `festival_pwa_selected_pages`
2. Sync runs → `class-content-sync.php` iterates only selected slugs
3. For each slug: `wp_remote_get()` fetches HTML → heuristic parser extracts content → saves JSON
4. `_manifest.json` written with the final page list
5. Service Worker reads `_manifest.json` at install → precaches only selected pages
6. Frontend fetches `/manifest` → builds nav tabs dynamically

### REST API Endpoints

| Endpoint | Method | Auth | Returns |
|----------|--------|------|---------|
| `/wp-json/festival/v1/manifest` | GET | None | `{pages, app_name, synced_at}` |
| `/wp-json/festival/v1/pages/{slug}` | GET | None | Page JSON (FAQ/Grid/Generic) |
| `/wp-json/festival/v1/design` | GET | None | Design tokens + asset URLs |
| `/wp-json/festival/v1/sync` | POST | Admin | Triggers manual sync |

### Content Sync Engine

The sync engine (`class-content-sync.php`) fetches raw HTML and auto-detects page layout:

**Heuristic detection:**
```
1. Slug contains "faq" or "question" → FAQ
2. Count h3 headings in <main>
3. If h3s followed by long paragraphs → FAQ
4. Otherwise → Grid
5. Fallback → Generic
```

**Extracted data types:**

| Type | Detection | Example Source Page |
|------|-----------|---------------------|
| FAQ | h2/h3 + long p tags | `/cashless` |
| Grid | h3 with short descriptions | `/performances`, `/workshops` |
| Generic | Full text fallback | `/info`, `/kontakt` |

---

## Data Flow

### First Visit (Online)

```
Guest visits /pwa/
  ↓
index.html loads (from server)
  ↓
app.js runs:
  1. fetch('/wp-json/festival/v1/manifest')
     → gets page list, app name
  2. renderNav() — builds bottom tabs
  3. loadPage(0) — loads home page
     → fetch('/wp-json/festival/v1/pages/home')
     → renders content
  4. registerSW() — registers service worker
  5. setupInstallPrompt() — waits for install event
  ↓
Service Worker installs:
  1. Fetches _manifest.json
  2. Precaches: index.html, app.js, sw.js, CSS, images
  3. Precaches: all selected page JSON files
  4. Precaches: design assets (bg.jpg, datum.png)
  ↓
Guest sees full app, can browse all pages
```

### Subsequent Visit (Offline)

```
Guest visits /pwa/ (no internet)
  ↓
index.html loads from Cache Storage (instant)
  ↓
app.js loads from cache
  ↓
fetch('/manifest') → served from cache
  ↓
All page JSON served from cache
  ↓
Offline badge appears: "Offline — Inhalte zwischengespeichert"
  ↓
App works fully — all pages, all content
```

### Auto-Refresh (Online, Periodic)

```
WP Cron fires every 6 hours
  ↓
class-content-sync::sync_all()
  ↓
Fetches each selected page from source
  ↓
Overwrites JSON files in pwa/data/
  ↓
Rewrites _manifest.json
  ↓
Next guest visit gets fresh content
```

---

## Design System

All design tokens extracted from the real `bucht-der-traeumer.de` website.

### Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#080943` | Deep navy background |
| `--bg-card` | `rgba(15, 18, 130, 0.35)` | Card backgrounds |
| `--accent-pink` | `#b0327a` | Primary accent, active states |
| `--accent-purple` | `#762c8c` | Secondary accent, gradients |
| `--accent-orange` | `#ff6f21` | Countdown, offline badge |
| `--text` | `#f3efdf` | Warm cream text |
| `--text-muted` | `rgba(243, 239, 223, 0.6)` | Secondary text |
| `--border` | `rgba(176, 50, 122, 0.3)` | Card borders |

### Typography

| Role | Font | Weights |
|------|------|---------|
| Body | Lato | 400, 700, 900 |
| Headings | Space Grotesk | 500, 700 |

Loaded from Google Fonts: `https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&family=Space+Grotesk:wght@500;700&display=swap`

### Background

Cosmic nebula image `scrollpage_1920_3.jpg` from the source site:
- Fetched automatically during sync
- Saved to `pwa/images/bg.jpg`
- Applied as `background: var(--bg) url('images/bg.jpg') center top / cover fixed`

### Layout Principles

- **Mobile-first** — designed for 320–414px width
- **Safe areas** — `env(safe-area-inset-top/bottom)` for notched phones
- **Bottom nav** — thumb-reachable, fixed position
- **Sticky header** — fades to transparent on scroll
- **Cards** — glassmorphism with `backdrop-filter: blur(8px)`
- **No tables** — everything is cards, lists, or grids

---

## File Reference

### Production Files

| File | Lines | Purpose |
|------|-------|---------|
| `festival-pwa.php` | ~160 | Plugin bootstrap, admin page, settings registration |
| `includes/class-content-sync.php` | ~333 | Fetch HTML, parse content, save JSON, download assets |
| `includes/class-rest-api.php` | ~80 | REST endpoints: /manifest, /pages/{slug}, /design, /sync |
| `includes/class-pwa-frontend.php` | ~40 | Route /pwa/ to serve app shell with correct headers |
| `pwa/index.html` | ~427 | App shell: viewport meta, inline CSS, install button, nav |
| `pwa/js/app.js` | ~340 | Dynamic controller: fetch manifest, render pages, install prompt |
| `pwa/sw.js` | ~80 | Service Worker: precache shell + manifest + dynamic pages |
| `pwa/manifest.json` | ~25 | PWA manifest: name, icons, theme colors, display mode |

### Preview Files

| File | Lines | Purpose |
|------|-------|---------|
| `preview/index.html` | ~427 | Same app shell as production (cosmic design) |
| `preview/js/app-v3.js` | ~250 | Hardcoded PAGES, loads local JSON, render functions |
| `preview/sw.js` | ~60 | Caches preview assets for offline testing |
| `preview/data/*.json` | varies | Static content: FAQ, grid items, events |
| `preview/images/*` | — | Background + logo (copied from source) |

---

## Setup & Configuration

### Local Development (Preview Mode)

**Step 1 — Start the server:**
```bash
cd /path/to/festival-pwa/preview
python3 -m http.server 8767
```

**Step 2 — Open in browser:**
```
http://localhost:8767/
```

**Step 3 — Enable DevTools:**
- Chrome: F12 → Application → Service Workers
- Check "Update on reload" for SW development
- Check "Bypass for network" to skip cache

**Step 4 — Test offline:**
- DevTools → Network → "Offline" checkbox
- Reload page — should still work
- Check Cache Storage for cached files

### WordPress Production Setup

**Step 1 — Install plugin:**
```bash
# SSH to your WP server
cd /var/www/html/wp-content/plugins/
cp -r /local/path/to/festival-pwa .
# Or upload via WP Admin → Plugins → Add New → Upload
```

**Step 2 — Activate:**
WP Admin → Plugins → Festival PWA → Activate

**Step 3 — Configure:**
WP Admin → Settings → Festival PWA
- Enter source URL: `https://bucht-der-traeumer.de`
- Set app name: `Bucht der Träumer*`
- Tick pages: Cashless, Performances, Workshops, Info
- Save Settings

**Step 4 — Initial sync:**
Click "🔄 Sync Content Now"

**Step 5 — Verify:**
- Check `pwa/data/` folder exists with JSON files
- Visit `https://yoursite.com/pwa/` on phone
- Should see cosmic design with content

**Step 6 — Install on phone:**
- Chrome: tap menu → "Add to Home Screen"
- iOS: Share button → "Add to Home Screen"

### Changing the Source Site

To point at a different WordPress site:

1. **Admin page:** Change "Source Website URL"
2. **Page slugs:** Edit `$default_pages` in `festival-pwa.php`
3. **Design assets:** Edit asset URLs in `class-content-sync.php::sync_design_assets()`
4. **Colors/fonts:** Edit CSS variables in `pwa/index.html`
5. **Re-sync:** Click "Sync Content Now"

### Customizing Page Types

The sync engine auto-detects layout, but you can force a type by slug:

Edit `class-content-sync.php::guess_page_type()`:
```php
private function guess_page_type($xpath, $slug) {
    // Force type by slug
    if ($slug === 'myfaq') return 'faq';
    if ($slug === 'lineup') return 'grid';
    // ... rest of heuristics
}
```

---

## Troubleshooting

### Preview / Standalone Issues

| Problem | Cause | Fix |
|---------|-------|-----|
| "Loading..." forever | Server not running | `python3 -m http.server 8767` |
| SW registration fails | Using `file://` protocol | Must use `http://localhost` |
| Background image missing | `images/bg.jpg` not found | Copy from `pwa/images/` or re-download |
| Pages don't switch | JS error in console | Check `data/_manifest.json` exists |
| Install button doesn't appear | Not Chrome/Android | iOS shows text hint instead |

### WordPress Plugin Issues

| Problem | Cause | Fix |
|---------|-------|-----|
| "Cannot modify header" | Syncthing conflict file | `rm *.sync-conflict-*` |
| `in_array()` TypeError | Option saved as string | `(array) get_option(...)` (fixed in v1.2) |
| `preg_replace()` PCRE2 error | Unicode escapes in regex | Use `#` delimiter (fixed in v1.2) |
| "No pages selected" | No checkboxes ticked | Go to settings, select pages, save |
| Sync returns empty JSON | Source site blocks requests | Check `allow_url_fopen`, firewall, SSL |
| Design assets not downloading | Wrong upload year/month | Edit asset URLs in `sync_design_assets()` |
| Offline not working | SW not registering | Check HTTPS required for SW |
| Cached content is stale | Cron not firing | Check WP Cron is running, or sync manually |

### Checking Logs

```bash
# WordPress / PHP error log
sudo tail -f /var/log/apache2/error.log
sudo tail -f /var/log/nginx/error.log

# Plugin-specific logs (we log to error_log)
grep "Festival PWA" /var/log/apache2/error.log

# Check if sync created files
ls -la wp-content/plugins/festival-pwa/pwa/data/
```

---

## Deployment Checklist

Before going live:

- [ ] Plugin uploaded to `wp-content/plugins/`
- [ ] Plugin activated in WP Admin
- [ ] Source URL configured correctly
- [ ] At least 2 pages selected in settings
- [ ] Manual sync completed successfully
- [ ] `pwa/data/` contains `.json` files
- [ ] `pwa/images/` contains `bg.jpg` and `datum.png`
- [ ] Visit `/pwa/` on phone — design looks correct
- [ ] Install prompt appears (Chrome/Android)
- [ ] iOS shows install hint
- [ ] Turn on airplane mode — app still works
- [ ] All selected pages load offline
- [ ] Cron schedule registered (check with WP Cron plugin)
- [ ] No PHP errors in log
- [ ] HTTPS enabled (required for Service Worker)

---

## Development Notes

### Adding a New Feature

1. **Prototype in preview first** — edit `preview/js/app-v3.js`, test locally
2. **Copy to production** — once working, port changes to `pwa/js/app.js`
3. **Update PHP if needed** — REST endpoints, sync logic
4. **Test on real WP** — upload, activate, sync, verify
5. **Document** — update this file

### Code Style

- **PHP:** WordPress coding standards, `wp_kses_post()` for output, nonces for actions
- **JS:** ES6 (async/await, arrow functions), no frameworks, inline event handlers for simplicity
- **CSS:** CSS variables for theming, `env(safe-area-inset-*)` for notches, `backdrop-filter` for glass

### Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-07 | Initial timetable PWA with CPT + day nav |
| 1.1.0 | 2026-07 | Added content sync from external WP site |
| 1.2.0 | 2026-07 | Page selector, cosmic design, install prompt, preview system |

---

*Built for Bucht der Träumer* 2026. Offline-first festival technology.*
