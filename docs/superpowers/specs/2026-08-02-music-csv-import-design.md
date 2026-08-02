# Music CSV Import — Design

**Status:** Approved for planning
**Date:** 2026-08-02
**Scope:** `pwa_music_event` custom post type only (`includes/class-music.php`)

## Problem

Music/DJ lineup data arrives as a CSV export from an external artist-booking
system (see `music_import.csv`). Today every `pwa_music_event` post has to be
created by hand in wp-admin. This adds a CSV import so an editor can upload
that export and have it populate/update the CPT in one step.

## Source data shape

Columns: `ID, Dein Artist Name, Stage, Playtime, day, start_time, end_time`.

Observed from the real export (314 rows):

- `ID` is an external booking-system reference, **not** a WordPress post ID
  (confirmed against `music.json`, where post IDs start at 1 and are
  unrelated to these values).
- `Playtime` is a free-text summary and is **unreliable** — e.g. one row's
  `Playtime` text says "Sunday 17.08" while 17.08.2026 is actually a Monday,
  and the same row's own `day` column says `Sunday`. The structured columns
  (`day`, `start_time`, `end_time`) disagree with the free text in cases like
  this, so the importer uses the structured columns only and ignores
  `Playtime` entirely.
- `day` is a weekday name (Thursday–Monday), not a calendar date.
- ~200 of 314 rows have blank `Stage`/`day`/`start_time`/`end_time` — artists
  booked but not yet scheduled.
- Some time values are corrupted: `30.12.1899` (Excel's artifact for an empty
  date/time cell) and times punctuated with `.` instead of `:` (`06.00`,
  `16.30`).
- A handful of rows are exact duplicates (same `ID`, same everything).
- Stage names in the CSV match `Festival_PWA_Music::STAGES` exactly, with
  two exceptions: the CSV uses a single `Mirage` and a single `Zirkus Mond`,
  where `STAGES` currently splits each into two (Outdoor/Indoor,
  draußen/drinnen).

## Decisions

1. **Upsert by external ID.** The CSV `ID` is stored as post meta
   `_pwa_music_external_id`. Import looks up an existing `pwa_music_event`
   post with that meta value and updates it if found, otherwise creates a
   new post. Re-importing an updated CSV updates in place rather than
   duplicating, and the duplicate rows in the source CSV collapse naturally
   (last occurrence wins).
2. **Stage list changes to match the CSV.** `STAGES` collapses
   `'Mirage Outdoor'` + `'Mirage Indoor'` → `'Mirage'`, and
   `'Zirkus Mond draußen'` + `'Zirkus Mond drinnen'` → `'Zirkus Mond'`. Every
   other stage name already matches. This is a one-time breaking change to
   the dropdown's meta values — any already-published event using one of the
   four removed values needs its stage re-selected by hand in the editor;
   the importer does not attempt to migrate it.
3. **Unresolved fields are left blank per-field, then flagged — not
   all-or-nothing.** Stage, start, and end are each resolved independently:
   a row with a matching stage but an unparseable time still gets its
   `_pwa_music_stage` meta set, just no `_pwa_music_start`/`_end`. A row
   with nothing resolvable (the ~200 blank rows) ends up title-only. This
   matches existing behavior: `rebuild_json()` already skips any event
   missing `start` or `stage`, so a partially/fully unresolved import is
   inert until an editor fills in the rest. Each row with at least one
   unresolved field is listed in the post-import report with its reason(s)
   (`no stage match`, `unscheduled`, `unparseable time`).
4. **One-click import**, no separate preview/dry-run step. Upload → import
   runs immediately → a results summary renders on the same page.
5. **`rebuild_json()` runs once**, after all rows are processed — not per
   row — to avoid rewriting `pwa/data/music.json` (and the webapp copy) 300+
   times in one request.

## Calendar-date resolution

`day` + `start_time`/`end_time` need to become full datetimes for
`_pwa_music_start`/`_pwa_music_end` (stored the same way the meta box does:
`datetime-local` strings, e.g. `2026-08-14T22:30`).

This festival edition's dates are fixed and confirmed by the CSV's own
`Playtime` text throughout (13.–17.08.2026), so the importer hardcodes a
weekday → calendar-date lookup, the same way `STAGES` is already a hardcoded
constant on `Festival_PWA_Music`:

```
Thursday => 2026-08-13
Friday   => 2026-08-14
Saturday => 2026-08-15
Sunday   => 2026-08-16
Monday   => 2026-08-17
```

