// Draggable "where is my tent" marker for the interactive map.
//
// Vanilla-JS port of ~/dev/maya/pwa_test/src/Map/tent.ts, minus the
// lock feature (Jacob explicitly deferred that). Same architecture:
//
//   startTent(map, { getTentDragText })
//       ↓
//   creates a <div class="tent-marker"> with a background-image of
//   the vendored Noto tent SVG, wraps it in a MapLibre `Marker` with
//   `draggable: true`, and pins it at either the persisted position
//   (localStorage `bucht-tent-position`) or the initial camp centroid.
//
// Returns a `stop()` function that detaches the zoom listener + the
// marker + closes the popup — invoked from renderInteractiveMap's
// teardown callback (same pattern as user-location.js).
//
// The dim-during-drag effect toggles every overlay layer's fill/circle
// opacity to 0.15 while a drag is in flight, then restores on drop —
// mirrors the raster-opacity trick in the React app but adapted to
// vector layers.
//
// Persistence: JSON `{lng, lat}` under `bucht-tent-position`, validated
// on read so a Safari quota artefact / wrong-shape / NaN payload falls
// back to the initial position instead of crashing.

import { safeGetJSON, safeSetJSON } from '../helpers/safe-storage.js';
import { t } from '../i18n.js';

// ─── Config ──────────────────────────────────────────────────────────

// Initial drop location on first-ever load. Hand-picked by Jacob
// (2026-08-08) to sit inside the main camping area — nudged east of
// the Check-in/Zeltverleih strip so it lands somewhere clearly
// campable and reads as "grab me, drop me on my real spot".
export const TENT_INITIAL_POSITION = [14.502449976129924, 52.27739273160731];

// localStorage key. No year suffix (per Jacob) — camping location is
// personal and re-used across festival editions if the user keeps the
// app installed.
const TENT_POSITION_KEY = 'bucht-tent-position';

// Marker base size + zoom-scaling constants copied verbatim from the
// React port. `Math.pow(2, zoom) * INTERPOLATION_FACTOR` is the
// interpolated height at each zoom; we floor it at TENT_HEIGHT so the
// tent never shrinks below its base size. ASPECT_RATIO ≈ 0.73 keeps
// the marker roughly the same footprint as the Fusion tent PNG.
const INTERPOLATION_FACTOR = 0.0018;
const ASPECT_RATIO = 0.73;
const TENT_HEIGHT = 60;

// Overlay drag effect:
//   camping-areas subset  — HIGHLIGHTED (opacity bump + thicker
//                          outline) so the tent drag reads as "drop
//                          me on one of these"
//   everything else       — FADED to 0.2 so the highlighted camps pop
//
// Layer ids kept in sync with map-interactive.js#FELT_LAYERS. If that
// list grows, extend both FADE_LAYERS and (if it's a new highlight
// group) HIGHLIGHT_OVERRIDES. Better long-term: refactor both sites
// to share a single source of truth.
const FADE_LAYERS = [
    'gastro-fill',          'gastro-outline',          'gastro-point',          'gastro-label',
    'produktion-fill',      'produktion-outline',      'produktion-point',      'produktion-label',
    'stages-fill',          'stages-outline',          'stages-point',          'stages-label',
    'sterne-fill',          'sterne-outline',          'sterne-point',          'sterne-label',
    'toilets-showers-fill', 'toilets-showers-outline', 'toilets-showers-point', 'toilets-showers-label',
];
const FADE_OPACITY = 0.2;

// Paint-property overrides applied to the camping-areas layers during
// drag. Each entry: [layerId, paintKey, dragValue]. On drop they're
// restored to DEFAULT_PAINT[paintKey].
const HIGHLIGHT_OVERRIDES = [
    ['camping-areas-fill',    'fill-opacity', 0.75],  // pop from 0.5
    ['camping-areas-outline', 'line-opacity', 1.0],   // pop from 0.9
    ['camping-areas-outline', 'line-width',   2.6],   // thicken from 1.2
    ['camping-areas-label',   'text-opacity', 1.0],   // already 1.0, but explicit for symmetry
];

// ─── Storage ─────────────────────────────────────────────────────────

function isValidPos(v) {
    return v && typeof v === 'object'
        && typeof v.lng === 'number' && Number.isFinite(v.lng)
        && typeof v.lat === 'number' && Number.isFinite(v.lat);
}

function readStoredPosition() {
    const raw = safeGetJSON(TENT_POSITION_KEY, null);
    return isValidPos(raw) ? raw : null;
}

function savePosition(lng, lat) {
    safeSetJSON(TENT_POSITION_KEY, { lng, lat });
}

// ─── Overlay dim/restore during drag ─────────────────────────────────

// MapLibre's setPaintProperty needs the actual paint key per layer
// type — 'fill-opacity' for fill, 'line-opacity' for line, 'circle-
// opacity' for circle, 'text-opacity' for symbol (label). We infer
// the key from the layer id suffix.
function paintKeyFor(layerId) {
    if (layerId.endsWith('-fill')) return 'fill-opacity';
    if (layerId.endsWith('-outline')) return 'line-opacity';
    if (layerId.endsWith('-point')) return 'circle-opacity';
    if (layerId.endsWith('-label')) return 'text-opacity';
    return null;
}

// Snapshot of pre-drag paint values so restore reads from the actual
// live state rather than a hardcoded mirror of addOverlayLayers. Keeps
// the two files decoupled: change camping-areas' default fill-opacity
// in map-interactive.js and tent.js doesn't need to know.
//
// Structure: Map<layerId, Map<paintKey, originalValue>>. Populated on
// dragstart, drained on dragend / stop().
let dragPaintSnapshot = null;

