# Standalone PWA — Usability Strategy

**Date:** 2026-07-10
**Context:** Making the `standalone/` version of the Festival PWA a genuinely useful offline festival companion, not just a static demo.

---

## Current Standalone Capabilities

- ✅ Static HTML + vanilla JS (no build step, no backend)
- ✅ Service Worker caches all assets for offline use
- ✅ 4 pages: Home, Cashless (FAQ), Performances (grid), Workshops (grid)
- ✅ Cosmic glassmorphism design, installable on home screen
- ✅ Works from any directory (relative paths fixed)

**What's missing:** user data persistence, search, bookmarks, personal schedule, content freshness signals, easy content updates.

---

## Philosophy: Zero-Build Static-First

The standalone version should remain:
- **Zero build step** — edit files, save, done
- **Static JSON data** — easy to update by non-developers
- **Vanilla JS only** — no frameworks, no npm
- **Fully offline** — everything cached, no API calls
- **Self-contained** — one folder = one working app

This is the superpower. Don't trade it for complexity.

---

## Quick Wins (Implement Now — Low Effort, High Impact)

### 1. Global Search Bar
**What:** A search input that filters across all loaded JSON content (FAQ questions, grid titles/descriptions, page intros).
**Why:** At a festival with 22+ acts and 38+ workshops, scrolling is painful. Search is the fastest way to find something.
**How:** ~40 lines of JS. Add an input to the header, filter JSON data on input, render matching results as cards.
**Effort:** Low
**Impact:** High

### 2. Bookmark / My Favorites
**What:** A star button on every FAQ item and grid card. Toggling saves the item ID to `localStorage`.
**Why:** Festival-goers want to mark "must-see" acts and workshops. Without persistence, they forget.
**How:** ~50 lines. Add a `localStorage` key `bucht-favorites` storing array of `{pageSlug, itemIndex}`. Render a filled star when saved.
**Effort:** Low
**Impact:** High

### 3. "My Schedule" Page
**What:** A new page in the bottom nav (or a filter mode) showing only bookmarked items across all pages.
**Why:** The killer feature of any festival app. "What did I star? What's next?"
**How:** ~60 lines. New render function `renderMySchedule()` that reads favorites from `localStorage` and groups by page.
**Effort:** Low-Medium
**Impact:** Very High

### 4. Last-Updated Timestamp
**What:** Show "Data from [date]" somewhere unobtrusive (footer or settings/about page).
**Why:** Users need to know if they're looking at fresh or stale content. Trust signal.
**How:** Read `synced_at` from `_manifest.json`, format as human-readable date. ~5 lines.
**Effort:** Trivial
**Impact:** Medium

### 5. Hide Empty FAQ Answers
**What:** Instead of showing "Details folgen bald." for every empty answer, collapse the FAQ item so only the question is visible. Tap to expand if an answer exists.
**Why:** 16 empty answers looks broken. Collapsing them keeps the FAQ clean and questions are still useful.
**How:** ~15 lines. In `renderFAQ()`, check if `answer` is empty and add a class that hides the answer div.
**Effort:** Trivial
**Impact:** Medium

---

## Medium Features (Next Phase)

### 6. Inline Content Editor (Organizer Mode)
**What:** A hidden page or overlay (`?editor=1`) that lets organizers edit JSON data directly in the browser and download the updated files.
**Why:** Non-technical organizers need to update content without touching code or running a sync.
**How:** A simple form that loads the current JSON, lets you edit fields, validates, and offers a download. Could also auto-generate the updated `_manifest.json`.
**Effort:** Medium
**Impact:** High (for organizers)

### 7. Add a Timetable / Day Schedule Page
**What:** If performances and workshops have time data, show them in a day-by-day schedule view (Wednesday → Monday).
**Why:** The original v1.0 of this app was a timetable. It's still the most natural way to browse festival content.
**How:** Requires adding `day` + `start` + `end` + `stage` fields to `performances.json` and `workshops.json`. Then a new render function with time-grouped headers.
**Effort:** Medium (requires data model changes)
**Impact:** Very High

