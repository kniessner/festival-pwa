import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Hand-rolled DOM + browser-globals harness for onboarding.js.
//
// onboarding.js touches a small, well-defined surface:
//   - document.getElementById(id)          → element with .textContent, .classList
//   - element.classList.add/remove(cls)
//   - element.textContent = string
//   - navigator.permissions.query          (via helpers/geolocation-permission.js)
//   - navigator.geolocation.getCurrentPosition / watchPosition
//   - localStorage.getItem/setItem         (via helpers/prompt-storage.js)
//   - document.dispatchEvent(new CustomEvent(...))
//   - imports from ./i18n.js (t) and ./store.js (store)
//
// We stub each of these on globalThis before importing onboarding.js
// so no jsdom dep is needed. The module is imported dynamically per
// test so it re-reads globals.
//
// State reset is by mutation, not by re-importing — Node's ESM cache
// keeps the module frozen after first load, and re-importing wouldn't
// reset its internal `pendingResolve` variable anyway. Instead we
// design each test to run either a full skip-path OR a full open-close
// cycle, leaving pendingResolve null at the end.
//
// One extra caveat: location.js's `watchId` module variable also
// survives across tests. Once startLocationWatch fires once (from any
// test), subsequent calls are idempotent no-ops. To stay honest about
// what we're asserting, only ONE test in this file asserts
// navigator.geolocation.watchPosition was called (the very first one
// runs); the other paths that would trigger it assert the orthogonal
// side effects (sticky flag, modal state, dispatched events).

function makeElement(id) {
    const classes = new Set();
    return {
        id,
        _textContent: '',
        get textContent() { return this._textContent; },
        set textContent(v) { this._textContent = v; },
        classList: {
            add: (c) => classes.add(c),
            remove: (c) => classes.delete(c),
            contains: (c) => classes.has(c),
            _all: () => [...classes],
        },
    };
}

function installGlobals({ permissionState, geolocation, localStorageState = {} } = {}) {
    // DOM: only the 9 IDs onboarding.js touches. Any getElementById for
    // an unknown ID returns null (handled by ?. in the module).
    const elements = new Map();
    for (const id of [
        'onboardingHeadline', 'onboardingIntro', 'onboardingFeatureTimetable',
        'onboardingDisclaimer', 'onboardingPrivacyTitle', 'onboardingPrivacyBody',
        'onboardingBtnAllow', 'onboardingBtnNotNow', 'onboardingModal',
    ]) {
        elements.set(id, makeElement(id));
    }
    const dispatchedEvents = [];
    const doc = {
        getElementById: (id) => elements.get(id) || null,
        dispatchEvent: (ev) => { dispatchedEvents.push(ev); return true; },
        _elements: elements,
        _dispatched: dispatchedEvents,
    };
    Object.defineProperty(globalThis, 'document', { value: doc, configurable: true, writable: true });

    // navigator with mock permissions + geolocation. permissionState
    // === 'throw' triggers the catch-branch in getGeolocationPermissionState.
    const nav = {
        permissions: {
            query: async () => {
                if (permissionState === 'throw') throw new Error('policy');
                if (permissionState === 'missing') throw new Error('should be unreachable');
                return { state: permissionState };
            },
        },
        geolocation,
    };
    if (permissionState === 'no-api') {
        delete nav.permissions;
    }
    Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });

    // localStorage: fake in-memory store, seeded with any initial keys.
    const ls = new Map(Object.entries(localStorageState));
    globalThis.localStorage = {
        getItem: (k) => ls.has(k) ? ls.get(k) : null,
        setItem: (k, v) => ls.set(k, String(v)),
        removeItem: (k) => ls.delete(k),
        clear: () => ls.clear(),
        _inspect: () => Object.fromEntries(ls),
    };

    // window for the fallback in stage-hysteresis.js — not used by
    // onboarding, but timetable-grid.js imports it transitively via app.js
    // (we don't touch that here, but if a future import graph pulls it
    // in, this keeps the surface consistent).
    Object.defineProperty(globalThis, 'window', {
        value: { setTimeout, clearTimeout },
        configurable: true, writable: true,
    });

    return { doc, nav, ls };
}

// Clean up any pending resolve promise between tests by exercising the
// close path via 'not now' when the module has an open prompt. Kept as
// a helper so the individual tests stay readable.

