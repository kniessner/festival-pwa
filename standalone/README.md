# 🎪 Festival PWA — Standalone Edition

Self-contained, offline-capable festival guide. No backend of its own — plain
ES modules loaded directly by the browser, no bundler required to run it.
An optional build step (`npm run build`) exists purely to minify/bundle
what gets deployed; the source itself never needs it.

## Quick Start

```bash
# 1. Start a local server (no build step needed)
./scripts/start.sh --open

# 2. Add to home screen on your phone for the full PWA experience
```

No Python? `npm start` works too — runs `server.js`, a zero-dependency
static file server (see File Structure below).

## Architecture

- **`index.html`** — the entire app shell (search bar, header, nav, all the
  modal containers). Everything inside `#content` is rendered by JS.
- **`js/app.js`** — the entry point. Boots the app (`init()`), owns a single
  delegated `click` listener keyed off `data-action` attributes (see
  `actions` map), and wires up language switching, search, and notifications.
- **`js/store.js`** — the one source of truth: `store.pageData` (fetched
  JSON, keyed by slug), `store.lang`, filter/UI state. `loadData()` fetches
  every entry in `DATA_FILES` (config.js) in parallel.
- **`js/router.js`** — `loadPage(index)` swaps `#content`'s `innerHTML` for
  whichever view module renders that page, and sets `document.body.className`
  to `page-<slug>` so CSS can scope itself per page.
- **`js/views/*.js`** — one render function per page (home, timetable,
  timetable-grid, info, favorites). Each exports a `render*(container)`
  function called by the router, plus whatever page-specific interaction
  handlers `app.js` needs to wire into its actions map.
- **`js/i18n.js`** — a flat `{de:{...}, en:{...}}` string table + `t(key, vars)`.
  Content itself (timetable/info/notifications JSON) is localized by fetching
  `data/en/<file>.json` first and falling back to `data/<file>.json` — see
  `fetchLocalized()` in store.js.
