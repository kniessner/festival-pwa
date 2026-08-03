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
