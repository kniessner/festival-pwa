# 🎪 Bucht der Träumer* – Festival PWA Plugin

Offline-capable Progressive Web App for festival websites.
Fetches live content from the main WordPress site, lets admins pick which pages to cache, and serves them as an installable mobile app.

## Features

- **Dynamic page selector** – Admin chooses which WP pages are included
- **Auto-sync** – Fetches and caches content every 6 hours via WP Cron
- **Manual sync** – One-click refresh in admin settings
- **Background sync** – Runs one page per cron step to avoid timeouts on large sites
- **Offline-first** – Service Worker precaches shell + selected pages
- **Snapshot mode** – Builds a self-contained offline mirror of a page (HTML + CSS + images)
- **Real design** – Downloads background images and design tokens from source site
- **Heuristic parsing** – Auto-detects FAQ vs Grid vs Generic layouts
- **PWA installable** – Add to home screen on iOS/Android

## Architecture

```
Plugin
├── Admin Settings       ← Page selector, source URL, app name
├── Content Sync         ← Fetches HTML, extracts content, saves JSON
├── REST API             ← Serves manifest + page JSON + design tokens
├── PWA Frontend         ← Vanilla JS app shell, no build step
└── Service Worker       ← Dynamic cache based on selected pages
```

## Install

1. Copy `festival-pwa/` folder to `wp-content/plugins/`
2. Activate in WP Admin → Plugins
3. Go to **Settings → Festival PWA**
4. Enter source URL (e.g. `https://bucht-der-traeumer.de`)
5. **Tick the pages** you want in the PWA
6. Click **🔄 Sync Content Now**
7. Visit `https://yoursite.com/pwa/` on mobile → Add to Home Screen

## Admin Settings

| Setting | Purpose |
|---------|---------|
| Source Website URL | The WP site to scrape content from |
| App Name | Shown in PWA title bar and install prompt |
| Select Pages | Add pages, choose source, and extraction mode |
| Extraction Mode | Snapshot / Raw HTML / Structured text |
| Urgent Announcement | Banner shown on PWA load |
| Sync Now | Manual trigger to fetch all selected pages |

## REST API Endpoints

| Endpoint | Returns |
|----------|---------|
| `GET /wp-json/festival/v1/manifest` | App name + list of included pages |
| `GET /wp-json/festival/v1/pages/{slug}` | Cached JSON content for that page |
| `GET /wp-json/festival/v1/design` | Design tokens + asset URLs |
| `POST /wp-json/festival/v1/sync` | Trigger manual sync (admin only) |

## Supported Page Types / Extraction Modes

Each PWA page can use one of three extraction modes:

| Mode | What it does | Best for |
|------|--------------|----------|
| **Snapshot** | Downloads the page HTML, CSS, and images into a self-contained offline file (`pwa/snapshots/{slug}.html`) | Complex layouts like `/programm-2026` with timetable filters |
| **Raw HTML** | Keeps original `<main>` markup + styles, rendered inside a Shadow DOM | Pages that need original styling but not all assets offline |
| **Structured** | Auto-detects FAQ / Grid / Generic and extracts clean text | Simple info pages, FAQ, lists |

The sync engine auto-detects layout only in **Structured** mode:

| Type | Detection | Example |
|------|-----------|---------|
| **FAQ** | Multiple h2/h3 + long paragraphs | `/cashless` |
| **Grid** | Multiple h3 with short descriptions | `/performances`, `/workshops` |
| **Generic** | Fallback – full text content | `/info`, `/kontakt` |

## File Structure

```
festival-pwa/
├── festival-pwa.php              ← Plugin bootstrap
├── admin/
│   ├── admin.css                 ← Admin styles (page selector grid)
│   └── admin.js                  ← Checkbox visual toggle
├── includes/
│   ├── class-content-sync.php    ← Fetch, extract, save, design sync
│   ├── class-rest-api.php        ← WP REST endpoints
│   ├── class-pwa-frontend.php    ← Route /pwa/ to app shell
│   └── class-admin.php           ← (optional extended admin)
├── pwa/
│   ├── index.html                ← App shell (cosmic design)
│   ├── js/app.js                 ← Dynamic frontend (fetches manifest)
│   ├── sw.js                     ← Service Worker (dynamic cache)
│   ├── manifest.json             ← PWA install manifest
│   ├── images/                   ← Downloaded design assets
│   │   ├── bg.jpg                ← Background from source WP
│   │   └── datum.png             ← Logo/date image
│   ├── snapshots/                ← Self-contained offline page mirrors
│   │   └── programm-2026.html
│   ├── cache/                    ← Downloaded CSS/images for snapshots
│   └── data/                     ← Cached JSON per page
│       ├── _manifest.json          ← Page list + app config
│       ├── cashless.json
│       ├── performances.json
│       └── workshops.json
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

## How It Works

1. **Admin selects pages** in settings → saved as `festival_pwa_selected_pages`
2. **Sync runs** (manual or cron) → `class-content-sync.php` fetches each page
3. **HTML is parsed** → heuristic detects FAQ/Grid/Generic → structured JSON saved
4. **Design assets downloaded** → background image, logo cached locally
5. **Manifest written** → `_manifest.json` lists included pages for the PWA
6. **PWA loads** → `app.js` fetches manifest, builds nav, loads pages via REST API
7. **Service Worker** → precaches shell + manifest + selected page JSON
8. **Offline mode** → all content served from cache, no internet needed

## Customization

### Adding more page options
Edit the `$default_pages` array in `festival-pwa.php`:

```php
private $default_pages = [
    ['slug' => 'cashless',   'label' => 'Cashless', 'icon' => '💳'],
    ['slug' => 'performances', 'label' => 'Acts', 'icon' => '🎭'],
    // Add your own...
];
```

### Changing the design
The PWA fetches design tokens automatically:
- Background: `pwa/images/bg.jpg`
- Logo: `pwa/images/datum.png`
- Colors: Navy `#080943`, Pink `#b0327a`, Orange `#ff6f21`
- Fonts: Lato + Space Grotesk

Replace images in `pwa/images/` after sync, or edit CSS variables in `pwa/index.html`.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "No pages selected" | Go to Settings → Festival PWA → tick checkboxes → Save |
| "Page not cached" | Click **Sync Content Now** or wait for cron |
| Background not showing | Check `pwa/images/bg.jpg` exists after sync |
| Offline not working | Check Service Worker registered in browser DevTools → Application |

## License

MIT – Festival Tech 2026
