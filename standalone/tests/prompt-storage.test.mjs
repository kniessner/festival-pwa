import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// prompt-storage.js reads/writes `localStorage` directly and swallows
// exceptions, so we exercise it against a fake global. Each test starts
// with a fresh fake to isolate state.
//
// We import lazily (inside each test after installing the fake) so the
// module's top-level import of LOCATION_PROMPT_KEY from config.js
// evaluates once but the localStorage reference is looked up on every
// call (getter/setter of the global). Node caches the module import
// across tests, matching the browser's ESM behaviour.

const KEY = 'bucht-2026-location-prompt-completed';

function makeFakeStorage(behaviour = {}) {
    const store = new Map();
    return {
        getItem(k) {
            if (behaviour.getThrows) throw new Error('quota / private mode');
            return store.has(k) ? store.get(k) : null;
        },
        setItem(k, v) {
            if (behaviour.setThrows) throw new Error('quota / private mode');
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

test('getLocationPromptCompleted returns false when the key was never set', async () => {
    const { getLocationPromptCompleted } = await import('../js/helpers/prompt-storage.js');
    assert.equal(getLocationPromptCompleted(), false);
});

test('getLocationPromptCompleted returns true after setLocationPromptCompleted', async () => {
    const { getLocationPromptCompleted, setLocationPromptCompleted } = await import('../js/helpers/prompt-storage.js');
    setLocationPromptCompleted();
    assert.equal(getLocationPromptCompleted(), true);
});

test('setLocationPromptCompleted writes the sentinel value "1" to the correct key', async () => {
    const { setLocationPromptCompleted } = await import('../js/helpers/prompt-storage.js');
    setLocationPromptCompleted();
    assert.equal(localStorage._inspect()[KEY], '1');
});

test('getLocationPromptCompleted returns false on a spurious non-"1" value', async () => {
    // Some other version of the app (or a manual edit) could leave a
    // different value. Strict equality ensures we don't confuse it for
    // "completed".
    localStorage.setItem(KEY, 'true');
    const { getLocationPromptCompleted } = await import('../js/helpers/prompt-storage.js');
    assert.equal(getLocationPromptCompleted(), false);
});

test('getLocationPromptCompleted returns false when localStorage throws (private mode / quota)', async () => {
    globalThis.localStorage = makeFakeStorage({ getThrows: true });
    const { getLocationPromptCompleted } = await import('../js/helpers/prompt-storage.js');
    assert.equal(getLocationPromptCompleted(), false);
});

test('setLocationPromptCompleted swallows exceptions silently (does not throw)', async () => {
    globalThis.localStorage = makeFakeStorage({ setThrows: true });
    const { setLocationPromptCompleted } = await import('../js/helpers/prompt-storage.js');
    assert.doesNotThrow(() => setLocationPromptCompleted());
});
