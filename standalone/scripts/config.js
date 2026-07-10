#!/usr/bin/env node
/**
 * Festival PWA Standalone — Configuration Tool
 * Usage: node scripts/config.js
 * Interactively sets app name, pages, theme, and festival date.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

const ROOT = path.resolve(__dirname, '..');

function readJson(p) {
    return JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf-8'));
}
function writeJson(p, data) {
    fs.writeFileSync(path.join(ROOT, p), JSON.stringify(data, null, 2) + '\n');
}
function readFile(p) {
    return fs.readFileSync(path.join(ROOT, p), 'utf-8');
}
function writeFile(p, content) {
    fs.writeFileSync(path.join(ROOT, p), content);
}

async function main() {
    console.log('🎪 Festival PWA — Standalone Configurator\n');

    // ── 1. App Name ──
    const manifest = readJson('data/_manifest.json');
    const currentName = manifest.app_name || 'Bucht der Träumer*';
    const name = await ask(`App name [${currentName}]: `);
    if (name.trim()) manifest.app_name = name.trim();

    // ── 2. Festival Date (for countdown) ──
    const today = new Date();
    const defaultYear = today.getFullYear();
    const yearStr = await ask(`Festival year [${defaultYear}]: `);
    const year = yearStr.trim() ? parseInt(yearStr) : defaultYear;
    const monthStr = await ask(`Festival month (1-12) [8]: `);
    const month = monthStr.trim() ? parseInt(monthStr) : 8;
    const dayStr = await ask(`Festival day (1-31) [15]: `);
    const day = dayStr.trim() ? parseInt(dayStr) : 15;
    const festivalDate = new Date(year, month - 1, day);
    const daysUntil = Math.ceil((festivalDate - today) / (1000 * 60 * 60 * 24));
    console.log(`   → Festival in ${daysUntil} days\n`);

    // ── 3. Pages ──
    console.log('📄 Current pages:');
    manifest.pages.forEach((p, i) => {
        console.log(`   ${i + 1}. ${p.icon} ${p.label} (${p.slug})`);
    });
    console.log('');

    const editPages = await ask('Edit pages? [y/N]: ');
    if (editPages.toLowerCase().startsWith('y')) {
        const newPages = [];
        // Always keep home
        const homePage = manifest.pages.find(p => p.slug === 'home') || { slug: 'home', label: 'Home', icon: '🏠' };
        newPages.push(homePage);

        // Favorites page
        const favPage = manifest.pages.find(p => p.slug === 'favorites') || { slug: 'favorites', label: 'Mein Plan', icon: '⭐' };
        newPages.push(favPage);

        while (true) {
            const slug = await ask('   Page slug (or empty to finish): ');
            if (!slug.trim()) break;
            const label = await ask(`   Label for "${slug.trim()}": `);
            const icon = await ask(`   Emoji icon: `);
            newPages.push({ slug: slug.trim(), label: label.trim() || slug.trim(), icon: icon.trim() || '📄' });
        }
        manifest.pages = newPages;
    }

    // ── 4. Theme Colors ──
    const editTheme = await ask('Edit theme colors? [y/N]: ');
    if (editTheme.toLowerCase().startsWith('y')) {
        let html = readFile('index.html');

        const currentBg = html.match(/--bg:\s*([^;]+)/)?.[1]?.trim() || '#080943';
        const bg = await ask(`Background color [${currentBg}]: `);
        if (bg.trim()) html = html.replace(/--bg:\s*[^;]+/, `--bg: ${bg.trim()}`);

        const currentPink = html.match(/--accent-pink:\s*([^;]+)/)?.[1]?.trim() || '#b0327a';
        const pink = await ask(`Accent pink [${currentPink}]: `);
        if (pink.trim()) html = html.replace(/--accent-pink:\s*[^;]+/, `--accent-pink: ${pink.trim()}`);

        const currentOrange = html.match(/--accent-orange:\s*([^;]+)/)?.[1]?.trim() || '#ff6f21';
        const orange = await ask(`Accent orange [${currentOrange}]: `);
        if (orange.trim()) html = html.replace(/--accent-orange:\s*[^;]+/, `--accent-orange: ${orange.trim()}`);

        writeFile('index.html', html);
        console.log('   ✅ Theme colors updated\n');
    }

    // ── 5. Write manifest ──
    manifest.synced_at = Math.floor(Date.now() / 1000);
    writeJson('data/_manifest.json', manifest);

    // ── 6. Update index.html title ──
    let html = readFile('index.html');
    html = html.replace(/<title>.*?<\/title>/, `<title>${manifest.app_name} – Festival Guide</title>`);
    // Update countdown
    html = html.replace(/<div class="countdown">\d+<\/div>/, `<div class="countdown">${daysUntil}</div>`);
    writeFile('index.html', html);

    // ── 7. Update manifest.json ──
    const pwaManifest = readJson('manifest.json');
    pwaManifest.name = `${manifest.app_name} – Festival Guide (Standalone)`;
    pwaManifest.short_name = manifest.app_name;
    writeJson('manifest.json', pwaManifest);

    // ── 8. Update SW cache name to bust cache ──
    let sw = readFile('sw.js');
    const newCacheName = `bucht-standalone-v${Date.now()}`;
    sw = sw.replace(/const CACHE_NAME = '[^']+'/, `const CACHE_NAME = '${newCacheName}'`);
    writeFile('sw.js', sw);

    console.log('\n✅ Configuration saved!');
    console.log(`   App:      ${manifest.app_name}`);
    console.log(`   Pages:    ${manifest.pages.length}`);
    console.log(`   Festival: ${festivalDate.toLocaleDateString('de-DE')}`);
    console.log(`   Cache:    ${newCacheName}`);
    console.log('\n   Next: run ./scripts/start.sh to test');
    console.log('        run ./scripts/update.sh to refresh content\n');

    rl.close();
}

main().catch(e => { console.error(e); process.exit(1); });
