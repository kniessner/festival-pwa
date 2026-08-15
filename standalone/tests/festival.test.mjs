// Regression tests for the day-boundary bug users reported on Aug 12/13
// 2026: at wall-clock Sat 00:00 the grid still showed Friday, and events
// crossing midnight (Cuddle Poodle 09:30 → 03:30) never got the
// "playing now" pulse after wall-clock midnight.
//
// Focus of this file: isEventRunning + isEventPlayingAt + eventPlayingRange.
// The stale-gridDay half of the fix (renderGridTimetable + visibility
// handler) lives in the DOM layer and is out of scope here.

import { test } from 'node:test';
import assert from 'node:assert/strict';

// isEventRunning / isEventPlayingAt / eventPlayingRange read `new Date()`
// directly.  Install a lightweight Date shim BEFORE importing the module,
// then reset it at the end of each test — otherwise the mock leaks into
// downstream tests via the shared Date global.
const RealDate = Date;
function withMockedNow(iso, fn) {
    class MockDate extends RealDate {
        constructor(...args) {
            if (args.length === 0) super(iso);
            else super(...args);
        }
        static now() { return new RealDate(iso).getTime(); }
    }
    // Keep parse / UTC static methods available.
    MockDate.parse = RealDate.parse;
    MockDate.UTC   = RealDate.UTC;
    globalThis.Date = MockDate;
    try { return fn(); }
    finally { globalThis.Date = RealDate; }
}

// Fresh dynamic import each test so the module picks up the freshly-mocked
// Date global at parse time (config.js only reads FESTIVAL_DATES statically,
// so no cache-busting needed there).
async function loadFestival() {
    return await import('../js/festival.js');
}

// Event fixtures modelled on real timetable.json entries.
const bodyOfPleasure = {
    title: 'Body of Pleasure',
    day: '2026-08-14',              // Friday
    start_time: '00:00',
    end_time:   '01:30',
};
const cuddlePoodle = {
    // Crosses midnight in wall-clock time — 09:30 Friday through
    // 03:30 Saturday.  The specific event the users reported as
    // "not pulsing after midnight".
    title: 'Cuddle Poodle',
    day: '2026-08-14',              // Friday
    start_time: '09:30',
    end_time:   '03:30',
};
const morningYoga = {
    title: 'Morning Yoga',
    day: '2026-08-15',              // Saturday
    start_time: '09:00',
    end_time:   '10:30',
};
const noTimeEvent = {
    title: 'Space (no time)',
    day: '2026-08-14',
    start_time: '',
    end_time:   '',
};

test('eventPlayingRange: literal-day anchor (start_time < 6am is NOT shifted)', async () => {
    const { eventPlayingRange } = await loadFestival();
    const r = eventPlayingRange(bodyOfPleasure);
    // Body of Pleasure day=Friday, start=00:00 → wall-clock Fri 00:00,
    // NOT Sat 00:00.  Matches blockDayFor's literal-date assumption
    // (event lands in Thursday's overnight block per the grid).
    assert.equal(r.startAt.toISOString().slice(0, 16), '2026-08-13T22:00');   // Fri 00:00 CEST = UTC 22:00 the previous day
    assert.equal(r.endAt.toISOString().slice(0, 16),   '2026-08-13T23:30');
});

test('eventPlayingRange: end time before start time bumps end forward one day', async () => {
    const { eventPlayingRange } = await loadFestival();
    const r = eventPlayingRange(cuddlePoodle);
    // Cuddle Poodle Fri 09:30 → next-day 03:30.  Without the wrap fix
    // endAt would land BEFORE startAt and no time would ever match.
    assert.equal(r.startAt.toISOString().slice(0, 16), '2026-08-14T07:30');
    assert.equal(r.endAt.toISOString().slice(0, 16),   '2026-08-15T01:30');
});

test('eventPlayingRange: no end_time falls back to 90-minute window', async () => {
    const { eventPlayingRange } = await loadFestival();
    const r = eventPlayingRange({ ...bodyOfPleasure, end_time: '' });
    const delta = r.endAt.getTime() - r.startAt.getTime();
    assert.equal(delta, 90 * 60 * 1000);
});

