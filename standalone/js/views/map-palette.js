// PNG palette + Protomaps theme override for the interactive map.
//
// Colors were sampled from the illustrated bucht.png / festival-map.png
// via 32-color median-cut quantization (see docs/plans/2026-08-08-*).
// This module is imported both by the browser (map-interactive.js) and
// by scripts/generate-basemap-layers.mjs at generation time — keep it
// pure data so both sides can consume it.

// ─── Palette ───────────────────────────────────────────────────────────

// Named tones grouped by role. Every festival-style paint expression in
// map-interactive.js and every basemap layer color should draw from one
// of these — if you find yourself hardcoding a hex literal, add it here
// instead.
export const PALETTE = {
    // Canvas / background — the deepest magenta, sits under everything.
    canvasDeep:      '#5c1c47',

    // Land magentas — dominant west/east base tones from the PNG.
    landDeep:        '#722946',   // burgundy, west-side land
    landMid:         '#832e63',   // primary earth magenta
    landWarm:        '#902e63',   // warm-magenta mid
    landRose:        '#ae3051',   // rose-magenta, east-side highlight
    landRoseAlt:     '#aa2f57',
    landRoseSoft:    '#9d2e5d',
    landRoseDeep:    '#a02f5b',

    // Deep plums — vegetation / camping / cool shadow.
    plumWarm:        '#732d6f',
    plumMid:         '#6c2c72',
    plumDeep:        '#632b75',
    plumDeeper:      '#532a77',

    // Stage reds — pops of accent, used on the illustrated dance floors.
    stageRedDeep:    '#c03049',
    stageRedMid:     '#bb2f4c',
    stageRedBright:  '#cb3540',

    // Water — Helenesee. Primary tone is the app's brand navy
    // (#080943 = --bg in tokens.css) so the lake reads as "same water
    // that fills the app background", making the map feel like it's
    // set on the same surface as the rest of the UI. The other water
    // tones stay warmer for depth/lap detail if we ever need them.
    waterDeepest:    '#050628',   // deeper than brand navy, night-sky
    waterMain:       '#080943',   // brand navy — Helenesee body
    waterAlt:        '#0d1152',
    waterLap:        '#3a3f7a',   // shallow / shore lap
    waterShadow:     '#1a1e42',

    // Ink lines — building outlines, road casings, deep detail.
    inkDeepest:      '#1c0716',
    inkDeep:         '#2a0b20',
    inkBuilding:     '#3a1230',
    inkForest:       '#4a1638',

    // Cream + text — the illustrated poster's readable overlay.
    cream:           '#f2e9dc',   // primary cream
    creamSoft:       '#e5dddd',   // muted cream
    creamMauve:      '#a59fab',   // dusk-lavender (secondary text)
    creamShadow:     '#816b7f',   // darker text shadow

    // Beach / shore — the sandy strip along Helenesee.
    beachSand:       '#e8c98a',
    beachShoreLine:  '#d9c191',
    shoreLap:        '#c17d81',   // pale pink foam
    shoreLapAlt:     '#aa6479',

    // Accent — lavender wash + rose figures (illustrated crowd).
    accentLavender:  '#9b7ab4',
    accentRose:      '#934a74',
};

// ─── Stage/camping fills (used by overlay geojson layers) ─────────────

// ─── Historical — legacy overlay palette exports (unused) ───────────
//
// The seven constants below (STAGE_FILL_WEST / _EAST, CAMPING_FILL /
// _LINE, BEACH_FILL / _LINE, SHORE_LINE) used to drive per-slug
// overlay-layer paint properties back when data/stages.geojson
// carried its own slug schema and map-interactive.js reached in by
// name. That data model was replaced by the Felt-derived geojsons
// (b9dc2c8) which paint via `FELT_LAYERS` / `LABEL_LAYER_IDS` in
// map-layers.js instead. No caller anywhere in js/ imports these
// today.
//
// Kept exported (rather than deleted outright) as a small
// forward-compat surface: if a future overlay refactor wants a
// two-tone stage fill or an explicit beach-shore-line token, these
// names are the natural ones to reach for. Anyone about to touch
// them should first grep and confirm they're still dead — if you
// wire a consumer, delete this comment.
export const STAGE_FILL_WEST  = '#7d1b2b';
export const STAGE_FILL_EAST  = PALETTE.stageRedDeep;
export const CAMPING_FILL     = PALETTE.landRoseAlt;
export const CAMPING_LINE     = PALETTE.landDeep;
export const BEACH_FILL       = PALETTE.beachSand;
export const BEACH_LINE       = PALETTE.beachShoreLine;
export const SHORE_LINE       = PALETTE.beachShoreLine;

// ─── Protomaps theme override ─────────────────────────────────────────

