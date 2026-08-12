// Overlay-layer registry shared by map-interactive.js (which renders
// them) and tent.js (which fades/highlights them during drag). Kept in
// this leaf module to break what would otherwise be a circular import
// between the two consumers.
//
// If a new overlay group joins the map, adding an entry here is the
// ONLY place both the render and drag-paint pipelines need to know.
// - `id`   drives every derived layer id: `${id}-fill`, `${id}-outline`,
//          `${id}-point`, `${id}-label`.
// - `file` is loaded as a geojson source under that id.
// - `color` is the shared paint colour for fill / outline / point /
//          label halo. Distinct per group so features stay separable
//          by eye during the analysis pass.
// - `pointRadius` / `pointStrokeWidth` (optional) override the
//          default 4 / 1 for Point features. Both accept a scalar or
//          a MapLibre expression, so a layer can zoom-interpolate its
//          circle size. Used by the security layer to render
//          prominent Assembly-point dots that shrink at overview
//          zoom and grow when the user pinches in.
// - `glyphOverlay` (optional) renders a small always-visible white
//          text glyph centred on each Point at every zoom level (an
//          extra symbol layer, id `${id}-glyph`). Used by cashless to
//          stamp a white € on the orange dot so the payment identity
//          is legible before the label fades in. text-size is
//          proportional to pointRadius; text-allow-overlap: true so
//          the glyph never gets dropped by collision.
//
// Order = z-order (first = bottom). Explicit "bigger underneath,
// smaller on top" policy so a small feature that sits inside a
// larger one is never occluded by it. Concrete calls this fixes:
//   - produktion Info-point / Crew-Bar Kiosk (a=1.8 / 0.3) sit inside
//     sterne Community Corner (a=8.7). produktion moved above sterne.
//   - gastro Communitea / De Loite / FanMan / Moving Cafe / Bitte
//     Drehen Sie durch (all a<1) sit inside sterne Marktplatz (a=26.8)
//     and Cuddle Poodle (a=6.9). gastro moved above sterne.
//
// General rule for anyone editing this list: if you add a new
// overlay whose polygons visually contain another overlay's polygons,
// put the containing one LOWER. Within a single geojson we don't
// currently need feature-level fill-sort-key since no within-file
// containment is known; if that changes, precompute a `z` property
// in scripts/optimize-geojson.mjs and set `fill-sort-key: ['get','z']`
// on the fill layer.
export const FELT_LAYERS = [
    { id: 'camping-areas',   file: 'camping-areas.geojson',   color: '#a48bc4' },
    { id: 'stages',          file: 'stages.geojson',          color: '#c22a4c' },
    // food-court sits ABOVE stages but BELOW gastro so the individual
    // food-stall polygons (Langos, Leuchtstoff, Zirkus Mond Bar, …)
    // paint on top of the food-court zone rather than being covered
    // by it. Same color as sterne so it visually reads as "a sterne
    // area we happen to render out-of-band for z-order reasons".
    { id: 'food-court',      file: 'food-court.geojson',      color: '#c17d81' },
    { id: 'sterne',          file: 'sterne.geojson',          color: '#c17d81' },
    { id: 'gastro',          file: 'gastro.geojson',          color: '#ff9540' },
    { id: 'produktion',      file: 'produktion.geojson',      color: '#8b7fa8' },
    // toilets-showers: converted from polygons to Points to save
    // ~3.4 KB (46% of file) and 144 vertex slots. Every feature was
    // a 5-vertex rectangle (4-30 m²) whose exact shape carried no
    // signal beyond "toilet is here". Point radius interpolates on
    // zoom (5 px overview → 8 px close), a subtler version of the
    // security-layer curve — the dots need to stay visually
    // secondary to the Sammelstellen (which peak at 14 px).
    {
        id: 'toilets-showers',
        file: 'toilets-showers.geojson',
        color: '#4ecdc4',
        pointRadius: ['interpolate', ['linear'], ['zoom'], 14, 4, 17, 10],
    },
    // traffic — guest-facing car/parking layer (P4 & P5 lots, P6
    // overflow, E3 entrance). Colour matches Felt's own
    // Auto&ParkKonzept blue so a guest cross-referencing the
    // printed / operator maps sees the same paint. Kept LEAN per
    // Jacob: staff-only polygons (P1, P3) + Notes were extracted
    // from Felt but deliberately not shipped — they'd only mislead
    // a driving guest into a wrong lot.
    { id: 'traffic',         file: 'traffic.geojson',         color: '#2674ba' },
    // security — Sammelstellen (emergency assembly points). Mustard
    // yellow, safety-signage convention. Point radius interpolates on
    // zoom (8 px at overview, 12 px when pinched in) so the dots don't
    // shout at low zoom but still read as safety beacons up close.
    // Kept at the top of the paint stack (last entry) so nothing
    // occludes them.
    {
        id: 'security',
        file: 'security.geojson',
        color: '#c9a227',
        pointRadius: ['interpolate', ['linear'], ['zoom'], 14, 6, 17, 14],
        pointStrokeWidth: 2,
    },
    // cashless — wristband top-up stations (7 across the site). Same
    // #F49300 orange as the printed static map. Point radius matches
    // the toilet tier (4 → 10 px) so they read as "utility
    // infrastructure", not safety.  Label 'Cashless top-up' fades in
    // at zoom ≥ 17 (fadeVeryClose tier); at overview the orange
    // colour alone carries the identity.  Kept at the top of the
    // paint stack so an unrelated future overlay can't accidentally
    // occlude the payment dots.
    //
    // Previously stamped a white '€' glyph on every dot via
    // `glyphOverlay: '€'`. Removed 2026-08-12: the tiny € at overview
    // zoom read as noise on the small dot. The infrastructure for
    // glyphOverlay is preserved (see FELT_LAYERS docstring) in case a
    // future layer wants it.
    {
        id: 'cashless',
        file: 'cashless.geojson',
        color: '#F49300',
        pointRadius: ['interpolate', ['linear'], ['zoom'], 14, 4, 17, 10],
    },
];
