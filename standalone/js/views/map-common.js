// Utilities shared by both /map variants (map-interactive.js and
// map-static.js). Kept intentionally small — anything variant-specific
// stays with the variant.

// Pan-limit bounds — hand-picked by Jacob (2026-08-08) from a felt
// polygon over the festival area. Format is MapLibre's LngLatBounds:
// [[minLng, minLat], [maxLng, maxLat]].
//
// Loosened to ≈ 3 km lat span so the mobile viewport can fit the
// whole festival at a comfortable zoom on load. Longitude range
// unchanged from Jacob's round-4 polygon; latitude range pushed
// ±670 m beyond it (N/S ends).
//
// Exported here (not in map-interactive.js) so both the interactive
// map and the map-controls module can read it without pulling in
// each other.
export const MAP_MAX_BOUNDS = [
    [14.478404931523073, 52.26177184691164],   // SW
    [14.521079717325279, 52.290739744887185],  // NE
];

// Buffer around MAP_MAX_BOUNDS for the "is the user actually at the
// festival?" check used by the locate-me control. 0.05 deg ≈ 5.5 km
// at this latitude — matches fusion's isNearFestival (see
// pwa_test/src/Map/helpers/bounds.ts). The buffer is generous on
// purpose: someone driving to the site who's a few km out still
// gets "you're near, here's the map" instead of an obtuse toast.
const NEAR_FESTIVAL_BUFFER_DEG = 0.05;

export function isNearFestival(longitude, latitude) {
    if (typeof longitude !== 'number' || typeof latitude !== 'number') return false;
    const [swLon, swLat] = MAP_MAX_BOUNDS[0];
    const [neLon, neLat] = MAP_MAX_BOUNDS[1];
    return (
        longitude >= swLon - NEAR_FESTIVAL_BUFFER_DEG &&
        longitude <= neLon + NEAR_FESTIVAL_BUFFER_DEG &&
        latitude  >= swLat - NEAR_FESTIVAL_BUFFER_DEG &&
        latitude  <= neLat + NEAR_FESTIVAL_BUFFER_DEG
    );
}

// Size the map's stage element to fill the remaining viewport under
// whatever page chrome sits above it. Both variants use the exact same
// stage container (`.festival-map`), and the sub-page header is not a
// fixed height (logo + title + language switcher stack differently on
// phone vs desktop), so we measure the stage's y-offset at mount and
// refresh on resize / orientation change.
//
// `gestureState.active` lets the caller suppress mid-gesture relayout
// (on iOS the address bar hides during a pinch and fires `resize`,
// which would otherwise recompute the image size / MapLibre canvas
// right under the user's fingers and cause a visible jump).
//
// Returns a cleanup that detaches the resize listeners — the caller
// composes it with its own teardown (MapLibre .remove(), pointer
// handlers, …) into the single cleanup handed back to the dispatcher.
export function attachStageSizing(stage, gestureState) {
    const sizeStage = () => {
        if (gestureState.active) return;
        const top = stage.getBoundingClientRect().top;
        const h = Math.max(200, window.innerHeight - top);
        stage.style.height = `${h}px`;
    };
    sizeStage();
    const onResize = () => sizeStage();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
        window.removeEventListener('resize', onResize);
        window.removeEventListener('orientationchange', onResize);
    };
}
