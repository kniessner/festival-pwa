// Festival Map route — thin dispatcher between two map variants:
//
//   • Interactive (default): MapLibre GL vector map, geojson polygons on
//     top of a locally-hosted Protomaps PMTiles basemap. Real Megan
//     Display labels via vendored SDF glyphs. See map-interactive.js.
//   • Static: the illustrated bucht.png with a custom pinch-zoom + pan
//     controller (survived from the earlier PNG-only /map). See
//     map-static.js.
//
// The two are mounted into the same route via a button-pair tab bar at
// the top (styled to match the timetable's .tt-type-tabs). The tab bar
// stays visible; switching tears down the previous variant (calling the
// cleanup it returned from render) and mounts the other cleanly. The
// router (see js/router.js) calls teardownMap() on route exit so
// MapLibre's WebGL context / workers don't leak while the user is
// browsing other routes.

import { t } from '../i18n.js';
import { renderStaticMap } from './map-static.js';
import { renderInteractiveMap } from './map-interactive.js';

const DEFAULT_VIEW = 'interactive';

// Route-scoped state. Reset every time the router re-mounts the view
// (i.e. every visit to /map defaults back to the interactive variant),
// which matches the product decision that Interactive is the primary
// experience and Static is a "if you need the illustrated overview"
// escape hatch.
let activeView = DEFAULT_VIEW;
let currentContainer = null;
// The teardown callback that the currently-mounted variant returned
// from its render function. Module-scoped (not on window) so we get
// single-owner semantics: the dispatcher is the only thing that can
// invoke it, which is what avoids the double-invocation crash we hit
// when both dispatcher and variant tried to clean up in sequence.
let activeCleanup = null;

export function renderMap(container) {
    currentContainer = container;
    activeView = DEFAULT_VIEW;
    container.innerHTML = `
        <div class="map-tabs-wrap">
            <div class="tt-type-tabs">
                <button class="tt-type-tab ${activeView === 'interactive' ? 'active' : ''}"
                        data-action="switch-map-view" data-view="interactive">
                    ${t('map.tabInteractive')}
                </button>
                <button class="tt-type-tab ${activeView === 'static' ? 'active' : ''}"
                        data-action="switch-map-view" data-view="static">
                    ${t('map.tabIllustration')}
                </button>
            </div>
        </div>
        <div class="map-body" id="mapBody"></div>
    `;
    mountActive();
}

// Called by app.js's action delegator on `data-action="switch-map-view"`.
// Idempotent — clicking the currently-active tab is a no-op.
export function switchMapView(view) {
    if (!currentContainer || view === activeView) return;
    activeView = view;
    currentContainer.querySelectorAll('[data-action="switch-map-view"]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === view);
    });
    mountActive();
}

// Called by router.js when the user navigates away from /map. Safe to
// call when nothing is mounted (idempotent). Without this the interactive
// variant's WebGL context / MapLibre workers stay alive across other
// routes until the user comes back to /map.
export function teardownMap() {
    if (activeCleanup) {
        activeCleanup();
        activeCleanup = null;
    }
    currentContainer = null;
}

function mountActive() {
    // Guard against a stale invocation — e.g. a delayed event handler
    // firing after teardownMap() nulled currentContainer. Today's only
    // callers set currentContainer immediately, but the invariant is
    // one refactor away from a null-deref if we ever async-defer a mount.
    if (!currentContainer) return;
    if (activeCleanup) {
        activeCleanup();
        activeCleanup = null;
    }
    const body = currentContainer.querySelector('#mapBody');
    if (!body) return;
    body.innerHTML = '';
    activeCleanup = activeView === 'static'
        ? renderStaticMap(body)
        : renderInteractiveMap(body);
}
