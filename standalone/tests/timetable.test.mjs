import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Hand-rolled DOM + globals harness, same approach as router.test.mjs.
// refreshTimetable() with an empty events array hits its early "no
// results" return right after the code under test here (the header
// filter button's active-class toggle), so this stub only needs the
// elements touched before that point.

function makeElement(id) {
    const classes = new Set();
    let html = '';
    return {
        id,
        get innerHTML() { return html; },
        set innerHTML(v) { html = v; },
        classList: {
            add: (c) => classes.add(c),
            remove: (c) => classes.delete(c),
            contains: (c) => classes.has(c),
            toggle: (c, force) => {
                const on = force === undefined ? !classes.has(c) : force;
                on ? classes.add(c) : classes.delete(c);
            },
        },
    };
}

function installGlobals({ localStorageState = {} } = {}) {
    const elements = new Map();
    for (const id of ['ttEvents', 'ttDayTabs', 'ttCategoryGroup', 'ttStagePills', 'headerFilterBtn']) {
        elements.set(id, makeElement(id));
    }
    const doc = {
        getElementById: (id) => elements.get(id) || null,
        addEventListener: () => {},
        _elements: elements,
    };
    Object.defineProperty(globalThis, 'document', { value: doc, configurable: true, writable: true });

    const ls = new Map(Object.entries(localStorageState));
    globalThis.localStorage = {
        getItem: (k) => ls.has(k) ? ls.get(k) : null,
        setItem: (k, v) => ls.set(k, String(v)),
        removeItem: (k) => ls.delete(k),
        clear: () => ls.clear(),
    };
    Object.defineProperty(globalThis, 'navigator', {
        value: { language: 'de-DE' }, configurable: true, writable: true,
    });

    return { doc };
}

beforeEach(() => {
    installGlobals({ localStorageState: { 'bucht-lang': 'de' } });
});

test('refreshTimetable marks the header filter button active only when stage or category is set', async () => {
    const { doc } = installGlobals({ localStorageState: { 'bucht-lang': 'de' } });
    const { store } = await import('../js/store.js');
    const { refreshTimetable } = await import('../js/views/timetable.js');

    store.pageData.timetable = {
        events: [],
        filters: { days: [], categories: [], stages: [] },
    };
    store.ttFilters = { stage: 'all', category: 'all', day: 'all' };
    store.eventTypeFilter = 'music';

    refreshTimetable();
    assert.equal(doc._elements.get('headerFilterBtn').classList.contains('active'), false, 'no filter set — inactive');

    store.ttFilters.stage = 'atlantis';
    refreshTimetable();
    assert.equal(doc._elements.get('headerFilterBtn').classList.contains('active'), true, 'stage set — active');

    store.ttFilters.stage = 'all';
    store.ttFilters.category = 'workshop';
    refreshTimetable();
    assert.equal(doc._elements.get('headerFilterBtn').classList.contains('active'), true, 'category set — active');

    store.ttFilters.category = 'all';
    refreshTimetable();
    assert.equal(doc._elements.get('headerFilterBtn').classList.contains('active'), false, 'reset back to inactive');
});

// renderEventCard() returns a plain HTML string — no DOM touched, so
// these need only the localStorage stub (for isFavorite) plus a
// store.pageData.timetable.events array containing the event under test
// (renderEventCard looks up its own index via .indexOf(ev)).

test('renderEventCard subline: no stage — just the title, no leading comma', async () => {
    installGlobals({ localStorageState: { 'bucht-lang': 'de' } });
    const { store } = await import('../js/store.js');
    const { renderEventCard } = await import('../js/views/timetable.js');

    const ev = { title: 'Momentarium', day: '2026-08-13', category: 'Space' };
    store.pageData.timetable = { events: [ev] };
    store.ttFilters = { day: '2026-08-13' };

    const html = renderEventCard(ev);
    assert.match(html, /<div class="tt-event-subline">Momentarium<\/div>/);
});

test('renderEventCard subline: stage present — joined with the title via a comma', async () => {
    installGlobals({ localStorageState: { 'bucht-lang': 'de' } });
    const { store } = await import('../js/store.js');
    const { renderEventCard } = await import('../js/views/timetable.js');

    const ev = { title: 'De Loite', stage_label: 'dezentral', day: '2026-08-13', category: 'Space' };
    store.pageData.timetable = { events: [ev] };
    store.ttFilters = { day: '2026-08-13' };

    const html = renderEventCard(ev);
    assert.match(html, /<div class="tt-event-subline"><strong>dezentral<\/strong>, De Loite<\/div>/);
});

test('renderEventCard meta: no time — just the category, no comma', async () => {
    installGlobals({ localStorageState: { 'bucht-lang': 'de' } });
    const { store } = await import('../js/store.js');
    const { renderEventCard } = await import('../js/views/timetable.js');

    const ev = { title: 'Momentarium', day: '2026-08-13', category: 'Space' };
    store.pageData.timetable = { events: [ev] };
    store.ttFilters = { day: '2026-08-13' };

    const html = renderEventCard(ev);
    assert.match(html, /<div class="tt-event-meta">Space<\/div>/);
});

test('renderEventCard meta: no category — just the time, no comma', async () => {
    installGlobals({ localStorageState: { 'bucht-lang': 'de' } });
    const { store } = await import('../js/store.js');
    const { renderEventCard } = await import('../js/views/timetable.js');

    const ev = { title: 'De Loite', day: '2026-08-13', time: 'DO 10:00', end_time: '21:00' };
    store.pageData.timetable = { events: [ev] };
    store.ttFilters = { day: '2026-08-13' };

    const html = renderEventCard(ev);
    assert.match(html, /<div class="tt-event-meta"><span class="event-time">DO 10:00 – 21:00<\/span><\/div>/);
});

test('renderEventCard meta: both time and category present — joined with a comma', async () => {
    installGlobals({ localStorageState: { 'bucht-lang': 'de' } });
    const { store } = await import('../js/store.js');
    const { renderEventCard } = await import('../js/views/timetable.js');

    const ev = { title: 'De Loite', day: '2026-08-13', time: 'DO 10:00', end_time: '21:00', category: 'Space' };
    store.pageData.timetable = { events: [ev] };
    store.ttFilters = { day: '2026-08-13' };

    const html = renderEventCard(ev);
    assert.match(html, /<div class="tt-event-meta"><span class="event-time">DO 10:00 – 21:00<\/span>, Space<\/div>/);
});
