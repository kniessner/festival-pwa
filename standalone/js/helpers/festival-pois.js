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
// so first-aid used to point to the same coord as the Eclipse fly-to
// entry — but Jacob 2026-08-11 reverted that: DRK is the real medical
// service (Deutsches Rotes Kreuz), staffed on-site, and the fly-to
// should send a hurting guest to the nearest actual DRK station, not
// to the awareness tent.

const DRK_COORDS = [
    // First entry doubles as the off-site fallback (see nearestOr
    // below). Picked the main DRK / Security base because it's the
    // larger of the two and the one with 24/7 staffing per the
    // festival's medical brief.
    [14.499670, 52.275745],   // DRK / Secu Base
    [14.489318, 52.276619],   // Psycare / DRK zelt
];

const INFO_POINT_COORD = [14.49468, 52.276328]; // Info-point / Lost & Found / Kiosk / DIY station — now a Point inside Community Corner (east side)
const ECLIPSE_COORD    = [14.489207, 52.276594]; // Awareness & Eclipse polygon centroid (produktion.geojson)

// Four Sammelstellen (emergency assembly points), source of truth
// data/security.geojson. Order matches the geojson: NW, N, NE, SW.
// Off-site fallback is the northern-most point (index 1) — the
// central-north Sammelstelle sits near the main entrance corridor
// and is the one a guest who's not at the festival yet is most
// likely to reach first.
const ASSEMBLY_COORDS = [
    [14.494086, 52.278566],   // N — central-north (main entrance corridor); doubles as off-site fallback
    [14.488925, 52.277668],   // NW
    [14.500259, 52.279394],   // NE
    [14.479336, 52.270342],   // SW
];

// Drinking-water stations. Curated by Jacob 2026-08-12 by clicking
// physical taps on the interactive map. Each coord is a drinkable-
// water source guests can refill bottles at — not to be confused with
// the toilet-family Points nearby (some water stations sit right
// next to a WC, but they're semantically distinct: safety-adjacent
// hydration infrastructure, referenced by the 'Water' fly-to entry).
// Off-site / null-GPS fallback is the Marktplatz cluster point
// (index 0), the most central and highest-traffic water source.
const WATER_COORDS = [
    [14.501610, 52.275641],   // Marktplatz — central (off-site fallback)
    [14.483340, 52.274040],   // Porto Loco / south
    [14.484062, 52.275466],   // Atlantis / Stroboklo
    [14.489587, 52.276544],   // DRK area
    [14.494918, 52.276348],   // Community Corner
    [14.491874, 52.276614],   // Strandflitzer NW
    [14.496785, 52.278121],   // Camp Taucher / N infrastructure row
    [14.499212, 52.276295],   // Momentarium / Peepshow
    [14.502954, 52.277897],   // Camp Stille Fische / NE
    [14.503148, 52.276092],   // Mirage
    [14.501556, 52.275672],   // Marktplatz — secondary (5m from index 0)
];

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
        // Sammelstellen — emergency assembly points. Listed FIRST
        // deliberately: in a real incident (evacuation, medical
        // extraction, missing-person coordination) this is the entry
        // guests need to hit fastest, so it sits at the top of the
        // menu even ahead of first-aid.
        id: 'assembly',
        labelKey: 'map.flyto.assembly',
        icon: 'images/poi-assembly.svg',
        resolve: nearestOr(ASSEMBLY_COORDS),
    },
    {
        id: 'first-aid',
        labelKey: 'map.flyto.firstAid',
        icon: 'images/poi-firstaid.svg',
        // Points at the nearest DRK station — there are two, ~700 m
        // apart, so the nearest-picker matters a lot for a guest who
        // may already be in distress. Off-site / null-GPS falls back
        // to the main DRK / Secu Base (DRK_COORDS[0]).
        resolve: nearestOr(DRK_COORDS),
    },
    {
        // Water stations — refill points scattered across the site.
        // Inserted between First aid and Toilet: hydration is safety-
        // adjacent (heatstroke is a real risk on hot festival days).
        // Off-site / null-GPS falls back to the Marktplatz central
        // station (WATER_COORDS[0]).
        id: 'water',
        labelKey: 'map.flyto.water',
        icon: 'images/poi-water.svg',
        resolve: nearestOr(WATER_COORDS),
    },
    {
        id: 'toilet',
        labelKey: 'map.flyto.toilet',
        icon: 'images/poi-toilet.svg',
        resolve: nearestOr(TOILET_COORDS),
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
    {
        // Tent sits at the bottom because it's a per-user marker,
        // not a fixed festival POI — visually separated from the
        // shared-infrastructure entries above it.
        id: 'tent',
        labelKey: 'map.flyto.tent',
        // Uses the outline poi-tent icon (part of the fly-to icon
        // family delivered by Berit) so the row reads as one of the
        // set with the other four entries. The bespoke red drop-pin
        // (images/tent.svg) is still what the user sees on the map
        // itself for the draggable "my tent" marker — visually
        // distinct on purpose so it stands out against the terrain.
        icon: 'images/poi-tent.svg',
        // Read fresh on every click so a drag+drop from the drag-me
        // marker is reflected immediately without a store subscription.
        resolve: () => getTentPosition(),
    },
];
