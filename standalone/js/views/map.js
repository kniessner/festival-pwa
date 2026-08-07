import { t } from '../i18n.js';

// ─── Data + palette ────────────────────────────────────────────────────
//
// Palette lifted from the illustrated bucht.png. Keeping it here (not in
// tokens.css) because these tones are map-specific styling for MapLibre's
// paint expressions, not app-wide theme colours.

const PNG_MAGENTA_DEEP = '#8b235f';
const PNG_MAGENTA_LINE = '#c22a4c';
const PNG_MAGENTA_HALO = '#3b0f26';
const PNG_STAGE_FILL_WEST = '#7d1b2b';
const PNG_STAGE_FILL_EAST = '#c22a4c';
const PNG_FOOD_GREEN = '#6ACE45';
const PNG_FOOD_LINE = '#3f7a26';
const PNG_FOOD_HALO = '#1a3d10';
const PNG_INFO_RED = '#c93535';
const PNG_INFO_LINE = '#7a1c1c';
const PNG_CREAM = '#f2e9dc';
const PNG_STAGE_LINE = '#e94a8c';
const PNG_SHORE_LINE = '#f2e9dc';

// MapTiler satellite verification underlay. Same key the fusion-map POC
// used. The satellite tiles are online-only — everything else on this
// map (JS, CSS, geojsons, bg image) is precached and works offline; the
// satellite gracefully turns into empty tiles when offline, which the
// user reads as "no ground image available", not "map broken".
const MAPTILER_KEY = '06rHa9F6cOokrirDiPlF';
const SATELLITE_TILES = `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${MAPTILER_KEY}`;

// Font stack we ship as a first pass. MapTiler's fontstack doesn't
// include Megan Display; Metropolis Bold Italic is the closest match.
// When we host our own SDF glyphs (fontnik → Megan Display + Lato) the
// only rows that need swapping are these two arrays.
const FONT_DISPLAY = [
    'Metropolis Bold Italic',
    'Open Sans Bold Italic',
    'Noto Sans Bold Italic',
];
const FONT_HELPER = [
    'Open Sans Italic',
    'Metropolis Regular Italic',
    'Noto Sans Italic',
];

// Slug list used to two-tone the stage polygons: west-shore stages take
// the deeper burgundy fill (matches the ATLANTIS/PORTO LOCO area on the
// PNG), everything else takes the brighter pink of the east crescent.
const WEST_STAGES = [
    'waldtraut',
    'unterholz',
    'sektamt',
    'schlupfloch',
    'porto-loco',
    'stroboklo',
    'atlantis',
    'neustockland',
];

// Combined geojson bbox centre (venues + food + stages) and starting zoom.
// The elongated east-west axis fits a portrait phone once we rotate the
// camera 90° CCW (bearing: -90 → north-on-the-right).
const MAP_CENTER = [14.4935, 52.27465];
const MAP_ZOOM = 14.8;
const MAP_BEARING = -90;

// ─── View ──────────────────────────────────────────────────────────────

export function renderMap(container) {
    container.innerHTML = `
        <div class="festival-map" id="festivalMap"></div>
    `;

    const stage = container.querySelector('#festivalMap');

    // Same dynamic-sizing trick as the PNG map: the sub-page header height
    // varies with viewport, so we measure top-offset at mount and fill the
    // remaining viewport, refreshing on resize (but skipping during a
    // MapLibre gesture to avoid mid-pinch relayouts).
    const gestureState = { active: false };
    const sizeStage = () => {
        if (gestureState.active) return;
        const top = stage.getBoundingClientRect().top;
        const h = Math.max(200, window.innerHeight - top);
        stage.style.height = `${h}px`;
    };
    sizeStage();
    const onResize = () => sizeStage();

    if (window.__festivalMapCleanup) window.__festivalMapCleanup();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    // Defer map init until layout has settled — MapLibre reads container
    // width/height in its constructor and stashes them, so building it
    // before we've set the height would leave it thinking the canvas is
    // 0×0 until the next resize. `requestAnimationFrame` gives the browser
    // a paint to apply our style.height above.
    let map;
    requestAnimationFrame(() => {
        map = createMap(stage, gestureState);
    });

    window.__festivalMapCleanup = () => {
        window.removeEventListener('resize', onResize);
        window.removeEventListener('orientationchange', onResize);
        // MapLibre .remove() releases the GL context, workers, and every
        // registered event listener — essential when the router navigates
        // away, otherwise a WebGL context leaks per visit.
        if (map) map.remove();
    };
}

