import { isPointInPolygon } from './point-in-polygon.js';

/**
 * Generous accuracy gate. A GPS fix with a 68% confidence radius worse
 * than this is treated as "no fix" for stage detection: it is too
 * likely to land us on the wrong polygon in a dense cluster. 40 m
 * keeps every realistic outdoor fix (typically 2–20 m at a festival)
 * and only rejects the cell-tower-fallback / weak-signal regime where
 * today's code would confidently report the wrong stage.
 *
 * Ported from fusion (get-floor.utils.ts).
 */
export const MAX_STAGE_DETECTION_ACCURACY_METRES = 40;

/**
 * Files fed into `loadStages()`. Order matters at two levels:
 *
 *   1. Cross-file precedence: `stages.geojson` first so a music-stage
 *      polygon always beats a sterne footprint if the two ever overlap.
 *   2. Within-file order: features are scanned top-down; two overlapping
 *      polygons within the same file resolve by whichever appears first.
 *      Author with that in mind (put smaller / more-specific polygons
 *      before their containers, or switch to a smallest-area-wins scan
 *      here if the data starts nesting).
 */
const POLYGON_FILES = ['data/stages.geojson', 'data/sterne.geojson'];

/**
 * Generic timetable slugs that intentionally have NO polygon on the
 * map. These are filter/UX buckets in the timetable UI, not physical
 * locations. Excluded from the "timetable slug without polygon" warning
 * so the warning only surfaces real mistakes.
 *
 *   - walking-act: events that roam the site (jugglers, mobile performers)
 *   - dezentral:   scheduled events at named sub-spots whose location is
 *                  encoded in the event title, not a fixed polygon
 */
const GENERIC_TIMETABLE_SLUGS = new Set(['walking-act', 'dezentral']);

let loadedFeatures = null;
let loadPromise = null;

/**
 * Load every geojson listed in POLYGON_FILES once. Idempotent: repeated
 * calls return the cached features (or the in-flight promise) instead
 * of re-fetching. Call once from app.js init() in parallel with
 * loadData().
 *
 * The service worker serves these via staleWhileRevalidate (matches the
 * /data/ route in sw.js), which is fine — polygons change rarely and
 * we don't want to block boot on a network round-trip.
 *
 * Historically named `loadStages` (single file). Now unions stages +
 * sterne so a GPS fix inside e.g. Cuddle Poodle or Community Corner
 * (both sterne polygons carrying timetable slugs) triggers the same
 * auto-scroll behaviour as a fix inside Atlantis.
 *
 * @returns Promise resolving to the flat features array (never rejects;
 *          on failure returns [] and getStage() will always return false).
 */
export async function loadStages() {
    if (loadedFeatures) return loadedFeatures;
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
        const collected = [];
        for (const path of POLYGON_FILES) {
            try {
                const res = await fetch(path);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const geojson = await res.json();
                for (const feat of geojson.features || []) collected.push(feat);
            } catch (e) {
                // Non-fatal: if one file fails to load the rest still work,
                // and getStage() just returns false for any missed polygons
                // rather than crashing the map.
                console.error(`Failed to load ${path}`, e);
            }
        }
        loadedFeatures = collected;
        return loadedFeatures;
    })();
    return loadPromise;
}

/** Returns the loaded features (empty array if load hasn't completed or failed). */
export function getLoadedStages() {
    return loadedFeatures || [];
}

/**
 * Console-warn any drift between the loaded polygon slugs (stages +
 * sterne) and the slug universe the timetable data model actually
 * uses. The intent is to catch two failure modes at boot:
 *
 *   1. A slug is referenced by an event or filter row but no polygon
 *      backs it → GPS-based auto-scroll to that row will silently
 *      never trigger.
 *   2. A polygon exists but nothing in the timetable model references
 *      it → a user standing on that polygon dispatches a valid
 *      stagechange, but the grid has no [data-stage="…"] row to
 *      scroll to.
 *
 * The caller pre-computes the used-slug Set (union of
 * `timetable.filters.stages[].value` and `music.events[].stage`) so
 * this module stays free of dependencies on the specific data shapes.
 * GENERIC_TIMETABLE_SLUGS (walking-act, dezentral) is dropped from
 * case 1 because those are UX buckets, not physical locations.
 *
 * Call after both loadData() and loadStages() have resolved.
 *
 * @param usedSlugs Set<string> of slugs referenced anywhere in the
 *        timetable model (filters + events). Empty / falsy = skip.
 */
