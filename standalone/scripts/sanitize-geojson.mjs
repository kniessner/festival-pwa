#!/usr/bin/env node
/**
 * Geojson data-sanitation rules for the Bucht der Träumer map.
 *
 * Applies every "Jacob-said-so" cleanup rule to
 * standalone/data/*.geojson in one idempotent pass.
 *
 * Chained into scripts/build.js before the search-index generator,
 * so `npm run build` never ships an index against unsanitised data.
 * Also runnable standalone via `npm run sanitize:geojson` after a
 * fresh Felt re-import when you want to see the diff without a full
 * build.
 *
 * All rules mutate the geojson files in place; feature order is
 * preserved for what's kept so the on-disk diff stays minimal.
 *
 * Pipeline (order matters):
 *   0. Whitespace-trim `text`         — strips leading/trailing spaces
 *                                        from every feature's text
 *                                        BEFORE any exact-match rule
 *                                        looks at it. Trailing spaces
 *                                        are a common Felt-export
 *                                        artefact that would otherwise
 *                                        silently defeat rules 1–5.
 *   1. Exact-text renames             — apply first so downstream
 *                                        pattern-removals can match
 *                                        the renamed value if needed.
 *   2. Exact-text removals            — kill named features outright.
 *   3. Pattern-text removals          — kill any feature whose text
 *                                        matches a regex.
 *   4. Empty-text Point removals      — drop unlabeled dots.
 *   5. Toilet-file label normalisation— fold WC / DIXI / Urinal
 *                                        variants into a small vocab.
 *
 * Unlabeled *Polygon* features (no `text` property, or `properties:
 * {}`) are DELIBERATELY KEPT: the map layer's filter `['has', 'text']`
 * excludes them from the label layer, but the fill layer still paints
 * them as background. Used for staff plots / infra rectangles that
 * we want on the map without a name. If a future data pass should
 * drop these too, extend Rule 4 or add a Rule 4b for the Polygon
 * shape.
 *
 * NOT here (kept elsewhere on purpose):
 *   - Search-index blocklist. See BLOCKLIST in
 *     scripts/build-search-index.mjs — those entries stay ON THE MAP
 *     but are hidden from the search dropdown.
 *
 * Rule log (chronological, so future edits can trace intent back to
 * a chat message):
 *
 *   2026-08-08  Remove `booth` features (staff / DJ booths)
 *   2026-08-08  Remove `(?)` features (uncertain-position Felt marks)
 *   2026-08-08  Remove `Kühlung` features (internal cooling units)
 *   2026-08-08  Toilet-file label normalisation:
 *                 Urinal (exact)                 → Urinale
 *                 contains "missoir" / "pissoir" → KEEP as-is
 *                 WC / DIXI / ECO / Toilet / etc → WC
 *                 Dusche / Shower                → untouched
 *               (Original rule was "WC & Missoir" for the missoir
 *               case; superseded 2026-08-08 to "keep as-is".)
 *   2026-08-08  Typo: ZIrkus Mond → Zirkus Mond
 *   2026-08-08  Rename: WC 9 + 7 → Missoir
 *   2026-08-08  Rename: Toilet House → Dusche & WC
 *   2026-08-08  Rename: Artistlager 10' container → Artist Office
 *   2026-08-08  Remove: Technik Lager (feature + polygon)
 *   2026-08-08  Remove: FOH Seeblick (specific name only — the
 *               blanket /foh/i rule was proposed but held pending
 *               a Horst-consult on Skalahara FOH).
 *   2026-08-08  Rename: Skalahara FOH → Skalahara. Preserves the
 *               only Skalahara feature in the geojson; strips the
 *               staff-only FOH suffix.
 *   2026-11-XX  Spot-rename: the WC polygon between Atlantis and
 *               Stroboklo (first vertex ~14.484031,52.275528) is
 *               actually a Missoir. Renamed to 'Missoir' via the new
 *               coordinate-keyed SPOT_RENAMES table so only that one
 *               feature is touched, not the ~29 other WCs. Rule 5's
 *               MISSOIR_RX skip-list keeps the new label as-is.
 *   2026-11-XX  Remove: 'Hot Unit' (staff-only heated shower/wash
 *               trailer in toilets-showers, not guest-facing).
 *   2026-11-XX  Rename: Küche → Crew Catering. Guest-facing label for
 *               the crew kitchen polygon north of Strandflitzer.
 *               Same string for EN and DE — map labels aren't
 *               translated at runtime.
 *   2026-11-XX  Remove: any text matching /sp[üu]l+mobil/i (the
 *               dish-washing trailer, staff-only). Pattern tolerates
 *               the current 'Spüllmobil' double-l typo AND a future
 *               correctly-spelled 'Spülmobil' re-import.
 *   2026-11-XX  Remove: any text matching /skalahara/i. Supersedes
 *               the 2026-08-08 'Skalahara FOH → Skalahara' rename
 *               (dropped) and the earlier 'blanket /foh/i would kill
 *               Skalahara' caveat. Jacob's call: drop the feature
 *               entirely, the polygon south of Community Corner is
 *               not needed on the guest map.
 *   2026-08-08  Remove: any text containing "Foodcourt" (kills
 *               "Foodcourt tent" + "Foodcourt tent 2"; both were
 *               already blocklisted from search, this drops the
 *               polygons + labels from the map itself too).
 *   2026-08-08  Rename: Shower Container → Dusche (x3 in toilets-
 *               showers). Keeps the polygons, cleans the label.
 *   2026-08-08  Casing fixes:
 *                 bar               → Bar
 *                 Bar - Porto LOco  → Bar - Porto Loco
 *   2026-08-08  Rename: Re:set Raversnacks → Raversnacks (strip the
 *               brand prefix, keep the descriptive tail).
 *   2026-08-08  Remove: any text matching /geländegestaltung/i
 *               ("Geländegestaltung Plaform" today; future
 *               "Platform" spelling caught too).
 *   2026-08-08  Remove: "Backstage Bar" and "BdT Foodie" (staff-
 *               only bar / eatery, not guest-facing).
 *   2026-08-08  Seeblick consolidation:
 *                 Seeblick indoor → Seeblick
 *                 Seeblick Stage  → Seeblick
 *   2026-08-08  Remove unlabeled Point features ("round dots" from
 *               Felt exports that never got a text property).
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = join(__dirname, '..', 'data');

// ─── Rule 1: exact-text renames (applied FIRST) ───────────────────────
const RENAMES = {
    // Felt-export typographic glitch (pipe instead of space).
    'Neuro|divers':               'Neuro Divers',
    // Typos
    'ZIrkus Mond':                'Zirkus Mond',
    // Toilet-family relabels
    'WC 9 + 7':                   'Missoir',
    'Toilet House':               'Dusche & WC',
    // Produktion tidy-up
    "Artistlager 10' container":  'Artist Office',
    // Seeblick: one label for the whole floor family
    'Seeblick indoor':            'Seeblick',
    'Seeblick Stage':             'Seeblick',
    'Seeblick Stage ':            'Seeblick',   // trailing-space variant
    // Shower-family relabels
    'Shower Container':           'Dusche',
    // Casing fixes
    'bar':                        'Bar',
    // Bar - Porto Loco: shorten label to just "Bar". Two entries so
    // the pre-existing casing-typo variant ("LOco") also normalises
    // straight to the short form in one sanitize pass.
    'Bar - Porto LOco':           'Bar',
    'Bar - Porto Loco':           'Bar',
    // Same treatment for the beach bar next to the Strandflitzer
    // stage — users know it as "Bar", the disambiguation prefix is
    // Felt-only. Applied consistently to every "Bar" that is really
    // just the bar of a nearby stage (Waldtraut, Schlupfloch, Zirkus
    // Mond, Strandflitzer) so the map reads as multiple identical
    // "Bar" labels rather than a soup of stage-tagged variants.
    // Standalone bar brands with their own identity are left alone:
    // Bimsbar. (Haus of Flausch Teabar and PinkPuk Bar used to live
    // here too, but were migrated into sterne.geojson as Points
    // — renamed 'Flausch and chill' and kept as 'PinkPuk Bar' —
    // so they don't need a REMOVE / RENAMES entry either way.)
    'Strandflitzer Bar':          'Bar',
    'Waldtraut Bar':              'Bar',
    'Bar Schlupfloch':            'Bar',
    'Zirkus Mond Bar':            'Bar',
    // Trim redundant prefix
    'Re:set Raversnacks':         'Raversnacks',
    // Crew kitchen north of Strandflitzer — guest-facing label.
    // Single string covers both EN and DE (map labels are not
    // translated at runtime).
    'Küche':                      'Crew Catering',
    // Correct the previous round's typo. Current source files still
    // have some features with text "Urinate" from that rule run;
    // this line renames them to the proper German plural "Urinale".
    // Rule 5 (toilet norm) below also emits "Urinale" now, so future
    // Felt re-imports never need this entry — but it survives here
    // to keep the sanitiser idempotent against the current data.
    'Urinate':                    'Urinale',
};

// ─── Rule 2: exact-text removals ──────────────────────────────────────
const REMOVE_EXACT = new Set([
    'Technik Lager',
    // FOH-Seeblick is the sound-mixing position, staff-only.
    'FOH Seeblick',
    // Staff-only bar / eatery, not part of the guest map.
    'Backstage Bar',
    'BdT Foodie',
    // Not participating this year (Jacob 2026-08-10).
    "l'Amore Pizza",
    // Staff logistics container, not a guest gastro (Jacob 2026-08-10).
    'Gastroplan Raumcont.',
    // Weird composite label — the location is already covered by
    // the neighbouring "Dusche" and "WC" features (Jacob 2026-08-10).
    'Dusche WC',
    // The generic "Produktion" polygon sitting under "Rezi Tresen" —
    // staff production office, no guest use (Jacob 2026-08-10).
    // The whole area is already implied by the surrounding produktion
    // features (Supporta / SupportA / Info-point / etc.).
    'Produktion',
    // Communitea polygon sits INSIDE the (much larger) Cuddle Poodle
    // polygon. At the zoom levels where either label is visible the
    // two collide 8 m apart, and Jacob wants only the Cuddle Poodle
    // label to represent that whole area (2026-08-10). Removing the
    // Communitea feature entirely leaves the underlying Cuddle Poodle
    // fill visible in that space — which is what he means by "leave
    // only cuddle poodle".
    'Communitea',
    // Staff-only backstage area for the sterne installations — not
    // a guest destination (Jacob 2026-08-10).
    'Sterne Backstage',
    // Staff-only heated shower / wash trailer in toilets-showers.
    'Hot Unit',
]);

// ─── Rule 3: pattern removals ─────────────────────────────────────────
const REMOVE_PATTERNS = [
    { rx: /booth/i,               label: 'booth'                },
    { rx: /\?/,                   label: '(?)'                  },
    { rx: /^kühlung$/i,           label: 'kuehlung'             },
    { rx: /foodcourt/i,           label: 'foodcourt'            },
    // Skalahara: polygon south of Community Corner. Pattern (not
    // exact) so any future Felt re-import that brings back the
    // 'Skalahara FOH' variant is killed the same way.
    { rx: /skalahara/i,           label: 'skalahara'            },
    // Spüllmobil (sic — the current Felt export has a double-l).
    // Dish-washing trailer for gastro crew, not a guest feature.
    // Pattern also catches the correct 'Spülmobil' spelling if a
    // future re-import fixes the typo.
    { rx: /sp[üu]l+mobil/i,       label: 'spuellmobil'          },
    // Staff platform / landscape build-out. Pattern also catches
    // the source typo ("Plaform") and any future correctly-spelled
    // "Platform" variant without a config change.
    { rx: /geländegestaltung/i,   label: 'gelaendegestaltung'   },
];

// ─── Rule 1b: spot renames by first-vertex coordinate ───────────────
// Used when a single feature needs a different label than the ~29
// others that share its text (e.g. one specific 'WC' polygon that is
// really a Missoir). Keyed by (file, first-vertex [lng, lat]) with a
// small tolerance so tiny Felt-export jitter doesn't unhook the rule.
// Runs BEFORE Rule 5's toilet normalisation — renaming to 'Missoir'
// therefore survives, because MISSOIR_RX is in Rule 5's skip list.
const SPOT_RENAME_TOL = 0.00002;   // ~2 m at this latitude
const SPOT_RENAMES = {
    'toilets-showers.geojson': [
        {
            firstVertex: [14.484071, 52.275508],
            to: 'Missoir',
            why: 'WC between Atlantis and Stroboklo is actually a Missoir',
        },
        {
            firstVertex: [14.483272, 52.274016],
            to: 'Missoir',
            why: 'WC between Sektamt and Porto Loco is actually a Missoir',
        },
    ],
};

// ─── Rule 5: toilet-file label normalisation ──────────────────────────
const TOILET_FILE     = 'toilets-showers.geojson';
const SHOWER_RX       = /dusche|shower/i;
const URINAL_ONLY_RX  = /^urinale?$/i;   // matches "Urinal" AND
                                         // already-normalised "Urinale"
const MISSOIR_RX      = /missoir|pissoir/i;
const TOILET_ANY_RX   = /wc|dixi|urinal|toilet|eco/i;

// ─── Helpers ──────────────────────────────────────────────────────────

function textOf(feat) {
    return (feat?.properties?.text || '').trim();
}

// First vertex of a Polygon / MultiPolygon feature, the coordinate
// of a Point, or null for any other geometry (LineString,
// GeometryCollection, malformed).  Used by Rule 1b to key
// spot-renames off the shape of the feature, so we can retag one
// specific feature out of many that share the same text.
//
// Point support is important now that toilets-showers.geojson was
// migrated from tiny rectangles to Points (see optimize-geojson.mjs)
// — without it, every SPOT_RENAMES entry for that file would
// silently no-op on subsequent sanitize runs and only survive as
// on-disk state.
function firstVertex(geom) {
    if (!geom) return null;
    const c = geom.coordinates;
    if (geom.type === 'Point' && Array.isArray(c) && typeof c[0] === 'number') {
        return c;
    }
    if (geom.type === 'Polygon' && Array.isArray(c?.[0]?.[0])) {
        return c[0][0];
    }
    if (geom.type === 'MultiPolygon' && Array.isArray(c?.[0]?.[0]?.[0])) {
        return c[0][0][0];
    }
    return null;
}

function sanitiseFile(fileName) {
    const filePath = join(DATA_DIR, fileName);
    const d = JSON.parse(readFileSync(filePath, 'utf8'));
    const before = d.features.length;

    const removed = [];
    let renamedFromRules = 0;
    const kept = [];

    let trimmed = 0;

    for (const feat of d.features) {
        // Rule 0: normalise whitespace on text property before any
        // rule evaluates it. Trailing spaces are a common Felt-export
        // artefact ('Secu point ', 'Tent ', 'SupportA ', 'Momentarium '),
        // and they render on the map with a stray character-width of
        // padding on the right AND make every downstream exact-match
        // rule fail against the un-trimmed source. One-line kills the
        // whole class of glitch without needing per-value BLOCKLIST /
        // RENAMES entries that only differ by a space.
        if (typeof feat.properties?.text === 'string') {
            const original = feat.properties.text;
            const trimmedText = original.trim();
            if (trimmedText !== original) {
                feat.properties.text = trimmedText;
                trimmed++;
            }
        }

        // Rule 0b: strip any digits-containing tokens from the label
        // (Jacob's 2026-08-10 policy: "remove any number from the
        // labels"). Handles trailing counters like "Dusche 10" as
        // well as embedded ones like "3x3" would produce. Whitespace-
        // token boundary means an unlikely name like "H2O" would be
        // stripped entirely too — no such labels exist today; if one
        // appears the fix is to add a RENAMES entry above so the
        // rule sees the corrected text and this pass leaves it alone.
        // Fail-safe: never let the stripped label become empty
        // (would render as an unlabeled polygon and drop out of
        // search); if the entire label was numeric, keep the original.
        if (typeof feat.properties?.text === 'string') {
            const original = feat.properties.text;
            const stripped = original
                .replace(/\S*\d+\S*/g, '')
                .replace(/\s+/g, ' ')
                .trim();
            if (stripped && stripped !== original) {
                feat.properties.text = stripped;
            }
        }

        // Rule 1: exact-text rename first.
        const originalText = textOf(feat);
        if (originalText && RENAMES[originalText]) {
            feat.properties.text = RENAMES[originalText];
            renamedFromRules++;
        }

        // Rule 1b: spot rename by first-vertex coordinate. Match a
        // single feature by geometry so we can retag one 'WC' out
        // of ~29 without touching the others. `entry._matched` is set
        // on hit so the run's tail can loud-warn about entries that
        // silently no-op (e.g. after a Felt re-import that redraws
        // the polygon and drifts its first vertex out of tolerance).
        const spotEntries = SPOT_RENAMES[fileName];
        if (spotEntries) {
            const fv = firstVertex(feat.geometry);
            if (fv) {
                for (const entry of spotEntries) {
                    if (Math.abs(fv[0] - entry.firstVertex[0]) < SPOT_RENAME_TOL &&
                        Math.abs(fv[1] - entry.firstVertex[1]) < SPOT_RENAME_TOL) {
                        if (textOf(feat) !== entry.to) {
                            feat.properties.text = entry.to;
                            renamedFromRules++;
                        }
                        entry._matched = true;
                        break;
                    }
                }
            }
        }

        const t = textOf(feat);   // possibly renamed
        const slug = feat?.properties?.slug;

        // Rule 2: exact-text removal.
        // Slug-aware exemption: features that carry a slug are
        // "owned" by us (hand-authored in data/*.geojson) rather than
        // a raw Felt import.  Skip the exact-text kill for those so
        // authored polygons like `produktion-base` (label
        // "Produktion", intentionally guest-visible) are not eaten
        // by the same rule that was written to kill Felt's old
        // staff-only "Produktion" backstage blob.
        if (t && REMOVE_EXACT.has(t) && !slug) {
            removed.push(['exact:'+t, t]);
            continue;
        }

        // Rule 3: pattern removal.
        let patternKilled = false;
        for (const { rx, label } of REMOVE_PATTERNS) {
            if (t && rx.test(t)) {
                removed.push([label, t]);
                patternKilled = true;
                break;
            }
        }
        if (patternKilled) continue;

        // Rule 4: unlabeled Point removal.
        if (!t && feat.geometry?.type === 'Point') {
            removed.push(['unlabeled-point', '(no text)']);
            continue;
        }

        kept.push(feat);
    }

    // Rule 5: toilet-file label normalisation.
    let toiletRenamed = 0;
    if (fileName === TOILET_FILE) {
        for (const feat of kept) {
            const t = textOf(feat);
            if (!t) continue;
            if (SHOWER_RX.test(t))     continue;     // showers untouched
            if (MISSOIR_RX.test(t))    continue;     // missoir kept as-is
            let next = null;
            if (URINAL_ONLY_RX.test(t))     next = 'Urinale';
            else if (TOILET_ANY_RX.test(t)) next = 'WC';
            if (next && next !== t) {
                feat.properties.text = next;
                toiletRenamed++;
            }
        }
    }

    d.features = kept;
    writeFileSync(filePath, JSON.stringify(d, null, 0) + '\n');

    return {
        fileName,
        before,
        after: kept.length,
        removed,
        renamedFromRules,
        toiletRenamed,
        trimmed,
    };
}

