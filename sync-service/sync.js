import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, 'config.json');

async function loadConfig() {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
}

async function fetchPage(url, timeout) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'FestivalPWA-Sync/1.0' }
        });
        clearTimeout(t);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
    } catch (err) {
        clearTimeout(t);
        throw err;
    }
}

function absolutizeUrl(url, baseUrl) {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith('//')) return 'https:' + url;
    if (/^(data:|mailto:|tel:|#|javascript:)/i.test(url)) return url;
    const base = new URL(baseUrl);
    if (url.startsWith('/')) return `${base.origin}${url}`;
    return `${base.origin}/${url}`;
}

function extractRaw(html, baseUrl, label) {
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    let main = doc.querySelector('main') ||
               doc.querySelector('article') ||
               doc.querySelector('.entry-content') ||
               doc.querySelector('.post-content') ||
               doc.querySelector('.site-content') ||
               doc.body;

    if (!main) return null;

    // Strip scripts/event handlers for safety.
    main.querySelectorAll('script').forEach(s => s.remove());
    main.querySelectorAll('[onclick], [onload], [onerror]').forEach(el => {
        el.removeAttribute('onclick');
        el.removeAttribute('onload');
        el.removeAttribute('onerror');
    });

    // Absolutize URLs in src/href/srcset/url(...).
    main.querySelectorAll('[href], [src], [srcset]').forEach(el => {
        if (el.href) el.href = absolutizeUrl(el.getAttribute('href'), baseUrl);
        if (el.src) el.src = absolutizeUrl(el.getAttribute('src'), baseUrl);
        if (el.srcset) {
            el.srcset = el.srcset.split(',').map(part => {
                const [url, desc] = part.trim().split(/\s+/);
                return `${absolutizeUrl(url, baseUrl)}${desc ? ' ' + desc : ''}`;
            }).join(', ');
        }
    });

    const styles = [];
    doc.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
        const href = link.getAttribute('href');
        if (href) styles.push({ type: 'link', href: absolutizeUrl(href, baseUrl) });
    });

    const title = doc.title?.replace(/\s*[-–|]\s*Bucht der Träumer\*?/i, '').trim() || label;

    return {
        type: 'raw',
        slug: null, // set by caller
        title,
        html: main.innerHTML,
        styles,
        base_url: baseUrl
    };
}

function extractSnapshot(html, baseUrl, label) {
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    // Strip scripts and event handlers.
    doc.querySelectorAll('script').forEach(s => s.remove());
    doc.querySelectorAll('[onclick], [onload], [onerror], [onmouseover]').forEach(el => {
        ['onclick', 'onload', 'onerror', 'onmouseover'].forEach(a => el.removeAttribute(a));
    });

    // Inline stylesheets.
    const inlineCss = [];
    doc.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
        // For the external service we keep link references rather than inlining,
        // because we cannot reach the WP cache dir. The PWA SW will cache cross-origin
        // CSS separately.
        const href = link.getAttribute('href');
        if (href) link.setAttribute('href', absolutizeUrl(href, baseUrl));
    });

    // Absolutize remaining asset URLs.
    doc.querySelectorAll('[href], [src], [srcset], [style]').forEach(el => {
        if (el.hasAttribute('href')) el.setAttribute('href', absolutizeUrl(el.getAttribute('href'), baseUrl));
        if (el.hasAttribute('src')) el.setAttribute('src', absolutizeUrl(el.getAttribute('src'), baseUrl));
        if (el.hasAttribute('srcset')) {
            el.setAttribute('srcset', el.getAttribute('srcset').split(',').map(part => {
                const [url, desc] = part.trim().split(/\s+/);
                return `${absolutizeUrl(url, baseUrl)}${desc ? ' ' + desc : ''}`;
            }).join(', '));
        }
        if (el.hasAttribute('style')) {
            el.setAttribute('style', el.getAttribute('style').replace(/url\(["']?([^"')]+)["']?\)/gi, (m, url) => {
                return `url("${absolutizeUrl(url, baseUrl)}")`;
            }));
        }
    });

    const title = doc.title?.replace(/\s*[-–|]\s*Bucht der Träumer\*?/i, '').trim() || label;

    // Build a fragment from the main content area.
    const main = doc.querySelector('main') ||
                 doc.querySelector('article') ||
                 doc.querySelector('.entry-content') ||
                 doc.body;

    const snapshotHtml = doc.documentElement.outerHTML;
    const fragmentHtml = main ? main.outerHTML : snapshotHtml;

    return {
        type: 'snapshot',
        slug: null,
        title,
        snapshot_html: snapshotHtml,
        fragment_html: fragmentHtml,
        base_url: baseUrl
    };
}

async function extractPage(page, config) {
    const baseUrl = config.wpBaseUrl;
    let url;
    if (page.sourceType === 'source') {
        url = `${baseUrl}/${page.sourceValue || page.slug}`;
    } else if (page.sourceType === 'remote') {
        url = page.sourceValue;
    } else {
        throw new Error(`sourceType "${page.sourceType}" not supported by external sync service`);
    }

    const html = await fetchPage(url, config.requestTimeout || 30000);

    let data;
    if (page.mode === 'snapshot') {
        data = extractSnapshot(html, baseUrl, page.label);
    } else {
        data = extractRaw(html, baseUrl, page.label);
    }
    if (!data) throw new Error('Extraction produced no content');
    data.slug = page.slug;
    return data;
}

async function runSync(config) {
    const results = [];
    for (const page of config.pages) {
        try {
            const data = await extractPage(page, config);
            results.push({ slug: page.slug, status: 'ok', data });
        } catch (err) {
            console.error(`[sync] failed ${page.slug}: ${err.message}`);
            results.push({ slug: page.slug, status: 'error', message: err.message });
        }
    }

    const payload = {
        secret: config.syncSecret,
        synced_at: Math.floor(Date.now() / 1000),
        app_name: config.appName,
        start_page: config.startPage,
        pages: config.pages.map(p => ({ slug: p.slug, label: p.label, icon: p.icon })),
        results
    };

    const res = await fetch(config.syncEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Sync endpoint returned ${res.status}: ${body}`);
    }

    const response = await res.json();
    console.log('[sync] server response:', JSON.stringify(response, null, 2));
    return response;
}

async function main() {
    const config = await loadConfig();
    const once = process.argv.includes('--once');

    async function tick() {
        try {
            await runSync(config);
        } catch (err) {
            console.error('[sync] tick failed:', err.message);
        }
    }

    await tick();
    if (once) return;

    const ms = (config.scheduleMinutes || 15) * 60 * 1000;
    console.log(`[sync] scheduling every ${config.scheduleMinutes || 15} minutes`);
    setInterval(tick, ms);
}

main().catch(err => {
    console.error('[sync] fatal:', err);
    process.exit(1);
});
