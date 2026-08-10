// User-location marker with heading cone — imperative port of the
// pwa_test React hooks (useDeviceHeading + useUserMarker). Consumes
// the shared 'locationchange' stream from js/location.js plus a
// smoothed deviceorientation stream, and paints a MapLibre Marker with the same DOM structure the pwa_test
// map uses:
//
//   <div class="user-location-marker has-heading">
//     <div class="user-heading-cone">
//       <svg>...gradient wedge...</svg>
//     </div>
//     <div class="maplibregl-user-location-dot"></div>
//   </div>
//
// Marker.setRotation() rotates the whole wrapper to the current heading;
// the dot is symmetric so only the cone visibly turns. Styling for the
// wrapper + cone (position, halo, palette) lives in css/views.css.
//
// Battery / lifecycle:
//   - We consume the shared 'locationchange' stream from js/location.js
//     instead of running our own watchPosition (DRY refactor,
//     2026-08-08). Kills the second parallel GPS subscriber the map
//     used to run. See the module-header block below for the rationale.
//   - deviceorientation listener detaches when document.hidden flips
//     true (screen off / tab backgrounded).
//   - No festival-bounds gate in this initial port — pwa_test's version
//     hides the marker when the user leaves the festival bbox; we'll
//     add that once Jacob's tested the raw port on his Android phone.
//   - No iOS permission button yet. iOS 13+ requires
//     DeviceOrientationEvent.requestPermission() from a user gesture;
//     as a stop-gap we trigger it on the first pointerdown on the map
//     canvas (Android is a no-op, iOS gets a permission prompt).

import { store } from '../store.js';
import { startLocationWatch } from '../location.js';

