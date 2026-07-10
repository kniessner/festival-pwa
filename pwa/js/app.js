/**
 * Festival PWA Frontend — fully dynamic.
 * Fetches manifest, builds nav, renders pages by type.
 */

const API_BASE = window.location.origin + '/wp-json/festival/v1';

let pages       = [];   // from manifest
let currentPage = 0;
let pageCache   = {};

// ===== INIT =====
async function init() {
    try {
        const manifest = await fetchManifest();
        pages = manifest.pages || [];
        if (!pages.length) {
            showError('Keine Seiten ausgewählt. Bitte im Admin-Bereich Seiten aktivieren.');
            return;
        }
        renderNav();
        const startSlug = manifest.start_page || '';
        const startIndex = startSlug ? pages.findIndex(p => p.slug === startSlug) : 0;
        await loadPage(startIndex >= 0 ? startIndex : 0);
        setupOfflineIndicator();
        setupInstallPrompt();
        registerSW();
    } catch (err) {
        console.error('Init failed', err);
        showError('Fehler beim Laden. Offline-Modus wird versucht...');
        // Fallback: try loading from cache
        tryLoadCached();
    }
}

async function fetchManifest() {
    const res = await fetch(`${API_BASE}/manifest`);
    if (!res.ok) throw new Error('Manifest fetch failed');
    return res.json();
}

async function tryLoadCached() {
    const cached = await getCachedJson('_manifest.json');
    if (cached && cached.pages) {
        pages = cached.pages;
        renderNav();
        const startSlug = cached.start_page || '';
        const startIndex = startSlug ? pages.findIndex(p => p.slug === startSlug) : 0;
        loadPage(startIndex >= 0 ? startIndex : 0);
        setupOfflineIndicator();
        setupInstallPrompt();
    }
}

// ===== SERVICE WORKER =====
function registerSW() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/pwa/sw.js')
            .then(reg => console.log('SW registered'))
            .catch(err => console.log('SW failed', err));
    }
}

// ===== NAVIGATION =====
function renderNav() {
    const nav = document.getElementById('pageNav');
    if (!pages.length) {
        nav.innerHTML = '';
        return;
    }
    nav.innerHTML = pages.map((p, i) =>
        `<button class="${i === currentPage ? 'active' : ''}" data-page="${i}">
            <span class="nav-icon">${p.icon || '📄'}</span>
            <span class="nav-label">${p.label || p.slug}</span>
        </button>`
    ).join('');
}

// ===== PAGE LOADING =====
async function loadPage(index) {
    currentPage = index;
    const page  = pages[index];
    const container = document.getElementById('content');
    const title = document.getElementById('pageTitle');

    title.textContent = page?.label || 'Festival Guide';
    container.innerHTML = '<div class="loading">Laden...⏳</div>';
    renderNav();

    if (!page) {
        showError('Seite nicht gefunden');
        return;
    }

    // Check local cache first
    if (pageCache[page.slug]) {
        renderContent(pageCache[page.slug]);
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/pages/${page.slug}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        pageCache[page.slug] = data;
        renderContent(data);
    } catch (err) {
        console.error('Fetch failed, trying cache', err);
        const cached = await getCachedJson(`${page.slug}.json`);
        if (cached) {
            renderContent(cached);
        } else {
            showError(`
                <p>Keine Inhalte für "${escapeHtml(page.label)}" verfügbar.</p>
                <button onclick="loadPage(${index})"
                    style="margin-top:20px;padding:12px 24px;border-radius:24px;border:none;
                           background:linear-gradient(135deg,var(--accent-pink),var(--accent-purple));
                           color:var(--text);font-weight:700;cursor:pointer;">Erneut versuchen</button>
            `);
        }
    }
}

async function getCachedJson(filename) {
    if (!('caches' in window)) return null;
    try {
        const cache = await caches.open('bucht-v3');
        const res   = await cache.match(`/pwa/data/${filename}`);
        return res ? await res.json() : null;
    } catch (e) {
        return null;
    }
}

function showError(msg) {
    document.getElementById('content').innerHTML = `<div class="empty">${msg}</div>`;
}

// ===== CONTENT RENDERERS =====
function renderContent(data) {
    const container = document.getElementById('content');
    const type = data.type || 'generic';

    switch (type) {
        case 'faq':     renderFAQ(container, data);     break;
        case 'grid':    renderGrid(container, data);    break;
        case 'home':    renderHome(container, data);    break;
        default:        renderGeneric(container, data); break;
    }
}