Given a row's `day`, `start_time`, `end_time`, resolve actual datetimes using
the existing `DAY_ROLLOVER_HOUR = 6` convention (mirrors
`derive_day()` in `class-music.php`, run forward instead of backward):

1. `base_date` = lookup(`day`).
2. `start_date` = `base_date`; if `start_time` hour < 6, `start_date` =
   `base_date + 1 day` (an event starting at 01:30 "on Friday" is actually
   past midnight, calendar Saturday — same logic `derive_day()` already
   applies in reverse when reading it back).
3. `end_date` = `base_date`; if `end_time` hour < 6, `end_date` =
   `base_date + 1 day`.
4. If the resulting `end_date`+`end_time` is not strictly after
   `start_date`+`start_time`, add one more day to `end_date` (handles an
   end hour that lands exactly on `06:00` or later, e.g. `23:00–06:00`).

Time normalization before parsing: replace `.` with `:` in `start_time`/
`end_time` (`06.00` → `06:00`); treat `30.12.1899` and any empty string as
"no time given" for that field. If either `start_time` or the row's `day` is
unresolvable, the row is imported title-only per decision 3.

## Components

- **`includes/class-music-import.php`** (new), loaded from
  `festival-pwa.php` next to the existing `class-music.php` require.
  - Registers a submenu page under the CPT list menu
    (`edit.php?post_type=pwa_music_event`, page slug `pwa-music-import`,
    "Import CSV"), `current_user_can('edit_posts')`.
  - Renders an upload form (nonce-protected) and, after submission, the
    results summary.
  - Parsing/normalization/date-math live in small static/pure methods so
    they're readable and independently callable, matching the level of
    decomposition already used in `class-music.php`
    (`derive_day()`, `rebuild_json()`).
  - Row processing: parse CSV → normalize each row → resolve stage match
    against `Festival_PWA_Music::STAGES` (via `sanitize_title()`, same as
    the dropdown) → resolve datetimes → upsert post + meta by
    `_pwa_music_external_id` → collect flags.
  - Calls `Festival_PWA_Music::rebuild_json()` once at the end (needs to be
    made callable from outside — currently public, so just an instantiate +
    call).
- **`includes/class-music.php`** (existing, modified): update `STAGES`
  const per decision 2. No other changes.
- **`festival-pwa.php`** (existing, modified): add the new require.

## Data flow

```
CSV upload
  → parse rows (PHP built-in fgetcsv/str_getcsv)
  → for each row:
      normalize stage/time strings
      resolve stage match (STAGES) or flag "no stage match"
      resolve start/end datetime or flag "unscheduled" / "unparseable time"
      find existing post by _pwa_music_external_id, or create new
      set title, update_post_meta for start/end/stage/external_id (only
        the ones resolved — leave others blank as today's meta box does)
  → Festival_PWA_Music::rebuild_json() once
  → render summary: created N, updated N, flagged rows table
```

## Error handling

- Malformed CSV (wrong columns, unreadable file, empty upload): abort before
  writing anything, show a single error notice, same nonce/capability guard
  pattern already used elsewhere in this plugin (`class-admin.php`,
  `festival-pwa.php`'s admin_post handlers).
- Per-row problems never abort the whole import — they degrade to a
  title-only post plus a flag, per decision 3, so one bad row can't block
  the other 300.

## Testing

There's no PHP test harness anywhere in this plugin today (the only test
suite in the repo is the standalone webapp's `.mjs` tests under
`standalone/tests/`, unrelated to this WP plugin's PHP). Adding PHPUnit
infrastructure is out of scope for this feature. Verification will be:

- Manual import of `music_import.csv` against a local WordPress install,
  checking: row counts (created/updated/flagged) match expectations, spot
  a few resolved datetimes against the source `Playtime` text, confirm
  `music.json` regenerates correctly, confirm re-running the same CSV
  produces zero new posts (pure updates).
- The date-math and normalization helpers are implemented as pure
  static methods precisely so they *can* be unit-tested later if/when a
  PHP test harness is added to this repo — not because one is being added
  now.

## Out of scope

- No preview/dry-run step before committing (explicitly declined).
- No UI for editing the weekday→date mapping — it's specific to this
  festival edition and hardcoded, matching how `STAGES` is already handled.
- No migration of existing posts using the four stage values being removed.
- No changes to `class-post-type.php` / `class-meta-boxes.php` /
  `class-admin.php` — those register the unrelated, unused `festival_event`
  CPT and are not loaded by `festival-pwa.php`.
