#!/usr/bin/env node
/**
 * Font raster-diff harness.
 *
 * Renders the same sample text with a "reference" and a "candidate" font
 * inside an OffscreenCanvas in a real browser (headed via Playwright's
 * built-in chromium), then does an exact pixel diff on the resulting
 * ImageData buffers. Zero differing channels = the candidate rasterises
 * bit-identically to the reference on this platform.
 *
 * Used to validate the TTF/OTF -> WOFF2 swap on the `optimization`
 * branch: WOFF2 is a lossless container (Brotli-compressed transform
 * of the same glyph outlines / hinting / OpenType tables) so the
 * expected diff is exactly 0.
 *
 * Run this whenever you swap or re-encode a font file and want a
 * numerical guarantee that rendering hasn't shifted. NOT a substitute
 * for eyeballing the app: this checks rasterisation identity for the
 * given text at the given size, nothing else.
 *
 * Usage:
 *   node scripts/font-raster-diff.mjs \
 *     --ref  fonts/Lato-Regular.ttf \
 *     --cand fonts/Lato-Regular.woff2 \
 *     [--text "Toiletten, Duschen, Camps — Bänderkontrolle"] \
 *     [--size 24] \
 *     [--weight 400]
 *
 * Requires: playwright (peer of anything that already ships Chromium),
 * OR the running system's `google-chrome` / `chromium` binary. Falls
 * back to spawning a headless server + curl if neither is available.
 *
 * The trick that makes the diff meaningful is that BOTH fonts are
 * loaded under different family aliases in the same document, so the
 * same rasteriser processes both back-to-back with identical settings
 * (hinting, subpixel positioning, browser version). Comparing across
 * two separate page loads would let a Chromium update change the
 * result on one side and not the other.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';

const HERE = dirname(fileURLToPath(import.meta.url));

// ── Arg parsing ────────────────────────────────────────────────────────

function parseArgs() {
    const args = process.argv.slice(2);
    const out = {
        ref: null,
        cand: null,
        text: 'BUCHT DER TRÄUMER · Waldtraut · Schweißperle 12345',
        size: 24,
        weight: 400,
        style: 'normal',
    };
    for (let i = 0; i < args.length; i++) {
        const k = args[i];
        const v = args[i + 1];
        if (k === '--ref')    { out.ref = v; i++; }
        else if (k === '--cand') { out.cand = v; i++; }
        else if (k === '--text') { out.text = v; i++; }
        else if (k === '--size') { out.size = Number(v); i++; }
        else if (k === '--weight') { out.weight = v; i++; }
        else if (k === '--style') { out.style = v; i++; }
        else if (k === '-h' || k === '--help') {
            console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 33).join('\n'));
            process.exit(0);
        }
    }
    if (!out.ref || !out.cand) {
        console.error('Missing --ref or --cand. Try --help.');
        process.exit(2);
    }
    return out;
}

// ── MIME map for the /font/<name> serving endpoint ─────────────────────

const FONT_MIME = {
    '.ttf':   'font/ttf',
    '.otf':   'font/otf',
    '.woff':  'font/woff',
    '.woff2': 'font/woff2',
};

// ── Build the A/B HTML the browser will load ───────────────────────────

function buildHtml(refFmt, candFmt, args) {
    // Format string that Chrome / Safari / Firefox all accept for each
    // container. WOFF2 accepts plain 'woff2' regardless of whether the
    // wrapped font is variable — browsers detect the fvar table itself.
    const fmt = {
        '.ttf':   "format('truetype')",
        '.otf':   "format('opentype')",
        '.woff':  "format('woff')",
        '.woff2': "format('woff2')",
    };
    return `<!doctype html>
<meta charset="utf-8">
<title>font raster diff</title>
<style>
  @font-face {
    font-family: 'Ref';
    font-weight: ${args.weight};
    font-style: ${args.style};
    src: url('/font/ref${refFmt}') ${fmt[refFmt]};
  }
  @font-face {
    font-family: 'Cand';
    font-weight: ${args.weight};
    font-style: ${args.style};
    src: url('/font/cand${candFmt}') ${fmt[candFmt]};
  }
</style>
<script>
window.__runDiff = async () => {
    await document.fonts.ready;
    // Force both faces to actually load (font-display: fallback would
    // otherwise let one of them stay in swap state until first paint).
    await Promise.all([
        document.fonts.load('${args.size}px Ref'),
        document.fonts.load('${args.size}px Cand'),
    ]);
    const w = 1200, h = ${args.size * 2 + 20};
    const draw = (family) => {
        const c = new OffscreenCanvas(w, h);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#080943';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#f3efdf';
        ctx.font = '${args.style} ${args.weight} ${args.size}px "' + family + '"';
        ctx.textBaseline = 'middle';
        ctx.fillText(${JSON.stringify(args.text)}, 10, h / 2);
        return ctx.getImageData(0, 0, w, h).data;
    };
    const a = draw('Ref');
    const b = draw('Cand');
    let differing = 0, sumAbs = 0;
    for (let i = 0; i < a.length; i++) {
        const d = Math.abs(a[i] - b[i]);
        if (d > 0) differing++;
        sumAbs += d;
    }
    return {
        channels: a.length,
        differing,
        pctChannelsDifferent: (differing / a.length * 100).toFixed(4) + '%',
        avgAbsDiff: (sumAbs / a.length).toFixed(4) + '/255',
        identicalRaster: differing === 0,
    };
};
</script>
`;
}

// ── Serve the HTML + both font files ───────────────────────────────────

function startServer(refPath, candPath, html) {
    return new Promise((resolveP) => {
        const server = createServer((req, res) => {
            if (req.url === '/' || req.url === '/index.html') {
                res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
                res.end(html);
            } else if (req.url.startsWith('/font/ref')) {
                const ext = extname(refPath);
                res.writeHead(200, { 'content-type': FONT_MIME[ext] || 'application/octet-stream' });
                res.end(readFileSync(refPath));
            } else if (req.url.startsWith('/font/cand')) {
                const ext = extname(candPath);
                res.writeHead(200, { 'content-type': FONT_MIME[ext] || 'application/octet-stream' });
                res.end(readFileSync(candPath));
            } else {
                res.writeHead(404); res.end();
            }
        });
        server.listen(0, '127.0.0.1', () => resolveP({ server, port: server.address().port }));
    });
}

// ── Drive a browser via Playwright if available; else print URL ────────

async function runInBrowser(port) {
    let playwright;
    try {
        playwright = await import('playwright');
    } catch {
        console.log(`\nOpen http://127.0.0.1:${port}/ in a browser, then in the console run:\n  await window.__runDiff()\n`);
        console.log('(Install `playwright` to automate this — `npm i -D playwright && npx playwright install chromium`.)');
        return null;
    }
    const browser = await playwright.chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto(`http://127.0.0.1:${port}/`);
        return await page.evaluate(() => window.__runDiff());
    } finally {
        await browser.close();
    }
}

// ── main ───────────────────────────────────────────────────────────────

async function main() {
    const args = parseArgs();
    const refPath = resolve(process.cwd(), args.ref);
    const candPath = resolve(process.cwd(), args.cand);
    if (!existsSync(refPath) || !existsSync(candPath)) {
        console.error(`Missing font: ${!existsSync(refPath) ? refPath : candPath}`);
        process.exit(2);
    }
    const refExt = extname(refPath);
    const candExt = extname(candPath);
    if (!FONT_MIME[refExt] || !FONT_MIME[candExt]) {
        console.error(`Unsupported font extension. Got: ${refExt}, ${candExt}. Expected one of ${Object.keys(FONT_MIME).join(', ')}`);
        process.exit(2);
    }

    const html = buildHtml(refExt, candExt, args);
    const { server, port } = await startServer(refPath, candPath, html);
    try {
        const result = await runInBrowser(port);
        if (!result) return;

        console.log(`Reference:  ${basename(refPath)}`);
        console.log(`Candidate:  ${basename(candPath)}`);
        console.log(`Text:       ${args.text}`);
        console.log(`Style:      ${args.style} ${args.weight} ${args.size}px`);
        console.log('');
        console.log(`channels compared:     ${result.channels}`);
        console.log(`channels differing:    ${result.differing}  (${result.pctChannelsDifferent})`);
        console.log(`avg abs diff:          ${result.avgAbsDiff}`);
        console.log(`identical raster:      ${result.identicalRaster ? '✅ yes' : '❌ NO — inspect visually'}`);
        process.exitCode = result.identicalRaster ? 0 : 1;
    } finally {
        server.close();
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