function snapshotPaint(map) {
    dragPaintSnapshot = new Map();
    // Snapshot every FADE_LAYERS opacity + every HIGHLIGHT_OVERRIDES
    // key/layer pair so we can restore whatever we're about to change.
    for (const id of FADE_LAYERS) {
        if (!map.getLayer(id)) continue;
        const key = paintKeyFor(id);
        if (!key) continue;
        try {
            const v = map.getPaintProperty(id, key);
            const inner = dragPaintSnapshot.get(id) ?? new Map();
            inner.set(key, v);
            dragPaintSnapshot.set(id, inner);
        } catch (_) { /* nothing */ }
    }
    for (const [id, key] of HIGHLIGHT_OVERRIDES) {
        if (!map.getLayer(id)) continue;
        try {
            const v = map.getPaintProperty(id, key);
            const inner = dragPaintSnapshot.get(id) ?? new Map();
            inner.set(key, v);
            dragPaintSnapshot.set(id, inner);
        } catch (_) { /* nothing */ }
    }
}

function applyDragPaint(map) {
    snapshotPaint(map);
    // Fade every non-camping overlay to FADE_OPACITY.
    for (const id of FADE_LAYERS) {
        if (!map.getLayer(id)) continue;
        const key = paintKeyFor(id);
        if (!key) continue;
        try { map.setPaintProperty(id, key, FADE_OPACITY); } catch (_) { /* nothing */ }
    }
    // Highlight camping areas.
    for (const [id, key, val] of HIGHLIGHT_OVERRIDES) {
        if (!map.getLayer(id)) continue;
        try { map.setPaintProperty(id, key, val); } catch (_) { /* nothing */ }
    }
}

// Restore paint props from the pre-drag snapshot. If no snapshot
// exists (e.g. stop() called before any drag ever happened), this is
// a no-op — nothing to undo.
function restorePaint(map) {
    if (!dragPaintSnapshot) return;
    for (const [id, inner] of dragPaintSnapshot) {
        if (!map.getLayer(id)) continue;
        for (const [key, val] of inner) {
            try { map.setPaintProperty(id, key, val); } catch (_) { /* nothing */ }
        }
    }
    dragPaintSnapshot = null;
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Start the tent marker on the given map. Returns a `stop()` function
 * that must be called on route/map teardown so we don't leak the zoom
 * listener or the DOM element on re-entry.
 *
 * @param {maplibregl.Map} map
 * @returns {() => void} stop
 */
export function startTent(map) {
    if (!window.maplibregl) return () => { /* nothing */ };

    // Marker DOM. Sized in pixels so the zoom-scaling logic can grow it
    // beyond the base size; the SVG scales inside via background-size.
    const tentEl = document.createElement('div');
    tentEl.className = 'tent-marker';
    const baseWidth = TENT_HEIGHT * ASPECT_RATIO;
    tentEl.style.width = baseWidth + 'px';
    tentEl.style.height = TENT_HEIGHT + 'px';

    const persisted = readStoredPosition();
    const startPos = persisted ?? { lng: TENT_INITIAL_POSITION[0], lat: TENT_INITIAL_POSITION[1] };

    // First-time popup ("Drag me to your tent!") — shown only when we
    // don't have a persisted position, and closes automatically on the
    // first drop. Uses MapLibre's built-in Popup (same widget the
    // interactive-layer popup uses in map-interactive.js).
    const popup = new window.maplibregl.Popup({
        closeButton: false,
        anchor: 'top',
        offset: [-2, 0],
    }).setText(t('map.tentDragMe'));

    const marker = new window.maplibregl.Marker({
        element: tentEl,
        draggable: true,
        anchor: 'bottom',
    })
        .setLngLat([startPos.lng, startPos.lat])
        .addTo(map);

    if (!persisted) {
        marker.setPopup(popup);
        marker.togglePopup();
    }

    // Drag lifecycle: dim overlays on start, persist + restore on end.
    marker.on('dragstart', () => applyDragPaint(map));
    marker.on('dragend', () => {
        const { lng, lat } = marker.getLngLat();
        savePosition(lng, lat);
        restorePaint(map);
        // Close the "drag me" hint permanently after first placement —
        // subsequent drags don't need re-onboarding.
        const p = marker.getPopup();
        if (p && p.isOpen()) marker.togglePopup();
    });

    // Zoom-scale the marker so it feels physical: bigger when close,
    // pinned to base size when zoomed out. Named so we can `.off()`
    // it in stop() — anonymous handlers can't be removed cleanly.
    const onZoom = () => {
        const z = map.getZoom();
        const interpolatedHeight = Math.pow(2, z) * INTERPOLATION_FACTOR;
        const interpolatedWidth = interpolatedHeight * ASPECT_RATIO;
        tentEl.style.width = (interpolatedWidth < baseWidth ? baseWidth : interpolatedWidth) + 'px';
        tentEl.style.height = (interpolatedHeight < TENT_HEIGHT ? TENT_HEIGHT : interpolatedHeight) + 'px';
    };
    map.on('zoom', onZoom);
    // Run once so the initial size reflects the current zoom (else the
    // first frame is base-size, then jerks on the first zoom event).
    onZoom();

    let stopped = false;
    return function stop() {
        if (stopped) return;
        stopped = true;
        try { map.off('zoom', onZoom); } catch (_) { /* nothing */ }
        try { marker.remove(); } catch (_) { /* nothing */ }
        try { restorePaint(map); } catch (_) { /* nothing */ }
    };
}
