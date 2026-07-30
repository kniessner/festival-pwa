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

test('a real bucht polygon: schweissperle from stages.geojson', async () => {
    // Row 1 col 2 of the 3x3 dummy grid: 14.496878..14.499082, 52.272816..52.274164.
    // Centre is (14.49798, 52.27349), which is where we position the Bucht PNG.
    const schweissperle = [
        [14.496878, 52.274164],
        [14.499082, 52.274164],
        [14.499082, 52.272816],
        [14.496878, 52.272816],
        [14.496878, 52.274164],
    ];
    // Dead centre — inside.
    assert.equal(isPointInPolygon([14.49798, 52.27349], schweissperle), true);
    // North of the polygon — outside.
    assert.equal(isPointInPolygon([14.49798, 52.280000], schweissperle), false);
    // In the ~50 m gap between schweissperle and cuddle-poodle — outside.
    assert.equal(isPointInPolygon([14.49798, 52.274500], schweissperle), false);
});

test('degenerate polygon (fewer than 3 unique vertices) never contains anything', () => {
    const line = [[0, 0], [1, 1], [0, 0]];
    assert.equal(isPointInPolygon([0.5, 0.5], line), false);
});
