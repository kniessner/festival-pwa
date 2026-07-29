# German/English i18n — Round 1 (UI chrome + Program/Timetable content) Design

**Date:** 2026-07-27
**Scope:** `2026-festival-pwa/standalone/` ONLY.
**Goal:** Add a DE/EN language toggle to the app, translate all app-chrome UI strings, and scrape/serve English Program + Timetable content from the festival's own `/en/` pages. A single `update.sh` run refreshes both languages.

**Out of scope for this round (Round 2, follow-up spec):** translating Cashless/FAQ/Info/News content. Those pages keep showing German content regardless of the selected language until Round 2 lands — see "Fallback behavior" below for why that's safe to ship as-is.

---

## Constraints (inherited from STRATEGY.md, unchanged)

- Zero build step, vanilla JS/ES modules, static JSON data, self-contained folder.
- Behavior-preserving for German users: with language = `de`, output must be pixel-identical to today.

---

## 1. Language state & UI toggle

New module `js/i18n.js`:

```js
export const STRINGS = { de: { 'nav.home': 'Home', ... }, en: { 'nav.home': 'Home', ... } };
export function getLang() { ... }   // localStorage 'bucht-lang', else navigator.language-based default
export function setLang(lang) { ... }
export function t(key, vars) { ... } // STRINGS[getLang()][key], with {{var}} interpolation, falls back to STRINGS.de[key] then key itself
```

- First visit: `navigator.language` starts with `en` → default `en`, else `de`. Persisted in `localStorage` under `bucht-lang` from then on.
- `store.js` gains `store.lang` (read from `getLang()` at startup).
- Header (`index.html` `#app-header`) gains a `DE | EN` toggle button next to the title. Click → `setLang(next)` → `store.lang = next` → re-run `loadData()` (now locale-aware, see §2) → `renderNav()` + reload the current page via the existing `loadPage(store.currentPage)`. No new rendering framework needed — this reuses the exact re-render path `app.js` already uses for page navigation.

### String inventory to migrate (every hardcoded literal → `t('key')`)

| File | Examples of strings moved into `STRINGS` |
|---|---|
| `index.html` | search placeholder, "Suchergebnisse", "Laden...⏳", install prompt text, `<html lang>` swap |
| `app.js` | update banner text/buttons, "Keine Inhalte verfügbar", "Stand: {{date}}" |
| `views/home.js` | quick-nav labels, info-card labels/descriptions, "Läuft gerade" / "Dein nächstes Event", countdown "Heute!"/"Vorbei" |
| `views/timetable.js` | "Programm wird geladen…", "Keine Events für diese Auswahl", filter panel labels ("Alle Bühnen", "Kategorie", "Genre", "Filter zurücksetzen") |
| `views/timetable-grid.js` | "Keine geplanten Acts für diesen Tag", scroll-toggle `aria-label`s |
| `views/favorites.js` | "Mein Plan" empty-state copy, group fallback labels (News/Cashless/FAQs — already English words, kept) |
| `views/info.js` | tab labels (News/Cashless/FAQs — no change needed, already English), "Aktuelle News werden hier angezeigt…" |
| `ui.js` | "Favorit" title attr, "Details folgen bald." |
| `search.js` | "Keine Ergebnisse für "{{query}}"" |
| `install.js` | all `showToast(...)` strings, offline badge text, iOS hint text |

Stage names, category badges (Performance/Workshop/Talk/Space), and proper nouns are **not** translated — they're already language-neutral (confirmed against the live `/en/` pages, where stage names like "Schweissperle" and category badges are identical to the German site).

---

## 2. Locale-aware data loading

`store.loadData()` changes from a fixed fetch to a fallback-chain fetch per file:

```js
async function fetchLocalized(file, lang) {
    if (lang !== 'de') {
        const res = await fetch(`data/${lang}/${file}`);
        if (res.ok) return res.json();
    }
    return (await fetch(`data/${file}`)).json();
}
```

