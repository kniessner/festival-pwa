#!/usr/bin/env node
/**
 * Build the map search index consumed by js/views/map-search.js.
 *
 * Reads every overlay geojson in standalone/data/*.geojson, filters
 * out staff-only / infrastructure entries via a hand-curated blocklist,
 * normalises well-known typos, computes a centroid per feature, and
 * writes a compact JSON array to standalone/data/map-search-index.json.
 *
 * Shape of each output entry:
 *   {
 *     id:       'stage-atlantis',        // stable, unique
 *     text:     'Atlantis',              // display name (typo-corrected)
 *     category: 'stage',                 // one of the CATEGORY_BY_FILE values
 *     tags:     ['stage'] | ['gastro','bar'] | ...   // used by synonym resolvers
 *     coord:    [lng, lat]               // 6-decimal centroid
 *   }
 *
 * Run it standalone (`npm run build:search-index`) OR let scripts/build.js
 * invoke it before the dist copy step. The output is committed to git so
 * dev servers work without a build.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = join(__dirname, '..', 'data');
const OUT_FILE  = join(DATA_DIR, 'map-search-index.json');

// ─── Configuration ────────────────────────────────────────────────────

/** Map from geojson filename → category slug baked into each entry. */
const CATEGORY_BY_FILE = {
    'stages.geojson':          'stage',
    'camping-areas.geojson':   'camp',
    'gastro.geojson':          'gastro',
    'sterne.geojson':          'sterne',
    'produktion.geojson':      'produktion',
    'toilets-showers.geojson': null,   // split at runtime by name (toilet vs shower)
    'landmarks.geojson':       'landmark',
};

/**
 * Feature `text` values that should NOT appear in the search index.
 * Staff-only, infrastructure, or misclassified features.
 *
 * Format is [filename, text] to avoid cross-file collisions (there's
 * a "Bar" in both gastro AND toilets-showers, only one of which is
 * "wrong"). If the text is truly the same across files and we want to
 * kill both, list it twice.
 */
const BLOCKLIST = new Set([
    // stages: FOH is staff sound-mixing, not a public stage
    'stages.geojson::FOH Seeblick',

    // gastro: internal / infra
    'gastro.geojson::Küche',
    'gastro.geojson::Kühlung',
    'gastro.geojson::Spüllmobil',
    'gastro.geojson::Gastroplan Raumcont.',
    'gastro.geojson::Food',          // too generic
    'gastro.geojson::Bar',           // too generic; specific bars have names
    'gastro.geojson::bar',           // lower-case variant present in data

    // produktion: staff-only. Kept: Awareness, Bänderkontrolle (+3x3),
    // Check-in Autos, DRK / Secu Base, Eclipse, Einlass / Check-in,
    // Info-point / Lost & Found / Kiosk / DIY station, Psycare / DRK zelt
    'produktion.geojson::Artist büros',
    "produktion.geojson::Artistlager 10' container",
    'produktion.geojson::Cashflow',
    'produktion.geojson::Crew Bar - Kiosk',
    'produktion.geojson::Gastroleitung',
    'produktion.geojson::Internet',
    'produktion.geojson::Lager',
    'produktion.geojson::Logisticszentrale',
    'produktion.geojson::Produktion',
    'produktion.geojson::Rezi raum',
    'produktion.geojson::Rezi tresen',
    'produktion.geojson::Secu point',
    'produktion.geojson::Secu point ',
    'produktion.geojson::Sterne Office',
    'produktion.geojson::Supporta',
    'produktion.geojson::SupportA',
    'produktion.geojson::SupportA ',
    'produktion.geojson::Technik Lager',
    'produktion.geojson::Tent',
    'produktion.geojson::Tent ',
    'produktion.geojson::Weez',
    'produktion.geojson::Foodcourt tent',
    'produktion.geojson::Foodcourt tent 2',

    // sterne: back-of-house
    'sterne.geojson::Sterne Backstage',
    'sterne.geojson::Geländegestaltung Plaform',

    // toilets-showers: misclassifications (not actually toilets)
    'toilets-showers.geojson::Bar',
    'toilets-showers.geojson::Hot Unit',
    'toilets-showers.geojson::Kühlung',
]);

/**
 * Known typos in the source data. Applied to the `text` we ship.
 * Left-hand side = as-in-geojson; right-hand side = corrected display.
 * If Berit fixes the source, entries below become no-ops and can be
 * pruned in a follow-up.
 */
const TEXT_CORRECTIONS = {
    'ZIrkus Mond': 'Zirkus Mond',
    'SupportA':    'Supporta',       // (blocklisted anyway; kept for consistency)
};

// ─── Helpers ──────────────────────────────────────────────────────────

const round6 = (n) => Math.round(n * 1_000_000) / 1_000_000;

function centroid(geom) {
    const { type, coordinates } = geom;
    if (type === 'Point') return coordinates;
    if (type === 'MultiPoint') return coordinates[0];
    let ring;
    if      (type === 'Polygon')      ring = coordinates[0];
    else if (type === 'MultiPolygon') ring = coordinates[0][0];
    else if (type === 'LineString')   ring = coordinates;
    else return null;
    let sx = 0, sy = 0;
    for (const [x, y] of ring) { sx += x; sy += y; }
    return [sx / ring.length, sy / ring.length];
}

