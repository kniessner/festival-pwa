# Produktion cleanup — 2026-08-10

Two-pass triage: first cut (commit `4617c41`, Jacob-only) then
Horst-review reconciliation (commit landing next).

**Final state:** 13 features kept, 16 dropped.

Applied against `standalone/data/produktion.geojson` on branch `map-follow-up`.

## Horst review deltas (against the first cut)

| feature | first cut | Horst | resolution |
|---|---|---|---|
| `Artist büros`         | drop | keep + rename → `Artist Office` | **restored from audit + renamed** |
| `Rezi tresen`          | drop | keep + rename → `Rezi Tresen`  | **restored from audit + capitalised** |
| `Bänderkontrolle 3x3`  | keep | keep + rename → `Bänderkontrolle` | **renamed in place** |
| `Secu point`           | keep | drop                          | **dropped, added to audit** |

Everything else on Horst's list matched the first cut exactly.

## Restore instructions

If a further review says any of these needed to stay, cherry-pick the feature
back out of `dropped-features.geojson` (it is a valid GeoJSON FeatureCollection
with an extra `_dropped_reason` property per feature; strip that before merging
back into `data/produktion.geojson`).

## Dropped features

| text | reason |
|---|---|
| (no text) | anonymous polygon (no text property) |
| (no text) | anonymous polygon (no text property) |
| (no text) | anonymous polygon (no text property) |
| Artist Office | staff-only |
| Cashflow | cashless-support staff |
| Crew Bar - Kiosk | crew-only bar |
| Gastroleitung | staff office (gastro management) |
| Internet | staff wifi hub |
| Lager | storage (staff) |
| Logisticszentrale | staff logistics |
| Rezi raum | reception room (staff) |
| Secu point | Horst: security post, not shown on static |
| Sterne Office | staff-only |
| Tent | generic tent, staff area |
| Tent | generic tent, staff area |
| Weez | Weezevent ticketing staff |

## Kept features (guest-facing, post-Horst review)

| text |
|---|
| Artist Office |
| Awareness & Eclipse |
| Bänderkontrolle |
| Bänderkontrolle |
| Check-in Autos |
| DRK / Secu Base |
| Einlass / Check-in |
| Info-point / Lost & Found / Kiosk / DIY station |
| Produktion |
| Psycare / DRK zelt |
| Rezi Tresen |
| SupportA |
| Supporta Base |
