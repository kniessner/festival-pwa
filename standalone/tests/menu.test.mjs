import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Hand-rolled DOM + globals harness, same approach as onboarding.test.mjs.
// openMenu() calls the real router.js renderNav(), which (until Task 4's
// cutover) still targets #pageNav — included in the stub purely so that
// call doesn't crash; this file's assertions are about menu.js's own
// behavior (modal open/close, news-preview rendering), not renderNav()'s
// output.

function makeElement(id) {
    const classes = new Set();
    let html = '';
    let text = '';
    return {
        id,
        get innerHTML() { return html; },
        set innerHTML(v) { html = v; },
        get textContent() { return text; },
        set textContent(v) { text = v; },
        classList: {
            add: (c) => classes.add(c),
            remove: (c) => classes.delete(c),
            contains: (c) => classes.has(c),
        },
    };
}

function installGlobals({ localStorageState = {} } = {}) {
    const elements = new Map();
    for (const id of [
        'pageNav', 'menuModal', 'menuModalTitle', 'menuNavList',
        'menuTriggerLabel', 'menuNewsPreviewContent',
    ]) {
        elements.set(id, makeElement(id));
    }
    const doc = {
        getElementById: (id) => elements.get(id) || null,
        // openMenu() → router.js → views/timetable-grid.js, which binds a
        // 'locationchange' listener at module-load time (so fixes that
        // arrive before the grid view ever mounts aren't missed). Never
        // fires in this test — just needs to exist so the import doesn't
        // throw.
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

test('openMenu opens the modal, sets the title, and renders the latest notification', async () => {
    const { doc } = installGlobals({ localStorageState: { 'bucht-lang': 'de' } });
    const { store } = await import('../js/store.js');
    store.pageData.notifications = { items: [
        { id: 1, question: 'Latest one', answer: 'Body text', date: '2026-08-01' },
    ] };
    store.pageData.timetable = { events: [], filters: {} };

    const { openMenu } = await import('../js/menu.js');
    openMenu();

    assert.equal(doc._elements.get('menuModal').classList.contains('open'), true);
    assert.equal(doc._elements.get('menuModalTitle').textContent, 'Menü');
    assert.match(doc._elements.get('menuNewsPreviewContent').innerHTML, /Latest one/);
});

test('openMenu renders the empty-state copy when there are no notifications', async () => {
    const { doc } = installGlobals({ localStorageState: { 'bucht-lang': 'de' } });
    const { store } = await import('../js/store.js');
    store.pageData.notifications = { items: [] };
    store.pageData.timetable = { events: [], filters: {} };

    const { openMenu } = await import('../js/menu.js');
    openMenu();

    assert.match(
        doc._elements.get('menuNewsPreviewContent').innerHTML,
        /Aktuelle News werden hier angezeigt/
    );
});

test('closeMenu removes the open class', async () => {
    const { doc } = installGlobals({ localStorageState: { 'bucht-lang': 'de' } });
    doc._elements.get('menuModal').classList.add('open');

    const { closeMenu } = await import('../js/menu.js');
    closeMenu();

    assert.equal(doc._elements.get('menuModal').classList.contains('open'), false);
});