### 8. Simple Festival Map
**What:** An SVG or image-based map of the festival grounds with labeled areas (stages, workshops, food, camping, etc.).
**Why:** "Where is the Pyramid Stage?" is the #1 question at any festival.
**How:** A static SVG map (can be designed in Figma/Illustrator) with clickable regions that highlight and show info. Zero JS dependencies.
**Effort:** Medium (requires map asset)
**Impact:** High

### 9. Announcements Banner
**What:** Read an `announcements.json` file and show a dismissible banner for urgent updates ("Main stage moved!", "Rain warning!").
**Why:** Static doesn't mean frozen. Organizers need to push updates.
**How:** Add `announcements.json` to the data folder. On init, check for non-empty entries, render as a dismissible banner. Dismissal stored in `localStorage` by announcement ID.
**Effort:** Low
**Impact:** High

---

## Architecture Recommendations

### Data Persistence Strategy

| What | Where | Why |
|------|-------|-----|
| Static content (FAQ, grid items) | Static JSON files | Zero build, easy to edit, fully offline |
| User favorites/bookmarks | `localStorage` | Simple, works offline, survives reloads |
| Dismissed announcements | `localStorage` | Don't show same banner twice |
| Last-viewed page | `localStorage` | Resume where they left off |
| Search history | `localStorage` | Optional, speeds up repeat searches |

**Avoid IndexedDB** for this use case. It's overkill. `localStorage` is synchronous, simple, and perfectly adequate for bookmarks and preferences.

### Content Update Workflow (Standalone)

```
Organizer edits JSON files (e.g., workshops.json)
    ↓
Update _manifest.json synced_at timestamp
    ↓
Commit/push to GitHub Pages / Netlify / FTP
    ↓
Users open app → Service Worker sees new version → prompts refresh
    ↓
Fresh content served from cache
```

**Key:** The Service Worker should use a versioned cache name. Change the cache name string in `sw.js` with each content update to force a fresh precache.

### Code Sharing Between Production and Standalone

Keep `pwa/js/app.js` and `standalone/js/app-v3.js` in sync:
- Extract shared render functions to a common module (e.g., `shared/renderers.js`)
- Or keep a `diff` checklist in `AUDIT.md` to verify parity
- The standalone version can be thought of as "production with static data instead of REST API"

### Deployment Scenarios for Standalone

| Scenario | How | Best For |
|----------|-----|----------|
| GitHub Pages | Push `standalone/` folder to a repo's `gh-pages` branch | Free hosting, version control |
| Netlify | Drag-and-drop the folder | One-click deploy, custom domain |
| Static file share | Zip the folder, share via WeTransfer/Dropbox | Quick client demo |
| WordPress plugin fallback | If REST API is down, serve static files | Resilience |
| Embedded in another app | Load `standalone/index.html` in a WebView | Native app wrapper |

---

## Top 3 Priority Actions

1. **Implement search + bookmarks + "My Schedule"** — These three features transform the app from a "nice brochure" into a "personal festival companion."

2. **Add the inline editor** — This unlocks the standalone version for non-technical organizers. Without it, standalone is developer-only.

3. **Add a timetable/day view** — This requires data enrichment (add time/location to performances + workshops), but it's the single most useful view for festival-goers.

---

## Anti-Patterns to Avoid

| Don't | Why |
|-------|-----|
| Add a build step (webpack, vite, etc.) | Breaks the zero-build philosophy. Adds complexity for no gain. |
| Use IndexedDB for simple bookmarks | Overkill. localStorage is fine. |
| Fetch data from an API in standalone | Defeats the purpose. Standalone must be fully offline. |
| Add React/Vue/Svelte | Adds ~40KB+ and build complexity. Vanilla JS handles this perfectly. |
| Make the editor require a server | Must work by opening `file://` or static hosting. |
| Cache-bust by appending `?v=123` to URLs | Service Workers cache by full URL. Use cache name versioning instead. |

---

*Strategy complete. Ready for implementation.*
