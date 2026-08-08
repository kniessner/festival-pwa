/**
 * Great-circle distance (Haversine) between two [lon, lat] WGS84 points,
 * in metres. Sub-metre accuracy at festival scale.
 *
 * Ported verbatim from fusion (pwa_test/src/Map/helpers/distance.ts).
 * We only ever RANK distances (to pick a nearest POI), so callers could
 * use planar-squared distance instead — but haversine costs a few
 * microseconds and the code that uses it is far easier to read when
 * "distance in metres" is what's actually returned. If this ever ends
 * up on a hot path, swap the helpers below to sqDist.
 */

const EARTH_RADIUS_M = 6371000;

const toRad = (deg) => (deg * Math.PI) / 180;

export function haversineMeters(a, b) {
    const [lonA, latA] = a;
    const [lonB, latB] = b;
    const dLat = toRad(latB - latA);
    const dLon = toRad(lonB - lonA);
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(latA)) * Math.cos(toRad(latB)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Given a user's fix and a list of candidate coords, return the one
 * closest to the user by great-circle distance. Callers pass a fallback
 * (the first coord in the list) via `fallback` for the case where the
 * user has no usable fix.
 */
export function nearest(userPos, candidates, fallback) {
    if (!userPos || !Array.isArray(userPos) || candidates.length === 0) {
        return fallback;
    }
    let best = candidates[0];
    let bestDist = haversineMeters(userPos, best);
    for (let i = 1; i < candidates.length; i++) {
        const d = haversineMeters(userPos, candidates[i]);
        if (d < bestDist) {
            bestDist = d;
            best = candidates[i];
        }
    }
    return best;
}
