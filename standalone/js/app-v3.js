/**
 * Festival PWA — Standalone Edition
 * Features: Search, Bookmarks, My Schedule, offline-first
 */

const PAGES = [
    { slug: 'home', label: 'Home', icon: '🏠' },
    { slug: 'favorites', label: 'Mein Plan', icon: '⭐' },
    { slug: 'cashless', label: 'Cashless', icon: '💳' },
    { slug: 'faqs', label: 'FAQs', icon: '❓' },
    { slug: 'programm-2026', label: 'Programm', icon: '📅' },
    { slug: 'performances', label: 'Acts', icon: '🎭' },
    { slug: 'workshops', label: 'Workshops', icon: '🛠️' }
];

const DATA_FILES = {
    cashless: 'cashless.json',
    faqs: 'faqs.json',
    'programm-2026': 'programm-2026.json',
    performances: 'performances.json',
    workshops: 'workshops.json'
};

const FAV_KEY = 'bucht-favorites';
let currentPage = 0;
let pageData = {};

// ===== INIT =====
async function init() {
    // Load all data files
    for (const [slug, file] of Object.entries(DATA_FILES)) {
        try {
            const res = await fetch(`data/${file}`);
            pageData[slug] = await res.json();
        } catch (e) {
            console.error('Failed to load', file, e);
        }
    }
    renderNav();
    loadPage(0);
    setupOfflineIndicator();
    setupInstallPrompt();
    showLastUpdated();
    setupSearch();
}

function showLastUpdated() {
    const meta = document.getElementById('lastUpdated');
    if (!meta) return;
    fetch('data/_manifest.json')
        .then(r => r.json())
        .then(m => {
            if (m.synced_at) {
                const d = new Date(m.synced_at * 1000);
                meta.textContent = `Stand: ${d.toLocaleDateString('de-DE')}`;
            }
        })
        .catch(() => {});
}

// ===== FAVORITES (localStorage) =====
function getFavorites() {
    try {
        return JSON.parse(localStorage.getItem(FAV_KEY)) || [];
    } catch { return []; }
}

function toggleFavorite(pageSlug, itemIndex) {
    const favs = getFavorites();
    const idx = favs.findIndex(f => f.page === pageSlug && f.index === itemIndex);
    if (idx >= 0) {
        favs.splice(idx, 1);
    } else {
        favs.push({ page: pageSlug, index: itemIndex });
    }
    localStorage.setItem(FAV_KEY, JSON.stringify(favs));
    return idx < 0; // true = now favorited
}

function isFavorite(pageSlug, itemIndex) {
    return getFavorites().some(f => f.page === pageSlug && f.index === itemIndex);
}

// ===== NAVIGATION =====
function renderNav() {
    const nav = document.getElementById('pageNav');
    const favCount = getFavorites().length;
    nav.innerHTML = PAGES.map((p, i) => {
        const isFavPage = p.slug === 'favorites';
        const badge = isFavPage && favCount > 0 ? `<span class="nav-badge">${favCount}</span>` : '';
        return `<button class="${i === currentPage ? 'active' : ''}" data-page="${i}">
            <span class="nav-icon">${p.icon}${badge}</span>
            <span class="nav-label">${p.label}</span>
        </button>`;
    }).join('');
}

// ===== SEARCH =====
function setupSearch() {
    const input = document.getElementById('searchInput');
    if (!input) return;
    input.addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        if (q.length < 2) {
            document.getElementById('searchResults').innerHTML = '';
            return;
        }
        doSearch(q);
    });
}

function doSearch(query) {
    const results = [];
    for (const [slug, data] of Object.entries(pageData)) {
        if (!data) continue;
        const pageLabel = PAGES.find(p => p.slug === slug)?.label || slug;
        
        // Search items (FAQ, grid)
        if (data.items) {
            data.items.forEach((item, i) => {
                const text = `${item.question || ''} ${item.title || ''} ${item.desc || ''}`.toLowerCase();
                if (text.includes(query)) {
                    results.push({ page: slug, pageLabel, index: i, item });
                }
            });
        }
        
        // Search events (program)
        if (data.events) {
            data.events.forEach((ev, i) => {
                const text = `${ev.title || ''} ${ev.excerpt || ''} ${ev.description || ''} ${ev.stage_label || ''} ${ev.type_label || ''} ${ev.hosts?.join(' ') || ''}`.toLowerCase();
                if (text.includes(query)) {
                    results.push({ page: slug, pageLabel, index: i, item: ev, isEvent: true });
                }
            });
        }
    }
    renderSearchResults(results, query);
}

