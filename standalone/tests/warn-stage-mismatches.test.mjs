import { test } from 'node:test';
import assert from 'node:assert/strict';
import { warnStageNameMismatches } from '../js/helpers/get-stage.js';

// Capture console.warn / console.info calls so tests can assert on
// which channel each drift kind lands in. Round-4 split them so
// "missing polygon" (real bug) stays on warn while "orphan polygon"
// (informational) demotes to info.
function captureLogs(fn) {
    const originalWarn = console.warn;
    const originalInfo = console.info;
    const warns = [];
    const infos = [];
    console.warn = (...args) => warns.push(args);
    console.info = (...args) => infos.push(args);
    try {
        fn();
    } finally {
        console.warn = originalWarn;
        console.info = originalInfo;
    }
    return { warns, infos };
}

// warnStageNameMismatches now takes a Set<string> of slugs the timetable
// model actually references (union of timetable.filters.stages[].value
// and music.events[].stage), so the helper stays free of data-shape
// dependencies. The four tests below cover the four inputs the caller
// might realistically hand in.

test('undefined input → silent no-op', () => {
    const { warns, infos } = captureLogs(() => warnStageNameMismatches(undefined));
    assert.equal(warns.length, 0);
    assert.equal(infos.length, 0);
});

test('non-Set input (e.g. plain object left over from old callers) → silent no-op', () => {
    const { warns, infos } = captureLogs(() => warnStageNameMismatches({ stages: 'nope' }));
    assert.equal(warns.length, 0);
    assert.equal(infos.length, 0);
});

test('empty Set → silent no-op', () => {
    const { warns, infos } = captureLogs(() => warnStageNameMismatches(new Set()));
    assert.equal(warns.length, 0);
    assert.equal(infos.length, 0);
});

test('only generic slugs (walking-act, dezentral) → silent no-op', () => {
    // Both are UX buckets, not physical locations. GENERIC_TIMETABLE_SLUGS
    // excludes them from the "missing polygon" check by design.
    const { warns, infos } = captureLogs(() =>
        warnStageNameMismatches(new Set(['walking-act', 'dezentral'])),
    );
    assert.equal(warns.length, 0);
    assert.equal(infos.length, 0);
});

test('used slug with no polygon → warns as missing on console.warn', () => {
    // No polygons loaded (getLoadedStages() → []), so schweissperle is
    // "used but unbacked". walking-act stays exempt.
    const { warns, infos } = captureLogs(() =>
        warnStageNameMismatches(new Set(['schweissperle', 'walking-act'])),
    );
    assert.equal(warns.length, 1, 'exactly one warn for the real drift');
    assert.match(warns[0][0], /timetable slugs without polygons/);
    assert.deepEqual(warns[0][1], ['schweissperle']);
    // No polygons loaded, so no orphan-polygon side either.
    assert.equal(infos.length, 0);
});