- **`sw.js`** — service worker. Precaches the app shell on install, then per
  request: app-shell files → cache-first, `/data/*.json` → stale-while-
  revalidate, `notifications.json` specifically → network-first (see
  [Notifications](#notifications-pwa-push) below for why that one's different).

## File Structure

```
standalone/
├── index.html              ← App shell + all modal containers
├── manifest.json           ← PWA install config (start_url, icons, theme)
├── sw.js                   ← Service worker (see Architecture above)
├── package.json            ← npm start / npm run build
├── server.js               ← zero-dependency static file server (no Python needed)
├── standalone.json         ← sync metadata (source_url, last_synced)
├── js/
│   ├── app.js              ← entry point, action delegation, init()
│   ├── store.js            ← store.pageData, loadData(), fetchLocalized()
│   ├── router.js           ← page switching, nav rendering
│   ├── config.js           ← PAGES, DATA_FILES, localStorage keys
│   ├── i18n.js              ← DE/EN string table + t()
│   ├── favorites.js        ← localStorage favorites (⭐), validity checks
│   ├── notifications.js    ← "PWA Push" popup — see dedicated section below
│   ├── search.js           ← in-app search across all loaded pageData
│   ├── install.js          ← "Add to Home Screen" card + install prompt
│   ├── ui.js               ← shared render helpers (favButton, escapeHtml, card)
│   ├── festival.js         ← festival-day/date-window logic
│   └── views/
│       ├── home.js
│       ├── timetable.js         ← "Program" — chronological list + filters
│       ├── timetable-grid.js    ← "Timetable" — horizontal multi-day grid
│       ├── info.js              ← News / Cashless / FAQs tabs
│       └── favorites.js         ← "My Plan"
├── data/                   ← fetched by store.js; see Data Format below
├── css/                    ← tokens.css, base.css, components.css, views.css
├── images/, icons/
├── dist/                   ← output of `npm run build` (git-tracked, used by
│                              deploy.sh's gh-pages push)
└── scripts/
    ├── start.sh            ← local dev server (Python, falls back to server.js)
    ├── build.js            ← bundles/minifies JS+CSS, compresses images → dist/
    ├── deploy.sh           ← builds dist/ and pushes it to the gh-pages branch
    ├── deploy-prod.sh      ← rsyncs standalone/ to bucht-der-traeumer.de/webapp/
    │                          over SSH, purges WordPress.com's edge cache
    ├── update.sh           ← re-scrapes content from the WP site (see below)
    ├── config.js           ← interactive: app name, festival date, pages, theme colors
    ├── _extract_*.py       ← one HTML scraper per content type (faq/grid/
    │                          program/news) — see update.sh for how they're wired
    └── _build_*.py         ← merge scraped pieces into the final per-page JSON
                               (timetable.json, info.json)
```

## Data Format

Every file in `data/` (and its `data/en/` counterpart) is one of:

**FAQ-shaped** (`cashless.json`, `faqs.json`, `notifications.json`):
```json
{ "type": "faq", "title": "...", "intro": "...", "items": [
  {"question": "...", "answer": "...", "date": "...", "highlight": false}
]}
```

**Timetable** (`timetable.json`, built by `_build_timetable.py` from three
scraped sources — programm-2026.json + performances.json + workshops.json):
```json
{ "events": [...], "filters": { "days": [...], "stages": [...], "categories": [...] } }
```

**Info** (`info.json`, built by `_build_info.py` — a merge, not a scrape):
```json
{ "type": "info", "news": {...}, "cashless": {...}, "faqs": {...} }
```
Note: `info.news` is still populated by the `/news/` page scrape, but the
**News tab no longer displays it** — see below.

## Content pipeline (`scripts/update.sh`)

Two DE + EN passes, each scraping `cashless`, `faqs`, `news`,
`programm-2026`, `performances`, `workshops` from the WordPress site's HTML,
then running `_build_timetable.py` and `_build_info.py` to assemble the
final `timetable.json`/`info.json`. Bumps `sw.js`'s `CACHE_VERSION` to a
timestamp when done. Run it, then `./scripts/start.sh` to check locally,
then `deploy.sh` (GitHub Pages) and/or `deploy-prod.sh` (WordPress.com)
to ship it.

## Notifications ("PWA Push")

This is the newest and most multi-part piece of the app, spanning both this
repo and the separate WordPress plugin (`includes/class-notifications.php`
at the project root) — worth documenting precisely.

**What it is:** admin-authored alerts (classic WP editor, a custom post type
called "PWA Push"), separate from `info.news` (which is scraped from the
site's public `/news/` page). Two independent pipelines feeding the same UI
slot, kept deliberately non-overlapping so neither can clobber the other.

**Where each piece lives:**

| Piece | File | Runs |
|---|---|---|
| CPT + admin UI, meta box (highlight / send-push flags) | `includes/class-notifications.php` (WP plugin) | WordPress admin, on every save |
| JSON rebuild (`{type,title,items:[{id,question,answer,date,time,highlight,push}]}`) | same file, `rebuild_json()` | on `save_post_pwa_notification`, `trashed_post`, `untrashed_post`, `before_delete_post` |
| REST exposure | same file, `register_routes()` | `GET /wp-json/festival/v1/notifications` |
| Fetch into the app | `js/store.js` `loadData()` via `DATA_FILES.notifications` | once at `app.js` `init()` |
| Re-fetch while running | `js/notifications.js` `refreshNotifications()` | on `visibilitychange` → `visible` (app brought back to foreground) |
| "New since last visit" popup | `js/notifications.js` `maybeShowNotifications()` | after every fetch/refresh above |
| Seen-state | `localStorage[NOTIFICATIONS_SEEN_KEY]` (config.js) | written when the popup is dismissed |
| Display in Info page | `js/views/info.js` News tab | reads `store.pageData.notifications`, not `info.news` |
| Caching strategy | `sw.js` `networkFirst()`, routed for any URL ending in `notifications.json` | every fetch of that file |

**Why it's built this way:**

- **Separate `notifications.json` file, not reusing `news.json`**: `news.json`
  is overwritten wholesale by `update.sh`'s scrape and by `deploy-prod.sh`'s
  rsync. If notifications lived in the same file, whichever pipeline ran last
  would silently erase the other's content. `deploy-prod.sh` explicitly
  `--exclude`s `data/notifications.json` from its rsync so the server-side
  copy (written live by the plugin) is never overwritten by a deploy.
- **Dual JSON write** (plugin's own `pwa/data/` *and* the standalone webapp's
  `data/`, configurable via PWA Push → Settings, defaulting to
  `/srv/htdocs/webapp/data`): the plugin has its own separate embedded PWA at
  `/pwa/`; the standalone app this README describes lives at `/webapp/` and
  needed its own copy. (We also explored symlinking `/webapp/` straight into
  the plugin's git-deployed `standalone/` checkout to avoid the dual-write
  entirely — reverted, since this WordPress.com host doesn't serve through
  symlinks. Two-path setup stands.)
- **`network-first` caching, not stale-while-revalidate**: every other data
  file uses stale-while-revalidate (serve cache instantly, refresh in the
  background for *next* time) because timetable/info content barely changes
  minute-to-minute. Notifications are alerts — showing last visit's list
  while a new one silently downloads in the background defeats the point.
- **In-app popup, not OS push**: the "send push" checkbox in the CPT records
  intent, but nothing sends an actual push notification yet — that needs a
  Web Push endpoint, VAPID keys, and a subscription store this project
  doesn't have. The in-app popup + foreground refetch gets "you missed
  something" coverage today with zero extra infrastructure; OS-level push
  is a real follow-up project, not a checkbox away.
- **What it still won't catch**: a notification published while a user is
  actively staring at an already-open, foregrounded tab. That needs polling
  or real push — deliberately not built, since the added complexity wasn't
  judged worth it for how rarely that exact timing would matter.

## Music lineup

A second WP plugin post type (`includes/class-music.php`, CPT `pwa_music_event`)
for the DJ/live-act schedule — title, start/end datetime, and a stage picked
from a fixed 15-stage list. Same save/rebuild/dual-write/REST/network-first
pattern as Notifications above, with one structural difference: **music.json
isn't its own page**. There's no dedicated "Music" tab — its `events` and
`stages` get merged straight into `store.pageData.timetable` (see
`js/music.js` `mergeMusicIntoTimetable()`), because that's the one array
both the Program list and the grid Timetable already read from, and events
get colored by the existing `Music` category swatch (orange) that the grid's
legend already had reserved. The merge re-runs on every fetch (initial load,
language switch, and the same foreground-refresh trigger notifications
uses) and is idempotent — repeated calls replace rather than duplicate the
previously-merged music events/stages/categories. If the user is currently
looking at the Program or grid Timetable page when a background refresh
picks up new music data, `app.js`'s `setupMusicRefresh()` re-renders that
page so it doesn't require a manual navigation to show up.

## Build & Deploy

```bash
npm install               # once, for esbuild + sharp (build.js only)
npm run build             # → dist/: bundled+minified JS, minified CSS/JSON,
                           #   compressed images. Rewrites sw.js's SHELL_ASSETS
                           #   to match (15 JS files → 1 bundle).
./scripts/deploy.sh        # runs the build above, pushes dist/ to gh-pages
./scripts/deploy-prod.sh   # rsyncs standalone/ (unbundled source) to
                           # bucht-der-traeumer.de/webapp/ over SSH, purges
                           # the WordPress.com edge cache afterward
```

Whenever you change anything in `js/`, `css/`, or `index.html`/`sw.js`
directly, bump `sw.js`'s `CACHE_VERSION` — the service worker only knows to
throw away its old cache and re-fetch everything when that string changes.

## Troubleshooting

| Problem | Fix |
|---|---|
| Changes don't show up after editing | Bump `CACHE_VERSION` in `sw.js` — old installs keep serving the previous cache otherwise |
| `deploy-prod.sh` says it deployed but the site looks unchanged | WordPress.com's edge cache — the script already purges it, but if you deployed some other way, run `wp edge-cache purge <url>` over SSH manually |
| Notifications don't show up | Check `data/notifications.json` actually updated server-side (the plugin writes it on publish); the popup only shows entries not already marked seen in `localStorage` |
| Search not working after a page nav | Check the browser console — `js/search.js` rebinds to `#searchInput` on each render, so a raw `innerHTML` swap elsewhere could detach it |
| Favorites "count" looks wrong | `js/favorites.js`'s `countValidFavorites()` filters out favorites whose underlying item no longer exists in the currently loaded data (e.g. after a re-scrape reorders the array) |

---

*Built for Bucht der Träumer 2026.*