function renderSearchResults(results, query) {
    const container = document.getElementById('searchResults');
    if (!container) return;
    if (results.length === 0) {
        container.innerHTML = `<div class="empty">Keine Ergebnisse für "${escapeHtml(query)}"</div>`;
        return;
    }
    container.innerHTML = results.map(r => {
        const title = r.item.title || r.item.question || 'Item';
        const desc = r.item.desc || r.item.answer || r.item.excerpt || '';
        const pageIdx = PAGES.findIndex(p => p.slug === r.page);
        return `
        <div class="grid-card search-card" onclick="loadPage(${pageIdx}); setTimeout(()=>scrollToItem('${r.page}',${r.index}), 300)">
            <div class="search-meta">${escapeHtml(r.pageLabel)}${r.item.time ? ' · ' + escapeHtml(r.item.time) : ''}${r.item.stage_label ? ' · ' + escapeHtml(r.item.stage_label) : ''}</div>
            <h3>${escapeHtml(title)}</h3>
            ${desc ? `<p>${escapeHtml(desc.substring(0, 120))}${desc.length > 120 ? '...' : ''}</p>` : ''}
        </div>`;
    }).join('');
}

function scrollToItem(pageSlug, itemIndex) {
    const items = document.querySelectorAll(`[data-item-index="${itemIndex}"]`);
    if (items.length) {
        items[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
        items[0].classList.add('highlight');
        setTimeout(() => items[0].classList.remove('highlight'), 2000);
    }
}

// ===== PAGE LOADING =====
function loadPage(index) {
    currentPage = index;
    const page = PAGES[index];
    const container = document.getElementById('content');
    const title = document.getElementById('pageTitle');
    const searchBar = document.getElementById('searchBar');

    title.textContent = page.label === 'Home' ? 'Bucht der Träumer*' : page.label;
    container.innerHTML = '';
    if (searchBar) searchBar.style.display = (page.slug === 'home' || page.slug === 'favorites') ? 'none' : '';

    if (page.slug === 'home') {
        renderHome(container);
    } else if (page.slug === 'favorites') {
        renderFavorites(container);
    } else {
        const data = pageData[page.slug];
        if (data) {
            if (data.type === 'faq') renderFAQ(container, data, page.slug);
            else if (data.type === 'program') renderProgram(container, data, page.slug);
            else if (data.type === 'grid') renderGrid(container, data, page.slug);
        } else {
            container.innerHTML = '<div class="empty">Keine Inhalte verfügbar</div>';
        }
    }

    renderNav();
}

function renderHome(container) {
    const favCount = getFavorites().length;
    const pageIdx = (slug) => PAGES.findIndex(p => p.slug === slug);
    container.innerHTML = `
        <div class="hero">
            <div class="hero-logo">🌊</div>
            <h2>Bucht der Träumer*</h2>
            <div class="hero-sub">Festival 2026</div>
            <div class="countdown">33</div>
            <div class="countdown-label">Tage bis zum Festival</div>
            <div class="quick-nav">
                <button class="quick-btn" onclick="loadPage(${pageIdx('cashless')})">💳 Cashless</button>
                <button class="quick-btn" onclick="loadPage(${pageIdx('programm-2026')})">📅 Programm</button>
                <button class="quick-btn" onclick="loadPage(${pageIdx('faqs')})">❓ FAQs</button>
                <button class="quick-btn" onclick="loadPage(${pageIdx('performances')})">🎭 Acts</button>
                <button class="quick-btn" onclick="loadPage(${pageIdx('workshops')})">🛠️ Workshops</button>
                ${favCount > 0 ? `<button class="quick-btn quick-btn-accent" onclick="loadPage(${pageIdx('favorites')})">⭐ Mein Plan (${favCount})</button>` : ''}
            </div>
        </div>

        <div class="info-section">
            <h3>📍 Wichtige Infos</h3>
            <div class="info-grid">
                <div class="info-card" onclick="loadPage(${pageIdx('cashless')})">
                    <span class="icon">💳</span>
                    <div class="label">100% Cashless</div>
                    <div class="desc">Lade dein Bändchen vor dem Festival auf</div>
                </div>
                <div class="info-card" onclick="loadPage(${pageIdx('programm-2026')})">
                    <span class="icon">📅</span>
                    <div class="label">Programm</div>
                    <div class="desc">Kulturprogramm mit Bühnen & Zeiten</div>
                </div>
                <div class="info-card" onclick="loadPage(${pageIdx('faqs')})">
                    <span class="icon">❓</span>
                    <div class="label">FAQs</div>
                    <div class="desc">Häufige Fragen & Antworten</div>
                </div>
                <div class="info-card" onclick="loadPage(${pageIdx('favorites')})">
                    <span class="icon">⭐</span>
                    <div class="label">Mein Plan</div>
                    <div class="desc">${favCount > 0 ? favCount + ' gespeichert' : 'Favoriten hinzufügen'}</div>
                </div>
            </div>
        </div>
    `;
}

function renderFavorites(container) {
    const favs = getFavorites();
    const pageIdx = (slug) => PAGES.findIndex(p => p.slug === slug);
    if (favs.length === 0) {
        container.innerHTML = `
            <div class="page-intro">
                <h3>⭐ Mein Plan</h3>
                <p style="margin-top:12px;">Noch keine Favoriten. Tippe auf den Stern ⭐ bei einem Programm-Eintrag, um ihn hier zu speichern.</p>
            </div>
            <div class="quick-nav">
                <button class="quick-btn" onclick="loadPage(${pageIdx('programm-2026')})">📅 Programm</button>
                <button class="quick-btn" onclick="loadPage(${pageIdx('performances')})">🎭 Acts</button>
                <button class="quick-btn" onclick="loadPage(${pageIdx('workshops')})">🛠️ Workshops</button>
            </div>
        `;
        return;
    }

    // Group favorites by page
    const grouped = {};
    for (const f of favs) {
        if (!grouped[f.page]) grouped[f.page] = [];
        const data = pageData[f.page];
        if (data && data.items && data.items[f.index]) {
            grouped[f.page].push({ ...data.items[f.index], index: f.index, page: f.page });
        } else if (data && data.events && data.events[f.index]) {
            // Programm-2026 uses events, not items
            grouped[f.page].push({ ...data.events[f.index], index: f.index, page: f.page });
        }
    }

    let html = '<div class="page-intro"><h3>⭐ Mein Plan</h3></div>';
    for (const [slug, items] of Object.entries(grouped)) {
        const label = PAGES.find(p => p.slug === slug)?.label || slug;
        html += `<div class="fav-group"><div class="fav-group-title">${escapeHtml(label)}</div>`;
        html += items.map((item, i) => {
            const title = item.title || item.question;
            const desc = item.desc || item.answer || item.excerpt || '';
            const meta = item.time ? `<span class="event-meta">${escapeHtml(item.time)} · ${escapeHtml(item.stage_label || '')}</span>` : '';
            const isFav = isFavorite(item.page, item.index);
            return `
            <div class="grid-card" data-item-index="${item.index}">
                <div class="card-header">
                    <h3>${escapeHtml(title)}</h3>
                    <button class="fav-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavFromCard(this, '${item.page}', ${item.index})" title="Favorit">⭐</button>
                </div>
                ${meta}
                ${desc ? `<p>${escapeHtml(desc.substring(0, 200))}${desc.length > 200 ? '...' : ''}</p>` : ''}
            </div>`;
        }).join('');
        html += '</div>';
    }
    container.innerHTML = html;
}

function toggleFavFromCard(btn, pageSlug, itemIndex) {
    const isNowFav = toggleFavorite(pageSlug, itemIndex);
    btn.classList.toggle('active', isNowFav);
    renderNav();
    // If on favorites page, re-render
    if (PAGES[currentPage].slug === 'favorites') {
        loadPage(currentPage);
    }
}

function renderFAQ(container, data, pageSlug) {
    container.innerHTML = `
        <div class="page-intro">${textToHtml(data.intro)}</div>
        <div class="faq-list">
            ${data.items.map((item, i) => {
                const hasAnswer = item.answer && item.answer.trim() && item.answer !== 'Details folgen bald.';
                const isFav = isFavorite(pageSlug, i);
                return `
                <div class="faq-item" data-faq="${i}" data-item-index="${i}">
                    <div class="faq-question">
                        <span>${escapeHtml(item.question)}</span>
                        <div class="faq-actions">
                            <button class="fav-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavFromCard(this, '${pageSlug}', ${i})" title="Favorit">⭐</button>
                            <span class="faq-toggle">+</span>
                        </div>
                    </div>
                    <div class="faq-answer ${hasAnswer ? '' : 'empty'}">${hasAnswer ? escapeHtml(item.answer) : '<em>Details folgen bald.</em>'}</div>
                </div>`;
            }).join('')}
        </div>
    `;

    container.querySelectorAll('.faq-item').forEach(item => {
        item.addEventListener('click', () => {
            const answer = item.querySelector('.faq-answer');
            const toggle = item.querySelector('.faq-toggle');
            const isOpen = item.classList.contains('open');
            container.querySelectorAll('.faq-item').forEach(f => {
                f.classList.remove('open');
                f.querySelector('.faq-answer').style.display = 'none';
                const t = f.querySelector('.faq-toggle');
                if (t) t.textContent = '+';
            });
            if (!isOpen) {
                item.classList.add('open');
                answer.style.display = 'block';
                toggle.textContent = '−';
            }
        });
    });
}

function renderGrid(container, data, pageSlug) {
    container.innerHTML = `
        <div class="page-intro">${textToHtml(data.intro)}</div>
        <div class="grid-list">
            ${data.items.map((item, i) => {
                const isFav = isFavorite(pageSlug, i);
                return `
                <div class="grid-card" data-item-index="${i}">
                    <div class="card-header">
                        <h3>${escapeHtml(item.title)}</h3>
                        <button class="fav-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavFromCard(this, '${pageSlug}', ${i})" title="Favorit">⭐</button>
                    </div>
                    ${item.desc ? `<p>${escapeHtml(item.desc.substring(0, 200))}${item.desc.length > 200 ? '...' : ''}</p>` : ''}
                </div>`;
            }).join('')}
        </div>
    `;
}

function renderProgram(container, data, pageSlug) {
    const favs = getFavorites();
    const activeFilters = { day: 'all', stage: 'all', type: 'all' };

    function buildFilterUI() {
        const days = data.filters.days || [];
        const stages = data.filters.stages || [];
        const types = data.filters.types || [];
        return `
        <div class="filter-bar">
            <div class="filter-group">
                <label>Tag</label>
                <select id="filter-day">
                    ${days.map(d => `<option value="${escapeHtml(d.value)}">${escapeHtml(d.label)}</option>`).join('')}
                </select>
            </div>
            <div class="filter-group">
                <label>Bühne</label>
                <select id="filter-stage">
                    ${stages.map(s => `<option value="${escapeHtml(s.value)}">${escapeHtml(s.label)}</option>`).join('')}
                </select>
            </div>
            <div class="filter-group">
                <label>Typ</label>
                <select id="filter-type">
                    ${types.map(t => `<option value="${escapeHtml(t.value)}">${escapeHtml(t.label)}</option>`).join('')}
                </select>
            </div>
        </div>`;
    }

    function renderEvents() {
        const dayVal = document.getElementById('filter-day')?.value || 'all';
        const stageVal = document.getElementById('filter-stage')?.value || 'all';
        const typeVal = document.getElementById('filter-type')?.value || 'all';

        const filtered = data.events.filter(ev => {
            if (dayVal !== 'all' && ev.day !== dayVal) return false;
            if (stageVal !== 'all' && ev.stage !== stageVal) return false;
            if (typeVal !== 'all' && ev.type !== typeVal) return false;
            return true;
        });

        const listEl = document.getElementById('program-list');
        if (!listEl) return;

        if (filtered.length === 0) {
            listEl.innerHTML = '<div class="empty" style="padding:40px 20px;">Keine Events für diese Filter</div>';
            document.getElementById('program-count').textContent = '0 Events';
            return;
        }

        listEl.innerHTML = filtered.map((ev, i) => {
            const idx = data.events.indexOf(ev);
            const isFav = isFavorite(pageSlug, idx);
            const hasDetail = ev.description && ev.description.trim().length > 0 && ev.description !== ev.excerpt;
            const hosts = ev.hosts && ev.hosts.length ? `<span class="event-hosts">${escapeHtml(ev.hosts.join(', '))}</span>` : '';
            const langBadges = ev.langs && ev.langs.length ? ev.langs.map(l => `<span class="lang-badge">${escapeHtml(l.toUpperCase())}</span>`).join('') : '';

            return `
            <div class="program-item ${hasDetail ? 'has-detail' : ''}" data-item-index="${idx}">
                <div class="program-header" onclick="toggleProgramDetail(this)">
                    <div class="program-meta">
                        ${ev.time ? `<span class="event-time">${escapeHtml(ev.time)}</span>` : ''}
                        ${ev.type_label ? `<span class="event-type">${escapeHtml(ev.type_label)}</span>` : ''}
                        ${langBadges}
                    </div>
                    <div class="program-title-row">
                        <h3>${escapeHtml(ev.title)}</h3>
                        <div class="program-actions">
                            <button class="fav-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavFromCard(this, '${pageSlug}', ${idx})" title="Favorit">⭐</button>
                            ${hasDetail ? '<span class="program-toggle">+</span>' : ''}
                        </div>
                    </div>
                    ${ev.stage_label ? `<span class="event-stage">${escapeHtml(ev.stage_label)}</span>` : ''}
                    ${hosts}
                    ${ev.excerpt ? `<p class="event-excerpt">${escapeHtml(ev.excerpt.substring(0, 140))}${ev.excerpt.length > 140 ? '...' : ''}</p>` : ''}
                </div>
                ${hasDetail ? `
                <div class="program-detail">
                    <div class="program-detail-inner">
                        ${escapeHtml(ev.description)}
                    </div>
                </div>
                ` : ''}
            </div>`;
        }).join('');

        document.getElementById('program-count').textContent = `${filtered.length} Event${filtered.length !== 1 ? 's' : ''}`;
    }

    container.innerHTML = `
        <div class="page-intro">${textToHtml(data.intro)}</div>
        ${buildFilterUI()}
        <div class="program-status"><span id="program-count">${data.events.length} Events</span></div>
        <div class="program-list" id="program-list"></div>
    `;

    // Wire up filter change listeners
    requestAnimationFrame(() => {
        ['filter-day', 'filter-stage', 'filter-type'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', renderEvents);
        });
        renderEvents();
    });
}

