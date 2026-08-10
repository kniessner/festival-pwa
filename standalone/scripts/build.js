#!/usr/bin/env node
/*
 * Production build: bundles + minifies JS into one file, minifies CSS in
 * place, compresses images (if `sharp` is installed), and copies everything
 * else into dist/ as-is. Run with `npm run build`, or `node scripts/build.js
 * <target-dir>` to build somewhere other than dist/.
 *
 * The app itself stays build-less (index.html loads js/app.js as a plain ES
 * module, no bundler at runtime) — this only optimizes the dist/ copy that
 * gets deployed. scripts/deploy.sh calls this instead of copying files
 * itself, so dist/ (and whatever deploy.sh pushes to gh-pages) is always
 * this optimized output, never a stale unminified one.
 *
 * Bumps sw.js's CACHE_VERSION (and syncs index.html's ?v= params to match,
 * via bump-cache-version.sh) on the SOURCE files before copying/bundling
 * into dist/ — so every build ships under a version the device hasn't
 * already cached, without relying on that being done by hand first.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const esbuild = require('esbuild');

const ROOT_DIR = path.join(__dirname, '..');
const DIST_DIR = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT_DIR, 'dist');

let sharp = null;
try {
    sharp = require('sharp');
} catch {
    console.log('   ⚠️  sharp not installed — images will be copied as-is (run `npm install` to enable compression)');
}

function fmtSize(bytes) {
    return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

async function buildJs() {
    const entry = path.join(ROOT_DIR, 'js', 'app.js');
    const outfile = path.join(DIST_DIR, 'js', 'app.js');
    fs.mkdirSync(path.dirname(outfile), { recursive: true });

    const jsFiles = fs.readdirSync(path.join(ROOT_DIR, 'js'), { recursive: true })
        .filter(f => f.endsWith('.js'));
    const before = jsFiles.reduce((sum, f) => sum + fs.statSync(path.join(ROOT_DIR, 'js', f)).size, 0);

    await esbuild.build({
        entryPoints: [entry],
        bundle: true,
        minify: true,
        format: 'esm',
        target: 'es2020',
        outfile
    });

    const after = fs.statSync(outfile).size;
    console.log(`   ✅ js/*.js (${fmtSize(before)}, ${jsFiles.length} files) → js/app.js (${fmtSize(after)})`);
    return jsFiles;
}

function buildCss() {
    const cssDir = path.join(ROOT_DIR, 'css');
    const outDir = path.join(DIST_DIR, 'css');
    fs.mkdirSync(outDir, { recursive: true });

    let before = 0, after = 0;
    for (const file of fs.readdirSync(cssDir)) {
        if (!file.endsWith('.css')) continue;
        const src = path.join(cssDir, file);
        const contents = fs.readFileSync(src, 'utf8');
        before += Buffer.byteLength(contents);
        const result = esbuild.transformSync(contents, { loader: 'css', minify: true });
        after += Buffer.byteLength(result.code);
        fs.writeFileSync(path.join(outDir, file), result.code);
    }
    console.log(`   ✅ css/*.css (${fmtSize(before)} → ${fmtSize(after)})`);
}

function copyDir(srcDir, destDir) {
    fs.mkdirSync(destDir, { recursive: true });
    let count = 0;
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
        const srcPath = path.join(srcDir, entry.name);
        const destPath = path.join(destDir, entry.name);
        if (entry.isDirectory()) count += copyDir(srcPath, destPath);
        else {
            fs.copyFileSync(srcPath, destPath);
            count++;
        }
    }
    return count;
}

function minifyJsonFile(src, dest) {
    const data = JSON.parse(fs.readFileSync(src, 'utf8'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, JSON.stringify(data));
}

function copyJsonDir(srcDir, destDir) {
    fs.mkdirSync(destDir, { recursive: true });
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
        const srcPath = path.join(srcDir, entry.name);
        const destPath = path.join(destDir, entry.name);
        if (entry.isDirectory()) copyJsonDir(srcPath, destPath);
        else if (entry.name.endsWith('.json')) minifyJsonFile(srcPath, destPath);
        else fs.copyFileSync(srcPath, destPath);
    }
}

async function copyImages(srcDir, destDir) {
    fs.mkdirSync(destDir, { recursive: true });
    let before = 0, after = 0, optimized = 0, copied = 0;

    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
        const srcPath = path.join(srcDir, entry.name);
        const destPath = path.join(destDir, entry.name);

        if (entry.isDirectory()) {
            const nested = await copyImages(srcPath, destPath);
            before += nested.before; after += nested.after;
            optimized += nested.optimized; copied += nested.copied;
            continue;
        }

        const ext = path.extname(entry.name).toLowerCase();
        const size = fs.statSync(srcPath).size;
        before += size;

        if (sharp && (ext === '.png' || ext === '.jpg' || ext === '.jpeg')) {
            const image = sharp(srcPath);
            if (ext === '.png') await image.png({ quality: 82, compressionLevel: 9 }).toFile(destPath);
            else await image.jpeg({ quality: 82, mozjpeg: true }).toFile(destPath);
            after += fs.statSync(destPath).size;
            optimized++;
        } else {
            fs.copyFileSync(srcPath, destPath);
            after += size;
            copied++;
        }
    }
    return { before, after, optimized, copied };
}

function buildServiceWorker(jsFiles) {
    const src = fs.readFileSync(path.join(ROOT_DIR, 'sw.js'), 'utf8');
    const match = src.match(/const SHELL_ASSETS = \[([\s\S]*?)\];/);
    if (!match) {
        console.log('   ⚠️  Could not find SHELL_ASSETS in sw.js — copying it unmodified');
        fs.copyFileSync(path.join(ROOT_DIR, 'sw.js'), path.join(DIST_DIR, 'sw.js'));
        return;
    }

    // Strip block + line comments from the array body BEFORE extracting
    // quoted strings. Comments in the source may contain apostrophes
    // (e.g. "the map's label typography") that would otherwise fool
    // the `'([^']+)'` regex into capturing everything from the
    // apostrophe until the next single quote as a fake asset path,
    // corrupting the whole precache list from that point on.
    const stripped = match[1]
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
    const assets = [...stripped.matchAll(/'([^']+)'/g)].map(m => m[1]);

    // Every real js/*.js file must be precached (see sw.js's own MAINTENANCE
    // comment) or an installed-then-offline user hits a broken app the first
    // time an uncached module is requested — catch a forgotten entry here
    // instead of shipping it silently.
    const missingJs = jsFiles
        .map(f => './js/' + f.split(path.sep).join('/'))
        .filter(rel => !assets.includes(rel));
    if (missingJs.length) {
        throw new Error(`sw.js SHELL_ASSETS is missing: ${missingJs.join(', ')}`);
    }

    // Same guard, extended to image references baked into the bundled
    // JS. Round-3 review caught poi-generic.svg silently missing from
    // SHELL_ASSETS — the file was copied into dist/images/ so online
    // users saw the icon, but installed-then-offline PWAs showed a
    // broken image. The class of bug repeats for any new static asset
    // referenced from client code, so we scan the bundled app.js and
    // fail the build on anything not in SHELL_ASSETS.
    const bundledJs = fs.readFileSync(path.join(DIST_DIR, 'js', 'app.js'), 'utf8');
    const IMAGE_REF_RX = /['"`](?:\.\/)?(images\/[a-zA-Z0-9._-]+\.(?:svg|png|jpg|jpeg|webp|gif))['"`]/g;
    const referencedImages = new Set();
    for (const m of bundledJs.matchAll(IMAGE_REF_RX)) referencedImages.add('./' + m[1]);
    const missingImgs = [...referencedImages].filter(rel => !assets.includes(rel));
    if (missingImgs.length) {
        throw new Error(
            `sw.js SHELL_ASSETS is missing image references from bundled JS: `
            + missingImgs.join(', ')
        );
    }

    // JS files are bundled into one, so every individual ./js/... entry
    // collapses down to just the bundle itself.
    const rewritten = assets.filter(a => !a.startsWith('./js/') || a === './js/app.js');
    const rewrittenBlock = `const SHELL_ASSETS = [\n${rewritten.map(a => `    '${a}'`).join(',\n')}\n];`;
    const out = src.replace(match[0], rewrittenBlock);

    fs.writeFileSync(path.join(DIST_DIR, 'sw.js'), out);
    console.log(`   ✅ sw.js (SHELL_ASSETS: ${assets.length} → ${rewritten.length} entries)`);
}

async function build() {
    console.log('📦 Festival PWA Standalone — Build');
    console.log(`   Source: ${ROOT_DIR}`);
    console.log(`   Target: ${DIST_DIR}`);
    console.log('');

    const newVersion = execFileSync(path.join(ROOT_DIR, 'scripts', 'bump-cache-version.sh'), { encoding: 'utf8' }).trim();
    console.log(`   🔁 Cache version bumped to ${newVersion}`);

    // Run the geojson sanitiser BEFORE the search-index generator so
    // any rule-based rename/removal is applied to source before we
    // index it. The sanitiser is idempotent — a stable working tree
    // gives a no-op diff. Round-3 review flagged the missing chain:
    // without it, a fresh Felt re-import followed by `npm run build`
    // would ship a correct index against unsanitized labels.
    execFileSync(process.execPath, [path.join(ROOT_DIR, 'scripts', 'sanitize-geojson.mjs')], { stdio: 'inherit' });

    // Rebuild the map search index from the (now-sanitised) geojsons.
    // Kept in-tree (data/map-search-index.json) so dev servers work
    // without an explicit build, and re-generated here so we can never
    // ship a stale index. Cheap (< 100 ms for 100-ish features).
    execFileSync(process.execPath, [path.join(ROOT_DIR, 'scripts', 'build-search-index.mjs')], { stdio: 'inherit' });

    fs.rmSync(DIST_DIR, { recursive: true, force: true });
    fs.mkdirSync(DIST_DIR, { recursive: true });

    fs.copyFileSync(path.join(ROOT_DIR, 'index.html'), path.join(DIST_DIR, 'index.html'));
    minifyJsonFile(path.join(ROOT_DIR, 'manifest.json'), path.join(DIST_DIR, 'manifest.json'));
    console.log('   ✅ index.html, manifest.json');

    const jsFiles = await buildJs();
    buildCss();
    buildServiceWorker(jsFiles);

    const fontCount = copyDir(path.join(ROOT_DIR, 'fonts'), path.join(DIST_DIR, 'fonts'));
    console.log(`   ✅ fonts/* (${fontCount} files, copied as-is)`);

    if (fs.existsSync(path.join(ROOT_DIR, 'vendor'))) {
        const vendorCount = copyDir(path.join(ROOT_DIR, 'vendor'), path.join(DIST_DIR, 'vendor'));
        console.log(`   ✅ vendor/* (${vendorCount} files, copied as-is)`);
    }

    if (fs.existsSync(path.join(ROOT_DIR, 'glyphs'))) {
        const glyphCount = copyDir(path.join(ROOT_DIR, 'glyphs'), path.join(DIST_DIR, 'glyphs'));
        console.log(`   ✅ glyphs/* (${glyphCount} files, copied as-is)`);
    }

    copyJsonDir(path.join(ROOT_DIR, 'data'), path.join(DIST_DIR, 'data'));
    console.log('   ✅ data/**/*.json (minified)');

    const iconStats = await copyImages(path.join(ROOT_DIR, 'icons'), path.join(DIST_DIR, 'icons'));
    const imgStats = await copyImages(path.join(ROOT_DIR, 'images'), path.join(DIST_DIR, 'images'));
    const combined = {
        before: iconStats.before + imgStats.before,
        after: iconStats.after + imgStats.after,
        optimized: iconStats.optimized + imgStats.optimized,
        copied: iconStats.copied + imgStats.copied
    };
    const imgLine = sharp
        ? `${fmtSize(combined.before)} → ${fmtSize(combined.after)}, ${combined.optimized} compressed`
        : `${fmtSize(combined.before)}, copied as-is`;
    console.log(`   ✅ icons/, images/ (${imgLine}${combined.copied && sharp ? `, ${combined.copied} unsupported type copied as-is` : ''})`);

    const date = new Date().toISOString();
    fs.writeFileSync(path.join(DIST_DIR, 'BUILD.txt'), `Built: ${date}\n`);

    console.log('');
    console.log(`✅ Build complete — ${path.relative(ROOT_DIR, DIST_DIR) || '.'}/ is ready.`);
}

build().catch(err => {
    console.error('❌ Build failed:', err);
    process.exit(1);
});