function renderHome(container, data) {
    container.innerHTML = `
        <div class="hero">
            <div class="hero-logo">🌊</div>
            <h2>${escapeHtml(data.title || 'Bucht der Träumer*')}</h2>
            <div class="hero-sub">Festival 2026</div>
            ${data.countdown ? `<div class="countdown">${escapeHtml(data.countdown)}</div>` : ''}
            <div class="countdown-label">Tage bis zum Festival</div>
            <div class="quick-nav">${pages.slice(1).map((p, i) =>
                `<button class="quick-btn" onclick="loadPage(${i + 1})">${p.icon || ''} ${escapeHtml(p.label)}</button>`
            ).join('')}</div>
        </div>
        <div class="info-section">
            <h3>📍 Wichtige Infos</h3>
            <div class="info-grid">
                ${pages.slice(1).map(p => `
                    <div class="info-card" onclick="gotoPage('${p.slug}')">
                        <span class="icon">${p.icon || '📄'}</span>
                        <div class="label">${escapeHtml(p.label)}</div>
                        <div class="desc">${escapeHtml(p.slug)}</div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderFAQ(container, data) {
    container.innerHTML = `
        <div class="page-intro">${textToHtml(data.intro)}</div>
        <div class="faq-list">
            ${(data.items || []).map((item, i) => `
                <div class="faq-item" data-faq="${i}">
                    <div class="faq-question">
                        <span>${escapeHtml(item.question)}</span>
                        <span class="faq-toggle">+</span>
                    </div>
                    <div class="faq-answer">${item.answer ? escapeHtml(item.answer) : 'Details folgen bald.'}</div>
                </div>
            `).join('')}
        </div>
    `;

    container.querySelectorAll('.faq-item').forEach(item => {
        item.addEventListener('click', () => {
            const isOpen = item.classList.contains('open');
            // Close all
            container.querySelectorAll('.faq-item').forEach(f => {
                f.classList.remove('open');
                f.querySelector('.faq-answer').style.display = 'none';
                f.querySelector('.faq-toggle').textContent = '+';
            });
            // Toggle current
            if (!isOpen) {
                item.classList.add('open');
                item.querySelector('.faq-answer').style.display = 'block';
                item.querySelector('.faq-toggle').textContent = '−';
            }
        });
    });
}

function renderGrid(container, data) {
    container.innerHTML = `
        <div class="page-intro">${textToHtml(data.intro)}</div>
        <div class="grid-list">
            ${(data.items || []).map(item => `
                <div class="grid-card">
                    <h3>${escapeHtml(item.title)}</h3>
                    ${item.desc ? `<p>${escapeHtml(item.desc.substring(0, 200))}${item.desc.length > 200 ? '...' : ''}</p>` : ''}
                </div>
            `).join('')}
        </div>
    `;
}

function renderGeneric(container, data) {
    container.innerHTML = `
        <div class="page-intro">
            <h2>${escapeHtml(data.title)}</h2>
            <div style="margin-top:12px;line-height:1.7;color:var(--text-muted);">${textToHtml(data.content || '')}</div>
        </div>
    `;
}

// ===== UTILS =====
function textToHtml(str) {
    if (!str) return '';
    return escapeHtml(str).replace(/\n/g, '<br>');
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function gotoPage(slug) {
    const idx = pages.findIndex(p => p.slug === slug);
    if (idx >= 0) loadPage(idx);
}

// ===== INTERACTION =====
document.getElementById('pageNav').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-page]');
    if (!btn) return;
    loadPage(parseInt(btn.dataset.page));
});

function setupOfflineIndicator() {
    const update = () => {
        const existing = document.querySelector('.offline-badge');
        if (!navigator.onLine) {
            if (!existing) {
                const badge = document.createElement('div');
                badge.className = 'offline-badge';
                badge.textContent = 'Offline — Inhalte zwischengespeichert';
                document.body.prepend(badge);
            }
        } else {
            existing?.remove();
        }
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
}

// ===== INSTALL PROMPT =====
let installEvent = null;

function setupInstallPrompt() {
    // Chrome/Android: capture the install event
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        installEvent = e;
        showInstallBtn();
    });

    // Hide button once installed
    window.addEventListener('appinstalled', () => {
        installEvent = null;
        hideInstallBtn();
    });

    // iOS Safari: show hint if not standalone
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
                      || window.navigator.standalone === true;
    if (isIos && !isStandalone) {
        showIosInstallHint();
    }
}

function showInstallBtn() {
    const btn = document.getElementById('installBtn');
    if (!btn) return;
    if (sessionStorage.getItem('installDismissed') === '1') return;
    btn.classList.remove('hidden');
}

function hideInstallBtn() {
    const btn = document.getElementById('installBtn');
    if (btn) btn.classList.add('hidden');
}

async function triggerInstall() {
    if (!installEvent) return;
    installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === 'accepted') {
        installEvent = null;
        hideInstallBtn();
    }
}

function dismissInstall(e) {
    e.stopPropagation();
    hideInstallBtn();
    // Remember dismiss for this session
    sessionStorage.setItem('installDismissed', '1');
}

function showIosInstallHint() {
    // On iOS we can't programmatically install — show a banner
    const btn = document.getElementById('installBtn');
    if (!btn) return;
    btn.querySelector('.install-text').textContent = 'iOS: Teilen → "Zum Home-Bildschirm"';
    btn.classList.remove('hidden');
}

// ===== START =====
init();