beforeEach(() => {
    // Reset each global freshly. permissionState defaults to 'granted'.
    installGlobals({
        permissionState: 'granted',
        geolocation: { getCurrentPosition: () => {}, watchPosition: () => 1 },
    });
});

test('sticky-completed + granted: skips modal, starts watcher', async () => {
    const { doc } = installGlobals({
        permissionState: 'granted',
        geolocation: {
            getCurrentPosition: () => {},
            watchPosition: () => { calls.push('watchPosition'); return 42; },
        },
        localStorageState: { 'bucht-2026-location-prompt-completed': '1' },
    });
    const calls = [];
    globalThis.navigator.geolocation.watchPosition = () => { calls.push('watchPosition'); return 42; };

    const { showLocationPromptIfNeeded } = await import('../js/onboarding.js');
    await showLocationPromptIfNeeded();

    assert.deepEqual(calls, ['watchPosition'], 'watcher started for returning granted user');
    assert.equal(doc._elements.get('onboardingModal').classList.contains('open'), false, 'modal never opened');
});

test('sticky-completed + denied at OS level: skips modal, no watcher', async () => {
    const { doc } = installGlobals({
        permissionState: 'denied',
        geolocation: {
            getCurrentPosition: () => {},
            watchPosition: () => { calls.push('watchPosition'); return 1; },
        },
        localStorageState: { 'bucht-2026-location-prompt-completed': '1' },
    });
    const calls = [];

    const { showLocationPromptIfNeeded } = await import('../js/onboarding.js');
    await showLocationPromptIfNeeded();

    assert.deepEqual(calls, [], 'watcher NOT started for denied returning user');
    assert.equal(doc._elements.get('onboardingModal').classList.contains('open'), false);
});

test('first launch + already-granted at OS level: skips modal, sets sticky flag', async () => {
    // Fresh user (no sticky flag) but OS already knows about geolocation.
    // (Watcher-start assertion lives in the first test in this file;
    // once startLocationWatch fires once, its module-scoped watchId is
    // set and subsequent calls no-op idempotently.)
    const { doc } = installGlobals({
        permissionState: 'granted',
        geolocation: { getCurrentPosition: () => {}, watchPosition: () => 1 },
        // no localStorageState — starts clean
    });

    const { showLocationPromptIfNeeded } = await import('../js/onboarding.js');
    await showLocationPromptIfNeeded();

    assert.equal(localStorage._inspect()['bucht-2026-location-prompt-completed'], '1', 'sticky flag set');
    assert.equal(doc._elements.get('onboardingModal').classList.contains('open'), false, 'modal not opened');
});

test('first launch + denied at OS level: skips modal, sets sticky flag, no watcher', async () => {
    installGlobals({
        permissionState: 'denied',
        geolocation: { getCurrentPosition: () => {}, watchPosition: () => 1 },
    });
    let watched = false;
    globalThis.navigator.geolocation.watchPosition = () => { watched = true; return 1; };

    const { showLocationPromptIfNeeded } = await import('../js/onboarding.js');
    await showLocationPromptIfNeeded();

    assert.equal(watched, false, 'watcher NOT started');
    assert.equal(localStorage._inspect()['bucht-2026-location-prompt-completed'], '1', 'sticky flag set');
});

test('first launch + prompt state: modal opens and headline is localised', async () => {
    const { doc } = installGlobals({
        permissionState: 'prompt',
        geolocation: { getCurrentPosition: () => {}, watchPosition: () => 1 },
    });

    const mod = await import('../js/onboarding.js');
    // Fire but don't await — showLocationPromptIfNeeded returns a
    // promise that resolves only when a button is tapped. We drive that
    // by hand below.
    const pending = mod.showLocationPromptIfNeeded();

    // Give the internal await getGeolocationPermissionState() one
    // microtask to resolve.
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(doc._elements.get('onboardingModal').classList.contains('open'), true, 'modal opened');
    assert.notEqual(doc._elements.get('onboardingHeadline').textContent, '', 'headline localised');

    // Close via not-now so the promise resolves and doesn't leak.
    mod.onboardingNotNow();
    await pending;
});

