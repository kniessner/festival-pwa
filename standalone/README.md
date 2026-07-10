# 🎪 Festival PWA — Standalone Edition

Self-contained, offline-capable festival guide. No WordPress. No build step. No backend.

## Quick Start

```bash
# 1. Start the local server
./scripts/start.sh

# 2. Open http://localhost:8767/ in your browser
# 3. Add to home screen on your phone for the full PWA experience
```

## Scripts

### `scripts/start.sh [port] [--open]`

Start a local HTTP server for testing.

```bash
./scripts/start.sh           # Default port 8767
./scripts/start.sh 3000      # Custom port
./scripts/start.sh --open    # Auto-open browser
```

### `scripts/config.js`

Interactive configuration: app name, festival date, pages, theme colors.

```bash
node scripts/config.js
```

Walks you through:
- **App name** — displayed in the title bar and install prompt
- **Festival date** — sets the countdown timer
- **Pages** — add/remove content pages (acts, workshops, info, etc.)
- **Theme colors** — background, accent pink, accent orange

Automatically updates:
- `data/_manifest.json`
- `index.html` (title + countdown)
- `manifest.json`
- `sw.js` (cache name → forces refresh)

### `scripts/update.sh [--rest URL | --source URL]`

Pull fresh content. Two modes:

```bash
# REST mode: from a Festival PWA host site's API
./scripts/update.sh --rest https://host-site.com/wp-json/festival/v1

# Source mode: scrape HTML directly from the WordPress site
./scripts/update.sh --source https://bucht-der-traeumer.de
```

**Note:** `bucht-der-traeumer.de` does not have the Festival PWA plugin installed, so `--rest` won't work there. Use `--source` to scrape HTML directly.

What it does:
1. Fetches manifest or scrapes pages
2. Downloads each page's content
3. Updates `standalone.json` with sync timestamp
4. Busts Service Worker cache (renames cache)
5. Updates countdown in `index.html`

### `scripts/deploy.sh [--target-dir DIR] [--zip]`

Prepare a deployment package.

```bash
./scripts/deploy.sh                    # Copy to dist/
./scripts/deploy.sh --zip              # Create dist.zip
./scripts/deploy.sh --target-dir ~/Desktop/festival-pwa --zip
```

Output can be uploaded to:
- **Netlify** — drag-and-drop
- **GitHub Pages** — push to `gh-pages` branch
- **Any static host** — FTP, S3, Vercel, etc.
- **Shared via file** — send the .zip

## Features

- 🔍 **Search** — find any act or workshop instantly
- ⭐ **Favorites** — bookmark items to your personal schedule
- 📋 **My Plan** — view all starred items in one place
- 📴 **Fully offline** — works without internet after first visit
- 📲 **Installable** — add to home screen on iOS/Android
- 🎨 **Configurable** — change name, colors, date, pages without touching code

## File Structure

```
standalone/
├── index.html          ← App shell (inline CSS, search bar, install prompt)
├── manifest.json       ← PWA install config
├── sw.js               ← Service Worker (relative paths, cache versioning)
├── standalone.json     ← Config metadata (source_url, last_synced)
├── js/
│   └── app-v3.js       ← Controller: search, bookmarks, favorites page
├── data/
│   ├── _manifest.json    ← Page list + app config
│   ├── cashless.json     ← FAQ content
│   ├── performances.json ← Grid content
│   └── workshops.json    ← Grid content
├── images/             ← Background + logo
├── icons/              ← 192px + 512px app icons
└── scripts/
    ├── start.sh        ← Start local server
    ├── config.js       ← Interactive configurator
    ├── update.sh       ← Pull content from production API
    └── deploy.sh       ← Prepare deployment package
```

## Data Format

Each `.json` in `data/` follows a typed structure:

**FAQ** (`cashless.json`):
```json
{
  "type": "faq",
  "title": "Cashless & TOP-UP",
  "intro": "...",
  "items": [
    {"question": "...", "answer": "..."}
  ]
}
```

**Grid** (`performances.json`, `workshops.json`):
```json
{
  "type": "grid",
  "title": "Performances",
  "intro": "...",
  "items": [
    {"title": "...", "desc": "..."}
  ]
}
```

## Adding New Pages

1. Create JSON file: `data/mynewpage.json`
2. Add to manifest: edit `data/_manifest.json`
3. Add to controller: edit `js/app-v3.js` — add a case in `loadPage()` if it's a new type
4. Update Service Worker: change `CACHE_NAME` in `sw.js` to bust cache
5. Or just run `node scripts/config.js`

## Updating Content

### Option A: Edit JSON files directly
Open `data/*.json` in any text editor, edit, save, reload browser.

### Option B: Pull from production
```bash
./scripts/update.sh https://yoursite.com/wp-json/festival/v1
```

### Option C: Use the configurator
```bash
node scripts/config.js
```

## Deployment

### Netlify (recommended)
```bash
./scripts/deploy.sh --zip
# Upload dist.zip to app.netlify.com
```

### GitHub Pages
```bash
./scripts/deploy.sh --target-dir /tmp/festival-pages
cd /tmp/festival-pages
git init
git remote add origin https://github.com/you/festival-pwa.git
git checkout -b gh-pages
git add .
git commit -m "Deploy standalone"
git push -u origin gh-pages --force
```

### Any Static Server
```bash
./scripts/deploy.sh
cp -r dist/* /var/www/html/festival/
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Loading..." forever | Run `./scripts/start.sh` — Service Workers need `http://` |
| Install button doesn't appear | Use Chrome on Android, or Safari on iOS |
| Old content after update | Clear browser cache, or change `CACHE_NAME` in `sw.js` |
| Search not working | Check browser console for JSON parse errors |
| Favorites lost | `localStorage` is per-domain. Don't mix `localhost` ports. |

---

*Built for Bucht der Träumer* 2026. Fully offline, zero dependencies.*
