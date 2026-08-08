# Felt extract — Bucht der Träumer* Lageplan

Raw GeoJSON layers extracted from the public Felt map:
https://felt.com/map/Bucht-der-Traumer-Lageplan-3Y9BfZ03mRm9BPJ1Z6mdkabB

**Do not edit these files by hand.** Re-run `_extract.py` to refresh from Felt.
Cherry-pick features into the hand-curated `../stages.geojson` /
`../food.geojson` / `../venues.geojson` etc. as the map work needs them.

## Layers

| File                     | Features | Contents                                        |
|--------------------------|---------:|-------------------------------------------------|
| `toilets-showers.geojson`|       46 | WCs, urinals, showers, Dixi rows                |
| `gastro.geojson`         |       42 | Bars, kitchens, food outlets                    |
| `stages.geojson`         |       29 | Stage footprints + FOH / DJ booths              |
| `produktion.geojson`     |       40 | Production infrastructure, tents, backstage     |
| `sterne.geojson`         |       26 | The "STERNE" points of interest                 |

## Refresh

```sh
python3 _extract.py \
  "https://felt.com/map/Bucht-der-Traumer-Lageplan-3Y9BfZ03mRm9BPJ1Z6mdkabB" \
  .
```

Writes one `<slug>.geojson` per Felt Group; keep only the five we care about
(delete the rest).

## Feature schema

Every Feature has `properties` with:

- `id` (Felt element UUID)
- `type` (Rectangle | Polygon | Path | Circle | Marker | Text | Note)
- `text` (label, often empty)
- `symbol` (icon slug, e.g. `water`, `food`, `fire`)
- `color` (per-feature stroke/fill override, hex)
- `description` (free text)
- `parentId` (Felt group UUID)
- `radius` (metres, Circles only)
- `rotation`, `_shape`

## Coordinate quirks

Felt stores `[lat, lng]`; the extractor swaps to standard GeoJSON `[lng, lat]`.
Polygon elements are converted to `MultiPolygon`, Rectangles to `Polygon`,
Paths to `LineString`/`MultiLineString`, Circles to `Point` (use `radius`
to draw the buffer).