function createMap(stage, gestureState) {
    const maplibregl = window.maplibregl;
    if (!maplibregl) {
        stage.innerHTML =
            `<div class="festival-map-error">${t('common.noContent')}</div>`;
        return null;
    }

    const map = new maplibregl.Map({
        container: stage,
        style: {
            version: 8,
            glyphs: `https://api.maptiler.com/fonts/{fontstack}/{range}.pbf?key=${MAPTILER_KEY}`,
            sources: {},
            // No background layer: the MapLibre canvas is transparent and
            // the page's page-map body class (see views.css) paints the
            // dreamy blue bg.jpg through the container behind it.
            layers: [],
        },
        center: MAP_CENTER,
        zoom: MAP_ZOOM,
        minZoom: 13,
        maxZoom: 19,
        bearing: MAP_BEARING,
        pitch: 0,
        // Disable attribution auto-collapse so the required OSM/MapTiler
        // credit stays readable on a phone where it would otherwise fold
        // into a tiny (i) button.
        attributionControl: { compact: false },
    });

    map.addControl(
        new maplibregl.NavigationControl({ visualizePitch: false }),
        'top-right',
    );

    // Wire up gesture tracking so the resize handler above knows when to
    // skip. `touchstart` and `pointerdown` both trigger; either works.
    stage.addEventListener('pointerdown', () => { gestureState.active = true; });
    stage.addEventListener('pointerup', () => { gestureState.active = false; });
    stage.addEventListener('pointercancel', () => { gestureState.active = false; });

    map.on('load', () => addLayers(map));
    return map;
}

// ─── Layer stack ───────────────────────────────────────────────────────