// Maps every Protomaps "light" theme color slot to a value from PALETTE.
// Slots we don't override inherit the light-theme default; those slots
// are almost all label/POI colors we suppress via noLabelsWithCustomTheme,
// so their leftover values don't matter.
//
// Slot names are defined by protomaps-themes-base@4.5.x — see the theme
// object in `namedTheme('light')`.
export const BASEMAP_THEME_OVERRIDE = {
    background: PALETTE.canvasDeep,
    earth: PALETTE.landMid,

    // Vegetation — parks / woods / scrub all read as darker magenta
    // patches in the illustrated map.
    park_a: PALETTE.plumMid,
    park_b: PALETTE.landDeep,
    wood_a: PALETTE.inkForest,
    wood_b: PALETTE.inkBuilding,
    scrub_a: PALETTE.landDeep,
    scrub_b: PALETTE.plumDeep,
    pedestrian: PALETTE.landRoseAlt,

    // Sand + water — direct from the illustrated poster.
    sand: PALETTE.beachSand,
    beach: PALETTE.beachSand,
    water: PALETTE.waterMain,

    // Buildings — deep magenta ink, outline added on top as a bespoke
    // layer in generate-basemap-layers.mjs.
    buildings: PALETTE.inkBuilding,

    // Institutional landuse (hospitals, schools, industrial, zoo,
    // military, aerodrome). All hidden or muted for the festival map —
    // reuse the canvas-deep magenta so they blend into the land.
    hospital: PALETTE.canvasDeep,
    industrial: PALETTE.canvasDeep,
    school: PALETTE.canvasDeep,
    zoo: PALETTE.plumMid,
    military: PALETTE.inkBuilding,
    aerodrome: PALETTE.inkBuilding,
    runway: PALETTE.inkForest,
    pier: PALETTE.inkBuilding,

    // Roads — cased ink lines. Each `kind` gets a slightly different
    // shade so a highway still reads heavier than a footpath.
    minor_a: PALETTE.inkDeep,
    minor_b: PALETTE.inkDeep,
    minor_service: PALETTE.inkDeep,
    link: PALETTE.inkDeep,
    other: PALETTE.inkDeep,
    major: PALETTE.inkBuilding,
    highway: PALETTE.inkForest,

    // Road casings + tunnels — one shade darker than the fill.
    minor_casing: PALETTE.inkDeepest,
    minor_service_casing: PALETTE.inkDeepest,
    link_casing: PALETTE.inkDeepest,
    major_casing_late: PALETTE.inkDeepest,
    major_casing_early: PALETTE.inkDeepest,
    highway_casing_late: PALETTE.inkDeepest,
    highway_casing_early: PALETTE.inkDeepest,
    tunnel_other_casing: PALETTE.inkDeepest,
    tunnel_minor_casing: PALETTE.inkDeepest,
    tunnel_link_casing: PALETTE.inkDeepest,
    tunnel_major_casing: PALETTE.inkDeepest,
    tunnel_highway_casing: PALETTE.inkDeepest,
    tunnel_other: PALETTE.inkDeep,
    tunnel_minor: PALETTE.inkDeep,
    tunnel_link: PALETTE.inkDeep,
    tunnel_major: PALETTE.inkBuilding,
    tunnel_highway: PALETTE.inkForest,

    // Bridges — mirror the base road palette for visual consistency.
    bridges_other: PALETTE.inkDeep,
    bridges_minor: PALETTE.inkDeep,
    bridges_link: PALETTE.inkDeep,
    bridges_major: PALETTE.inkBuilding,
    bridges_highway: PALETTE.inkForest,
    bridges_other_casing: PALETTE.inkDeepest,
    bridges_minor_casing: PALETTE.inkDeepest,
    bridges_link_casing: PALETTE.inkDeepest,
    bridges_major_casing: PALETTE.inkDeepest,
    bridges_highway_casing: PALETTE.inkDeepest,

    railway: PALETTE.inkDeep,
    boundaries: PALETTE.inkForest,

    // Label colors — never rendered (noLabelsWithCustomTheme skips the
    // whole label layer stack) but the theme validator complains if
    // they're missing, so we ship them anyway.
    waterway_label: PALETTE.cream,
    roads_label_minor: PALETTE.cream,
    roads_label_minor_halo: PALETTE.inkDeep,
    roads_label_major: PALETTE.cream,
    roads_label_major_halo: PALETTE.inkDeep,
    ocean_label: PALETTE.cream,
    peak_label: PALETTE.cream,
    subplace_label: PALETTE.cream,
    subplace_label_halo: PALETTE.inkDeep,
    city_label: PALETTE.cream,
    city_label_halo: PALETTE.inkDeep,
    state_label: PALETTE.cream,
    state_label_halo: PALETTE.inkDeep,
    country_label: PALETTE.cream,
    address_label: PALETTE.creamMauve,
    address_label_halo: PALETTE.inkDeep,
};

// ─── Extras appended after the Protomaps stack ────────────────────────

// Building outline layer paint values — a thin dark ink stroke that
// gives building footprints definition against the magenta land.
export const BUILDING_OUTLINE_PAINT = {
    color: PALETTE.inkDeepest,
    width: 0.6,
    opacity: 0.7,
};
