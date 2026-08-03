import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// passwordGateOK() only touches localStorage — a plain read, no DOM.
// showPasswordGate()'s DOM manipulation (document.createElement +
// querySelector on a dynamically built subtree) is out of scope for this
// codebase's test conventions (no jsdom; existing tests only stub
// document.getElementById for known static ids, never a real
// createElement/querySelector tree) — verified by manual code review
// instead, same as menu.js's/router.js's className toggling that also
// isn't exercised beyond getElementById-level stubs.

function installGlobals({ localStorageState = {} } = {}) {
    const ls = new Map(Object.entries(localStorageState));
    globalThis.localStorage = {
        getItem: (k) => ls.has(k) ? ls.get(k) : null,
        setItem: (k, v) => ls.set(k, String(v)),
        removeItem: (k) => ls.delete(k),
        clear: () => ls.clear(),
    };
}

beforeEach(() => {
    installGlobals();
});

test('passwordGateOK is false when the gate has never been passed', async () => {
    installGlobals();
    const { passwordGateOK } = await import('../js/password-gate.js');
    assert.equal(passwordGateOK(), false);
});

test('passwordGateOK is true once the flag is set', async () => {
    installGlobals({ localStorageState: { 'bucht-2026-gate-passed': '1' } });
    const { passwordGateOK } = await import('../js/password-gate.js');
    assert.equal(passwordGateOK(), true);
});

test('passwordGateOK is false for any other stored value', async () => {
    installGlobals({ localStorageState: { 'bucht-2026-gate-passed': 'true' } });
    const { passwordGateOK } = await import('../js/password-gate.js');
    assert.equal(passwordGateOK(), false);
});

test('passwordGateOK does not throw when localStorage is unavailable', async () => {
    Object.defineProperty(globalThis, 'localStorage', {
        get() { throw new Error('SecurityError: localStorage disabled'); },
        configurable: true,
    });
    const { passwordGateOK } = await import('../js/password-gate.js');
    assert.equal(passwordGateOK(), false);
});
