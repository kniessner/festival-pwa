/**
 * Festival PWA — Standalone Edition
 * Features: Search, Bookmarks, My Schedule, offline-first
 */

const PAGES = [
    { slug: 'home', label: 'Home', icon: '🏠' },
    { slug: 'favorites', label: 'Mein Plan', icon: '⭐' },
    { slug: 'cashless', label: 'Cashless', icon: '💳' },
    { slug: 'performances', label: 'Acts', icon: '🎭' },
    { slug: 'workshops', label: 'Workshops', icon: '🛠️' }
];

const DATA_FILES = {
    cashless: 'cashless.json',
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
        if (!data || !data.items) continue;
        const pageLabel = PAGES.find(p => p.slug === slug)?.label || slug;
        data.items.forEach((item, i) => {
            const text = `${item.question || ''} ${item.title || ''} ${item.desc || ''}`.toLowerCase();
            if (text.includes(query)) {
                results.push({ page: slug, pageLabel, index: i, item });
            }
        });
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
        const desc = r.item.desc || r.item.answer || '';
        const pageIdx = PAGES.findIndex(p => p.slug === r.page);
        return `
        <div class="grid-card search-card" onclick="loadPage(${pageIdx}); setTimeout(()=>scrollToItem('${r.page}',${r.index}), 300)">
            <div class="search-meta">${escapeHtml(r.pageLabel)}</div>
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
            else if (data.type === 'grid') renderGrid(container, data, page.slug);
        } else {
            container.innerHTML = '<div class="empty">Keine Inhalte verfügbar</div>';
        }
    }

    renderNav();
}

function renderHome(container) {
    const favCount = getFavorites().length;
    container.innerHTML = `
        <div class="hero">
            <div class="hero-logo">🌊</div>
            <h2>Bucht der Träumer*</h2>
            <div class="hero-sub">Festival 2026</div>
            <div class="countdown">33</div>
            <div class="countdown-label">Tage bis zum Festival</div>
            <div class="quick-nav">
                <button class="quick-btn" onclick="loadPage(2)">💳 Cashless</button>
                <button class="quick-btn" onclick="loadPage(3)">🎭 Acts</button>
                <button class="quick-btn" onclick="loadPage(4)">🛠️ Workshops</button>
                ${favCount > 0 ? `<button class="quick-btn quick-btn-accent" onclick="loadPage(1)">⭐ Mein Plan (${favCount})</button>` : ''}
            </div>
        </div>

        <div class="info-section">
            <h3>📍 Wichtige Infos</h3>
            <div class="info-grid">
                <div class="info-card" onclick="loadPage(2)">
                    <span class="icon">💳</span>
                    <div class="label">100% Cashless</div>
                    <div class="desc">Lade dein Bändchen vor dem Festival auf</div>
                </div>
                <div class="info-card" onclick="loadPage(3)">
                    <span class="icon">🎭</span>
                    <div class="label">22+ Acts</div>
                    <div class="desc">Performances über das Wochenende</div>
                </div>
                <div class="info-card" onclick="loadPage(4)">
                    <span class="icon">🛠️</span>
                    <div class="label">38+ Workshops</div>
                    <div class="desc">Interaktive Workshops & Talks</div>
                </div>
                <div class="info-card" onclick="loadPage(1)">
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
    if (favs.length === 0) {
        container.innerHTML = `
            <div class="page-intro">
                <h3>⭐ Mein Plan</h3>
                <p style="margin-top:12px;">Noch keine Favoriten. Tippe auf den Stern ⭐ bei Acts oder Workshops, um sie hier zu speichern.</p>
            </div>
            <div class="quick-nav">
                <button class="quick-btn" onclick="loadPage(3)">🎭 Acts</button>
                <button class="quick-btn" onclick="loadPage(4)">🛠️ Workshops</button>
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
        }
    }

    let html = '<div class="page-intro"><h3>⭐ Mein Plan</h3></div>';
    for (const [slug, items] of Object.entries(grouped)) {
        const label = PAGES.find(p => p.slug === slug)?.label || slug;
        html += `<div class="fav-group"><div class="fav-group-title">${escapeHtml(label)}</div>`;
        html += items.map((item, i) => {
            const title = item.title || item.question;
            const desc = item.desc || item.answer || '';
            const isFav = isFavorite(item.page, item.index);
            return `
            <div class="grid-card" data-item-index="${item.index}">
                <div class="card-header">
                    <h3>${escapeHtml(title)}</h3>
                    <button class="fav-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavFromCard(this, '${item.page}', ${item.index})" title="Favorit">⭐</button>
                </div>
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