window.toggleProgramDetail = function(header) {
    const item = header.closest('.program-item');
    const detail = item.querySelector('.program-detail');
    const toggle = header.querySelector('.program-toggle');
    if (!detail) return;
    const isOpen = item.classList.contains('open');
    if (isOpen) {
        item.classList.remove('open');
        detail.style.display = 'none';
        if (toggle) toggle.textContent = '+';
    } else {
        item.classList.add('open');
        detail.style.display = 'block';
        if (toggle) toggle.textContent = '−';
    }
};

// ===== UTILS =====
function textToHtml(str) {
    if (!str) return '';
    return escapeHtml(str).replace(/\n/g, '<br>');
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
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
let installPromptShown = false;

function setupInstallPrompt() {
    // Chrome/Android: capture the beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        installEvent = e;
        if (!installPromptShown) {
            showInstallBtn();
            installPromptShown = true;
        }
    });

    // Hide button once installed
    window.addEventListener('appinstalled', () => {
        installEvent = null;
        hideInstallBtn();
        showToast('App installiert');
    });

    // iOS Safari: show manual install hint (beforeinstallprompt never fires on iOS)
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
                      || window.navigator.standalone === true;

    if (isStandalone) {
        hideInstallBtn();
    } else if (isIos) {
        showIosInstallHint();
    }

    // Wire up button events via listeners (no inline onclick)
    const btn = document.getElementById('installBtn');
    const closeBtn = document.getElementById('installClose');
    if (btn) {
        btn.addEventListener('click', (e) => {
            if (e.target.closest('#installClose')) return;
            handleInstallClick();
        });
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dismissInstall();
        });
    }
}

