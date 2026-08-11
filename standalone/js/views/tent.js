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
import { FELT_LAYERS } from './map-layers.js';

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

// Zoom-scaled sizing.
//
// The original React port used `Math.pow(2, zoom) * 0.0018` — an
// exponential-grow curve calibrated against fusion's maxZoom = 15.6
// (at which the tent tops out around 90 px). Bucht's maxZoom is 19,
// which pushed the same formula to a 944 px tent at the tightest
// zoom — the marker completely swallowed the ground it was meant to
// pin. Ported the concept, inverted the direction: the tent stays
// at its comfortable overview size (60 px) up to the fade-in zoom,
// then LINEARLY shrinks to a small pin (32 px) at maxZoom, so at
// close range you can actually see the patch of camp under it.
//
// If we ever grow the max/min tunables, revisit these in one place:
const ASPECT_RATIO = 0.73;
const TENT_HEIGHT_MAX = 50;   // px at overview zoom (≤ SHRINK_START)
const TENT_HEIGHT_MIN = 36;   // px floor, hit at SHRINK_END and held
                              // from there on. Big enough to grab
                              // under a finger at the tightest zoom;
                              // small enough that the ground under it
                              // is still visible.
const TENT_SHRINK_START_ZOOM = 14;   // stays at MAX below this
const TENT_SHRINK_END_ZOOM   = 22;   // interp target. maxZoom is 19,
                                     // so we never actually reach MIN
                                     // — at zoom 19 the tent lands at
                                     // ~41 px (halfway-plus of the
                                     // 50 → 36 shrink). This is the
                                     // "comfortable-at-close-up" size
                                     // Jacob asked for.

// Overlay drag effect:
//   camping-areas subset  — HIGHLIGHTED (opacity bump + thicker
//                          outline) so the tent drag reads as "drop
//                          me on one of these"
//   everything else       — HIDDEN completely so the highlighted
//                            camps are the only thing visible
//
// FADE_LAYERS is derived from map-interactive.js#FELT_LAYERS so adding
// a new overlay group there automatically extends the fade set here —
// map-interactive.js is now the single source of truth.
//
// NOTE: The `landmarks-label` layer (Helenesee etc.) is intentionally
// NOT in this list. Landmarks are ambient / atmospheric labels; the
// tent-drop UX is scoped to the camps (see HIGHLIGHT_LAYER_ID below).
// If a future landmark should participate in the fade, register it
// in FELT_LAYERS instead of adding a special case here.
//
// EXTRA_FADE_LAYERS: labels that live OUTSIDE FELT_LAYERS but should
// still disappear during a tent drag. Today: the two region labels
// (Umbria / Lumina) rendered by map-interactive.js#addOverlayLayers.
// They’re not overlay-tier features (own source, own zoom-fade),
// but visually they behave like every other non-camping label and
// should vanish alongside them so the camps read as the only
// possible drop targets. Add here rather than in FELT_LAYERS to
// avoid dragging the whole tier machinery (fill/point/outline/
// zoom-fade) along for what is really just one symbol layer.
const EXTRA_FADE_LAYERS = ['regions-label'];

// The one overlay group we highlight instead of fade. If we ever want
// to promote another layer to the same "drop target" role, add it
// here and give it HIGHLIGHT_OVERRIDES entries.
const HIGHLIGHT_LAYER_ID = 'camping-areas';

const FADE_LAYERS = [
    ...FELT_LAYERS
        .filter(({ id }) => id !== HIGHLIGHT_LAYER_ID)
        .flatMap(({ id }) => [id + '-fill', id + '-outline', id + '-point', id + '-label']),
    ...EXTRA_FADE_LAYERS,
];
// Non-camping overlays are hidden completely during a tent drag
// (Jacob 2026-08-10: "labels still faintly visible — they should be
// really not visible apart from the camping ones"). Was 0.2 before;
// dropped to 0 so the drag interaction becomes an unambiguous
// "which camp are you in" question with no distracting fills or
// labels bleeding through.
const FADE_OPACITY = 0;