- With `store.lang === 'en'`: `timetable.json` loads from `data/en/timetable.json` (exists after this round). `info.json` has no `data/en/info.json` yet (Round 2), so it silently falls back to German — the Info/FAQ/Cashless pages just stay German for English users until Round 2, which is an accepted, deliberate gap for this round rather than a bug.
- With `store.lang === 'de'`: unchanged, fetches `data/*.json` exactly as today.

---

## 3. Scraping pipeline — one command, both languages

Confirmed against the live site: `https://bucht-der-traeumer.de/en/programm-2026/`, `/en/performances/`, `/en/workshops/` all return HTTP 200, use the **identical accordion HTML structure** (`festival-accordion-item`, `data-day`, `data-types`, `data-stages`, `festival-accordion-badge--time`, etc.) as the German pages, and the content is already professionally translated by the festival's own team.

### Script changes

- **`_extract_program.py`**: add a `lang` argument (`de` default). The only hardcoded, language-specific values in this file — the `day_map`/`day_short` dicts (`Donnerstag`/`DO` etc.) and the page `title` (`'Kulturprogramm'`) — become locale-keyed lookups:
  ```python
  DAY_MAP = {'de': {...as today...}, 'en': {'2026-08-13': 'Thursday', '2026-08-14': 'Friday', '2026-08-15': 'Saturday', '2026-08-16': 'Sunday', '2026-06-15': 'Monday', 'no-day': ''}}
  DAY_SHORT = {'de': {...as today...}, 'en': {'2026-08-13': 'THU', '2026-08-14': 'FRI', '2026-08-15': 'SAT', '2026-08-16': 'SUN', '2026-06-15': 'MON', 'no-day': ''}}
  TITLE = {'de': 'Kulturprogramm', 'en': 'Culture Program'}
  ```
  `type_map`/`stage_map` are untouched (language-neutral, per above).
- **`_extract_grid.py`** (performances/workshops): **no code changes.** It already derives `title` from the fetched page's own `<title>` tag and follows detail-page links found in that same page's HTML, so pointing it at an `/en/` URL is sufficient.
- **`_build_timetable.py`**: add a `lang` argument (`de` default), used only to pick the locale-keyed title (`'Kulturprogramm'` / `'Culture Program'`). `cat_map`, `day_order`, and all date logic are already language-neutral.
- **`_extract_faq.py`**: untouched — not used this round.

### `update.sh` changes

The existing single German scrape block is wrapped in a loop over `("de" "" ) ("en" "en/")` — or equivalently, two sequential passes sharing the same trace ID/log file:

1. **Pass 1 (German, unchanged today):** scrape `cashless`, `faqs`, `programm-2026`, `performances`, `workshops` from `$URL` into `data/*.json`; clear stale `data/timetable.json` first; run `_build_timetable.py data` (implicit `lang=de`).
2. **Pass 2 (English, new):** `mkdir -p data/en`; clear stale `data/en/timetable.json`; scrape only `programm-2026`, `performances`, `workshops` (not `cashless`/`faqs` — Round 2) from `$URL/en` into `data/en/*.json` via the same three extractor scripts with `lang=en`; run `_build_timetable.py data/en en`.
3. Regenerate `_manifest.json` and bump the service-worker `CACHE_NAME` **once**, after both passes — one manifest, one cache generation covers both locales, since the nav structure itself is static (`config.js` + `i18n.js`), not manifest-driven.
4. The existing per-page success/failure JSON lines (written to `$TMP_PAGES`) get one entry per language per page, so the final summary distinguishes e.g. a failed `en/programm-2026` from a failed German `programm-2026` — nothing currently silently merges the two.

Re-running `update.sh` is fully idempotent for both locales: each pass deletes its own stale `timetable.json` before rebuilding, so a removed/renamed event never lingers in either language's output.

