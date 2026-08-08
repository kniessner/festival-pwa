// Fly-to popover — the small contextual menu that opens above the
// fly-to button in the map controls group. Shows a short list of
// jump-to entries (see js/helpers/festival-pois.js) that on click
// resolve to a coord and fly the map there.
//
// Anchoring: absolute inside .festival-map, bottom-left aligned so
// its bottom edge sits just above the button-group waistline. Width
// grows to fit the widest label but is bounded so it never crosses
// the right edge on narrow phones.
//
// Dismissal: backdrop click, escape key, entry-pick. The map beneath
// the popover stays fully interactive (backdrop is pointer-events:
// none except a single transparent tap-target strip below the card
// itself, which is where an outside-click actually lands). We match
// fusion's behaviour: pan/pinch on the map does NOT close the popover.
//
// Single-instance: only one popover per stage. Re-opening closes an
// existing one first, so a stray click can't spawn two side-by-side.

import { t } from '../i18n.js';
import { store } from '../store.js';
import { POI_LIST } from '../helpers/festival-pois.js';

// Fly-to camera behaviour. Zoom is deep on purpose — the user
// picked a specific POI, so the fly-to should land close enough
// that the exact location is unmistakable. maxZoom is 19, so 18
// leaves one full pinch of headroom.
const FLYTO_ZOOM = 18;
const FLYTO_DURATION_MS = 1200;
// Delay before the ripple auto-removes. Must be at least as long as
// the .poi-pulse-ring CSS animation (1.8 s) plus a small buffer.
const PULSE_MARKER_LIFETIME_MS = 2300;

const POPOVER_CLASS = 'festival-map-flyto';

// One popover per stage, keyed by container so multiple map mounts
// (unlikely) can't share state.
const state = new WeakMap();

/**
 * Open the fly-to popover for the given map+stage. If one is already
 * open for this stage, it's closed first (toggle semantics).
 *
 * @param {maplibregl.Map} map
 * @param {HTMLElement}    stage
 */
export function openFlyToMenu(map, stage) {
    // Toggle: if already open, close and bail.
    const existing = state.get(stage);
    if (existing) {
        closeFlyToMenu(stage);
        return;
    }

    const overlay = buildOverlay(map, stage);
    stage.appendChild(overlay);

    const onKeyDown = (e) => {
        if (e.key === 'Escape') closeFlyToMenu(stage);
    };
    document.addEventListener('keydown', onKeyDown);

    state.set(stage, { overlay, onKeyDown });

    // Focus the first entry so keyboard users can Tab through the list
    // immediately. rAF so the browser has painted the popover first
    // (focus on a display: none / just-appended element sometimes
    // doesn't take on iOS).
    requestAnimationFrame(() => {
        const first = overlay.querySelector('.festival-map-flyto-entry');
        if (first) first.focus();
    });
}

export function closeFlyToMenu(stage) {
    const entry = state.get(stage);
    if (!entry) return;
    document.removeEventListener('keydown', entry.onKeyDown);
    if (entry.overlay.parentNode) entry.overlay.parentNode.removeChild(entry.overlay);
    state.delete(stage);
}

export function isFlyToMenuOpen(stage) {
    return state.has(stage);
}

// ─── Internals ──────────────────────────────────────────────────────

function buildOverlay(map, stage) {
    const overlay = document.createElement('div');
    overlay.className = POPOVER_CLASS;

    // Backdrop = the container itself outside the card. Clicking it
    // closes the popover; clicks INSIDE the card don't bubble to it.
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeFlyToMenu(stage);
    });

    const card = document.createElement('div');
    card.className = 'festival-map-flyto-card';
    card.setAttribute('role', 'menu');
    card.setAttribute('aria-label', t('map.flyto.title'));
    card.addEventListener('click', (e) => e.stopPropagation());

    // Small header so the list reads as intentional, not just a stack
    // of buttons. Matches fusion's "Jump to" label.
    const header = document.createElement('div');
    header.className = 'festival-map-flyto-header';
    header.textContent = t('map.flyto.title');
    card.appendChild(header);

    POI_LIST.forEach((poi) => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'festival-map-flyto-entry';
        row.setAttribute('role', 'menuitem');
        row.dataset.poiId = poi.id;
        row.innerHTML = `
            <img src="${poi.icon}" alt="" class="festival-map-flyto-icon"
                 width="28" height="28">
            <span class="festival-map-flyto-label">${escapeHtml(t(poi.labelKey))}</span>
        `;
        row.addEventListener('click', () => {
            handleEntryPick(map, stage, poi);
        });
        card.appendChild(row);
    });

    overlay.appendChild(card);
    return overlay;
}