// ─── Run ─────────────────────────────────────────────────────────────

const files = readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.geojson'))
    .filter(f => f !== 'map-search-index.json')
    .sort();

console.log('🧹 Sanitising geojsons in data/...\n');

let totalBefore = 0, totalAfter = 0, totalRemoved = 0, totalRenamed = 0, totalToiletRenamed = 0, totalTrimmed = 0;
for (const fileName of files) {
    const r = sanitiseFile(fileName);
    totalBefore  += r.before;
    totalAfter   += r.after;
    totalRemoved += r.removed.length;
    totalRenamed += r.renamedFromRules;
    totalToiletRenamed += r.toiletRenamed;
    totalTrimmed += r.trimmed;

    const summary = [`${r.before} → ${r.after}`];
    if (r.trimmed)           summary.push(`${r.trimmed} trimmed`);
    if (r.renamedFromRules)  summary.push(`${r.renamedFromRules} renamed`);
    if (r.toiletRenamed)     summary.push(`${r.toiletRenamed} toilet-labels normalised`);
    if (r.removed.length)    summary.push(`${r.removed.length} removed`);
    console.log(`  ${fileName}: ${summary.join(', ')}`);
    for (const [why, txt] of r.removed) console.log(`    - [${why}] ${txt}`);
}

console.log(`\n✅ Done. ${totalBefore} → ${totalAfter} across ${files.length} files (${totalRemoved} removed, ${totalRenamed} renamed, ${totalTrimmed} trimmed, ${totalToiletRenamed} toilet-labels normalised).`);

