// Quick-jump POI catalogue for the fly-to menu (see map-flyto.js).
//
// Each entry knows how to resolve itself to a single [lng, lat] coord
// given the user's current fix. Single-location entries always return
// the fixed coord; multi-location entries pick the nearest instance to
// the user when they're near the festival, or fall back to the first
// coord otherwise. Same pattern as fusion's pois.ts.
//
// Coord tables extracted from the source geojsons on 2026-08-08 (see
// tools/list-pois.py in git history — the one-liner python that dumped
// each feature's centroid). If Berit reshuffles those, re-run and
// paste back. We intentionally don't compute centroids at runtime so
// the fly-to has no dependency on the (large) geojsons being loaded
// yet.

import { nearest } from './distance.js';
import { getTentPosition } from '../views/tent.js';
import { isNearFestival } from '../views/map-common.js';

// ─── Coord tables ────────────────────────────────────────────────────

// First coord in each list is the fallback used when the user has no
// usable position fix (denied, unavailable, or outside festival bounds).

const TOILET_COORDS = [
    // Approx. central; picked as the fallback for a lost user.
    [14.494186, 52.278280], // DIXI x2 (top of camping strip)
    [14.492139, 52.276826], // WC 14
    [14.499171, 52.276411], // Toilet House
    [14.503399, 52.275656], // WC Wagen
    [14.501550, 52.275724], // WC Wagen
    [14.492722, 52.278090], // DIXI x10
    [14.495003, 52.276231], // Urinal
    [14.494843, 52.276413], // ECO Toilets x8
    [14.482314, 52.271981], // Urinal
    [14.489566, 52.276507], // DIXI
    [14.485274, 52.276411], // DIXI 10
    [14.489628, 52.276657], // Dixi Toilets x8
    [14.492054, 52.276825], // WC 14
    [14.485229, 52.276330], // Urinal
    [14.484063, 52.275512], // WC 9 + 7
    [14.488940, 52.276527], // DIXI
    [14.488930, 52.276547], // DIXI
    [14.485247, 52.276363], // Urinal
    [14.492244, 52.276885], // Urinal
    [14.489596, 52.276498], // DIXI
    [14.485238, 52.276347], // Urinal
    [14.482540, 52.275294], // Dixi x5
    [14.482432, 52.275179], // Dixi x5
    [14.483270, 52.274022], // WC 9 + 7
    [14.482172, 52.271978], // WC Wagen 4,5 x 2,5
    [14.482989, 52.272954], // WC Wagen
    [14.502749, 52.277956], // WC 14
    [14.496659, 52.278220], // Dixi x10 + urinal
    [14.499453, 52.278570], // DIXI x8
];

// First-aid was previously resolved to the nearer of two coords
// (DRK / Secu Base + Psycare / DRK zelt). The Horst review consolidated
// awareness + first-aid provisioning at the Awareness & Eclipse polygon,
// so first-aid now points to the same coord as the Eclipse fly-to entry
// below. FIRST_AID_COORDS deliberately removed rather than left dead
// so a future contributor doesn't wire it back in without knowing why.

const INFO_POINT_COORD = [14.494663, 52.276211]; // Info-point / Lost & Found / Kiosk / DIY station
const ECLIPSE_COORD    = [14.489207, 52.276594]; // Awareness & Eclipse polygon centroid (produktion.geojson)

// ─── Entry catalogue ────────────────────────────────────────────────

/**
 * Each entry:
 *   id         stable string, used as data-poi-id and localStorage
 *   labelKey   i18n key rendered as the row's label
 *   icon       filename under images/, rendered as <img>
 *   resolve(userPos)  returns the [lng, lat] to fly to. userPos may
 *                     be null when GPS is denied or outside bounds.
 */

const nearestOr = (coords) => (userPos) => {
    // Fall back to the first coord when the user is off-site or has no
    // fix at all: same policy as fusion's isInFestivalBounds guard.
    const usable = userPos && isNearFestival(userPos[0], userPos[1]) ? userPos : null;
    return nearest(usable, coords, coords[0]);
};

export const POI_LIST = [
    {
        id: 'tent',
        labelKey: 'map.flyto.tent',
        // Reuses the bespoke drop-pin from the draggable tent marker
        // (images/tent.svg) instead of the outline poi-tent icon, so
        // the fly-to entry visually reads as the same thing the user
        // sees on the map. Self-styled (hardcoded beach-sand fill +
        // red glyph) so it doesn't need the mask-image treatment the
        // other poi icons use.
        icon: 'images/tent.svg',
        // Read fresh on every click so a drag+drop from the drag-me
        // marker is reflected immediately without a store subscription.
        resolve: () => getTentPosition(),
    },
    {
        id: 'toilet',
        labelKey: 'map.flyto.toilet',
        icon: 'images/poi-toilet.svg',
        resolve: nearestOr(TOILET_COORDS),
    },
    {
        id: 'first-aid',
        labelKey: 'map.flyto.firstAid',
        icon: 'images/poi-firstaid.svg',
        // Points at the Awareness & Eclipse polygon — same coord as the
        // Eclipse entry below, since that's where first-aid + emotional
        // support are co-located per Horst's produktion review.
        resolve: () => ECLIPSE_COORD,
    },
    {
        id: 'info',
        labelKey: 'map.flyto.info',
        icon: 'images/poi-info.svg',
        resolve: () => INFO_POINT_COORD,
    },
    {
        // Eclipse is one of two chill-out / de-escalation spots at the
        // festival (paired with PsyCare). Same fixed-location resolver
        // as info-point — there's only one Eclipse and it doesn't have
        // a "nearest" flavour.
        id: 'eclipse',
        labelKey: 'map.flyto.eclipse',
        icon: 'images/poi-generic.svg',
        resolve: () => ECLIPSE_COORD,
    },
];
