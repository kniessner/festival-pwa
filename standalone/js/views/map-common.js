// Utilities shared by both /map variants (map-interactive.js and
// map-static.js). Kept intentionally small — anything variant-specific
// stays with the variant.

// Pan-limit bounds — hand-picked by Jacob (2026-08-08) from a felt
// polygon over the festival area. Format is MapLibre's LngLatBounds:
// [[minLng, minLat], [maxLng, maxLat]].
//
// The venue's native N-S extent (3.22 km) is slightly larger than
// its E-W extent (2.91 km). Two bounds sets:
//
//   MAP_MAX_BOUNDS         tight, matches the venue.
//                          Used for portrait viewports (mobile PWA,
//                          which is orientation-locked to portrait
//                          per manifest.json). Anyone actually AT the
//                          festival opening the app on their phone.
//
//   MAP_MAX_BOUNDS_WIDE    N-S loosened by ~1.1 km each side.
//                          Used for landscape-shaped viewports
//                          (desktop, rotated browser tab). Fixes the
//                          "only diagonal panning" bug: when the
//                          viewport aspect ratio is wider than the
//                          bounds aspect ratio, MapLibre's implicit
//                          minZoom clamps N-S to zero-slack while
//                          leaving E-W free — combined with the
//                          -73° bearing, the only unclamped world
//                          axis lands on the screen as a diagonal.
//
// Exported here so both the interactive map and the map-controls
// module can read them without pulling in each other. `MAP_MAX_BOUNDS`
// stays exported for legacy call sites and matches the tight bounds
// used by isNearFestival() below (looser bounds would over-broaden
// the "is the user at the festival" check).
export const MAP_MAX_BOUNDS = [
    [14.478404931523073, 52.26177184691164],   // SW
    [14.521079717325279, 52.290739744887185],  // NE
];

export const MAP_MAX_BOUNDS_WIDE = [
    [14.478404931523073, 52.25177],            // SW: ~1.1 km south of tight
    [14.521079717325279, 52.30074],            // NE: ~1.1 km north of tight
];

/**
 * Pick the right maxBounds for the current viewport. Called once at
 * map init (map-interactive.js). Not re-computed on resize — window
 * resizes mid-session are rare (installed PWA is portrait-locked;
 * a browser-tab user rotating their phone mid-map-view is a<1%
 * scenario). If we ever need it, call `map.setMaxBounds(...)` from
 * a resize listener.
 *
 * See PORTRAIT_ASPECT_THRESHOLD below for the numeric threshold + why
 * it lives just above the bounds' own aspect ratio.
 */
// Aspect-ratio threshold that flips between the tight and wide
// bounds. The bounds' own aspect ratio is 2.91 km / 3.22 km ≈ 0.90;
// anything materially wider than that (typical landscape viewport,
// desktop, iPad landscape) needs the wide bounds. Everything below,
// including phone portrait (aspect ~ 0.5), fits happily inside the
// tight venue-shape.
const PORTRAIT_ASPECT_THRESHOLD = 1.1;

export function pickMaxBounds(viewportWidth, viewportHeight) {
    const aspect = viewportWidth / viewportHeight;
    return aspect > PORTRAIT_ASPECT_THRESHOLD ? MAP_MAX_BOUNDS_WIDE : MAP_MAX_BOUNDS;
}

// Buffer around MAP_MAX_BOUNDS for the "is the user actually at the
// festival?" check used by the locate-me control. 0.05 deg is
// asymmetric because a degree of longitude at 52.27°N is smaller
// than a degree of latitude: buffer works out to ~5.5 km N-S and
// ~3.4 km E-W. Fine — the point is "roughly close", not a strict
// isochrone. Matches fusion's isNearFestival (see
// pwa_test/src/Map/helpers/bounds.ts).
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

// Shared "land close-in" camera targets. Both the locate-me button
// and the fly-to POI menu land at the same zoom so the two controls
// feel like siblings behaviourally as well as visually. maxZoom is
// 19, so 18 leaves one full pinch of headroom for the user to look
// around from wherever they land. Duration matches too — same
// perceived weight of "jumping to a place".
export const MAP_CLOSE_ZOOM = 18;
export const MAP_FLYTO_DURATION_MS = 1200;

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
