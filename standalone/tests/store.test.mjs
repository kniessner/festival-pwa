import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Hand-rolled DOM + globals harness, same approach as router.test.mjs.
// store.js's getLang() (called at module scope for the `store` singleton's
// initial `lang` field) reads localStorage + navigator.language.

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

function jsonResponse(body) {
    return { ok: true, json: async () => body };
}

function failedResponse() {
    return { ok: false, status: 503 };
}

test('fetchLocalized appends ?forceRefresh=1 only when requested', async () => {
    const calls = [];
    globalThis.fetch = async (url) => { calls.push(url); return jsonResponse({ ok: true }); };

    const { fetchLocalized } = await import('../js/store.js');
    await fetchLocalized('info.json', 'de');
    await fetchLocalized('info.json', 'de', { forceRefresh: true });

    assert.equal(calls[0], 'data/info.json');
    assert.equal(calls[1], 'data/info.json?forceRefresh=1');
});

test('refreshAllData overwrites store.pageData for every file that succeeds', async () => {
    globalThis.fetch = async (url) => jsonResponse({ url });

    const { store, refreshAllData } = await import('../js/store.js');
    const { failed } = await refreshAllData();

    assert.deepEqual(failed, []);
    assert.equal(store.pageData.info.url, 'data/info.json?forceRefresh=1');
    assert.equal(store.pageData.timetable.url, 'data/timetable.json?forceRefresh=1');
    // music.json is never localized — always fetched as 'de' regardless of store.lang.
    assert.equal(store.pageData.music.url, 'data/music.json?forceRefresh=1');
});

test('refreshAllData leaves existing pageData untouched for a slug whose refresh fails', async () => {
    globalThis.fetch = async (url) => {
        if (url.includes('notifications.json')) return failedResponse();
        return jsonResponse({ url });
    };

    const { store, refreshAllData } = await import('../js/store.js');
    store.pageData.notifications = { existing: true };

    const { failed } = await refreshAllData();

    assert.deepEqual(failed, ['notifications']);
    assert.deepEqual(store.pageData.notifications, { existing: true });
    assert.equal(store.pageData.info.url, 'data/info.json?forceRefresh=1');
});

test('refreshAllData reports every slug that throws, not just the first', async () => {
    globalThis.fetch = async () => { throw new Error('network down'); };

    const { refreshAllData } = await import('../js/store.js');
    const { failed } = await refreshAllData();

    assert.deepEqual(failed.sort(), ['info', 'music', 'notifications', 'timetable']);
});
