import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Fake localStorage covering the three failure modes safe-storage guards
// against: normal operation, throw on getItem (Safari private mode),
// throw on setItem (quota exceeded). Each test installs a fresh fake.
function makeFakeStorage(behaviour = {}) {
    const store = new Map();
    return {
        getItem(k) {
            if (behaviour.getThrows) throw new Error('getItem denied');
            return store.has(k) ? store.get(k) : null;
        },
        setItem(k, v) {
            if (behaviour.setThrows) throw new Error('setItem denied');
            store.set(k, String(v));
        },
        removeItem(k) { store.delete(k); },
        clear() { store.clear(); },
        _inspect: () => Object.fromEntries(store),
    };
}

beforeEach(() => {
    globalThis.localStorage = makeFakeStorage();
});

// --- safeGet ---

test('safeGet returns the stored value when the key exists', async () => {
    localStorage.setItem('k', 'v');
    const { safeGet } = await import('../js/helpers/safe-storage.js');
    assert.equal(safeGet('k'), 'v');
});

test('safeGet returns null by default for missing keys', async () => {
    const { safeGet } = await import('../js/helpers/safe-storage.js');
    assert.equal(safeGet('missing'), null);
});

test('safeGet returns the fallback for missing keys', async () => {
    const { safeGet } = await import('../js/helpers/safe-storage.js');
    assert.equal(safeGet('missing', 'fallback'), 'fallback');
});

test('safeGet returns the fallback when localStorage throws (private mode / quota)', async () => {
    globalThis.localStorage = makeFakeStorage({ getThrows: true });
    const { safeGet } = await import('../js/helpers/safe-storage.js');
    assert.equal(safeGet('any', 'safe'), 'safe');
});

// --- safeGetJSON ---

test('safeGetJSON parses valid JSON', async () => {
    localStorage.setItem('k', JSON.stringify([1, 2, 3]));
    const { safeGetJSON } = await import('../js/helpers/safe-storage.js');
    assert.deepEqual(safeGetJSON('k'), [1, 2, 3]);
});

test('safeGetJSON returns the fallback for a missing key', async () => {
    const { safeGetJSON } = await import('../js/helpers/safe-storage.js');
    assert.deepEqual(safeGetJSON('missing', []), []);
});

test('safeGetJSON returns the fallback when stored value is malformed JSON', async () => {
    localStorage.setItem('k', '{not: valid');
    const { safeGetJSON } = await import('../js/helpers/safe-storage.js');
    assert.deepEqual(safeGetJSON('k', []), []);
});

test('safeGetJSON returns the fallback when stored value parses to null', async () => {
    // 'null' is valid JSON but semantically empty \u2014 we want the fallback
    // so callers don't have to special-case null vs missing.
    localStorage.setItem('k', 'null');
    const { safeGetJSON } = await import('../js/helpers/safe-storage.js');
    assert.deepEqual(safeGetJSON('k', 'fallback'), 'fallback');
});

test('safeGetJSON returns the fallback when read throws', async () => {
    globalThis.localStorage = makeFakeStorage({ getThrows: true });
    const { safeGetJSON } = await import('../js/helpers/safe-storage.js');
    assert.deepEqual(safeGetJSON('k', []), []);
});

// --- safeSet ---

test('safeSet writes the value and returns true on success', async () => {
    const { safeSet } = await import('../js/helpers/safe-storage.js');
    assert.equal(safeSet('k', 'v'), true);
    assert.equal(localStorage._inspect().k, 'v');
});

test('safeSet coerces the value to a string', async () => {
    const { safeSet } = await import('../js/helpers/safe-storage.js');
    safeSet('k', 42);
    assert.equal(localStorage._inspect().k, '42');
});

test('safeSet returns false when localStorage throws (private mode / quota)', async () => {
    globalThis.localStorage = makeFakeStorage({ setThrows: true });
    const { safeSet } = await import('../js/helpers/safe-storage.js');
    assert.equal(safeSet('k', 'v'), false);
});

// --- safeSetJSON ---

test('safeSetJSON serialises and writes on success', async () => {
    const { safeSetJSON } = await import('../js/helpers/safe-storage.js');
    assert.equal(safeSetJSON('k', { a: 1 }), true);
    assert.equal(localStorage._inspect().k, '{"a":1}');
});

test('safeSetJSON returns false when the write throws', async () => {
    globalThis.localStorage = makeFakeStorage({ setThrows: true });
    const { safeSetJSON } = await import('../js/helpers/safe-storage.js');
    assert.equal(safeSetJSON('k', { a: 1 }), false);
});

test('safeSetJSON returns false when the value fails to serialise (circular)', async () => {
    const { safeSetJSON } = await import('../js/helpers/safe-storage.js');
    const circular = {};
    circular.self = circular;
    assert.equal(safeSetJSON('k', circular), false);
});
