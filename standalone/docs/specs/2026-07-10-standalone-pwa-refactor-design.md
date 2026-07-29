# Standalone PWA — Refactor & Modernize Design

**Date:** 2026-07-10
**Scope:** `2026-festival-pwa/standalone/` ONLY. No changes to the parent `festival-pwa` app, the `bucht-pwa` project, or the WordPress plugin.
**Goal:** Split the monolithic `index.html` into maintainable HTML/CSS/JS files, remove dead code, reduce duplication, and modernize the code within the project's **zero-build, vanilla, no-npm, no-framework** philosophy (per `STRATEGY.md`).

---

## Constraints (non-negotiable, from STRATEGY.md)

- **Zero build step** — no npm, no bundler, no transpile. Edit files, reload, done.
- **Vanilla JS only** — no React/Vue/Svelte. ES modules via native `<script type="module">`.
- **Static JSON data** — no API calls; fully offline after first load.
- **Self-contained** — one folder = one working app; must work on any static host.

## Guiding principle

This is a **behavior-preserving refactor**. Same visuals, same interactions, same data.
The only intentional functional changes are the two bug fixes in "Bug fixes" below.

---

## 1. Target file structure

### HTML
`index.html` shrinks from **1631 → ~60 lines** — shell only: `<head>` (meta, manifest, icons, font + CSS links), `<main>` with `#app-header`, `#searchResults`, `#content`, `#pageNav`, and one `<script type="module" src="js/app.js">`.

Cleanup during extraction:
- Remove stray WordPress cruft (`wp-block-heading has-text-align-center`, `eplus-wrapper`, commented-out blocks).
- The hardcoded remote `<video>` (points at `bucht-der-traeumer.de`) breaks offline — see Bug fixes.

### CSS — split the 1577-line inline `<style>` by concern (4 files, linked directly, no `@import`)
```
css/
  tokens.css       :root custom properties (cosmic purple theme, spacing, radii)
  base.css         reset, html/body, typography, layout primitives, utilities
  components.css   cards, bottom-nav, search bar, install prompt, toast, badges, offline badge
  views.css        home/hero, timetable (day tabs, hour groups, event cards, filter panel), info tabs, faq accordion, favorites
```
- Delete orphaned `css/app.css` (unused brown/orange theme, never linked).

### JS — split `app-v3.js` (906 lines) into ES modules
```
js/
  app.js          entry: bootstrap init(), register SW, wire delegated event listeners
  config.js       PAGES, DATA_FILES, FAV_KEY, FESTIVAL_DATES, WEEKDAY_MAP, festival start
  store.js        shared mutable state (currentPage, pageData, ttFilters) + loadData()
  favorites.js    getFavorites / toggleFavorite / isFavorite
  festival.js     getEffectiveFestivalDay(), isEventRunning()  — single source of festival-day logic
  ui.js           escapeHtml, textToHtml, showToast, favButton(), card(), renderFaqList()
  search.js       setupSearch, doSearch, renderSearchResults, scrollToItem
  router.js       loadPage(), renderNav()
  install.js      setupInstallPrompt + offline indicator + toast wiring
  views/
    home.js       renderHome
    timetable.js  renderTimetable, refreshTimetable, renderEventCard, filters, scrollToCurrentTime
    info.js       renderInfo (news/cashless/faqs tabs), switchInfoTab
    favorites.js  renderFavorites, toggleFavFromCard
```

### Deletions (confirmed dead)
`css/app.css`, `js/app-v2.js`, `js/app-live.js`, `js/app-preview.js`, `app-preview.js` (root), `js/db.js`, dead `renderFAQ()` inside the old controller.

---

## 2. Event handling — delegation (replaces inline onclick)

ES module functions are not global, so all inline `onclick="..."` handlers are replaced with **`data-action` attributes + a small set of delegated listeners**.

- Templates emit e.g. `<button data-action="load-page" data-page="1">`, `<button data-action="toggle-fav" data-page="timetable" data-index="5">`, `<div data-action="toggle-event">`, `<button data-action="switch-info-tab" data-tab="cashless">`, `<button data-action="toggle-filter">`, etc.
- A single delegated `click` listener resolves `e.target.closest('[data-action]')` and dispatches to an `actions` map.
- Accordion/detail toggles that currently mutate inline `style.display` move to a CSS `.open` class toggle (behavior identical, cleaner).
- No functions are attached to `window`.

---

## 3. Duplicate code to consolidate

| Duplication today | Consolidated to |
|---|---|
| `weekdayMap`/`festivalDates`→`effectiveDay` computed in `getCurrentFestivalDay`, `isEventRunning`, `scrollToCurrentTime` | one `getEffectiveFestivalDay()` in `festival.js` |
| FAQ accordion rendered + wired 3× (cashless panel, faqs panel, dead `renderFAQ`) | one `renderFaqList(items, page)` + one delegated accordion behavior |
| Favorite-button markup repeated in every card | `favButton(page, index)` helper |
| grid-card title/desc/meta markup repeated (search, favorites) | `card(...)` helper |

---

## 4. Bug fixes (intentional, folded into the refactor)

1. **`sw.js` `SHELL_ASSETS` is stale** — it precaches `data/cashless.json` + `data/faqs.json`, but the app now fetches `data/info.json` + `data/timetable.json`. Sync the precache list to the files the app actually loads (+ the new CSS files). Bump `CACHE_NAME`.
2. **Offline-breaking remote assets** — the hero `<video>` and poster are loaded from `bucht-der-traeumer.de`. Keep it network-only and non-blocking so it degrades gracefully offline (already the SW's network-first path); do not add it to the precache. Google Fonts stays in `SHELL_ASSETS` (already handled). Flag the video to the user as "not offline" rather than downloading a large asset without approval.

---

## 5. index.html + sw.js wiring changes

- `index.html`: add the 4 `<link rel="stylesheet">` tags and swap the single `<script src="js/app-v3.js">` for `<script type="module" src="js/app.js">`.
- `sw.js`: `SHELL_ASSETS` updated to `./index.html`, `./js/app.js` + module files, the 4 CSS files, `./data/info.json`, `./data/timetable.json`, `./data/_manifest.json`, icons, images, fonts. Bump `CACHE_NAME`.
- `scripts/config.js` references (title/countdown/cache-name rewriting) verified to still match the new markup; adjust its selectors only if the extraction changes the anchors it edits.
- `dist/` is build output from `deploy.sh` and is regenerated — not hand-edited.

---

## 6. Verification (before claiming done)

Run `scripts/start.sh` and drive each flow, confirming parity with current behavior:
- Home: quick-nav buttons, info cards, favorites count badge.
- Timetable: day tabs, stage/category/genre filters + reset, favorite toggle, event-detail expand/collapse, auto-scroll to current time, "running" highlight.
- Info: news/cashless/faqs tab switching, FAQ accordion open/close (single-open per panel).
- Search: ≥2-char query filters across timetable + info, result click jumps + highlights the item (incl. info-tab switching path).
- Favorites: grouped rendering, un-favoriting live-updates the page + nav badge, empty state.
- Offline: reload with network off → app + data load from cache; offline badge appears.
- Install prompt: appears (Android/Chrome), iOS hint text, dismiss persists for session.

---

## Out of scope

- New features from STRATEGY.md (inline editor, map, announcements) — not part of this refactor.
- Changes to the parent `festival-pwa` production app or WordPress plugin.
- Adding a build step, framework, or npm dependencies.
