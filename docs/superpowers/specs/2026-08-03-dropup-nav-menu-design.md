# Drop-up Navigation Menu — Design

**Status:** Approved for planning
**Date:** 2026-08-03
**Scope:** `standalone/` webapp only — navigation UI and the notifications-preview surface it adds. No WordPress/plugin changes.

## Problem

The standalone app's navigation is a fixed bottom icon bar (`<nav class="bottom-nav" id="pageNav">`, `standalone/index.html:101`, rendered by `renderNav()` in `standalone/js/router.js:11-24`). The user wants to replace it with a drop-up menu — a slim persistent trigger at the bottom that opens a full panel listing the app's pages, with a "latest news" preview instead of a nav-bar icon row.

## Current state (from exploration)

- **Routing.** `PAGES` is a static array in `standalone/js/config.js:1-7`: `home` (hidden today, kept in markup — `components.css:397-401`), `favorites` ("Merkzettel"), `timetable` ("Programm"), `grid` ("Timetable"), `info` ("Infos"). Labels come from `t(labelKey)` in `standalone/js/i18n.js`. Clicking a nav button dispatches `data-action="load-page"` through the delegated `actions` map (`standalone/js/app.js:196-197, 243-245`) to `goToPage(index)` → `loadPage(index)` (`router.js:26-48`), which sets `store.currentPage`, swaps `#content`, and re-renders the nav for active/badge state.
- **Existing modal convention.** Three overlays already share one pattern — fixed backdrop + panel, toggled via a `.open` class, closed via a `data-action="close-*"` button in the same delegated `actions` map: `#searchModal`, `#notificationsModal`, `#onboardingModal` (`standalone/index.html:41-84`). The onboarding modal's own comment (`index.html:63-65`) documents this as the reusable convention. The new drop-up menu follows the same shape.
- **News data.** `standalone/data/notifications.json`, loaded into `store.pageData.notifications` via `DATA_FILES` (`config.js:8`). `standalone/js/notifications.js`: `getUnseenNotifications()` (`:24-29`) filters by a seen-IDs set in `localStorage`; `maybeShowNotifications()` (`:45-62`) renders `.news-card` HTML into `#notificationsList` and opens `#notificationsModal`; `refreshNotifications()` re-fetches on visibility change. A *separate* `news.json` (scraped `/news/` feed) exists but is unrelated — not used here.
- **Visual identity.** `standalone/css/tokens.css:4-12`: `--bg: #080943` (navy), `--bg-card: #f2e9dc`-ish cream, `--accent-orange: #ff6f21`, `--accent-pink`, `--accent-purple`, `--accent-blue`, `--text` (near-black on cream), `--text-muted` (cream on navy). `base.css:57-80` layers a semi-transparent `frame.png` texture over the navy body background. The reference screenshot's dark-brown palette does not match these tokens — it's a structural/layout reference only, not a literal color target.
- **No existing counterparts** for: a font-size adjuster (searched, zero matches), a standalone geolocation-permission banner (only an onboarding *modal* exists — `onboarding.js` explicitly comments "No banner subsystem (v1 scope)"), or a "Festivalmap" page (not in `PAGES`, no view file).

## Decisions

1. **Trigger:** a slim bar occupies the bottom slot the current nav uses today (same fixed position, similar height, so no layout jump), showing the current page's label plus a menu/chevron glyph. Tapping it anywhere opens the drop-up panel.
2. **Panel contents, top to bottom:** close (✕) control; the nav list; the news-preview section.
3. **Nav list:** the four real `PAGES` entries (`favorites`, `timetable`, `grid`, `info` — `home` stays hidden, unchanged from today), restyled as list rows instead of an icon row. Tapping a row calls the existing `loadPage(index)` and then closes the menu. Routing/index logic is untouched.
4. **Festivalmap placeholder:** a fifth row, hardcoded directly in the menu markup/render — **not** added to the `PAGES` array (so index-based routing in `loadPage()` is never at risk of an off-by-one from a non-routable entry). Rendered visually muted, no `data-action`, `aria-disabled="true"`, optionally a small "bald verfügbar" sublabel. No new view/route is built.
5. **News preview:** reads `store.pageData.notifications.items`, shows only the single most recent entry (title + short excerpt/date) regardless of its seen/unseen state, styled like the existing `.news-card`. Tapping it opens `#notificationsModal` rendering **all** items, not just unseen ones — this must be a distinct render path from the automatic-popup's `maybeShowNotifications()` (which filters to unseen and marks them seen), because the previewed item may already be marked seen: reusing the unseen-only path here would risk opening the modal to an empty list the moment the one item being previewed has already been dismissed elsewhere. Empty state (no notifications yet) renders a quiet placeholder line, not a blank gap or an error.
6. **Visual restyle:** built from this app's real tokens (navy background + `frame.png` texture, cream panel/row surfaces, orange/pink for the active page), not the screenshot's literal brown/tan colors.
7. **Explicitly out of scope:** font-size adjuster, geolocation-permission banner, a real Festivalmap view. None of these exist today and none were requested beyond the screenshot's visual reference.

