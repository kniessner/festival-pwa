import { store } from './store.js';

// The onboarding overlay's "Enable GPS" handler already primed
// store.userLocation with a one-shot getCurrentPosition (inside the click
// handler, for the iOS-PWA gesture rule). This module keeps a
// watchPosition open for the rest of the session so subsequent fixes
// flow into store.userLocation and dispatch 'locationchange'.
//
// Unlike fusion (which gates the watcher on 3 routes to save battery),
// Bucht has exactly one location-consuming surface — the grid timetable —
// so gating adds complexity for no meaningful battery gain: users who
// grant permission are almost always on the timetable anyway.
//
// There is no stopLocationWatch counterpart: the app has no revoke-
// permission surface and the watcher is cheap to keep running for the
// session. Browsers clear the underlying navigator.geolocation.watchPosition
// on page navigation / tab close automatically.

let watchId = null;

/**
 * Start (or no-op if already running) a high-accuracy watchPosition.
 * Writes every fix to store.userLocation and dispatches a
 * 'locationchange' CustomEvent on document.
 *
 * Idempotent — safe to call from multiple entry points (onboarding
 * grant handler, grid view mount, returning user's app.js init).
 */
export function startLocationWatch() {
    if (watchId != null) return;
    if (!navigator.geolocation) {
        store.userLocation = { longitude: null, latitude: null, accuracy: null, error: 'unsupported' };
        return;
    }
    watchId = navigator.geolocation.watchPosition(
        (position) => {
            const { longitude, latitude, accuracy } = position.coords;
            store.userLocation = { longitude, latitude, accuracy, error: null };
            document.dispatchEvent(new CustomEvent('locationchange', {
                detail: { longitude, latitude, accuracy },
            }));
        },
        (error) => {
            const message = error.code === 1 ? 'denied' : error.message;
            store.userLocation = {
                longitude: null,
                latitude: null,
                accuracy: null,
                error: message,
            };
            document.dispatchEvent(new CustomEvent('locationchange', {
                detail: { error: message },
            }));
        },
        // maximumAge: 0 forces a fresh fix on every poll — matches the
        // fusion rationale (Android otherwise served stale lastKnownLocation
        // fixes stamped acc:1 kilometres away from the actual position).
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 },
    );
}
