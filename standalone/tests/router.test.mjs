import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Hand-rolled DOM + globals harness, same approach as onboarding.test.mjs.
// renderNav() touches:
//   - document.getElementById('menuTriggerLabel'|'menuNavList')
//   - store.currentPage, store.pageData (real singleton, mutated directly)
//   - localStorage (transitively, via i18n.js's getLang() and
//     favorites.js's getFavorites())
// router.js also transitively imports views/timetable-grid.js, which
// binds document.addEventListener('locationchange', ...) at module-load
// time — stubbed as a no-op, same as menu.test.mjs.
//
// Only renderNav() is covered here, not loadPage() — loadPage() isn't
// changed by this task, and testing it would require stubbing every view
// renderer (home.js, timetable.js, etc.), well beyond this task's scope.

function makeElement(id) {
    let text = '';
    let html = '';
    return {
        id,
        get textContent() { return text; },
        set textContent(v) { text = v; },
        get innerHTML() { return html; },
        set innerHTML(v) { html = v; },
    };
}

function installGlobals({ localStorageState = {} } = {}) {
    const elements = new Map();
    for (const id of ['menuTriggerLabel', 'menuNavList']) {
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

test('renderNav lists the 4 real pages (excluding hidden home) plus the enabled Festivalmap row', async () => {
    const { doc } = installGlobals({ localStorageState: { 'bucht-lang': 'de' } });
    const { store } = await import('../js/store.js');
    store.currentPage = 2; // 'timetable'

    const { renderNav } = await import('../js/router.js');
    renderNav();

    const html = doc._elements.get('menuNavList').innerHTML;
    for (const slug of ['favorites', 'timetable', 'grid', 'info', 'map']) {
        assert.match(html, new RegExp(`data-slug="${slug}"`), `${slug} row present`);
    }
    assert.doesNotMatch(html, /data-slug="home"/, 'home row excluded');
    // Festivalmap was a disabled placeholder pre-`interactive-map-basemap`;
    // that page is now live so the disabled class must be gone.
    assert.doesNotMatch(html, /menu-item-disabled/, 'Festivalmap no longer a placeholder');
});

test('renderNav includes a Cashless link that opens the Weezevent widget in a new tab', async () => {
    const { doc } = installGlobals({ localStorageState: { 'bucht-lang': 'de' } });
    const { store } = await import('../js/store.js');
    store.currentPage = 2;

    const { renderNav } = await import('../js/router.js');
    renderNav();

    const html = doc._elements.get('menuNavList').innerHTML;
    assert.match(
        html,
        /<a class="menu-item-link" href="https:\/\/widget\.weezevent\.com\/pay\/410675\/widgets\/c17f233e-6562-413e-9187-b6663d72afd2\/login" target="_blank" rel="noopener noreferrer">/,
        'Cashless link has the exact URL and opens in a new tab'
    );
    assert.match(html, />Cashless</, 'labelled Cashless');
});

test('renderNav marks the current page active and updates the trigger label', async () => {
    const { doc } = installGlobals({ localStorageState: { 'bucht-lang': 'de' } });
    const { store } = await import('../js/store.js');
    store.currentPage = 3; // 'grid' — see PAGES order in config.js

    const { renderNav } = await import('../js/router.js');
    renderNav();

    const html = doc._elements.get('menuNavList').innerHTML;
    assert.match(
        html,
        /<button class="active" data-action="load-page" data-page="3" data-slug="grid">/,
        'grid button has the active class and correct index'
    );
    assert.match(
        html,
        /<button class="" data-action="load-page" data-page="1" data-slug="favorites">/,
        'favorites button is present but not active'
    );
    assert.equal(doc._elements.get('menuTriggerLabel').textContent, 'Timetable');
});

test('renderNav shows the favorites badge only when count > 0', async () => {
    const { doc } = installGlobals({
        localStorageState: {
            'bucht-lang': 'de',
            'bucht-favorites': JSON.stringify([{ page: 'timetable', index: 0 }]),
        },
    });
    const { store } = await import('../js/store.js');
    store.currentPage = 1;
    store.pageData.timetable = { events: [{ title: 'Some Act' }] };

    const { renderNav } = await import('../js/router.js');
    renderNav();

    assert.match(doc._elements.get('menuNavList').innerHTML, /nav-badge">1</);
});

test('renderNav omits the favorites badge when count is 0', async () => {
    const { doc } = installGlobals({ localStorageState: { 'bucht-lang': 'de' } });
    const { store } = await import('../js/store.js');
    store.currentPage = 1;
    store.pageData.timetable = { events: [] };

    const { renderNav } = await import('../js/router.js');
    renderNav();

    assert.doesNotMatch(doc._elements.get('menuNavList').innerHTML, /nav-badge/);
});
