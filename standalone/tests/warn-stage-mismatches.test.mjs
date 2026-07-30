import { test } from 'node:test';
import assert from 'node:assert/strict';
import { warnStageNameMismatches } from '../js/helpers/get-stage.js';

// Capture console.warn calls so tests can assert on messages.
function captureWarn(fn) {
    const original = console.warn;
    const calls = [];
    console.warn = (...args) => calls.push(args);
    try {
        fn();
    } finally {
        console.warn = original;
    }
    return calls;
}

test('no filters object → silent no-op', () => {
    const calls = captureWarn(() => warnStageNameMismatches(undefined));
    assert.equal(calls.length, 0);
});

test('filters with non-array stages → silent no-op', () => {
    const calls = captureWarn(() => warnStageNameMismatches({ stages: 'nope' }));
    assert.equal(calls.length, 0);
});

test('empty filters + empty polygons → no warnings', () => {
    // getStage's loadedFeatures starts as null, getLoadedStages() returns [].
    // With no timetable slugs either, there is no drift to warn about.
    const calls = captureWarn(() => warnStageNameMismatches({ stages: [] }));
    assert.equal(calls.length, 0);
});

test('walking-act in timetable is excluded from mismatch check', () => {
    // walking-act has no polygon by design. A single timetable stage of
    // walking-act with zero loaded polygons should trigger no warnings.
    const calls = captureWarn(() =>
        warnStageNameMismatches({
            stages: [{ value: 'walking-act', label: 'Walking Act' }],
        }),
    );
    assert.equal(calls.length, 0);
});

test('timetable slug with no polygon → warns as missing', () => {
    // With no polygons loaded (getLoadedStages() → []), any non-walking-act
    // slug in the timetable is missing a polygon.
    const calls = captureWarn(() =>
        warnStageNameMismatches({
            stages: [
                { value: 'schweissperle', label: 'Schweissperle' },
                { value: 'walking-act', label: 'Walking Act' },
            ],
        }),
    );
    // Exactly one warn, about the missing polygon for schweissperle.
    assert.equal(calls.length, 1);
    assert.match(calls[0][0], /timetable slugs without polygons/);
    assert.deepEqual(calls[0][1], ['schweissperle']);
});
