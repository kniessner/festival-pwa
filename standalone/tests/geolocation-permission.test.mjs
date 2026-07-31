import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// geolocation-permission.js wraps navigator.permissions.query. In Node
// there is no navigator (well: Node 21+ has a built-in read-only
// navigator, so we install fakes via Object.defineProperty which
// bypasses the readonly getter).

function makeNavigator({ hasPermissions = true, queryImpl = null } = {}) {
    if (!hasPermissions) return {};
    return {
        permissions: {
            query: queryImpl || (async () => ({ state: 'granted' })),
        },
    };
}

function setNavigator(nav) {
    Object.defineProperty(globalThis, 'navigator', {
        value: nav,
        configurable: true,
        writable: true,
    });
}

beforeEach(() => {
    setNavigator(makeNavigator());
});

test('returns "unknown" when the permissions API is missing on navigator', async () => {
    setNavigator(makeNavigator({ hasPermissions: false }));
    const { getGeolocationPermissionState } = await import('../js/helpers/geolocation-permission.js');
    assert.equal(await getGeolocationPermissionState(), 'unknown');
});

test('returns "unknown" when navigator.permissions.query is not a function', async () => {
    setNavigator({ permissions: { query: 'not-a-function' } });
    const { getGeolocationPermissionState } = await import('../js/helpers/geolocation-permission.js');
    assert.equal(await getGeolocationPermissionState(), 'unknown');
});

test('returns the state string when navigator.permissions.query resolves normally', async () => {
    for (const state of ['granted', 'denied', 'prompt']) {
        setNavigator(makeNavigator({
            queryImpl: async () => ({ state }),
        }));
        const { getGeolocationPermissionState } = await import('../js/helpers/geolocation-permission.js');
        assert.equal(await getGeolocationPermissionState(), state);
    }
});

test('returns "unknown" when the resolved status has no state field (defensive fallback)', async () => {
    setNavigator(makeNavigator({
        queryImpl: async () => ({}),   // no `state`
    }));
    const { getGeolocationPermissionState } = await import('../js/helpers/geolocation-permission.js');
    assert.equal(await getGeolocationPermissionState(), 'unknown');
});

test('returns "unknown" when navigator.permissions.query throws (Safari private mode / FF flag)', async () => {
    setNavigator(makeNavigator({
        queryImpl: async () => { throw new Error('permission denied by policy'); },
    }));
    const { getGeolocationPermissionState } = await import('../js/helpers/geolocation-permission.js');
    assert.equal(await getGeolocationPermissionState(), 'unknown');
});

test('returns "unknown" when navigator.permissions.query throws synchronously', async () => {
    setNavigator(makeNavigator({
        queryImpl: () => { throw new Error('synchronous throw'); },
    }));
    const { getGeolocationPermissionState } = await import('../js/helpers/geolocation-permission.js');
    assert.equal(await getGeolocationPermissionState(), 'unknown');
});
