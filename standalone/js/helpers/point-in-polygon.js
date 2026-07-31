/**
 * Standard ray-casting point-in-polygon test.
 *
 * @param point   [longitude, latitude]
 * @param polygon Outer ring as [[lng, lat], ...]. Holes are not
 *                supported; pass the outer ring of a GeoJSON Polygon.
 * @returns true if the point lies inside the polygon, false otherwise.
 *          Behaviour on the boundary itself is undefined
 *          (ray-casting flips state at edge crossings).
 *
 * Ported verbatim from the fusion app's Map/helpers/pointInPolygon.ts —
 * same algorithm, same behaviour, plain JS instead of TS.
 */
export function isPointInPolygon(point, polygon) {
    const [x, y] = point;
    let isInside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i];
        const [xj, yj] = polygon[j];
        const intersect =
            (yi > y) !== (yj > y) &&
            x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
        if (intersect) {
            isInside = !isInside;
        }
    }
    return isInside;
}
