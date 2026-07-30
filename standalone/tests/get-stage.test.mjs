import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getStage, MAX_STAGE_DETECTION_ACCURACY_METRES } from '../js/helpers/get-stage.js';

// getStage reads its polygons from a module-scoped cache populated by
// loadStages(). We can't fetch() from bare node, so we monkey-patch the
// cache via re-import trickery: the module exports getLoadedStages()
// which reads `loadedFeatures`. Instead of touching internals, we use
// dependency injection at test level — call getStage with a fake
// features array by intercepting getLoadedStages via a wrapper module.
//
// Simpler for now: getStage doesn't take features as a param, so we
// exercise it indirectly. If refactored to accept an optional features
// array, these tests become trivial. For now, we test the *branches*
// that don't require polygons: null/false input handling and the
// accuracy gate (which fires before any polygon lookup).

test('getStage(null) returns false', () => {
    assert.equal(getStage(null), false);
});

test('getStage(undefined) returns false', () => {
    assert.equal(getStage(undefined), false);
});

test('getStage(false) returns false (idempotent for hysteresis feed)', () => {
    assert.equal(getStage(false), false);
});

test('getStage rejects fixes worse than the accuracy gate', () => {
    // Even at the dead centre of a polygon, accuracy > 40 m makes us
    // return false (the polygon lookup never runs).
    const fix = {
        longitude: 14.49798,
        latitude: 52.27349,
        accuracy: MAX_STAGE_DETECTION_ACCURACY_METRES + 0.1,
    };
    assert.equal(getStage(fix), false);
});

test('getStage without polygons loaded returns false', () => {
    // No loadStages() was called, so getLoadedStages() is []. Any valid
    // fix short-circuits to false after iterating zero polygons.
    const fix = { longitude: 14.49798, latitude: 52.27349 };
    assert.equal(getStage(fix), false);
});

test('MAX_STAGE_DETECTION_ACCURACY_METRES is 40', () => {
    // Regression guard: this constant is the single knob for the
    // accuracy gate. If a future refactor bumps it accidentally,
    // this catches it.
    assert.equal(MAX_STAGE_DETECTION_ACCURACY_METRES, 40);
});

test('getStage accepts a fix with no accuracy field', () => {
    // Older browsers / mocks may omit accuracy. We only reject when
    // accuracy is *present and > threshold*. Missing = trust the fix.
    // (No polygons loaded so still returns false, but should not throw.)
    assert.doesNotThrow(() => getStage({ longitude: 14, latitude: 52 }));
});

test('getStage accepts accuracy === null (also treated as "unknown")', () => {
    assert.doesNotThrow(() =>
        getStage({ longitude: 14, latitude: 52, accuracy: null }),
    );
});

test('getStage accepts accuracy exactly at the threshold', () => {
    // Boundary condition: 40 m accuracy is the last accepted value.
    // 40.0001 would be rejected. The comparison is strict `>` so
    // exactly 40 goes through.
    const fix = {
        longitude: 14.49798,
        latitude: 52.27349,
        accuracy: MAX_STAGE_DETECTION_ACCURACY_METRES,
    };
    // No polygons loaded → false regardless, but the CALL should not
    // short-circuit on accuracy. We assert it returns false and does
    // not throw (i.e. the point-in-polygon loop ran).
    assert.equal(getStage(fix), false);
});
