# Produktion cleanup — 2026-08-10

**Before:** 29 features. **After:** 12 features. **Dropped:** 17.

Applied against `standalone/data/produktion.geojson` on branch `map-follow-up`.

## Restore instructions

If Horst says any of these needed to stay, cherry-pick the feature back out of
`dropped-features.geojson` (it is a valid GeoJSON FeatureCollection with an
extra `_dropped_reason` property per feature; strip that before merging back
into `data/produktion.geojson`).

## Dropped features

| text | reason |
|---|---|
| (no text) | anonymous polygon (no text property) |
| (no text) | anonymous polygon (no text property) |
| (no text) | anonymous polygon (no text property) |
| Artist Office | staff-only |
| Artist büros | staff-only |
| Cashflow | cashless-support staff |
| Crew Bar - Kiosk | crew-only bar |
| Gastroleitung | staff office (gastro management) |
| Internet | staff wifi hub |
| Lager | storage (staff) |
| Logisticszentrale | staff logistics |
| Rezi raum | reception room (staff) |
| Rezi tresen | reception counter (staff) |
| Sterne Office | staff-only |
| Tent | generic tent, staff area |
| Tent | generic tent, staff area |
| Weez | Weezevent ticketing staff |

## Kept features (guest-facing)

| text |
|---|
| Awareness & Eclipse |
| Bänderkontrolle |
| Bänderkontrolle 3x3 |
| Check-in Autos |
| DRK / Secu Base |
| Einlass / Check-in |
| Info-point / Lost & Found / Kiosk / DIY station |
| Produktion |
| Psycare / DRK zelt |
| Secu point |
| SupportA |
| Supporta Base |
