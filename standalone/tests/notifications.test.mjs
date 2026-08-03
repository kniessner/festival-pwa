import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Hand-rolled DOM + globals harness, same approach as onboarding.test.mjs.
// notifications.js (transitively, via store.js's module-level
// `lang: getLang()`) touches:
//   - document.getElementById('notificationsModal'|'notificationsList')
//   - element.innerHTML, element.classList.add/remove/contains
//   - localStorage.getItem/setItem (via i18n.js's getLang and this
//     module's own seen-ids tracking)
//   - navigator.language (via i18n.js's getLang fallback)

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
        },
    };
}

function installGlobals({ localStorageState = {} } = {}) {
    const elements = new Map();
    for (const id of ['notificationsModal', 'notificationsList']) {
        elements.set(id, makeElement(id));
    }
    const doc = {
        getElementById: (id) => elements.get(id) || null,
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

test('getLatestNotification returns the first item when items exist', async () => {
    installGlobals({ localStorageState: { 'bucht-lang': 'de' } });
    const { store } = await import('../js/store.js');
    const { getLatestNotification } = await import('../js/notifications.js');

    store.pageData.notifications = { items: [
        { id: 1, question: 'First', answer: 'A', date: '2026-08-01' },
        { id: 2, question: 'Second', answer: 'B', date: '2026-07-30' },
    ] };

    const latest = getLatestNotification();
    assert.equal(latest.id, 1);
    assert.equal(latest.question, 'First');
});

test('getLatestNotification returns null when there are no items', async () => {
    const { store } = await import('../js/store.js');
    const { getLatestNotification } = await import('../js/notifications.js');

    store.pageData.notifications = { items: [] };
    assert.equal(getLatestNotification(), null);

    store.pageData.notifications = undefined;
    assert.equal(getLatestNotification(), null);
});

test('maybeShowNotifications still only shows unseen items (existing behavior unchanged)', async () => {
    const { doc } = installGlobals({
        localStorageState: {
            'bucht-lang': 'de',
            'bucht-notifications-seen': JSON.stringify([1]),
        },
    });
    const { store } = await import('../js/store.js');
    const { maybeShowNotifications } = await import('../js/notifications.js');

    store.pageData.notifications = { items: [
        { id: 1, question: 'Seen already', answer: 'A' },
        { id: 2, question: 'Still unseen', answer: 'B' },
    ] };

    maybeShowNotifications();

    const list = doc._elements.get('notificationsList');
    assert.doesNotMatch(list.innerHTML, /Seen already/, 'seen item excluded');
    assert.match(list.innerHTML, /Still unseen/, 'unseen item included');
});
