// Map controls — the button group that lives inside the .festival-map
// stage, bottom-left, mirroring the app-wide menu FAB at bottom-right.
//
// Extensible on purpose: today it's a single "locate me" button but the
// container is already a flex row so future buttons (recenter tent,
// toggle layers, reset camera…) slot in without reflowing the layout.
//
// Owns nothing that outlives the map: builds DOM, attaches listeners,
// returns a cleanup that removes both. Called from map-interactive.js
// after `map.on('load')`, and its cleanup is invoked by that variant's
// teardown before map.remove().

import { t } from '../i18n.js';
import { store } from '../store.js';
import {
    isNearFestival,
    MAP_CLOSE_ZOOM,
    MAP_FLYTO_DURATION_MS,
} from './map-common.js';
import { showMapToast } from './map-toast.js';
import { openFlyToMenu, closeFlyToMenu, cancelPendingPulse } from './map-flyto.js';

// (Zoom + duration constants live in map-common.js so the fly-to
// menu and the locate button can't drift out of sync.)

/**
 * Mount the map control group.
 *
 * @param {maplibregl.Map} map    The MapLibre instance.
 * @param {HTMLElement}    stage  The .festival-map container.
 * @returns {() => void}          Cleanup: removes DOM + listeners.
 */
export function createMapControls(map, stage) {
    const group = document.createElement('div');
    group.className = 'festival-map-controls';

    const locateBtn = buildLocateButton();
    // Order matters visually: locate on the left (mirrors the menu
    // FAB's role as the primary action per corner), fly-to on the
    // right, so they read as "where am I / where to next" left-to-right.
    const flyToBtn = buildFlyToButton();
    group.appendChild(locateBtn);
    group.appendChild(flyToBtn);

    stage.appendChild(group);

    const onLocateClick = () => handleLocateClick(map, stage);
    locateBtn.addEventListener('click', onLocateClick);

    const onFlyToClick = () => openFlyToMenu(map, stage);
    flyToBtn.addEventListener('click', onFlyToClick);

    return () => {
        locateBtn.removeEventListener('click', onLocateClick);
        flyToBtn.removeEventListener('click', onFlyToClick);
        // Close a possibly-open popover so its escape-key listener is
        // unhooked before the map goes away.
        closeFlyToMenu(stage);
        if (group.parentNode) group.parentNode.removeChild(group);
    };
}

function buildLocateButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'festival-map-control-btn festival-map-locate-btn';
    btn.setAttribute('aria-label', t('map.locateMe'));
    btn.innerHTML = `
        <img src="images/locate.svg" alt="" class="festival-map-control-icon"
             width="20" height="20">
    `;
    return btn;
}

function buildFlyToButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'festival-map-control-btn festival-map-flyto-btn';
    btn.setAttribute('aria-label', t('map.flyto.title'));
    btn.setAttribute('aria-haspopup', 'menu');
    btn.innerHTML = `
        <img src="images/fly-navigation.svg" alt="" class="festival-map-control-icon"
             width="20" height="20">
    `;
    return btn;
}

// The click handler is deliberately synchronous:
//   1. If we have a valid, near-festival fix -> flyTo it.
//   2. Otherwise -> toast and bail. We do NOT re-request permission
//      from here. Permission state is one of:
//        - granted : the shared watch (js/location.js) will keep
//                    delivering fixes; a toast now would race an
//                    imminent fix, so we bail.
//        - denied  : subsequent getCurrentPosition / watchPosition
//                    calls are silent no-ops until the user changes
//                    the site's permission in browser settings, which
//                    they can't do from a button click. Toast + link
//                    them mentally back to onboarding is the best we
//                    can do without adding a settings flow.
//        - prompt  : we already asked during onboarding. Re-asking
//                    on a random button click feels worse than a
//                    quiet toast pointing them at the same flow.
function handleLocateClick(map, stage) {
    const loc = store.userLocation;
    const hasFix =
        loc &&
        typeof loc.latitude === 'number' &&
        typeof loc.longitude === 'number' &&
        loc.error == null;

    if (!hasFix) {
        showMapToast(stage, t('map.gpsNeeded'));
        return;
    }

    if (!isNearFestival(loc.longitude, loc.latitude)) {
        // User has a valid fix but is nowhere near the site (e.g.
        // testing the app from home). MapLibre's maxBounds would clip
        // the flyTo to the nearest festival edge, which would be
        // misleading — better to surface it with a toast.
        showMapToast(stage, t('map.notAtFestival'));
        return;
    }

    // Cancel any POI-pulse handler that's waiting on the previous
    // flyTo's moveend. Without this, tapping locate mid-POI-flight
    // could paint the ring at the abandoned POI coord instead of
    // being silently discarded — event ordering when one flyTo
    // interrupts another is implementation-defined in MapLibre, so
    // we don't want to depend on the gesture handler catching this.
    cancelPendingPulse(map);

    map.flyTo({
        center: [loc.longitude, loc.latitude],
        zoom: MAP_CLOSE_ZOOM,
        duration: MAP_FLYTO_DURATION_MS,
        // essential = don't respect prefers-reduced-motion: the
        // animation IS the "here you are" feedback.
        // Note: no pulse ring here (unlike the fly-to POI menu) —
        // the user-location dot IS its "here you are" marker, so a
        // second ripple on top would feel redundant.
        essential: true,
    });
}
