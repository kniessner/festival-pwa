# The Label Collision Problem

Named pattern used across the interactive map (`js/views/map-interactive.js`)
whenever two feature labels sit close enough that their rendered text boxes
physically overlap on screen at any zoom level a user is likely to reach.

Trigger phrases from Jacob: **"label-collision-problem"** or **"labels overlap"**.

## What we do about it

We keep the two features rendered where they are (never move a polygon just
to fix a label), and push each label in a direction that separates them via
MapLibre's `text-offset`. The offset is expressed in ems (relative to the
label's text size), so it stays visually consistent across zoom levels —
unlike geographic offsets which would grow/shrink with zoom.

### Recipe

1. Identify the colliding pair (or n-clique). Both must be in an
   `text-allow-overlap: true` layer for the collision to be visible —
   otherwise MapLibre would already drop one via `text-optional`.
2. Measure the geographic direction from one to the other. The label
   further NORTH gets shifted further north on screen (`y < 0`); the
   southern one gets shifted south (`y > 0`). Symmetric splits look best.
3. Add a `match ['get', 'text']` expression on the layer's `text-offset`
   layout property. Every non-colliding feature falls through to the
   default `[0, 0]`.
4. Keep the offset magnitude to ~1.2 em per side as a starting point
   (total 2.4 em ≈ 38 px extra separation). Then eyeball on-map and
   TIGHTEN if either side has more breathing room than it needs —
   e.g. one polygon has no neighbours in that direction, so the label
   can shift much less. Asymmetric splits are fine when the visual
   context isn't symmetric (see Cuddle Poodle / Neuro Divers below).
   Bigger than ~1.2 em on either side looks disconnected from the
   polygon.
5. MapLibre `text-offset` uses **screen coords** — negative y is UP on
   screen, i.e. geographic NORTH. Positive y is DOWN (south). This is
   the opposite of lat/lng intuition, so double-check.

### First application: Cuddle Poodle ↔ Neuro Divers

Original commit: `map-follow-up-2` (2026-08-11). Two `sterne-major` polygon
centres are only 22 m apart:
```
Cuddle Poodle   14.495171, 52.276838     (north)
Neuro Divers    14.495170, 52.276642     (south, 22 m away)
```
Their labels are ~120 px wide at zoom 16.5; the geographic separation at
that zoom is ~50 px. Result: `NeurCuddlePoodle` mash-up. Fix:

```js
'text-offset': [
    'match', ['get', 'text'],
    'Cuddle Poodle', ['literal', [0, -1.2]],  // push up
    'Neuro Divers',  ['literal', [0,  0.5]],  // push down
    ['literal', [0, 0]],
],
```

Asymmetric on purpose: Cuddle Poodle has nothing above it and
needed the full 1.2 em; Neuro Divers only needed 0.5 em to clear
both Cuddle Poodle above and the food-court labels below. Total
1.7 em (≈ 27 px) extra vertical separation. Labels now sit on
distinct baselines and read cleanly.

## When this pattern is NOT the right fix

- **Both features in the same `text-optional: true` layer.** MapLibre already
  drops one on collision. Leave it alone unless which one drops matters.
- **Clusters of 3+ tightly packed features.** Manual offsets get messy; use
  the [collapse-at-overview pattern](#see-also-collapse-at-overview) instead
  (see the `stages` textField step in `map-interactive.js` for Mirage +
  Zirkus Mond + Community).
- **Physically identical coordinates** (two polygons stacked). Combine into
  one feature at the data layer instead.

## See also: collapse-at-overview

Separate pattern in the same file: at low zoom, collapse a stage cluster
to a single brand label ("Zirkus Mond", "Mirage", "Community"), then split
into individual names at zoom ≥ 15.5. Solves the *overview* collision;
label-collision-problem solves the *close-zoom* collision that remains
after splitting.

The two patterns compose: at overview → collapse; at close zoom → offset.
