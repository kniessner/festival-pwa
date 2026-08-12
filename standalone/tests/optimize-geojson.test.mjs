// Tests for scripts/optimize-geojson.mjs — specifically the exported
// helpers used by one-off "smooth this ONE feature" scripts.  We only
// cover the helpers we call from outside the pipeline; the full-file
// optimize pass has its own eyeball-verification via the deploy diff.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundRing, roundGeometry, BORDER_RADIUS_METRES } from '../scripts/optimize-geojson.mjs';

const METRES_TO_DEG = 1 / (111000 * 0.78);
const R_DEG = BORDER_RADIUS_METRES * METRES_TO_DEG;

// A well-formed rectangle just to sanity-check the happy path: no
// nulls, roughly 4× the vertex count from bezier-smoothing each of
// the four corners.
test('roundRing rounds a clean rectangle without producing null vertices', () => {
    const ring = [
        [0, 0],
        [0.001, 0],
        [0.001, 0.001],
        [0, 0.001],
        [0, 0],
    ];
    const out = roundRing(ring, R_DEG);
    assert.ok(out.length > ring.length, 'rounded ring should have more vertices');
    for (const [x, y] of out) {
        assert.ok(Number.isFinite(x) && Number.isFinite(y), `vertex must be finite, got [${x}, ${y}]`);
    }
});

// Regression: the bassliner polygon (traffic.geojson) shipped with a
// duplicate consecutive vertex from Felt, which turned into a zero-
// length edge inside roundRing.  Dividing by that edge length produced
// NaN → JSON null → MapLibre "wrap around the world" ring.  The visible
// symptom was a phantom "Bassliner" label floating over the bay.
// This test locks the two guards in place:
//   1. dedupe consecutive identical vertices before processing, so
//      the duplicated corner still rounds (not just gets skipped)
//   2. skip a vertex if EITHER adjacent edge is zero-length as a
//      last-line defence against any degenerate input we didn't
//      anticipate
test('roundRing tolerates duplicate consecutive vertices (bassliner regression)', () => {
    const ring = [
        [14.492905, 52.278253],
        [14.492725, 52.278655],
        [14.494075, 52.278876],
        [14.494237, 52.278485],
        [14.494237, 52.278485],   // ← duplicate that broke commit 6884686
        [14.492905, 52.278253],
    ];
    const out = roundRing(ring, R_DEG);
    for (const [x, y] of out) {
        assert.ok(Number.isFinite(x) && Number.isFinite(y), `vertex must be finite, got [${x}, ${y}]`);
    }
    // Dedupe → 4 unique corners × 5 bezier points + closing vertex.
    assert.equal(out.length, 21);
});

// roundGeometry is a thin wrapper; a smoke test that it delegates
// correctly and preserves the geometry envelope is enough.
test('roundGeometry preserves Polygon/MultiPolygon type and produces finite coords', () => {
    const poly = {
        type: 'Polygon',
        coordinates: [[[0, 0], [0.001, 0], [0.001, 0.001], [0, 0.001], [0, 0]]],
    };
    const rounded = roundGeometry(poly, BORDER_RADIUS_METRES);
    assert.equal(rounded.type, 'Polygon');
    for (const ring of rounded.coordinates) {
        for (const [x, y] of ring) {
            assert.ok(Number.isFinite(x) && Number.isFinite(y));
        }
    }

    const multi = { type: 'MultiPolygon', coordinates: [poly.coordinates] };
    const roundedMulti = roundGeometry(multi, BORDER_RADIUS_METRES);
    assert.equal(roundedMulti.type, 'MultiPolygon');
    for (const p of roundedMulti.coordinates) {
        for (const ring of p) {
            for (const [x, y] of ring) {
                assert.ok(Number.isFinite(x) && Number.isFinite(y));
            }
        }
    }
});