async function handleInstallClick() {
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIos) {
        showToast('iOS: Tippe unten auf Teilen → Zum Home-Bildschirm');
        return;
    }

    if (!installEvent) {
        if (window.matchMedia('(display-mode: standalone)').matches) {
            showToast('Bereits installiert');
        } else {
            showToast('Chrome/Edge auf Android: Menü → Zum Startbildschirm');
        }
        return;
    }

    installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === 'accepted') {
        installEvent = null;
        hideInstallBtn();
        showToast('App wird installiert...');
    } else {
        showToast('Installieren abgebrochen');
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

function dismissInstall() {
    hideInstallBtn();
    sessionStorage.setItem('installDismissed', '1');
}

function showIosInstallHint() {
    const text = document.getElementById('installText');
    if (text) text.textContent = 'iOS: Teilen → "Zum Home-Bildschirm"';
    showInstallBtn();
}

function showToast(message) {
    const existing = document.querySelector('.toast-message');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: calc(90px + env(safe-area-inset-bottom));
        left: 50%;
        transform: translateX(-50%);
        z-index: 400;
        background: linear-gradient(135deg, #b0327a, #762c8c);
        color: #f3efdf;
        padding: 12px 20px;
        border-radius: 24px;
        font-size: 0.85rem;
        font-weight: 700;
        box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        max-width: 90vw;
        text-align: center;
        opacity: 0;
    `;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
        setTimeout(() => toast.remove(), 350);
    }, 3000);
}

// ===== START =====
init();