function handleEntryPick(map, stage, poi) {
    const userPos = readUserPos();
    const target = poi.resolve(userPos);

    // Guard: a resolver returned nothing usable. Should never happen
    // for the current catalogue (single-location entries always return
    // their coord, multi-location always fall back to the first) but
    // defensive because resolvers are user-editable.
    if (!Array.isArray(target) || target.length !== 2) {
        closeFlyToMenu(stage);
        return;
    }

    closeFlyToMenu(stage);

    map.flyTo({
        center: target,
        zoom: FLYTO_ZOOM,
        duration: FLYTO_DURATION_MS,
        // essential = don't respect prefers-reduced-motion. The
        // animation IS the "here you go" feedback — a jump would
        // leave the user disoriented.
        essential: true,
    });

    // Ripple ring at the POI's world coord, fired once the camera
    // settles. See armPulseOnMoveEnd for the rapid-re-tap guarding —
    // taps that arrive while a previous flyTo is still in progress
    // must cancel that pulse handler, or the ring would appear at
    // the wrong (previous) coord when the interrupted flyTo emits
    // moveend from being aborted. Ported from
    // pwa_test/src/Map/MapComponent.tsx#flyToPoi.
    armPulseOnMoveEnd(map, target);
}

// ─── Ripple state (module-scoped: the fly-to menu is a singleton per
// map instance anyway; multiple maps would each mount their own popover
// but share this state harmlessly as long as .off() unhooks the right
// handler). ─────────────────────────────────────────────────────────
let pendingPulseHandler = null;

function armPulseOnMoveEnd(map, coord) {
    if (pendingPulseHandler) {
        map.off('moveend', pendingPulseHandler);
        pendingPulseHandler = null;
    }
    const handler = () => {
        pendingPulseHandler = null;
        pulseAtCoord(map, coord);
    };
    pendingPulseHandler = handler;
    map.once('moveend', handler);
}

// Anchor a briefly-lived Marker at `coord` and let CSS animate the
// pulse. Using a Marker (not a MapLibre symbol layer) so the ring
// stays glued to the world coord as the camera settles, even if the
// flyTo overshoots a fraction — the ring is on the map, not the
// screen. Auto-removed after PULSE_MARKER_LIFETIME_MS so the DOM
// doesn't leak nodes on repeated jumps.
function pulseAtCoord(map, coord) {
    const maplibregl = window.maplibregl;
    if (!maplibregl) return;

    const el = document.createElement('div');
    el.className = 'poi-pulse';
    const ring = document.createElement('span');
    ring.className = 'poi-pulse-ring';
    el.appendChild(ring);

    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(coord)
        .addTo(map);

    setTimeout(() => {
        // The map may be torn down before the timer fires (user swiped
        // to another tab, closed the app…). Marker.remove() is safe
        // in that case per MapLibre's docs, but wrap in try/catch
        // because "safe" and "defensive" aren't quite the same thing.
        try { marker.remove(); } catch (_) { /* nothing */ }
    }, PULSE_MARKER_LIFETIME_MS);
}

function readUserPos() {
    const loc = store.userLocation;
    if (
        loc &&
        typeof loc.latitude === 'number' &&
        typeof loc.longitude === 'number' &&
        loc.error == null
    ) {
        return [loc.longitude, loc.latitude];
    }
    return null;
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