function addLayers(map) {
    // Satellite verification underlay (raster-opacity 0.5). Sits at the
    // bottom of the layer stack: illustrated polygons + labels render on
    // top so the tester can visually check that a stage/venue polygon
    // sits on the right patch of ground. Purely a QA layer for now — a
    // later toggle can hide it for the user-facing view.
    map.addSource('satellite-src', {
        type: 'raster',
        tiles: [SATELLITE_TILES],
        tileSize: 256,
        attribution: '© MapTiler © OpenStreetMap contributors',
    });
    map.addLayer({
        id: 'satellite',
        source: 'satellite-src',
        type: 'raster',
        paint: { 'raster-opacity': 0.5 },
    });

    // Helenesee north shore — the OSM Helenesee polygon clipped to the
    // festival bbox on the north half (see standalone/data/helenesee-shore.geojson).
    map.addSource('shore-src', {
        type: 'geojson',
        data: 'data/helenesee-shore.geojson',
    });
    map.addLayer({
        id: 'shore',
        source: 'shore-src',
        type: 'line',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
            'line-color': PNG_SHORE_LINE,
            'line-width': [
                'interpolate', ['linear'], ['zoom'],
                12, 0.8,
                14, 1.6,
                16, 2.6,
                18, 4,
            ],
            'line-opacity': 0.9,
            'line-blur': 0.4,
        },
    });

    // Stages (16 real polygons from the real-floor-geo-data PR). The
    // fill switches on slug so west-cluster stages read as burgundy
    // (matches the PNG's west shore) and east stages as brighter pink.
    map.addSource('stages-src', {
        type: 'geojson',
        data: 'data/stages.geojson',
    });
    map.addLayer({
        id: 'stages',
        source: 'stages-src',
        type: 'fill',
        paint: {
            'fill-color': [
                'match', ['get', 'slug'],
                WEST_STAGES, PNG_STAGE_FILL_WEST,
                PNG_STAGE_FILL_EAST,
            ],
            'fill-opacity': 0.55,
        },
    });
    map.addLayer({
        id: 'stages-outline',
        source: 'stages-src',
        type: 'line',
        paint: {
            'line-color': PNG_STAGE_LINE,
            'line-width': 1.6,
            'line-opacity': 0.95,
        },
    });
    map.addLayer({
        id: 'stages-label',
        source: 'stages-src',
        type: 'symbol',
        layout: {
            'text-field': [
                'upcase',
                ['coalesce', ['get', 'slug'], ['get', 'name'], ''],
            ],
            'text-font': FONT_DISPLAY,
            'text-size': [
                'interpolate', ['linear'], ['zoom'],
                13, 11,
                15, 15,
                17, 22,
            ],
            'text-letter-spacing': 0.15,
            'text-anchor': 'center',
            'text-max-width': 8,
            'text-allow-overlap': false,
            'text-optional': true,
            'text-padding': 4,
            'text-rotation-alignment': 'viewport',
            'text-pitch-alignment': 'viewport',
        },
        paint: {
            'text-color': PNG_CREAM,
            'text-halo-color': PNG_MAGENTA_HALO,
            'text-halo-width': 2,
            'text-halo-blur': 0.4,
        },
    });

    // Art venues — 22 polygons from Lageplan (1)+(2) merged by felt:id.
    map.addSource('venues-src', {
        type: 'geojson',
        data: 'data/venues.geojson',
    });
    map.addLayer({
        id: 'venues',
        source: 'venues-src',
        type: 'fill',
        paint: {
            'fill-color': PNG_MAGENTA_DEEP,
            'fill-opacity': 0.42,
        },
    });
    map.addLayer({
        id: 'venues-outline',
        source: 'venues-src',
        type: 'line',
        paint: {
            'line-color': PNG_MAGENTA_LINE,
            'line-width': 1.1,
            'line-opacity': 0.9,
        },
    });
    map.addLayer({
        id: 'venues-label',
        source: 'venues-src',
        type: 'symbol',
        minzoom: 14,
        layout: {
            'text-field': ['get', 'name'],
            'text-font': FONT_HELPER,
            'text-size': [
                'interpolate', ['linear'], ['zoom'],
                14, 9,
                16, 11,
                17, 13,
            ],
            'text-anchor': 'center',
            'text-max-width': 7,
            'text-allow-overlap': false,
            'text-optional': true,
            'text-padding': 2,
            'text-rotation-alignment': 'viewport',
            'text-pitch-alignment': 'viewport',
        },
        paint: {
            'text-color': PNG_CREAM,
            'text-halo-color': PNG_MAGENTA_HALO,
            'text-halo-width': 1.4,
        },
    });

    // Food stalls + red Community Corner info point (L3, 21 polygons).
    // Category is baked in during data prep so we can drive fill and halo
    // off a single `category` property.
    map.addSource('foodstalls-src', {
        type: 'geojson',
        data: 'data/food.geojson',
    });
    map.addLayer({
        id: 'foodstalls',
        source: 'foodstalls-src',
        type: 'fill',
        paint: {
            'fill-color': [
                'match', ['get', 'category'],
                'info', PNG_INFO_RED,
                PNG_FOOD_GREEN,
            ],
            'fill-opacity': 0.55,
        },
    });
    map.addLayer({
        id: 'foodstalls-outline',
        source: 'foodstalls-src',
        type: 'line',
        paint: {
            'line-color': [
                'match', ['get', 'category'],
                'info', PNG_INFO_LINE,
                PNG_FOOD_LINE,
            ],
            'line-width': 1.1,
            'line-opacity': 0.9,
        },
    });
    map.addLayer({
        id: 'foodstalls-label',
        source: 'foodstalls-src',
        type: 'symbol',
        minzoom: 15,
        layout: {
            'text-field': ['get', 'name'],
            'text-font': FONT_HELPER,
            'text-size': [
                'interpolate', ['linear'], ['zoom'],
                15, 9,
                17, 12,
            ],
            'text-anchor': 'center',
            'text-max-width': 7,
            'text-allow-overlap': false,
            'text-optional': true,
            'text-padding': 2,
            'text-rotation-alignment': 'viewport',
            'text-pitch-alignment': 'viewport',
        },
        paint: {
            'text-color': PNG_CREAM,
            'text-halo-color': [
                'match', ['get', 'category'],
                'info', PNG_INFO_LINE,
                PNG_FOOD_HALO,
            ],
            'text-halo-width': 1.4,
        },
    });

    // Popup on click for any interactive feature. Uses the same cream
    // popup styling as the fusion-map POC, defined in views.css.
    map.on('click', (e) => {
        const features = map.queryRenderedFeatures(e.point, {
            layers: ['venues', 'foodstalls', 'stages'],
        });
        if (!features.length) return;
        const f = features[0];
        const p = f.properties || {};
        const name = p.name || p.slug || '';
        const desc = p.description || '';
        const cat = p.category || p.slug || '';
        new window.maplibregl.Popup({ closeButton: true, offset: 8 })
            .setLngLat(e.lngLat)
            .setHTML(`
                <div class="festival-map-popup">
                    <div class="festival-map-popup-title">${escapeHtml(name)}</div>
                    ${cat ? `<div class="festival-map-popup-cat">${escapeHtml(String(cat))}</div>` : ''}
                    ${desc ? `<div class="festival-map-popup-desc">${escapeHtml(desc)}</div>` : ''}
                </div>
            `)
            .addTo(map);
    });

    ['venues', 'foodstalls', 'stages'].forEach((id) => {
        map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
    });
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}