/**
 * Derive category + tags for an entry.
 *
 * For most files the category is fixed by CATEGORY_BY_FILE. Toilets-
 * showers is the exception: we split it into `toilet` and `shower`
 * subcategories so the synonym resolvers can pick the right subset.
 *
 * Tags are additive: an entry can have several so a single query hits
 * the same feature via multiple aliases (e.g. a bar is both `gastro`
 * and `bar`; a first-aid tent is both `produktion` and `firstAid`).
 */
function tagify(fileName, text) {
    const t = text.toLowerCase();
    if (fileName === 'toilets-showers.geojson') {
        if (/dusche|shower/.test(t)) return { category: 'shower', tags: ['shower'] };
        return { category: 'toilet', tags: ['toilet'] };
    }
    if (fileName === 'gastro.geojson') {
        if (/bar/.test(t))  return { category: 'gastro', tags: ['gastro', 'bar'] };
        return { category: 'gastro', tags: ['gastro', 'food'] };
    }
    if (fileName === 'produktion.geojson') {
        if (/drk|psycare/.test(t))            return { category: 'produktion', tags: ['produktion', 'firstAid'] };
        if (/info-?point|lost.*found/.test(t))return { category: 'produktion', tags: ['produktion', 'info'] };
        if (/awareness/.test(t))              return { category: 'produktion', tags: ['produktion', 'awareness'] };
        if (/einlass|check-?in/.test(t))      return { category: 'produktion', tags: ['produktion', 'entrance'] };
        if (/bänderkontrolle|wristband/.test(t))
                                              return { category: 'produktion', tags: ['produktion', 'wristband'] };
        return { category: 'produktion', tags: ['produktion'] };
    }
    if (fileName === 'sterne.geojson') {
        if (/müllstation|recycling/.test(t) && !/neo:trash/.test(t))
            return { category: 'sterne', tags: ['sterne', 'recycling'] };
        return { category: 'sterne', tags: ['sterne'] };
    }
    // stages / camps: single-tag.
    return { category: CATEGORY_BY_FILE[fileName], tags: [CATEGORY_BY_FILE[fileName]] };
}

function slugify(text) {
    // German umlauts / ss-ligature must expand to Latin digraphs BEFORE
    // the NFD-strip pass, or they collapse to bare vowels: ü → u, ß →
    // (nothing) → an empty slug segment. music.json already uses this
    // convention (e.g. `zirkus-mond-turmbuehnchen`), so the search
    // index must match to join cleanly with timetable events.
    return text
        .toLowerCase()
        .replace(/ß/g, 'ss')
        .replace(/ä/g, 'ae')
        .replace(/ö/g, 'oe')
        .replace(/ü/g, 'ue')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

// ─── Main ─────────────────────────────────────────────────────────────

function buildIndex() {
    const out = [];
    let dedup = new Map();  // id -> entry (last wins if collision)

    const files = readdirSync(DATA_DIR).filter(f => f.endsWith('.geojson')).sort();
    for (const fileName of files) {
        if (!(fileName in CATEGORY_BY_FILE)) continue;
        const geojson = JSON.parse(readFileSync(join(DATA_DIR, fileName), 'utf8'));

        for (const feat of geojson.features) {
            const rawText = (feat.properties?.text || '').trim();
            if (!rawText) continue;

            const blocklistKey = `${fileName}::${rawText}`;
            if (BLOCKLIST.has(blocklistKey)) continue;

            const text = TEXT_CORRECTIONS[rawText] ?? rawText;
            const c = centroid(feat.geometry);
            if (!c) continue;

            const { category, tags } = tagify(fileName, text);
            // Prefer an explicit `slug` property when the source geojson
            // has one — stages.geojson / sterne.geojson carry canonical
            // slugs authored to match music.json / programm-2026 event
            // stages, and those must survive verbatim so the search
            // index joins cleanly with the timetable. Fall back to
            // slugify(text) for features without one (produktion,
            // gastro, camping-areas, toilets-showers, landmarks).
            const slug = (typeof feat.properties?.slug === 'string' && feat.properties.slug)
                ? feat.properties.slug
                : slugify(text);
            const id = `${category}-${slug}`;

            const entry = {
                id,
                text,
                category,
                tags,
                coord: [round6(c[0]), round6(c[1])],
            };

            // Two features with identical text → keep both under
            // suffixed ids so the resolver can still pick the nearest
            // instance. E.g. "Müllstation Recycling" appears twice
            // in sterne.
            if (dedup.has(id)) {
                let n = 2;
                while (dedup.has(`${id}-${n}`)) n++;
                entry.id = `${id}-${n}`;
            }
            dedup.set(entry.id, entry);
            out.push(entry);
        }
    }

    return out;
}

const index = buildIndex();
writeFileSync(OUT_FILE, JSON.stringify(index, null, 0) + '\n');

const byCat = index.reduce((acc, e) => { acc[e.category] = (acc[e.category] || 0) + 1; return acc; }, {});
console.log(`✅ Wrote ${index.length} entries to data/map-search-index.json`);
console.log('   By category: ' + Object.entries(byCat).map(([k, v]) => `${k}=${v}`).join(', '));
