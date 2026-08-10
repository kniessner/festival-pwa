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

function optimize(fc) {
    const features = fc.features.map((f) => ({
        type: 'Feature',
        properties: pickProps(f.properties),
        geometry: {
            ...f.geometry,
            coordinates: roundCoords(f.geometry.coordinates),
        },
    }));
    // Sort by descending polygon area so bigger polygons paint first
    // (draw at low index) and smaller ones paint on top (draw at high
    // index). Non-fill features (area 0) fall to the end but their
    // ordering is irrelevant — they go to the -point / -label layers,
    // not the -fill layer.
    features.sort((a, b) => geometryArea(b.geometry) - geometryArea(a.geometry));
    return {
        type: 'FeatureCollection',
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
    const optimized = optimize(fc);
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
