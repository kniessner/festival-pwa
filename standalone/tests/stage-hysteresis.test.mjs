import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStageHysteresis } from '../js/helpers/stage-hysteresis.js';

// Fake clock: setTimeout registrations queue up with a target time,
// clearTimeout removes them, advance(ms) fires everything whose target
// is <= the new virtual time. Lets us drive the state machine
// deterministically without touching real setTimeout.
function makeFakeClock() {
    const timers = new Map();
    let nextId = 1;
    let now = 0;
    return {
        setTimeout(fn, ms) {
            const id = nextId++;
            timers.set(id, { fn, at: now + ms });
            return id;
        },
        clearTimeout(id) {
            timers.delete(id);
        },
        advance(ms) {
            now += ms;
            for (const [id, t] of [...timers]) {
                if (t.at <= now) {
                    timers.delete(id);
                    t.fn();
                }
            }
        },
        pendingCount() {
            return timers.size;
        },
    };
}

function makeHysteresis(clock, thresholdMs = 3000) {
    const commits = [];
    const h = createStageHysteresis({
        thresholdMs,
        setTimeout: clock.setTimeout.bind(clock),
        clearTimeout: clock.clearTimeout.bind(clock),
        onCommit: (v) => commits.push(v),
    });
    return { h, commits };
}

test('first fix commits immediately (no delay on cold start)', () => {
    const clock = makeFakeClock();
    const { h, commits } = makeHysteresis(clock);
    h.feed('schweissperle');
    assert.deepEqual(commits, ['schweissperle']);
    assert.equal(h.current, 'schweissperle');
});

test('same-stage feed is a no-op (cancels any pending swap)', () => {
    const clock = makeFakeClock();
    const { h, commits } = makeHysteresis(clock);
    h.feed('schweissperle');           // first fix
    h.feed('mirage');                  // starts a pending swap
    assert.equal(clock.pendingCount(), 1);
    h.feed('schweissperle');           // cancels the swap
    assert.equal(clock.pendingCount(), 0);
    clock.advance(5000);
    assert.deepEqual(commits, ['schweissperle']);
});

test('new candidate held for full window before committing', () => {
    const clock = makeFakeClock();
    const { h, commits } = makeHysteresis(clock, 3000);
    h.feed('schweissperle');
    h.feed('mirage');
    clock.advance(2999);
    assert.equal(h.current, 'schweissperle', 'not committed just before threshold');
    clock.advance(1);
    assert.equal(h.current, 'mirage', 'committed exactly at threshold');
    assert.deepEqual(commits, ['schweissperle', 'mirage']);
});

test('sustained same candidate does not restart the timer', () => {
    const clock = makeFakeClock();
    const { h, commits } = makeHysteresis(clock, 3000);
    h.feed('schweissperle');
    h.feed('mirage');       // starts 3s timer for mirage
    clock.advance(2000);
    h.feed('mirage');       // same candidate — should NOT reset timer
    clock.advance(1000);    // total 3000ms since first mirage
    assert.equal(h.current, 'mirage', 'committed on schedule, not reset');
});

test('candidate flap resets the timer', () => {
    const clock = makeFakeClock();
    const { h, commits } = makeHysteresis(clock, 3000);
    h.feed('schweissperle');
    h.feed('mirage');       // starts 3s timer for mirage
    clock.advance(2000);
    h.feed('dezentral');    // different candidate — restarts with dezentral
    clock.advance(2999);
    assert.equal(h.current, 'schweissperle', 'not committed — restart deferred');
    clock.advance(1);
    assert.equal(h.current, 'dezentral', 'commits dezentral, not mirage');
    assert.deepEqual(commits, ['schweissperle', 'dezentral']);
});

test('coord-null clears immediately and cancels pending', () => {
    const clock = makeFakeClock();
    const { h, commits } = makeHysteresis(clock);
    h.feed('schweissperle');
    h.feed('mirage');            // pending swap
    h.feed(null);                // no-fix — clears immediately
    assert.equal(h.current, null);
    assert.equal(clock.pendingCount(), 0);
    assert.deepEqual(commits, ['schweissperle', null]);
});

test('false (getStage no-match) is treated identically to null', () => {
    const clock = makeFakeClock();
    const { h, commits } = makeHysteresis(clock);
    h.feed('schweissperle');
    h.feed(false);
    assert.equal(h.current, null);
    assert.deepEqual(commits, ['schweissperle', null]);
});

test('cancel() clears any in-flight swap without committing', () => {
    const clock = makeFakeClock();
    const { h, commits } = makeHysteresis(clock);
    h.feed('schweissperle');
    h.feed('mirage');
    h.cancel();
    clock.advance(5000);
    assert.equal(h.current, 'schweissperle');
    assert.deepEqual(commits, ['schweissperle']);
});

test('null → stage is the first-fix path (immediate commit)', () => {
    const clock = makeFakeClock();
    const { h, commits } = makeHysteresis(clock);
    h.feed(null);                     // no-fix before any stage
    assert.equal(h.current, null);
    assert.deepEqual(commits, []);    // clearing null-to-null is a no-op
    h.feed('schweissperle');
    assert.deepEqual(commits, ['schweissperle']); // first REAL fix commits
});
