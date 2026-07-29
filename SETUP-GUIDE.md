# 📖 Festival PWA — Step-by-Step Setup Guide

Complete walkthrough for setting up the Festival PWA plugin, from installation to offline-ready mobile app.

---

## Table of Contents

1. [What You Need](#1-what-you-need)
2. [Installation](#2-installation)
3. [Plugin Settings](#3-plugin-settings)
4. [Configuring Pages](#4-configuring-pages)
5. [Running Your First Sync](#5-running-your-first-sync)
6. [Testing the PWA](#6-testing-the-pwa)
7. [Installing on a Phone](#7-installing-on-a-phone)
8. [Verifying Offline Mode](#8-verifying-offline-mode)
9. [Advanced: Adding Remote Pages](#9-advanced-adding-remote-pages)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. What You Need

Before starting, make sure you have:

- **A WordPress site** (where you install this plugin)
- **A source site** — can be the same WP site or a different one
  - If different: the site must be publicly accessible (no login wall)
  - The pages you want to cache must have public HTML output
- **HTTPS on the host site** — required for Service Workers (PWA install)
- **PHP with DOM extension** — `php-xml` must be installed (check with `php -m | grep dom`)
- **Write permissions** on `wp-content/plugins/festival-pwa/pwa/data/` and `pwa/images/`

---

## 2. Installation

### Step 2a: Upload the Plugin

**Method 1 — SFTP / SSH:**
```bash
# On your server
cd /var/www/html/wp-content/plugins/
# Upload or extract the festival-pwa/ folder here
```

**Method 2 — WordPress Admin:**
1. Zip the `festival-pwa/` folder
2. Go to **WP Admin → Plugins → Add New → Upload Plugin**
3. Select the zip and click "Install Now"

### Step 2b: Activate

Go to **WP Admin → Plugins → Installed Plugins**

Find **"Bucht der Träumer* – Festival PWA"** and click **Activate**.

### Step 2c: Check the Menu

After activation, a new menu item appears:

**Settings → Festival PWA**

Click it. You should see the settings page.

---

## 3. Plugin Settings

### 3a. Choose Your Source Website

At the top of the settings page, find **🔗 Source Website**.

**Option A — Use this WordPress site**
- Select this if the festival content lives on the same site where you installed the plugin
- Content is read directly from the WP database (no HTTP requests)
- Faster, more reliable

**Option B — Custom URL**
- Select this if the content is on a different site
- Enter the full URL, e.g. `https://bucht-der-traeumer.de`
- The plugin will fetch pages via HTTP

> **Click "Save Settings"** after choosing.

### 3b. Set the App Name

In the **📱 App Name** field, enter the name guests will see:

- Install prompt title
- Browser tab title
- Home screen icon label

Example: `Bucht der Träumer*` or `Fusion Festival Guide`

---

## 4. Configuring Pages

This is the most important step. Here you define what appears in the PWA.

### 4a. Understanding Page Sources

Each page in the PWA can come from one of three sources:

| Source Type | What it means | Example use |
|-------------|---------------|-------------|
| **Internal WP Page** | A page/post on the same WordPress site | Use existing WP pages like `/about`, `/contact` |
| **From Source Site** | A page on the configured source URL | Fetch `/cashless`, `/performances` from the festival site |
| **Remote URL** | Any absolute URL on the web | Pull in a page from a completely different domain |

### 4b. Adding Your First Page

In the **📄 PWA Pages** section:

1. **Click "➕ Add Page"** — a new row appears
2. **Icon** — enter an emoji, e.g. `💳` or `🎭`
3. **Label** — display name, e.g. `Cashless & TOP-UP`
4. **Slug** — the URL path in the PWA, e.g. `cashless` (becomes `/pwa/#cashless`)
5. **Source Type** — pick from the dropdown
6. **Source Value** — depends on the type:
   - *Internal*: select a WP page from the dropdown
   - *Source*: enter the slug as it appears on the source site (e.g. `cashless`)
   - *Remote*: enter the full URL (e.g. `https://other-site.com/info`)

### 4c. Adding More Pages

Repeat step 4b for each page you want:

| Icon | Label | Slug | Source Type | Source Value |
|------|-------|------|-------------|--------------|
| 💳 | Cashless | cashless | From Source | `cashless` |
| 🎭 | Performances | performances | From Source | `performances` |
| 🛠️ | Workshops | workshops | From Source | `workshops` |
| ℹ️ | Info | info | Internal | *(select your WP info page)* |
| 🎫 | Tickets | tickets | Remote | `https://tickets.example.com/festival` |

### 4d. Set the Start Page

In the **🏠 Start / Entry Page** section:

Pick which page opens when guests launch the PWA. Usually this is:
- **Home** — a landing page with quick links
- **Info** — important announcements first
- **Cashless** — if payment info is critical

If you don't select one, the first page in your list opens by default.

### 4e. Save Settings

**Click "💾 Save Settings"** at the bottom.

---

## 5. Running Your First Sync

After saving, you must sync content to generate the offline cache.

### Step 5a: Click Sync

In the **🔄 Content Sync** section, click:

**🔄 Sync Content Now**

The page will reload. You should see a green success message:

> ✅ Content synced successfully!

### Step 5b: Check Status

Scroll down to **📊 Status & Cached Files**.

You should see:

| Metric | Expected |
|--------|----------|
| Pages configured | Matches how many you added |
| Cached JSON files | Same as above (plus `_manifest.json`) |
| Background image | ✅ |
| Logo image | ✅ |

Under **Cached JSON Files**, you'll see a table with:
- File name (click to view raw JSON)
- PWA page label
- File size
- Last modified date
- REST API link

> **If you see ❌ for images**, the source site might have moved them. Check the URLs in `class-content-sync.php`.

---

## 6. Testing the PWA

### 6a. Open in Browser

At the top of the settings page, click:

**📱 Open PWA** (opens in a new tab)

Or visit directly:
```
https://yoursite.com/pwa/
```

### 6b. What You Should See

- **Cosmic nebula background** (dark blue with stars)
- **Bottom navigation bar** with your page icons
- **Content loads** when you tap each tab
- **Pink/magenta accent colors** on active items

### 6c. Check the REST API

In the Quick Links section, click:

**📋 View Manifest JSON**

You should see JSON like:
```json
{
  "pages": [
    {"slug": "cashless", "label": "Cashless & TOP-UP", "icon": "💳"},
    {"slug": "performances", "label": "Performances", "icon": "🎭"}
  ],
  "app_name": "Bucht der Träumer*",
  "start_page": "cashless",
  "synced_at": 1759946400
}
```

This confirms the backend is serving the page list correctly.

---

## 7. Installing on a Phone

### Android (Chrome)

1. Open `https://yoursite.com/pwa/` in Chrome
2. Wait a few seconds — a pink pill appears at the bottom:

   > 📲 Zum Startbildschirm

3. **Tap it** — a native dialog asks "Add to home screen?"
4. **Tap "Add"**
5. The app icon appears on your home screen
6. **Launch from the icon** — it opens in standalone mode (no browser chrome)

### iOS (Safari)

1. Open `https://yoursite.com/pwa/` in Safari
2. A hint appears: "iOS: Teilen → 'Zum Home-Bildschirm'"
3. Tap the **Share button** (bottom toolbar)
4. Scroll down, tap **"Add to Home Screen"**
5. Tap **"Add"** in the top right
6. The icon appears — launch it

### Verify Install

After installing:
- The app should open **full screen** (no browser address bar)
- The bottom nav should work smoothly
- Swiping between pages should feel like a native app

---

## 8. Verifying Offline Mode

This is the whole point of the PWA. Let's test it.

### Step 8a: Load Content While Online

1. Make sure you're on WiFi or mobile data
2. Open the PWA (browser or installed app)
3. **Visit every page** — tap each bottom nav tab
4. This ensures all pages are cached in the Service Worker

### Step 8b: Go Offline

**Method 1 — Airplane Mode**
1. Turn on **Airplane Mode** on your phone
2. Open the PWA again

**Method 2 — DevTools (desktop)**
1. Press F12 → Network tab
2. Check the **"Offline"** checkbox
3. Reload the page

### Step 8c: Verify

You should see:

- ✅ The app still loads
- ✅ An orange badge at the top: "Offline — Inhalte zwischengespeichert"
- ✅ All your pages still work
- ✅ Content is readable (from cached JSON)

If something doesn't load:
- You might not have visited that page while online yet
- The Service Worker might not have cached it
- Try reloading while online, then go offline again

---

## 9. Advanced: Adding Remote Pages

Sometimes you want to include content from outside the source site.

### Example: External Ticket Shop

1. In PWA Pages, click **Add Page**
2. Set:
   - Icon: 🎫
   - Label: Get Tickets
   - Slug: tickets
   - Source Type: **Remote URL**
   - Source Value: `https://tickets.festivaltickets.de/bucht-der-traeumer`
3. Save Settings
4. Run Sync

The plugin will fetch that external page and cache its content. Guests see it in the PWA nav and can read it offline.

> ⚠️ **Limitations**: The sync engine extracts text content from HTML. Pages that require JavaScript to render (React apps, SPAs) won't work well. Stick to static HTML or WordPress pages.

---

## 10. Troubleshooting

### "No pages selected" error

**Cause**: You haven't added any pages in the PWA Pages section.  
**Fix**: Click "Add Page", fill in the fields, Save Settings, then Sync.

### Sync fails with "Cannot modify header information"

**Cause**: A Syncthing conflict file (`.sync-conflict-*`) is in the plugin folder.  
**Fix**: SSH to server and run:
```bash
cd wp-content/plugins/festival-pwa/
rm -f *.sync-conflict-*
```

### Sync fails with "PCRE2 does not support \\u"

**Cause**: Old regex with Unicode escapes (fixed in v1.3).  
**Fix**: Update to the latest plugin files.

### "Page not cached" when visiting a tab

**Cause**: The page wasn't included in the last sync, or sync failed for that page.  
**Fix**:
1. Check if the JSON file exists: `pwa/data/{slug}.json`
2. Check the REST API: visit `/wp-json/festival/v1/pages/{slug}`
3. Re-run sync
4. Check error log for fetch failures

### Background image not showing

**Cause**: The source site moved or renamed the image.  
**Fix**:
1. Check the image URLs in `includes/class-content-sync.php`
2. Look for the actual background image on the source site
3. Update the URLs in `sync_design_assets()`
4. Re-sync

### Service Worker not registering

**Cause**: You're on `http://` instead of `https://`.  
**Fix**: Service Workers require HTTPS (except `localhost`). Enable SSL on your site.

### Install button never appears (Android)

**Cause**: Chrome hasn't decided the site is "installable" yet.  
**Fix**:
1. Make sure `manifest.json` is valid (check in DevTools → Application → Manifest)
2. Make sure icons exist (192px and 512px)
3. Visit the PWA a few times over a few minutes
4. Chrome will eventually show the prompt

### Content looks different from source site

**Cause**: The sync engine extracts plain text, not full CSS.  
**Fix**: The PWA has its own design system (cosmic theme). If you want to match the source site exactly, edit the CSS variables in `pwa/index.html`.

### iOS shows blank page

**Cause**: iOS Safari has stricter CORS policies for Service Workers.  
**Fix**: Make sure all assets (fonts, images) are served from the same domain or have proper CORS headers.

---

## Quick Reference

### Important URLs

| URL | Purpose |
|-----|---------|
| `https://yoursite.com/pwa/` | The PWA app |
| `https://yoursite.com/wp-json/festival/v1/manifest` | Page list + config |
| `https://yoursite.com/wp-json/festival/v1/pages/{slug}` | Single page JSON |
| `https://yoursite.com/wp-json/festival/v1/design` | Design tokens |
| `https://yoursite.com/wp-admin/options-general.php?page=festival-pwa` | Settings page |

### Important Files

| File | Purpose |
|------|---------|
| `pwa/data/_manifest.json` | Master page list |
| `pwa/data/{slug}.json` | Cached content per page |
| `pwa/images/bg.jpg` | Background image |
| `pwa/images/datum.png` | Logo image |

---

*Need more help? Check the full documentation: `DOCUMENTATION.md`*