No new CLI flags — `./scripts/update.sh --source https://bucht-der-traeumer.de` (or the `standalone.json`-configured default) does the full DE+EN refresh in one run, same as today's single command.

---

## 4. Offline caching (`sw.js`)

`sw.js`'s `SHELL_ASSETS` array is a hardcoded list passed to `cache.addAll()`, which is **atomic** — if even one URL 404s, the entire precache install fails (silently breaking offline mode for everything, not just the new files). This means:

- Add `./js/i18n.js` (new module) to `SHELL_ASSETS`.
- Add `./data/en/timetable.json` to `SHELL_ASSETS` — safe because it's guaranteed to exist after this round's `update.sh` change.
- **Do not** add `./data/en/info.json` (or any other Round-2 file) — it doesn't exist yet, and would break `addAll()` for every user until Round 2 ships.

`precacheData()` separately discovers per-page JSON at runtime from `_manifest.json`'s page list, fetching each with its own try/catch inside a `Promise.allSettled` — failures there are already tolerated per-file, not atomic. Extend its loop to also request `./data/en/${slug}.json` for each manifest page slug; slugs without an English file yet (e.g. `info`) simply fail that one fetch and get skipped, exactly like today's handling of a missing page.

`CACHE_NAME` is bumped by `update.sh` on every content refresh (existing behavior, §3 step 3) — no separate change needed here.

---

## 5. Fallback behavior (what happens when EN data is missing/stale)

- **Missing file** (e.g. `data/en/info.json` doesn't exist yet): `fetchLocalized` falls back to the German file automatically — English-language users see German Info/FAQ content this round, not an error or blank page.
- **Missing translation string**: `t(key)` falls back to `STRINGS.de[key]`, then to the raw `key` as a last resort — a forgotten string shows German text (or an obviously-wrong key, easy to spot in review) rather than crashing the render.
- **A scrape pass fails outright** (e.g. `/en/programm-2026/` 404s on some future URL change): `update.sh` logs and reports the failure for that page/language exactly as it does today for German failures, and leaves the previous `data/en/*.json` in place rather than deleting it — a bad scrape never wipes out the last known-good English data. (This is the existing per-page failure handling in `update.sh`; the only change is that it now also applies to the English pass.)

---

## 6. Verification (before claiming done)

Run `scripts/start.sh` and check both languages:

- **Toggle:** DE↔EN switch updates nav labels, all chrome strings, and re-renders the current page without a full reload; choice persists across a reload (localStorage).
- **First visit:** clear `localStorage`, set browser language to English → app opens in English by default; German browser language → opens in German.
- **Timetable/Grid (EN):** day tabs show English day names, events show English titles/descriptions/hosts, stage names unchanged, category badges unchanged, filters work identically to German.
- **Timetable/Grid (DE):** byte-for-byte same behavior as before this change (regression check).
- **Info page while in EN:** shows German content (expected fallback, not a bug) — confirm it doesn't error or show a blank page.
- **`update.sh` single run:** produces/updates `data/timetable.json` **and** `data/en/timetable.json`, `_manifest.json`, and bumps `sw.js` `CACHE_NAME`, all from one invocation; re-running immediately after produces no duplicate/stale events in either file.
- **Offline:** service worker installs successfully (no `addAll()` failure from a missing file — check the console for `[SW]` errors on first install); `data/en/timetable.json` and `js/i18n.js` are present in the cache; language toggle still works with network off; toggling to EN while offline and `data/en/info.json` doesn't exist falls back to cached German `info.json` rather than erroring.

---

## Out of scope

- Translating Cashless/FAQ/Info/News content (`_extract_faq.py`, `data/info.json`, `data/news.json`) — Round 2.
- Any change to `deploy.sh`'s git-commit/gh-pages-push behavior.
- Auto-detecting language from IP/region instead of browser language.
- Per-favorite or per-search-result language (favorites/search already operate on whatever `store.pageData` currently holds, no extra work needed since that's already locale-switched by §2).
