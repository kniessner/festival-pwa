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
    // schweissperle in the current geojson is one of nine 30m x 30m squares
    // strung along the north shore of Helenesee (all at ~52.283 N).
    // Centre is (14.491, 52.283).
    const schweissperle = [
        [14.490780, 52.283135],
        [14.491220, 52.283135],
        [14.491220, 52.282865],
        [14.490780, 52.282865],
        [14.490780, 52.283135],
    ];
    // Dead centre — inside.
    assert.equal(isPointInPolygon([14.491, 52.283], schweissperle), true);
    // Well outside the polygon (way north) — outside.
    assert.equal(isPointInPolygon([14.491, 52.290000], schweissperle), false);
    // Just to the east of this polygon (in the gap before skalahara) — outside.
    assert.equal(isPointInPolygon([14.4925, 52.283], schweissperle), false);
});

test('degenerate polygon (fewer than 3 unique vertices) never contains anything', () => {
    const line = [[0, 0], [1, 1], [0, 0]];
    assert.equal(isPointInPolygon([0.5, 0.5], line), false);
});