// Paint-property overrides applied to the camping-areas layers during
// drag. Each entry: [layerId, paintKey, dragValue]. On drop they're
// restored to whatever the snapshot captured pre-drag.
const HIGHLIGHT_OVERRIDES = [
    ['camping-areas-fill',    'fill-opacity', 0.75],  // pop from map-interactive.js default
    ['camping-areas-outline', 'line-opacity', 1.0],   //   ditto
    ['camping-areas-outline', 'line-width',   2.6],   // thicken from 1.2
    ['camping-areas-label',   'text-opacity', 1.0],   // already 1.0, but explicit for symmetry
];

// Layers whose zoom range gets widened to [0, 24] during drag so
// their labels stay visible regardless of any minzoom/maxzoom gating
// we add later for the ambient (non-drag) view. Camping-area labels
// are the "which camp am I dropping into?" affordance and must NOT be
// gated away when the user picks up the tent, even if we hide them at
// low zoom during normal viewing. Snapshot + restore mirrors the
// paint-property approach.
const FORCE_VISIBLE_DURING_DRAG = ['camping-areas-label'];

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

/**
 * Public read of the current tent position, returned as a [lng, lat]
 * tuple to match the POI-coord shape used by the fly-to menu (see
 * js/helpers/festival-pois.js). Falls back to TENT_INITIAL_POSITION
 * when the user hasn't dropped the tent yet.
 *
 * Kept as a fresh localStorage read (not a cached module-scoped
 * value) so a jump-to click always reflects the latest drop, even
 * if the user moved the tent, closed the map, and re-opened it in
 * the same session — no cross-module sync needed.
 */
export function getTentPosition() {
    const stored = readStoredPosition();
    if (stored) return [stored.lng, stored.lat];
    return TENT_INITIAL_POSITION;
}

/**
 * True iff the user has explicitly dropped a tent (i.e. a valid
 * position is stored). Used by tent-intro to decide whether the
 * "where is my tent?" onboarding dialog is still relevant — someone
 * who has already placed the tent doesn't need the pitch.
 */
