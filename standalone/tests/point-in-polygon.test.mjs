import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPointInPolygon } from '../js/helpers/point-in-polygon.js';

// point-in-polygon is the primitive underneath getStage. We test it
// here rather than through getStage so failures point at the right
// layer. Boundary behaviour is deliberately not asserted — ray-casting
// flips state at edge crossings, so on-boundary results are undefined.

const unitSquare = [[0, 0], [1, 0], [1, 1], [0, 1]];

test('point strictly inside a unit square', () => {
    assert.equal(isPointInPolygon([0.5, 0.5], unitSquare), true);
});

test('point strictly outside a unit square', () => {
    assert.equal(isPointInPolygon([1.5, 0.5], unitSquare), false);
    assert.equal(isPointInPolygon([-0.1, 0.5], unitSquare), false);
    assert.equal(isPointInPolygon([0.5, 2], unitSquare), false);
});

test('a real bucht polygon: schweissperle from stages.geojson', () => {
    // schweissperle in the real geojson is an irregular hexagon on the
    // north side of the festival site (~52.2763 N, 14.4954 E).
    const schweissperle = [
        [14.495101, 52.276442],
        [14.495049, 52.276191],
        [14.495705, 52.276123],
        [14.495779, 52.27622],
        [14.495844, 52.276294],
        [14.495761, 52.276365],
        [14.495691, 52.276425],
        [14.495101, 52.276442],
    ];
    // Roughly the centre of the polygon — inside.
    assert.equal(isPointInPolygon([14.4954, 52.2763], schweissperle), true);
    // Well north of the polygon — outside.
    assert.equal(isPointInPolygon([14.4954, 52.2775], schweissperle), false);
    // Just east of the polygon — outside.
    assert.equal(isPointInPolygon([14.4965, 52.2763], schweissperle), false);
});

test('degenerate polygon (fewer than 3 unique vertices) never contains anything', () => {
    const line = [[0, 0], [1, 1], [0, 0]];
    assert.equal(isPointInPolygon([0.5, 0.5], line), false);
});