## Components

- **`standalone/index.html`** (modified): remove `<nav class="bottom-nav" id="pageNav">` (`:101`); add a trigger-bar element in its place and a new `#menuModal` panel (backdrop + panel), following the `#onboardingModal` markup shape.
- **`standalone/js/router.js`** (modified): `renderNav()` reworked to (a) populate the new nav-list rows from `PAGES` + the hardcoded Festivalmap row, and (b) update the trigger bar's current-page label. Active/favorites-badge state logic carries over from the current implementation, just targeting new markup.
- **`standalone/js/app.js`** (modified): add `open-menu` / `close-menu` entries to the delegated `actions` map (same shape as `close-search`/`close-notifications`); wire the trigger bar's `data-action="open-menu"`.
- **`standalone/js/notifications.js`** (modified): add a way to get "the single most recent item" (likely just `items[0]` if the feed is already newest-first — confirm ordering during implementation) for the menu's news preview, and a *separate* render function (or a parameter on the existing one) that opens `#notificationsModal` showing all items — distinct from `maybeShowNotifications()`'s unseen-only, mark-as-seen behavior, per the News preview decision above.
- **`standalone/css/components.css`** (modified): remove the old `.bottom-nav` rule block (`:426-492`, including the hidden-`home` carve-out at `:397-401` if it's no longer relevant to the new markup); add trigger-bar + `#menuModal` panel/list/news-preview styles using existing tokens.

## Data flow

```
App loads / page changes
  → renderNav() reads PAGES (routable rows) + hardcoded Festivalmap row
  → trigger bar shows current page's label
  → (unchanged) store.pageData.notifications already loaded via loadData()

User taps trigger bar
  → open-menu action → #menuModal gets .open
  → menu shows: nav rows (from renderNav's last render) + news preview
      (news preview reads store.pageData.notifications.items[0])

User taps a real nav row
  → loadPage(index)  [unchanged]
  → close-menu        [new: menu closes after navigating]

User taps the Festivalmap row
  → no-op (no data-action bound, aria-disabled)

User taps the news preview
  → opens #notificationsModal via the new "show all items" render path
    (NOT maybeShowNotifications()'s unseen-only/mark-seen path)

User taps ✕ or the backdrop
  → close-menu
```

## Error handling

- `store.pageData.notifications` not yet loaded (e.g. very first paint before `loadData()` resolves): news preview renders its empty state, not an error — same defensive pattern as other data-dependent UI in this app (checked truthiness before rendering).
- Empty `items` array: same empty-state treatment as "not yet loaded" — no special-casing needed between "no data" and "no items."
- No new error paths are introduced elsewhere — this is a pure UI/routing restyle; no new network calls, no new WordPress-side data.

## Testing

`standalone/tests/*.test.mjs` (Node's built-in test runner) already covers related JS modules (`onboarding.test.mjs`, `warn-stage-mismatches.test.mjs`, etc.), though note (from unrelated prior work in this session) that the current suite has pre-existing, unrelated failures in `get-stage.js`'s module export shape — not something this feature should try to fix, just something to route around when adding new test files. New/updated coverage for this feature:

- `renderNav()` produces the correct row set (4 real + 1 disabled Festivalmap) and updates the trigger bar's label on page change.
- The Festivalmap row has no click behavior (no `data-action`, or a click handler that verifiably no-ops).
- The news preview selects the single most recent notification item (independent of seen/unseen state) and renders its empty state when `items` is empty/absent.
- Tapping the news preview opens the modal via the "show all items" path — verify this doesn't call `maybeShowNotifications()`'s unseen-filter/mark-seen logic, so a previewed-but-already-seen item still shows up when the modal opens.
- Menu open/close via trigger tap, ✕, and backdrop click all toggle the same `.open` class the other three modals use (so this can largely reuse whatever generic open/close assertions those existing tests already have, if any — check during implementation rather than re-deriving from scratch).

## Out of scope

- Font-size adjuster (no existing equivalent; not requested beyond the screenshot).
- Geolocation-permission banner (no banner subsystem exists in this app; onboarding modal already covers this permission elsewhere).
- A real Festivalmap page/view/route.
- Any WordPress/plugin-side change — this is standalone-webapp-only.