test('eventPlayingRange: null / missing / unparseable inputs return null', async () => {
    const { eventPlayingRange } = await loadFestival();
    assert.equal(eventPlayingRange(null), null);
    assert.equal(eventPlayingRange(undefined), null);
    assert.equal(eventPlayingRange(noTimeEvent), null);
    assert.equal(eventPlayingRange({ ...bodyOfPleasure, start_time: 'nope' }), null);
    assert.equal(eventPlayingRange({ ...bodyOfPleasure, end_time: 'wat:xx' }), null);
});

test('isEventPlayingAt: Body of Pleasure playing at Fri 00:30 (mid-event)', async () => {
    const { isEventPlayingAt } = await loadFestival();
    withMockedNow('2026-08-14T00:30:00', () => {
        assert.equal(isEventPlayingAt(bodyOfPleasure), true);
    });
});

test('isEventPlayingAt: Body of Pleasure NOT playing at Sat 02:00 (long over)', async () => {
    // Regression: under the old literal-Date code the "past" case
    // worked for a completed same-day event.  Kept as a guard against
    // an over-zealous +24h shift bringing it back into "now".
    const { isEventPlayingAt } = await loadFestival();
    withMockedNow('2026-08-15T02:00:00', () => {
        assert.equal(isEventPlayingAt(bodyOfPleasure), false);
    });
});

test('isEventPlayingAt: Cuddle Poodle playing at Sat 02:00 (past midnight)', async () => {
    // THE regression that started this whole fix.  Old isEventRunning
    // did `(hh*60+mm) >= startMinutes && (...) <= endMinutes` \u2014 with
    // startMinutes=570 (09:30) and endMinutes=210 (03:30), current=120
    // (Sat 02:00) was outside the [570, 210] interval on either read,
    // so no pulse fired after midnight even though the event was
    // audibly still on stage.
    const { isEventPlayingAt } = await loadFestival();
    withMockedNow('2026-08-15T02:00:00', () => {
        assert.equal(isEventPlayingAt(cuddlePoodle), true);
    });
});

test('isEventPlayingAt: Cuddle Poodle playing at Fri 15:00 (mid-afternoon, well inside range)', async () => {
    const { isEventPlayingAt } = await loadFestival();
    withMockedNow('2026-08-14T15:00:00', () => {
        assert.equal(isEventPlayingAt(cuddlePoodle), true);
    });
});

test('isEventPlayingAt: Morning Yoga playing at Sat 09:30 (mid-event)', async () => {
    const { isEventPlayingAt } = await loadFestival();
    withMockedNow('2026-08-15T09:30:00', () => {
        assert.equal(isEventPlayingAt(morningYoga), true);
    });
});

test('isEventPlayingAt: Morning Yoga NOT playing at Fri 09:30 (wrong calendar day)', async () => {
    const { isEventPlayingAt } = await loadFestival();
    withMockedNow('2026-08-14T09:30:00', () => {
        assert.equal(isEventPlayingAt(morningYoga), false);
    });
});

test('isEventRunning: gates on ev.day === selectedDay before checking playing window', async () => {
    // Tab-scoped semantics: even if the event is physically playing,
    // it only paints .running on the tab that lists it.
    const { isEventRunning } = await loadFestival();
    withMockedNow('2026-08-15T02:00:00', () => {
        // Cuddle Poodle IS physically playing, and its ev.day is Friday.
        // On the Friday tab \u2192 running; on the Saturday tab \u2192 not.
        assert.equal(isEventRunning(cuddlePoodle, '2026-08-14'), true);
        assert.equal(isEventRunning(cuddlePoodle, '2026-08-15'), false);
    });
});

test('isEventRunning: no start_time still returns false (guard against noTime events)', async () => {
    const { isEventRunning } = await loadFestival();
    assert.equal(isEventRunning(noTimeEvent, '2026-08-14'), false);
});
