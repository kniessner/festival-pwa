# Interactive Map — Progress Notes

Session pause snapshot. Everything below is scoped to the
`interactive-map-basemap` branch of `kniessner/festival-pwa`.

## Where we are

Live at **https://fusion.kubante.com/** (fresh install
→ password `Buchtischmuchti26!` → menu → Festival Map).
Cache version `1786136118`.

The `/map` route renders a full-screen MapLibre GL map with:

- **Basemap**: locally-hosted Protomaps PMTiles slice (`data/basemap.pmtiles`,
  1.5 MB, bbox `14.47..14.52 × 52.26..52.29`, max zoom 15). Painted magenta
  land + navy Helenesee, no roads, no POIs.
- **Typography**: real **Megan Display** for zone banners and
  **Instrument Sans Italic** for helper labels, via vendored SDF glyph
  tiles under `standalone/glyphs/`.
- **Data layers** (all offline-cached):
  - `data/helenesee-shore.geojson` — cream shore line
  - `data/osm-features.geojson` — 6 real OSM polygons (Hauptstrand +
    Weststrand beaches, three recreation grounds inc. Bungalowsiedlung)
  - `data/stages.geojson` — 16 stage polygons, two-tone magenta by
    slug (west cluster burgundy, east cluster brighter pink)
  - `data/venues.geojson` — 22 art venues, deep magenta
  - `data/food.geojson` — 21 food stalls + Community Corner info point
- **Camera**: `bearing: -90` (rotated 90° CW → portrait phone friendly),
  `fitBoundsOptions` locked to the stages bbox so first paint fits everything.
- **Interactions**: pinch/drag only, no zoom buttons. Click a polygon →
  cream popup with name / category / description.
- **Offline**: full basemap + shore + polygons + Megan-Display labels
  render with zero network (verified by killing the dev server mid-session).

## Branch layout

- `v1` — untouched base
- `add-map` (PR-ready, pushed) — earlier PNG-based Festival Map
  (pinch-zoom controller on a static image)
- `interactive-map` (pushed) — MapLibre map w/ satellite verification
  underlay, MapTiler fonts, no basemap
- **`interactive-map-basemap`** (pushed, this snapshot) — PMTiles
  basemap + fontnik + OSM beaches/rec grounds. This is the head to
  continue from tomorrow.

## Files added or heavily changed on `interactive-map-basemap`

Source:
- `standalone/js/views/map.js` (~400 lines)
- `standalone/js/config.js` (added map slug)
- `standalone/js/router.js` (enabled menu row, wired renderMap)
- `standalone/index.html` (loads vendor/maplibre-gl + vendor/pmtiles)
- `standalone/sw.js` (range-serving from cache + expanded SHELL_ASSETS)
- `standalone/server.js` (dev-time HTTP Range request support)
- `standalone/scripts/build.js` (copies vendor/ + glyphs/ into dist/)
- `standalone/scripts/generate-glyphs.js` (fontnik one-shot)
- `standalone/css/views.css` (map view CSS)

Data + vendored assets:
- `standalone/vendor/{maplibre-gl.js, maplibre-gl.css, pmtiles.js}`
- `standalone/data/{stages, venues, food, helenesee-shore,
  osm-features}.geojson`
- `standalone/data/basemap.pmtiles`
- `standalone/glyphs/{Megan Display, Lato Regular, Lato Bold,
  Instrument Sans, Instrument Sans Italic}/{0-255, 256-511}.pbf`

## Known open items

**Data gaps (external input needed)**
- The five festival camp zones (Camp Taucher / Qualle / Waschbär /
  Stille Fische / Camperbuchten) are still absent. They're marketing
  subdivisions, not OSM features. Options: Jacob exports the relevant
  Felt layers, or we trace approximate rectangles by hand from the
  bucht.png using the fusion-map calibrator.
- Amenity POIs (9 legend entries: Trinkwasser / Toilette / DRK /
  Essensstände / Fluchtweg / Sammelstelle / Dusche / Cashless /
  Badestellen) — needs point coords, none currently in any geojson.
- More Felt layers spotted in the sidebar but not yet exported:
  TOILETS & SHOWERS, GASTRO, Auto&ParkKonzept, Fences, PRODUKTION,
  Generators, STERNE, Helenesee/Pre-existing Struct.

**Style polish (can do without new data)**
- Tier B basemap: add Protomaps' `landcover` layer for subtle forest
  tint, a soft earth gradient by zoom, decorative blurred shore stroke.
- Layer toggle strip UI so users (and testers) can hide/show basemap
  layers, beaches, satellite (if we add it back).
- Popup UX: bigger tap targets on mobile, "add to plan" button for
  stages once we integrate with the app's favourites store.
- Amenity icons as SVG sprites — needs the point data first.
- Bring back an optional satellite verification underlay behind a
  toggle (currently removed for the illustrated look).

**Correctness / infra**
- Offline pmtiles ranges are served from cache — confirmed working.
- Font pbfs are precached — confirmed working.
- Every geojson is precached — confirmed working.
- The dev server (`standalone/server.js`) is a plain node zero-dep
  static server; I added HTTP Range support for pmtiles (required by
  the byte-serving reader). Prod hosts (nginx / WP.com) already
  handle ranges natively.

## Quick recipes

Regenerate glyph tiles (after adding a font):
```bash
cd standalone
node scripts/generate-glyphs.js
```

Extract a fresh Helenesee PMTiles slice (rolls monthly at protomaps):
```bash
pmtiles extract "https://build.protomaps.com/YYYYMMDD.pmtiles" \
    standalone/data/basemap.pmtiles \
    --bbox=14.47,52.26,14.52,52.29 --maxzoom=15
```

Rebuild + redeploy:
```bash
cd standalone
node scripts/build.js
rsync -avz --delete --exclude '.DS_Store' dist/ \
    kubante.com:/websites/fusion.kubante.com/
```

Run locally:
```bash
cd standalone && node server.js
# → http://localhost:8767/  (password Buchtischmuchti26!)
```

## Suggested resume order

1. Tier B basemap polish (2-3 h, no external input).
2. Amenity SVG icons — only if Felt layer data comes in.
3. Camp zone polygons — either from Felt (fast) or manual PNG tracing
   with the calibrator on `fusion-map` (rougher, ~2 h).
4. Layer toggle UI.
5. Wire the map to the existing favourites store so tapping a stage
   can add it to "My Plan".
