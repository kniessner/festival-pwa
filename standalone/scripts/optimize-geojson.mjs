#!/usr/bin/env node
/**
 * Overlay-geojson optimizer.
 *
 * Reads every `data/*.geojson`, strips each feature's `properties` down
 * to a small whitelist that the map actually consumes, rounds every
 * coordinate to `COORD_PRECISION` decimals, and writes the file back.
 *
 * Idempotent. Safe to re-run any time the Felt export refreshes.
 *
 * Whitelist rationale:
 *   text  —  label rendered by the -label symbol layer + used by
 *            the tent's initial-drop logic for future features.
 *   slug  —  (b9dc2c8) canonical id joining the map to the timetable.
 *            `get-stage.js` returns it on GPS-inside-polygon;
 *            `build-search-index.mjs` prefers it over slugify(text).
 *            Stripping it silently breaks GPS auto-scroll AND makes
 *            search-index ids drift on any label edit — both silent
 *            regressions, so this key is load-bearing even though
 *            it's not rendered by any map layer.
 *
 * `description` and `symbol` were kept while the click-popup existed;
 * that popup was removed in f3f8a5e so those two fields no longer
 * have a runtime consumer. Rerunning this script now strips them.
 * Add them back to KEEP_PROPS if a future feature (e.g. tap-to-detail
 * bottom sheet) needs them again.
 *
 * Everything else in the raw Felt export (id, parentId, type, _shape,
 * radius, rotation, color) is unused by the code. Colour is set from
 * FELT_LAYERS in map-interactive.js, not from the geojson.
 *
 * Coordinate precision: 6 decimals ≈ 11 cm at the equator, ≈ 7 cm at
 * lat 52°. Way finer than any Felt digitizing precision — the extra
 * decimals in the source are float noise, not signal.
 *
 * Feature draw order (within a single geojson):
 * MapLibre paints fill features in the source array order — later
 * ones overwrite earlier ones on overlap. To satisfy the "bigger
 * underneath, smaller on top" rule uniformly (fusion-parity for the
 * z-order pass documented in js/views/map-layers.js's FELT_LAYERS
 * comment), features are sorted by DESCENDING polygon area before
 * writing back. Non-fill geometries (Point / LineString) get area 0
 * and fall to the end — their draw ordering is irrelevant to the
 * fill layer that consumes this file.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

const KEEP_PROPS = new Set(['text', 'slug']);
const COORD_PRECISION = 6;

// CSS-`border-radius`-style polygon rounding.
//
// Unlike Chaikin (which curves EVERY vertex — turns rectangles into
// blobs), this pass rounds only ACTUAL sharp corners and leaves gentle
// bends alone. Same feel as a CSS border-radius: 4 px on a rectangle
// where the four right-angle corners get a small arc and everything
// else stays untouched.
//
// Algorithm per ring:
//   1. For each vertex V(i), compute the turn angle between the
//      incoming edge V(i-1) → V(i) and the outgoing edge V(i) → V(i+1).
//      A near-zero turn means the vertex sits on an almost-straight
//      run → keep it untouched.
//   2. Otherwise, replace V(i) with a small quadratic-bezier arc:
//        P1 = V(i) + (V(i-1) - V(i)) * s     // back along in-edge
//        P2 = V(i) + (V(i+1) - V(i)) * s     // forward along out-edge
//        sampled at t = [0, 0.25, 0.5, 0.75, 1] with V(i) as the
//        bezier control point, giving 5 output vertices instead of 1.
//      `s` is capped at half the shorter adjacent edge so the arc
//      never over-runs the polygon at very short edges.
//
// Radius is expressed in metres and converted to lat/lon degrees
// using an isotropic approximation at lat 52° ("cos(52°) ≈ 0.62").
// A radius of ~2 m matches Jacob's target of "very very slight, like
// CSS 4 px" — at typical map zoom the arc reads as a soft corner
// without changing the polygon silhouette.
//
// Trade-off accepted (grill Branch A1): the rounded polygon shrinks
// by ~0.5 % at each rounded corner — well below mobile GPS accuracy
// (5-15 m) that feeds get-stage.js, and the stage-hysteresis 3 s
// window absorbs any brief edge flicker. If get-stage regresses on
// the ground, splitting into stages.geojson (rounded, render) +
// stages.raw.geojson (original, hit-test) is a straightforward next
// step.
//
// Idempotency guard: rounding ADDS vertices, so re-running the script
// would over-round. Sentinel `_smoothed: true` on the FeatureCollection
// short-circuits the pass on subsequent runs (sanitize-geojson only
// touches feature props, not FC-level fields, so the sentinel survives
// a full pipeline rerun).
export const BORDER_RADIUS_METRES = 2;
const TURN_ANGLE_THRESHOLD_DEG = 8;   // straighter than this = leave alone
const BEZIER_STEPS = [0.25, 0.5, 0.75];

// Minimum footprint (m²) a polygon needs before its corners get
// rounded. Everything ABOVE this threshold and NOT in
// SKIP_SMOOTH_FILES gets the CSS-border-radius treatment. Set low
// (100 m²) because file-level exclusion below already keeps the
// small-and-numerous tiers (toilets, food-and-drink stalls) out of
// the pass; this floor is just a last-line guard against tiny
// anonymous shapes in the remaining files (e.g. Bänderkontrolle at
// ~9 m² in produktion.geojson).
const MIN_SMOOTH_AREA_M2 = 100;

// Files whose contents are ENTIRELY small utility features — toilets,
// showers, urinals, bars, food stalls. Skipped from smoothing wholesale
// (regardless of individual polygon size) because on a 15 m×15 m stall
// footprint a 2 m radius eats a meaningful chunk of the silhouette,
// and there's no visual gain: users see these as icons at their
// respective zoom bands, not as prominent painted zones.
const SKIP_SMOOTH_FILES = new Set([
    'toilets-showers.geojson',   // WCs, urinals, showers, Dusche WC
    'gastro.geojson',            // bars + food stalls
]);

// 1 metre ≈ how many degrees at latitude 52°. Rough enough for a
// cosmetic radius on the order of metres.
const METRES_TO_DEG = 1 / (111000 * 0.78);   // 0.78 ≈ avg of 1 and cos(52°)

// Convert MIN_SMOOTH_AREA_M2 into the raw shoelace (deg²) space that
// geometryArea() below returns, so the size gate can compare directly
// without a per-feature conversion. At lat 52.27°, 1 (deg)² ≈
// 111 km × cos(52.27°) × 111 km ≈ 6.85e9 m².
const M2_PER_DEG2 = 111000 * (111000 * Math.cos(52.27 * Math.PI / 180));
const MIN_SMOOTH_AREA_DEG2 = MIN_SMOOTH_AREA_M2 / M2_PER_DEG2;

// Point / LineString features (basemap POIs, walking-act paths,
// tent icon marker, etc.) don't get rounded — no corners to soften.
const SMOOTHABLE_TYPES = new Set(['Polygon', 'MultiPolygon']);

function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
function add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
function scale(a, k) { return [a[0] * k, a[1] * k]; }
function len(a) { return Math.hypot(a[0], a[1]); }

// Angle between two 2D vectors, in degrees, [0, 180].
function angleBetweenDeg(v1, v2) {
    const dot = v1[0] * v2[0] + v1[1] * v2[1];
    const cos = dot / (len(v1) * len(v2));
    return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
}

// Quadratic bezier point at parameter t ∈ [0, 1] with control point p1.
function bezier(p0, p1, p2, t) {
    const u = 1 - t;
    return [
        u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
        u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    ];
}

// Round every sharp corner in a single ring (closed, first === last).
// Exported so a one-off script (or a future selective re-smooth) can
// call it on a single feature without the whole-file sentinel gate
// short-circuiting a per-feature refresh.  See
// tests/optimize-geojson.test.mjs when we add coverage.
export function roundRing(ring, radiusDeg) {
    // Strip the duplicate closing vertex; we'll re-add it at the end.
    const pts = ring.slice(0, -1);
    const n = pts.length;
    if (n < 3) return ring;

    const out = [];
    for (let i = 0; i < n; i++) {
        const prev = pts[(i - 1 + n) % n];
        const curr = pts[i];
        const next = pts[(i + 1) % n];

        // Turn angle = 180° minus interior angle. Small = almost
        // straight, keep vertex as-is.
        const inVec  = sub(curr, prev);
        const outVec = sub(next, curr);
        const turn = 180 - angleBetweenDeg(scale(inVec, -1), outVec);

        if (turn < TURN_ANGLE_THRESHOLD_DEG) {
            out.push(curr);
            continue;
        }

        // Cap the arc so it never exceeds half either adjacent edge.
        const inLen  = len(inVec);
        const outLen = len(outVec);
        const r = Math.min(radiusDeg, inLen / 2, outLen / 2);

        const backDir = scale(sub(prev, curr), 1 / inLen);
        const fwdDir  = scale(sub(next, curr), 1 / outLen);
        const p1 = add(curr, scale(backDir, r));
        const p2 = add(curr, scale(fwdDir,  r));

        out.push(p1);
        for (const t of BEZIER_STEPS) out.push(bezier(p1, curr, p2, t));
        out.push(p2);
    }

    // Re-close the ring.
    out.push(out[0]);
    return out;
}

export function roundGeometry(geom, radiusMetres) {
    const radiusDeg = radiusMetres * METRES_TO_DEG;
    if (geom.type === 'Polygon') {
        return {
            ...geom,
            coordinates: geom.coordinates.map((ring) => roundRing(ring, radiusDeg)),
        };
    }
    if (geom.type === 'MultiPolygon') {
        return {
            ...geom,
            coordinates: geom.coordinates.map((poly) =>
                poly.map((ring) => roundRing(ring, radiusDeg))
            ),
        };
    }
    return geom;
}

const round = (n) => Number(n.toFixed(COORD_PRECISION));

// Recursively round every number found inside a geometry's coordinates
// tree (Point / LineString / Polygon / MultiPolygon all reduce to the
// same "nested arrays of numbers" shape).
function roundCoords(node) {
    if (typeof node === 'number') return round(node);
    if (Array.isArray(node)) return node.map(roundCoords);
    return node;
}

// Planar polygon area via the shoelace formula. Good enough at this
// latitude for RELATIVE ordering (we only care which of two features
// is bigger, not the true m²). Points / LineStrings / GeometryCollections
// return 0 so they sort to the end.
function ringArea(ring) {
    let a = 0;
    for (let i = 0; i < ring.length - 1; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[i + 1];
        a += x1 * y2 - x2 * y1;
    }
    return Math.abs(a) / 2;
}
function geometryArea(geom) {
    if (!geom) return 0;
    if (geom.type === 'Polygon')      return ringArea(geom.coordinates[0]);
    if (geom.type === 'MultiPolygon') return geom.coordinates.reduce((s, poly) => s + ringArea(poly[0]), 0);
    return 0;
}

function pickProps(props) {
    if (!props || typeof props !== 'object') return {};
    const out = {};
    for (const key of Object.keys(props)) {
        if (KEEP_PROPS.has(key)) {
            const v = props[key];
            // Skip empty strings / nulls too — they're just dead weight.
            if (v !== null && v !== undefined && v !== '') out[key] = v;
        }
    }
    return out;
}

function optimize(fc, fileName) {
    // Guard against re-running polygon smoothing on already-smoothed
    // output. See the SMOOTH_ITERATIONS comment above; skipping this
    // block on the second run leaves the coord-round + sort passes
    // still idempotent while preventing vertex-count runaway.
    const alreadySmoothed = fc._smoothed === true;

    // File-level smoothing skip: whole-file utility categories
    // (toilets, bars, food stalls) never get rounded corners. See
    // SKIP_SMOOTH_FILES above.
    const fileSkipsSmoothing = SKIP_SMOOTH_FILES.has(fileName);

    const features = fc.features.map((f) => {
        let geometry = f.geometry;

        if (
            !alreadySmoothed &&
            !fileSkipsSmoothing &&
            geometry &&
            SMOOTHABLE_TYPES.has(geometry.type) &&
            // Size gate for the remaining files: skip tiny anonymous
            // shapes (< 100 m²) so a 2 m radius doesn't distort them.
            geometryArea(geometry) >= MIN_SMOOTH_AREA_DEG2
        ) {
            geometry = roundGeometry(geometry, BORDER_RADIUS_METRES);
        }

        return {
            type: 'Feature',
            properties: pickProps(f.properties),
            geometry: {
                ...geometry,
                coordinates: roundCoords(geometry.coordinates),
            },
        };
    });
    // Sort by descending polygon area so bigger polygons paint first
    // (draw at low index) and smaller ones paint on top (draw at high
    // index). Non-fill features (area 0) fall to the end but their
    // ordering is irrelevant — they go to the -point / -label layers,
    // not the -fill layer.
    features.sort((a, b) => geometryArea(b.geometry) - geometryArea(a.geometry));
    return {
        type: 'FeatureCollection',
        _smoothed: true,
        features,
    };
}

function human(n) {
    if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(2) + ' MB';
    if (n >= 1024) return (n / 1024).toFixed(1) + ' KB';
    return n + ' B';
}

const files = readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.geojson'))
    .map((f) => join(DATA_DIR, f));

let totalBefore = 0;
let totalAfter = 0;

for (const file of files) {
    const beforeText = readFileSync(file, 'utf8');
    const before = beforeText.length;
    totalBefore += before;

    const fc = JSON.parse(beforeText);
    if (fc.type !== 'FeatureCollection') {
        console.warn(`skip (not a FeatureCollection): ${basename(file)}`);
        continue;
    }
    const optimized = optimize(fc, basename(file));
    // Compact JSON output — no pretty printing. The build pipeline
    // already re-minifies but writing compact keeps the source diff
    // meaningful and cuts working-tree size too.
    const afterText = JSON.stringify(optimized);
    writeFileSync(file, afterText + '\n');
    const after = afterText.length + 1;
    totalAfter += after;

    const pct = (100 * (1 - after / before)).toFixed(1);
    console.log(
        `${basename(file).padEnd(28)} ${human(before).padStart(9)} → ${human(after).padStart(9)}  (−${pct}%)`
    );
}

console.log('─'.repeat(64));
const pct = (100 * (1 - totalAfter / totalBefore)).toFixed(1);
console.log(
    `${'total'.padEnd(28)} ${human(totalBefore).padStart(9)} → ${human(totalAfter).padStart(9)}  (−${pct}%)`
);
