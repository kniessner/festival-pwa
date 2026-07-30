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

let loadedFeatures = null;
let loadPromise = null;

/**
 * Load standalone/data/stages.geojson once. Idempotent: repeated calls
 * return the cached features (or the in-flight promise) instead of
 * re-fetching. Call once from app.js init() in parallel with loadData().
 *
 * The service worker serves this via staleWhileRevalidate (matches the
 * /data/ route in sw.js), which is fine — polygons change rarely and
 * we don't want to block boot on a network round-trip.
 *
 * @returns Promise resolving to the loaded features array (never rejects;
 *          on failure returns [] and getStage() will always return false).
 */
export async function loadStages() {
    if (loadedFeatures) return loadedFeatures;
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
        try {
            const res = await fetch('data/stages.geojson');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const geojson = await res.json();
            loadedFeatures = geojson.features || [];
        } catch (e) {
            console.error('Failed to load stages.geojson', e);
            loadedFeatures = [];
        }
        return loadedFeatures;
    })();
    return loadPromise;
}

/** Returns the loaded features (empty array if load hasn't completed or failed). */
export function getLoadedStages() {
    return loadedFeatures || [];
}

/**
 * Determine which stage the given GPS fix falls into.
 *
 * @param location { longitude, latitude, accuracy? } | null | false.
 *   `accuracy` is the fix's 68% confidence radius in metres. When
 *   provided and greater than MAX_STAGE_DETECTION_ACCURACY_METRES,
 *   the stage is reported as unknown (returns false) instead of
 *   guessing on a low-quality fix.
 * @returns The name (slug) of the stage if the fix lies within one of
 *          the loaded polygons; false otherwise. Return type matches
 *          fusion's getFloor() for pattern parity — hysteresis consumers
 *          normalise false to null internally.
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
        // GeoJSON Polygon: coordinates is an array of linear rings; the
        // first is the outer ring. Holes (subsequent rings) are not
        // modelled for stage polygons, so we only check the outer ring.
        const outerRing = feature.geometry.coordinates[0];
        if (isPointInPolygon(point, outerRing)) {
            return feature.properties.name;
        }
    }
    return false;
}
