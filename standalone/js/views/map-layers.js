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
    { id: 'toilets-showers', file: 'toilets-showers.geojson', color: '#4ecdc4' },
];