export function warnStageNameMismatches(usedSlugs) {
    if (!usedSlugs || typeof usedSlugs.has !== 'function' || usedSlugs.size === 0) return;

    const polygonSlugs = new Set(
        getLoadedStages()
            .map(f => f.properties?.slug)
            .filter(Boolean),
    );
    const nonGenericUsed = [...usedSlugs].filter(v => v && !GENERIC_TIMETABLE_SLUGS.has(v));

    const missingPolygons = nonGenericUsed.filter(s => !polygonSlugs.has(s)).sort();
    const orphanPolygons  = [...polygonSlugs].filter(p => !usedSlugs.has(p)).sort();

    if (missingPolygons.length) {
        // Real bug: a slug the timetable renders as a row / references
        // in events has no polygon to receive GPS fixes. Auto-scroll
        // silently no-ops for that stage. Loud so it can't be missed.
        console.warn('[stages] timetable slugs without polygons:', missingPolygons);
    }
    if (orphanPolygons.length) {
        // Informational: polygon has no timetable programming yet
        // (art installations, back-of-house, services). Not an error —
        // downgraded to info so it doesn't train devs to ignore the
        // whole warning family.
        console.info('[stages] polygons without matching timetable slugs:', orphanPolygons);
    }
}

/**
 * Return the outer ring(s) of a GeoJSON polygon geometry, one per
 * physical polygon. Handles both `Polygon` (single ring array) and
 * `MultiPolygon` (list of polygon-arrays); collapses each polygon to
 * its outer ring only — holes are not modelled for stage / sterne
 * footprints in this dataset.
 *
 * Any other geometry type returns []. Point is a legitimate feature
 * shape in the source (art installations like Skull, Momentarium etc.
 * are Points because they don't have a footprint you can stand
 * "inside of") — those are silently skipped. Truly unexpected types
 * (LineString, GeometryCollection, …) log a dev-mode warning the
 * FIRST time each appears, so a stray non-polygon in the source
 * doesn't corrupt point-in-polygon output without leaving a trace.
 */
const KNOWN_NON_POLYGON_TYPES = new Set(['Point']);
const _warnedGeomTypes = new Set();
function outerRingsOf(geom, featureLabel) {
    if (!geom || typeof geom !== 'object') return [];
    if (geom.type === 'Polygon')      return [geom.coordinates[0]];
    if (geom.type === 'MultiPolygon') return geom.coordinates.map(poly => poly[0]);
    if (!KNOWN_NON_POLYGON_TYPES.has(geom.type) && !_warnedGeomTypes.has(geom.type)) {
        _warnedGeomTypes.add(geom.type);
        console.warn(
            `[stages] unsupported geometry type in polygon set: ${geom.type}`
            + (featureLabel ? ` (feature: ${featureLabel})` : ''),
        );
    }
    return [];
}

/**
 * Determine which stage (or sterne) the given GPS fix falls into.
 *
 * @param location { longitude, latitude, accuracy? } | null | false.
 *   `accuracy` is the fix's 68% confidence radius in metres. When
 *   provided and greater than MAX_STAGE_DETECTION_ACCURACY_METRES,
 *   the stage is reported as unknown (returns false) instead of
 *   guessing on a low-quality fix.
 * @returns The slug of the polygon the fix lies within (from
 *          stages.geojson OR sterne.geojson — first hit wins), or
 *          false when no polygon matches. Return type matches
 *          fusion's getFloor() for pattern parity — hysteresis
 *          consumers normalise false to null internally.
 */
export function getStage(location) {
    if (!location) return false;
    if (
        location.accuracy != null &&
        location.accuracy > MAX_STAGE_DETECTION_ACCURACY_METRES
    ) {
        return false;
    }
    const point = [location.longitude, location.latitude];
    for (const feature of getLoadedStages()) {
        // Handle both Polygon (single outer ring) and MultiPolygon
        // (several polygons, each with its own outer ring). Iterating
        // the ring list here lets a single feature that spans a
        // discontiguous area (e.g. two disjoint tents sharing one
        // slug) still resolve correctly.
        for (const outerRing of outerRingsOf(feature.geometry, feature.properties?.slug)) {
            if (isPointInPolygon(point, outerRing)) {
                return feature.properties?.slug;
            }
        }
    }
    return false;
}
