#!/usr/bin/env node
/**
 * Geojson data-sanitation rules for the Bucht der Träumer map.
 *
 * Applies every "Jacob-said-so" cleanup rule to
 * standalone/data/*.geojson in one idempotent pass. Rerun this
 * whenever Berit re-exports the Felt layers, before regenerating
 * the search index.
 *
 * All rules mutate the geojson files in place; feature order is
 * preserved for what's kept so the on-disk diff stays minimal.
 *
 * Pipeline (order matters):
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
 *                 Urinal (exact)                 → Urinate
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
 *   2026-08-08  Remove: any text containing "Foodcourt" (kills
 *               "Foodcourt tent" + "Foodcourt tent 2"; both were
 *               already blocklisted from search, this drops the
 *               polygons + labels from the map itself too).
 *   2026-08-08  Rename: Shower Container → Dusche (x3 in toilets-
 *               showers). Keeps the polygons, cleans the label.
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
    // Strip FOH suffixes so the venue name stays, the tech tag goes.
    // Blanket /foh/i removal was avoided because it would kill the
    // only Skalahara feature in the geojson entirely (Jacob's call
    // 2026-08-08 after checking with Horst).
    'Skalahara FOH':              'Skalahara',
    // Shower-family relabels
    'Shower Container':           'Dusche',
};

// ─── Rule 2: exact-text removals ──────────────────────────────────────
const REMOVE_EXACT = new Set([
    'Technik Lager',
    // FOH-Seeblick is the sound-mixing position, staff-only. Killed
    // by name so we don't need a blanket /foh/i rule that would also
    // hit "Skalahara FOH" — Jacob is asking Horst whether that one
    // stays or goes.
    'FOH Seeblick',
    // Staff-only bar / eatery, not part of the guest map.
    'Backstage Bar',
    'BdT Foodie',
]);

// ─── Rule 3: pattern removals ─────────────────────────────────────────
const REMOVE_PATTERNS = [
    { rx: /booth/i,               label: 'booth'                },
    { rx: /\?/,                   label: '(?)'                  },
    { rx: /^kühlung$/i,           label: 'kuehlung'             },
    { rx: /foodcourt/i,           label: 'foodcourt'            },
    // Staff platform / landscape build-out. Pattern also catches
    // the source typo ("Plaform") and any future correctly-spelled
    // "Platform" variant without a config change.
    { rx: /geländegestaltung/i,   label: 'gelaendegestaltung'   },
];

// ─── Rule 5: toilet-file label normalisation ──────────────────────────
const TOILET_FILE     = 'toilets-showers.geojson';
const SHOWER_RX       = /dusche|shower/i;
const URINAL_ONLY_RX  = /^urinal$/i;
const MISSOIR_RX      = /missoir|pissoir/i;
const TOILET_ANY_RX   = /wc|dixi|urinal|toilet|eco/i;

// ─── Helpers ──────────────────────────────────────────────────────────

function textOf(feat) {
    return (feat?.properties?.text || '').trim();
}

function sanitiseFile(fileName) {
    const filePath = join(DATA_DIR, fileName);
    const d = JSON.parse(readFileSync(filePath, 'utf8'));
    const before = d.features.length;

    const removed = [];
    let renamedFromRules = 0;
    const kept = [];

    for (const feat of d.features) {
        // Rule 1: exact-text rename first.
        const originalText = textOf(feat);
        if (originalText && RENAMES[originalText]) {
            feat.properties.text = RENAMES[originalText];
            renamedFromRules++;
        }

        const t = textOf(feat);   // possibly renamed

        // Rule 2: exact-text removal.
        if (t && REMOVE_EXACT.has(t)) {
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
            if (URINAL_ONLY_RX.test(t))     next = 'Urinate';
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
    };
}

// ─── Run ─────────────────────────────────────────────────────────────

const files = readdirSync(DATA_DIR)
    .filter(f => f.endsWith('.geojson'))
    .filter(f => f !== 'map-search-index.json')
    .sort();

console.log('🧹 Sanitising geojsons in data/...\n');

let totalBefore = 0, totalAfter = 0, totalRemoved = 0, totalRenamed = 0, totalToiletRenamed = 0;
for (const fileName of files) {
    const r = sanitiseFile(fileName);
    totalBefore  += r.before;
    totalAfter   += r.after;
    totalRemoved += r.removed.length;
    totalRenamed += r.renamedFromRules;
    totalToiletRenamed += r.toiletRenamed;

    const summary = [`${r.before} → ${r.after}`];
    if (r.renamedFromRules)  summary.push(`${r.renamedFromRules} renamed`);
    if (r.toiletRenamed)     summary.push(`${r.toiletRenamed} toilet-labels normalised`);
    if (r.removed.length)    summary.push(`${r.removed.length} removed`);
    console.log(`  ${fileName}: ${summary.join(', ')}`);
    for (const [why, txt] of r.removed) console.log(`    - [${why}] ${txt}`);
}

console.log(`\n✅ Done. ${totalBefore} → ${totalAfter} across ${files.length} files (${totalRemoved} removed, ${totalRenamed} renamed, ${totalToiletRenamed} toilet-labels normalised).`);
console.log('   Next step: `npm run build:search-index` to refresh the index.');