// Loud-warn about any SPOT_RENAMES entry that was declared but never
// matched a real feature. Silent no-op is the failure mode we care
// about here: if a Felt re-import redraws a polygon and its first
// vertex drifts more than SPOT_RENAME_TOL, the rename skips and the
// label silently reverts to whatever the source geojson said (e.g.
// the WC → Missoir spot-rename would flip back to "WC" and merge into
// the ~29 other WCs). Non-fatal — we still ship what we've got — but
// noisy so a re-import PR won't sail through review unnoticed.
let unmatched = 0;
for (const [fileName, entries] of Object.entries(SPOT_RENAMES)) {
    for (const entry of entries) {
        if (!entry._matched) {
            if (unmatched === 0) console.log('\n⚠️  SPOT_RENAMES entries that matched NO feature:');
            console.log(`   - ${fileName}  firstVertex=[${entry.firstVertex.join(', ')}]  → '${entry.to}'`);
            console.log(`     (${entry.why})`);
            unmatched++;
        }
    }
}
if (unmatched) {
    console.log(`   Likely cause: a Felt re-import moved the polygon's first vertex past SPOT_RENAME_TOL (${SPOT_RENAME_TOL}).`);
    console.log('   Fix: open the geojson, find the feature, update firstVertex in SPOT_RENAMES.');
}

console.log('   Next step: `npm run build:search-index` to refresh the index.');
