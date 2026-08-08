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
import { MAP_CLOSE_ZOOM, MAP_FLYTO_DURATION_MS } from './map-common.js';

// Fly-to camera behaviour. Zoom + duration shared with the locate-me
// button via map-common.js so the two controls can't drift out of
// sync. See MAP_CLOSE_ZOOM there for rationale.
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
    const card = overlay.querySelector('.festival-map-flyto-card');

    const onKeyDown = (e) => {
        if (e.key === 'Escape') closeFlyToMenu(stage);
    };
    document.addEventListener('keydown', onKeyDown);

    // Outside-click dismissal. Deferred one animation frame so the
    // POINTERDOWN/CLICK sequence that opened the menu (via the fly-to
    // button) doesn't itself land in this listener and close on the
    // same tick.
    //
    // Uses `click`, not `pointerdown`, on purpose: `pointerdown` would
    // fire on the first frame of a pan/pinch gesture over the map and
    // eagerly close the menu, contradicting Jacob's design intent that
    // the map stays fully interactive underneath. `click` only fires
    // for a tap-and-release with negligible movement, so a gesture on
    // the map goes through to MapLibre without dismissing the popover.
    const onDocClick = (e) => {
        if (!card.contains(e.target)) closeFlyToMenu(stage);
    };
    const rafId = requestAnimationFrame(() => {
        document.addEventListener('click', onDocClick);
    });

    state.set(stage, { overlay, onKeyDown, onDocClick, rafId, triggerEl: document.activeElement });

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
    // rafId may be pending (menu opened and closed within one frame)
    // or already-fired (typical). cancel it either way; also detach
    // the listener in case it already installed.
    if (entry.rafId != null) cancelAnimationFrame(entry.rafId);
    if (entry.onDocClick) document.removeEventListener('click', entry.onDocClick);
    if (entry.overlay.parentNode) entry.overlay.parentNode.removeChild(entry.overlay);
    state.delete(stage);
    // Restore focus to whatever was focused before we opened — usually
    // the fly-to button. Keyboard / screen-reader users otherwise get
    // dropped on <body> and lose their place.
    if (entry.triggerEl && typeof entry.triggerEl.focus === 'function') {
        try { entry.triggerEl.focus(); } catch (_) { /* nothing */ }
    }
}

export function isFlyToMenuOpen(stage) {
    return state.has(stage);
}

// ─── Internals ──────────────────────────────────────────────────────

function buildOverlay(map, stage) {
    const overlay = document.createElement('div');
    overlay.className = POPOVER_CLASS;
    // No click handler on the overlay itself: dismissal is done by
    // the document-level `click` listener wired in openFlyToMenu, so
    // that pan/pinch on the map underneath doesn't trigger a close.

    const card = document.createElement('div');
    card.className = 'festival-map-flyto-card';
    card.setAttribute('role', 'menu');
    card.setAttribute('aria-label', t('map.flyto.title'));
    // Belt-and-braces stopPropagation on the card: even though the
    // document-level close-on-outside listener explicitly checks
    // `!card.contains(e.target)`, stopping here means a picky future
    // refactor of that listener can't accidentally close on a click
    // inside the card.
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
        zoom: MAP_CLOSE_ZOOM,
        duration: MAP_FLYTO_DURATION_MS,
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

// ─── Ripple lifecycle
//
// Handler state is stashed on the map instance (map.__pulseState) so
// there's exactly one per MapLibre map. If the user tears down /map
// while a flyTo is in flight, MapLibre's .off() during .remove() drops
// our moveend listener and the closure is GC'd with the rest of the
// map — no module-scoped variables hold on to it across mounts.
//
// Two ways an armed pulse can be cancelled:
//   (a) A second POI tap arrives during the previous flyTo. We detach
//       the old handler before arming the new one — without this,
//       MapLibre would fire moveend when it aborts the first flyTo
//       and paint the ring at the OLD coord.
//   (b) The user starts a gesture (drag/pinch/zoom) during the flyTo,
//       which aborts the animation. We detach the handler so the
//       ring doesn't appear at the abandoned target while the user is
//       already looking somewhere else.
// ─────────────────────────────────────────────────────────────────────────────────────
function cancelPendingPulse(map) {
    const s = map.__pulseState;
    if (!s) return;
    if (s.moveendHandler) map.off('moveend', s.moveendHandler);
    if (s.gestureHandler) {
        map.off('dragstart',  s.gestureHandler);
        map.off('pitchstart', s.gestureHandler);
        map.off('zoomstart',  s.gestureHandler);
    }
    map.__pulseState = null;
}

function armPulseOnMoveEnd(map, coord) {
    cancelPendingPulse(map);

    // Named handlers so both firing and gesture-cancel can .off()
    // by reference.
    const moveendHandler = () => {
        // moveend fires ONCE (we used .once). Detach the gesture
        // guards manually so they don't outlive the pulse.
        if (map.__pulseState) {
            map.off('dragstart',  map.__pulseState.gestureHandler);
            map.off('pitchstart', map.__pulseState.gestureHandler);
            map.off('zoomstart',  map.__pulseState.gestureHandler);
        }
        map.__pulseState = null;
        pulseAtCoord(map, coord);
    };
    const gestureHandler = () => {
        // User grabbed the camera mid-flyTo. Abandon the pulse — the
        // target coord is no longer where the user is looking.
        cancelPendingPulse(map);
    };

    map.__pulseState = { moveendHandler, gestureHandler };
    map.once('moveend', moveendHandler);
    map.on('dragstart',  gestureHandler);
    map.on('pitchstart', gestureHandler);
    map.on('zoomstart',  gestureHandler);
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
