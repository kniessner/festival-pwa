import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Hand-rolled globals harness, same approach as onboarding.test.mjs.
// event-type-filter.js touches store.js (module-level getLang() call) and
// i18n.js (t()'s own getLang() call), both needing localStorage/navigator.

function installGlobals({ localStorageState = {} } = {}) {
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
}

beforeEach(() => {
    installGlobals({ localStorageState: { 'bucht-lang': 'de' } });
});

test('isMusicEvent checks category === "Music"', async () => {
    const { isMusicEvent } = await import('../js/event-type-filter.js');

    assert.equal(isMusicEvent({ category: 'Music' }), true);
    assert.equal(isMusicEvent({ category: 'Workshop' }), false);
    assert.equal(isMusicEvent({ category: '' }), false);
    assert.equal(isMusicEvent({}), false);
});

test('matchesEventType filters to music events when the music tab is active', async () => {
    const { store } = await import('../js/store.js');
    const { matchesEventType } = await import('../js/event-type-filter.js');

    store.eventTypeFilter = 'music';
    assert.equal(matchesEventType({ category: 'Music' }), true);
    assert.equal(matchesEventType({ category: 'Workshop' }), false);
});

test('matchesEventType filters to non-music events when the culture tab is active', async () => {
    const { store } = await import('../js/store.js');
    const { matchesEventType } = await import('../js/event-type-filter.js');

    store.eventTypeFilter = 'culture';
    assert.equal(matchesEventType({ category: 'Music' }), false);
    assert.equal(matchesEventType({ category: 'Workshop' }), true);
    assert.equal(matchesEventType({ category: 'Talk' }), true);
});

test('resetTypeSpecificFilters resets stage/category to "all", leaves other keys untouched', async () => {
    const { resetTypeSpecificFilters } = await import('../js/event-type-filter.js');

    const filters = { stage: 'atlantis', category: 'workshop', day: 'friday' };
    resetTypeSpecificFilters(filters);

    assert.equal(filters.stage, 'all');
    assert.equal(filters.category, 'all');
    assert.equal(filters.day, 'friday', 'day is untouched — it is not type-specific');
});

test('stagesForCurrentType only returns stage options with at least one event of the active type', async () => {
    const { store } = await import('../js/store.js');
    const { stagesForCurrentType } = await import('../js/event-type-filter.js');

    const events = [
        { category: 'Music', stage: 'atlantis' },
        { category: 'Music', stage: 'waldtraut' },
        { category: 'Workshop', stage: 'dezentral' },
    ];
    const stageOptions = [
        { value: 'atlantis', label: 'Atlantis' },
        { value: 'waldtraut', label: 'Waldtraut' },
        { value: 'dezentral', label: 'Dezentral' },
    ];

    store.eventTypeFilter = 'music';
    const musicStages = stagesForCurrentType(events, stageOptions).map(s => s.value);
    assert.deepEqual(musicStages.sort(), ['atlantis', 'waldtraut']);

    store.eventTypeFilter = 'culture';
    const cultureStages = stagesForCurrentType(events, stageOptions).map(s => s.value);
    assert.deepEqual(cultureStages, ['dezentral']);
});

test('renderEventTypeTabs marks the active tab and uses the given action name', async () => {
    const { store } = await import('../js/store.js');
    const { renderEventTypeTabs } = await import('../js/event-type-filter.js');

    store.eventTypeFilter = 'music';
    const html = renderEventTypeTabs('set-event-type');

    assert.match(html, /data-action="set-event-type"/);
    assert.match(html, /<button class="tt-type-tab active" data-action="set-event-type" data-type="music">/);
    assert.match(html, /<button class="tt-type-tab " data-action="set-event-type" data-type="culture">/);
});