test('first launch + unknown state (permissions API missing): treated same as prompt', async () => {
    const { doc } = installGlobals({
        permissionState: 'no-api',
        geolocation: { getCurrentPosition: () => {}, watchPosition: () => 1 },
    });

    const mod = await import('../js/onboarding.js');
    const pending = mod.showLocationPromptIfNeeded();
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(doc._elements.get('onboardingModal').classList.contains('open'), true, 'modal opened on unknown state');
    mod.onboardingNotNow();
    await pending;
});

test('onboardingNotNow closes the modal and sets the sticky flag', async () => {
    const { doc } = installGlobals({
        permissionState: 'prompt',
        geolocation: { getCurrentPosition: () => {}, watchPosition: () => 1 },
    });

    const mod = await import('../js/onboarding.js');
    const pending = mod.showLocationPromptIfNeeded();
    await Promise.resolve(); await Promise.resolve();

    mod.onboardingNotNow();
    await pending;

    assert.equal(doc._elements.get('onboardingModal').classList.contains('open'), false, 'modal closed');
    assert.equal(localStorage._inspect()['bucht-2026-location-prompt-completed'], '1', 'sticky flag set on decline');
});

test('onboardingAllow calls getCurrentPosition (iOS gesture rule), populates store on success, dispatches locationchange', async () => {
    const geoCalls = [];
    installGlobals({
        permissionState: 'prompt',
        geolocation: {
            getCurrentPosition: (ok, err, opts) => {
                geoCalls.push({ fn: 'getCurrentPosition', opts });
                // Simulate immediate success.
                ok({ coords: { longitude: 14.494, latitude: 52.283, accuracy: 8 } });
            },
            watchPosition: () => 7,
        },
    });

    const mod = await import('../js/onboarding.js');
    const pending = mod.showLocationPromptIfNeeded();
    await Promise.resolve(); await Promise.resolve();

    mod.onboardingAllow();
    await pending;

    // getCurrentPosition must be called inside the click handler for
    // the iOS-PWA gesture rule to fire.
    assert.equal(geoCalls.filter(c => c.fn === 'getCurrentPosition').length, 1,
        'getCurrentPosition called exactly once');

    // enableHighAccuracy: true is critical for stage detection accuracy.
    const gcp = geoCalls.find(c => c.fn === 'getCurrentPosition');
    assert.equal(gcp.opts.enableHighAccuracy, true);

    // Success payload should have dispatched locationchange.
    const dispatched = globalThis.document._dispatched;
    const locEvent = dispatched.find(e => e.type === 'locationchange');
    assert.ok(locEvent, 'locationchange event dispatched');
    assert.equal(locEvent.detail.longitude, 14.494);
    assert.equal(locEvent.detail.latitude, 52.283);
    assert.equal(locEvent.detail.accuracy, 8);
});

test('onboardingAllow: OS-dialog denial (getCurrentPosition error callback) is silent, does not throw', async () => {
    installGlobals({
        permissionState: 'prompt',
        geolocation: {
            getCurrentPosition: (ok, err) => {
                err({ code: 1, message: 'User denied Geolocation' });
            },
            watchPosition: () => 1,
        },
    });

    const mod = await import('../js/onboarding.js');
    const pending = mod.showLocationPromptIfNeeded();
    await Promise.resolve(); await Promise.resolve();

    // Should not throw despite the error callback.
    assert.doesNotThrow(() => mod.onboardingAllow());
    await pending;

    // Sticky flag still gets set (user engaged with the button).
    assert.equal(localStorage._inspect()['bucht-2026-location-prompt-completed'], '1');
});

test('onboardingAllow when navigator.geolocation is missing entirely: no throw, modal still closes', async () => {
    const { doc } = installGlobals({
        permissionState: 'prompt',
        geolocation: undefined, // no geolocation on this browser
    });
    // Blow away geolocation on the mocked navigator.
    delete globalThis.navigator.geolocation;

    const mod = await import('../js/onboarding.js');
    const pending = mod.showLocationPromptIfNeeded();
    await Promise.resolve(); await Promise.resolve();

    assert.doesNotThrow(() => mod.onboardingAllow());
    await pending;

    assert.equal(doc._elements.get('onboardingModal').classList.contains('open'), false,
        'modal closes even with no geolocation available');
});