export function startUserLocation(map) {
    // ─── State + refs ─────────────────────────────────────────────────
    // Kept in closure vars because the port is imperative; the React
    // version threaded these through hook state.
    let marker = null;
    let lastHeading = null;         // smoothed heading, or null
    let orientationAttached = false;
    let removed = false;             // guard against post-cleanup writes

    const iosNeedsPermission =
        typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function';

    // ─── Marker DOM ────────────────────────────────────────────────────
    // Same wrapper + cone + dot triplet as pwa_test. The wrapper is
    // sized to the dot; the cone is absolutely positioned to sit above
    // (pre-rotation) so `Marker.setRotation` pivots its tip on the dot.
    function buildMarkerEl() {
        const wrapper = document.createElement('div');
        wrapper.className = 'user-location-marker';

        const cone = document.createElement('div');
        cone.className = 'user-heading-cone';
        // Inline SVG — matches pwa_test verbatim: a downward-pointing
        // triangle (viewBox 60x36) with a top-to-bottom gradient that
        // fades from transparent at the tip base to 0.9 alpha of
        // `currentColor` at the wide end. `currentColor` lets the CSS
        // change color without touching this markup.
        cone.innerHTML = `
            <svg viewBox="0 0 60 36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <defs>
                    <linearGradient id="user-heading-cone-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="currentColor" stop-opacity="0"/>
                        <stop offset="100%" stop-color="currentColor" stop-opacity="0.9"/>
                    </linearGradient>
                </defs>
                <polygon points="30,36 0,0 60,0" fill="url(#user-heading-cone-grad)"/>
            </svg>
        `;
        wrapper.appendChild(cone);

        const dot = document.createElement('div');
        dot.className = 'maplibregl-user-location-dot';
        wrapper.appendChild(dot);

        return wrapper;
    }

    function ensureMarker(lng, lat) {
        if (marker) {
            marker.setLngLat([lng, lat]);
            return;
        }
        const el = buildMarkerEl();
        marker = new window.maplibregl.Marker({
            element: el,
            // Map-aligned so the cone points at the real-world heading
            // even when the user pinch-rotates the map (basemap has
            // bearing -90 by default; the cone stays true).
            rotationAlignment: 'map',
        })
            .setLngLat([lng, lat])
            .addTo(map);
    }

    function applyHeading(h) {
        if (!marker) return;
        const el = marker.getElement();
        if (h == null) {
            el.classList.remove('has-heading');
            marker.setRotation(0);
        } else {
            el.classList.add('has-heading');
            marker.setRotation(h);
        }
    }

    // ─── Compass heading ──────────────────────────────────────────────
    // Straight port of pwa_test's useDeviceHeading smoothing loop:
    //   1. iOS: event.webkitCompassHeading is already CW-from-north.
    //   2. Android: event.alpha is CCW from the device's magnetic north
    //      when event.absolute is true. Convert to CW.
    //   3. Bias by screen.orientation.angle so the cone reads correctly
    //      when the phone is held sideways.
    //   4. Exponential smoothing (alpha=0.3) with shortest-arc delta
    //      so we don't ping-pong across the 359 -> 1 wrap.
    function onOrientation(event) {
        let raw = null;
        if (typeof event.webkitCompassHeading === 'number') {
            raw = event.webkitCompassHeading;
        } else if (event.absolute && event.alpha != null) {
            raw = (360 - event.alpha) % 360;
        }
        if (raw == null) return;

        const screenAngle = window.screen && window.screen.orientation
            ? (window.screen.orientation.angle || 0)
            : 0;
        const corrected = (raw + screenAngle) % 360;

        const prev = lastHeading;
        let next;
        if (prev == null) {
            next = corrected;
        } else {
            let delta = corrected - prev;
            if (delta > 180) delta -= 360;
            else if (delta < -180) delta += 360;
            next = (prev + delta * 0.3 + 360) % 360;
        }
        lastHeading = next;
        if (!removed) applyHeading(next);
    }

    function attachOrientation() {
        if (orientationAttached) return;
        // Some Android builds only fire `deviceorientationabsolute`;
        // subscribe to both and let onOrientation pick whichever event
        // carries usable values.
        window.addEventListener('deviceorientationabsolute', onOrientation);
        window.addEventListener('deviceorientation', onOrientation);
        orientationAttached = true;
    }
    function detachOrientation() {
        if (!orientationAttached) return;
        window.removeEventListener('deviceorientationabsolute', onOrientation);
        window.removeEventListener('deviceorientation', onOrientation);
        orientationAttached = false;
    }
    function onVisibilityChange() {
        if (removed) return;
        if (document.hidden) detachOrientation();
        else attachOrientation();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    // Kick things off. On Android this attaches immediately; on iOS
    // the browser will silently drop the events until permission is
    // granted, so the attach is harmless.
    if (!document.hidden) attachOrientation();

    // iOS 13+ permission gate: hook a one-shot pointerdown on the
    // MapLibre canvas that triggers requestPermission (must be inside
    // a user gesture). No-op on Android. Once the user answers we
    // re-attach — deviceorientation events start flowing.
    let iosPermissionRequested = false;
    async function requestIosPermission() {
        if (iosPermissionRequested) return;
        iosPermissionRequested = true;
        if (!iosNeedsPermission) return;
        try {
            const result = await DeviceOrientationEvent.requestPermission();
            if (result === 'granted') attachOrientation();
        } catch {
            // Denied or non-gesture context. Silent — the cone just
            // stays hidden on iOS. Later work: an explicit "enable
            // compass" button that pipes through this same call.
        }
    }
    // MapLibre's canvas exists after `load`; hook the whole map
    // container just in case load hasn't fired yet.
    const iosTrigger = () => { requestIosPermission(); };
    const rootEl = map.getContainer();
    if (rootEl) rootEl.addEventListener('pointerdown', iosTrigger, { once: true, passive: true });

    // ─── Geolocation ──────────────────────────────────────────────────
    // Subscribe to the shared 'locationchange' stream instead of
    // running our own watchPosition. If the boot path already fired
    // (returning user with permission granted, or fresh grant in the
    // onboarding modal) the store already has coordinates and we can
    // drop the marker immediately.
    //
    // startLocationWatch() is idempotent — calling it here as a safety
    // net covers the edge case where /map is reached without going
    // through the boot path (deep-link, HMR, tests).
    startLocationWatch();

    function onLocationChange(event) {
        if (removed) return;
        const detail = event && event.detail;
        if (!detail || detail.error) return;
        const { longitude, latitude } = detail;
        if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return;
        ensureMarker(longitude, latitude);
        // Apply the latest heading immediately after the marker exists
        // so the first fix already shows the cone (subsequent
        // orientation events keep it updated).
        applyHeading(lastHeading);
    }
    document.addEventListener('locationchange', onLocationChange);

    // Prime with whatever the store already holds — no wait for the
    // next dispatch.
    const initial = store.userLocation;
    if (initial && !initial.error
        && Number.isFinite(initial.longitude)
        && Number.isFinite(initial.latitude)) {
        ensureMarker(initial.longitude, initial.latitude);
    }

    // ─── Cleanup ──────────────────────────────────────────────────────
    return function stopUserLocation() {
        removed = true;
        document.removeEventListener('locationchange', onLocationChange);
        detachOrientation();
        document.removeEventListener('visibilitychange', onVisibilityChange);
        if (rootEl) rootEl.removeEventListener('pointerdown', iosTrigger);
        if (marker) {
            marker.remove();
            marker = null;
        }
    };
}
