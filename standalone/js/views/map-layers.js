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
// Order = z-order (first = bottom). camping-areas sits at the bottom
// so every category-specific layer paints on top of the camp canvas.
export const FELT_LAYERS = [
    { id: 'camping-areas',   file: 'camping-areas.geojson',   color: '#a48bc4' },
    { id: 'produktion',      file: 'produktion.geojson',      color: '#8b7fa8' },
    { id: 'stages',          file: 'stages.geojson',          color: '#c22a4c' },
    // food-court sits ABOVE stages but BELOW gastro so the individual
    // food-stall polygons (Langos, Leuchtstoff, Zirkus Mond Bar, …)
    // paint on top of the food-court zone rather than being covered
    // by it. Same color as sterne so it visually reads as "a sterne
    // area we happen to render out-of-band for z-order reasons".
    { id: 'food-court',      file: 'food-court.geojson',      color: '#ffd166' },
    { id: 'gastro',          file: 'gastro.geojson',          color: '#ff9540' },
    { id: 'sterne',          file: 'sterne.geojson',          color: '#ffd166' },
    { id: 'toilets-showers', file: 'toilets-showers.geojson', color: '#4ecdc4' },
];
