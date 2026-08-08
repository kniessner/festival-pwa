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
import { isNearFestival } from './map-common.js';
import { showMapToast } from './map-toast.js';

// Zoom target for the fly-to. Matches Jacob's design intent that
// "locate me" only means something at close-in zoom — the marker is
// too small to read at overview zoom, so forcing 16.5 puts the user
// squarely in "I can see the stages around me" range.
const LOCATE_ZOOM = 16.5;

// Camera animation duration (ms). MapLibre's default is 1000 but the
// festival map is small; the swoop finishes fast so the fix feels
// responsive.
const FLY_DURATION_MS = 1200;

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
    group.appendChild(locateBtn);

    stage.appendChild(group);

    const onLocateClick = () => handleLocateClick(map, stage);
    locateBtn.addEventListener('click', onLocateClick);

    return () => {
        locateBtn.removeEventListener('click', onLocateClick);
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

// The click handler is deliberately synchronous:
//   1. If we have a valid, near-festival fix -> flyTo it.
//   2. Otherwise -> toast and bail. We do NOT re-request permission
//      from here: the browser's geolocation API only prompts on the
//      first navigator.geolocation.watchPosition/.getCurrentPosition
//      call of the session, and any subsequent call inside a denied
//      state is a silent no-op. The right place to (re-)prompt is the
//      onboarding flow, which is exactly where we send the user.
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

    // Preserve bearing + pitch (respects whatever orientation the user
    // has set) and force zoom to LOCATE_ZOOM so the fix reads at the
    // right scale regardless of where the camera was.
    map.flyTo({
        center: [loc.longitude, loc.latitude],
        zoom: LOCATE_ZOOM,
        duration: FLY_DURATION_MS,
        essential: true, // don't respect prefers-reduced-motion: the
                         // animation IS the "here you are" feedback.
    });
}
