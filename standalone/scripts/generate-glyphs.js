#!/usr/bin/env node
/*
 * Generate SDF glyph tiles (.pbf, MapLibre's format) from the OTF/TTF
 * font files in fonts/ so the interactive Festival Map can render its
 * labels in the actual festival typeface (Megan Display) offline.
 *
 * Output layout matches MapLibre's convention:
 *   glyphs/<fontstack>/<start>-<end>.pbf
 * where <fontstack> is the URL-decoded font family + style name used in
 * the style's `text-font` array. See js/views/map.js for the mapping.
 *
 * Range choice: we only ship U+0000..U+0255 (Basic Latin + Latin-1
 * Supplement). That covers every character in the festival's German +
 * English labels (Ä, Ö, Ü, ß, Ł and friends). Skipping the other 255
 * ranges keeps the SW shell an order of magnitude smaller than a
 * blanket "generate every range" pass.
 *
 * Regenerate manually: `node scripts/generate-glyphs.js`
 * The output is committed so a fresh clone of the repo can serve it
 * without needing fontnik's native binary at hand.
 */

const fs = require('fs');
const path = require('path');
const fontnik = require('fontnik');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'glyphs');

// Font file → fontstack name used by MapLibre's text-font.
const FONTS = [
    { file: 'fonts/Megan-Display.otf', stack: 'Megan Display' },
    { file: 'fonts/Lato-Regular.ttf', stack: 'Lato Regular' },
    { file: 'fonts/Lato-Bold.ttf', stack: 'Lato Bold' },
    { file: 'fonts/InstrumentSans-Italic-Variable.ttf', stack: 'Instrument Sans Italic' },
    { file: 'fonts/InstrumentSans-Variable.ttf', stack: 'Instrument Sans' },
];

// Unicode ranges we ship. Latin-1 covers everything the labels need.
const RANGES = [[0, 255], [256, 511]];

function generate({ file, stack }) {
    const buf = fs.readFileSync(path.join(ROOT, file));
    const dir = path.join(OUT_DIR, stack);
    fs.mkdirSync(dir, { recursive: true });
    return Promise.all(RANGES.map(([start, end]) => new Promise((resolve, reject) => {
        fontnik.range({ font: buf, start, end }, (err, res) => {
            if (err) return reject(err);
            const outFile = path.join(dir, `${start}-${end}.pbf`);
            fs.writeFileSync(outFile, res);
            console.log(`  ${stack}/${start}-${end}.pbf  ${res.length} B`);
            resolve();
        });
    })));
}

async function main() {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    for (const f of FONTS) {
        console.log(`— ${f.file} → ${f.stack}`);
        await generate(f);
    }
    console.log(`\n✅ ${FONTS.length} fontstacks × ${RANGES.length} ranges → ${OUT_DIR}`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