export function hasStoredTentPosition() {
    return readStoredPosition() !== null;
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

// Snapshot pre-drag paint values + zoom ranges so restore reads from
// the actual live state rather than a hardcoded mirror of
// addOverlayLayers. Keeps tent.js and map-interactive.js decoupled:
// change camping-areas' default fill-opacity (or add a minzoom on the
// -label layer) in map-interactive.js and this file doesn't need to
// know.
//
// Snapshot shape: { paint: Map<layerId, Map<paintKey, value>>,
//                   zoom:  Map<layerId, { minzoom, maxzoom }> }
// The snapshot belongs to a single startTent() invocation — owned by
// that closure, NOT module-scoped, so two overlapping tent lifetimes
// (HMR, PiP, a future split view) wouldn't clobber each other's
// restore state.
function snapshotPaint(map) {
    const snap = new Map();
    const record = (id, key) => {
        if (!map.getLayer(id)) return;
        try {
            const v = map.getPaintProperty(id, key);
            const inner = snap.get(id) ?? new Map();
            inner.set(key, v);
            snap.set(id, inner);
        } catch (_) { /* nothing */ }
    };
    for (const id of FADE_LAYERS) {
        const key = paintKeyFor(id);
        if (key) record(id, key);
    }
    for (const [id, key] of HIGHLIGHT_OVERRIDES) record(id, key);
    return snap;
}

function snapshotZoomRanges(map) {
    const snap = new Map();
    for (const id of FORCE_VISIBLE_DURING_DRAG) {
        const layer = map.getLayer(id);
        if (!layer) continue;
        // MapLibre layer objects expose minzoom/maxzoom as numbers,
        // defaulting to 0 / 24 when unset. Capture both so restore is
        // exactly reversible whether or not the layer had explicit
        // gating.
        snap.set(id, { minzoom: layer.minzoom, maxzoom: layer.maxzoom });
    }
    return snap;
}

function applyDragPaint(map, snapshotRef) {
    snapshotRef.current = {
        paint: snapshotPaint(map),
        zoom: snapshotZoomRanges(map),
    };
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
    // Widen zoom range on FORCE_VISIBLE_DURING_DRAG layers so any
    // ambient minzoom/maxzoom gating (added later for the non-drag
    // view) is temporarily bypassed. 0 / 24 covers every zoom the
    // camera can reach.
    for (const id of FORCE_VISIBLE_DURING_DRAG) {
        if (!map.getLayer(id)) continue;
        try { map.setLayerZoomRange(id, 0, 24); } catch (_) { /* nothing */ }
    }
}

// Restore paint props + zoom ranges from the pre-drag snapshot. If no
// snapshot exists (e.g. stop() called before any drag ever happened),
// this is a no-op — nothing to undo.
function restorePaint(map, snapshotRef) {
    const snap = snapshotRef.current;
    if (!snap) return;
    for (const [id, inner] of snap.paint) {
        if (!map.getLayer(id)) continue;
        for (const [key, val] of inner) {
            try { map.setPaintProperty(id, key, val); } catch (_) { /* nothing */ }
        }
    }
    for (const [id, { minzoom, maxzoom }] of snap.zoom) {
        if (!map.getLayer(id)) continue;
        try { map.setLayerZoomRange(id, minzoom ?? 0, maxzoom ?? 24); } catch (_) { /* nothing */ }
    }
    snapshotRef.current = null;
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
    const baseWidth = TENT_HEIGHT_MAX * ASPECT_RATIO;
    tentEl.style.width = baseWidth + 'px';
    tentEl.style.height = TENT_HEIGHT_MAX + 'px';

    const persisted = readStoredPosition();
    const startPos = persisted ?? { lng: TENT_INITIAL_POSITION[0], lat: TENT_INITIAL_POSITION[1] };

    // First-time popup ("Drag me to your tent!") — shown only when we
    // don't have a persisted position, and closes automatically on the
    // first drop. Uses MapLibre's built-in Popup (same widget the
    // interactive-layer popup uses in map-interactive.js).
    const popup = new window.maplibregl.Popup({
        closeButton: false,
        anchor: 'top',
        // x-offset 0, y-offset 1: the tooltip sits directly below the
        // marker (anchor: 'top'), and Jacob wanted a hair of breathing
        // room so the popup's tick isn't glued to the tent silhouette.
        // Third and hopefully last nudge on this offset.
        offset: [0, 1],
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

    // Pre-drag paint snapshot lives in this closure — not module-scoped —
    // so two overlapping startTent() lifetimes (HMR, future PiP-style
    // split view, or a route flap) can't clobber each other's restore
    // state. Wrapped in a { current } cell so apply/restore can share a
    // stable reference by identity.
    const snapshotRef = { current: null };

    // Drag lifecycle: dim overlays on start, persist + restore on end.
    marker.on('dragstart', () => applyDragPaint(map, snapshotRef));
    marker.on('dragend', () => {
        const { lng, lat } = marker.getLngLat();
        savePosition(lng, lat);
        restorePaint(map, snapshotRef);
        // Close the "drag me" hint permanently after first placement —
        // subsequent drags don't need re-onboarding.
        const p = marker.getPopup();
        if (p && p.isOpen()) marker.togglePopup();
    });

    // Zoom-scale the marker so it feels physical: base size when
            // zoomed out, shrinks as you pinch in so the exact ground the
            // pin marks doesn't get covered by the marker itself. Named so
            // we can `.off()` it in stop() — anonymous handlers can't be
            // removed cleanly.
    const onZoom = () => {
        const z = map.getZoom();
        // Linear interpolation across the shrink range, clamped 0–1.
        const t = Math.max(0, Math.min(1,
            (z - TENT_SHRINK_START_ZOOM) /
            (TENT_SHRINK_END_ZOOM - TENT_SHRINK_START_ZOOM)
        ));
        const height = TENT_HEIGHT_MAX - (TENT_HEIGHT_MAX - TENT_HEIGHT_MIN) * t;
        const width  = height * ASPECT_RATIO;
        tentEl.style.width  = width  + 'px';
        tentEl.style.height = height + 'px';
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
        try { restorePaint(map, snapshotRef); } catch (_) { /* nothing */ }
    };
}
