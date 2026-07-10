/**
 * Festival PWA — Standalone Edition v4
 * Unified timetable: programm-2026 + performances + workshops
 */

const PAGES = [
    { slug: 'home', label: 'Home', icon: '🏠' },
    { slug: 'timetable', label: 'Programm', icon: '📅' },
    { slug: 'favorites', label: 'Mein Plan', icon: '⭐' },
    { slug: 'cashless', label: 'Cashless', icon: '💳' },
    { slug: 'faqs', label: 'FAQs', icon: '❓' }
];

const DATA_FILES = {
    cashless: 'cashless.json',
    faqs: 'faqs.json',
    timetable: 'timetable.json'
};

const FAV_KEY = 'bucht-favorites';
let currentPage = 0;
let pageData = {};

// ════════════════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════════════════
async function init() {
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

// ════════════════════════════════════════════════════════════════
// FAVORITES
// ════════════════════════════════════════════════════════════════
function getFavorites() {
    try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; }
    catch { return []; }
}

function toggleFavorite(pageSlug, itemIndex) {
    const favs = getFavorites();
    const idx = favs.findIndex(f => f.page === pageSlug && f.index === itemIndex);
    if (idx >= 0) { favs.splice(idx, 1); }
    else { favs.push({ page: pageSlug, index: itemIndex }); }
    localStorage.setItem(FAV_KEY, JSON.stringify(favs));
    return idx < 0;
}

function isFavorite(pageSlug, itemIndex) {
    return getFavorites().some(f => f.page === pageSlug && f.index === itemIndex);
}

// ════════════════════════════════════════════════════════════════
// NAVIGATION
// ════════════════════════════════════════════════════════════════
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

// ════════════════════════════════════════════════════════════════
// SEARCH
// ════════════════════════════════════════════════════════════════
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
        if (data.items) {
            data.items.forEach((item, i) => {
                const text = `${item.question || ''} ${item.title || ''} ${item.desc || ''}`.toLowerCase();
                if (text.includes(query)) results.push({ page: slug, pageLabel, index: i, item });
            });
        }
        if (data.events) {
            data.events.forEach((ev, i) => {
                const text = `${ev.title || ''} ${ev.excerpt || ''} ${ev.description || ''} ${ev.stage_label || ''} ${ev.type_label || ''} ${ev.hosts?.join(' ') || ''}`.toLowerCase();
                if (text.includes(query)) results.push({ page: slug, pageLabel, index: i, item: ev, isEvent: true });
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
        const meta = r.item.time ? `${escapeHtml(r.item.time)} · ${escapeHtml(r.item.stage_label || '')}` : '';
        const pageIdx = PAGES.findIndex(p => p.slug === r.page);
        return `
        <div class="grid-card search-card" onclick="loadPage(${pageIdx}); setTimeout(()=>scrollToItem('${r.page}',${r.index}), 300)">
            <div class="search-meta">${escapeHtml(r.pageLabel)}${meta ? ' · ' + meta : ''}</div>
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

// ════════════════════════════════════════════════════════════════
// PAGE LOADING
// ════════════════════════════════════════════════════════════════
function loadPage(index) {
    currentPage = index;
    const page = PAGES[index];
    const container = document.getElementById('content');
    const title = document.getElementById('pageTitle');
    const searchBar = document.getElementById('searchBar');

    title.textContent = page.label === 'Home' ? 'Bucht der Träumer*' : page.label;
    container.innerHTML = '';
    document.getElementById('searchResults').innerHTML = '';
    if (searchBar) searchBar.style.display = (page.slug === 'home' || page.slug === 'favorites') ? 'none' : '';

    if (page.slug === 'home') { renderHome(container); }
    else if (page.slug === 'favorites') { renderFavorites(container); }
    else if (page.slug === 'timetable') { renderTimetable(container); }
    else if (page.slug === 'cashless') { renderFAQ(container, pageData.cashless, 'cashless'); }
    else if (page.slug === 'faqs') { renderFAQ(container, pageData.faqs, 'faqs'); }
    else { container.innerHTML = '<div class="empty">Keine Inhalte verfügbar</div>'; }

    renderNav();
}

// ════════════════════════════════════════════════════════════════
// HOME
// ════════════════════════════════════════════════════════════════
function pageIdx(slug) { return PAGES.findIndex(p => p.slug === slug); }

function renderHome(container) {
    const favCount = getFavorites().length;
    container.innerHTML = `
        <div class="hero">
            <div class="hero-logo">🌊</div>
            <h2>Bucht der Träumer*</h2>
            <div class="hero-sub">Festival 2026</div>
            <div class="countdown" id="countdown">–</div>
            <div class="countdown-label">Tage bis zum Festival</div>
            <div class="quick-nav">
                <button class="quick-btn" onclick="loadPage(${pageIdx('timetable')})">📅 Programm</button>
                <button class="quick-btn" onclick="loadPage(${pageIdx('cashless')})">💳 Cashless</button>
                <button class="quick-btn" onclick="loadPage(${pageIdx('faqs')})">❓ FAQs</button>
                ${favCount > 0 ? `<button class="quick-btn quick-btn-accent" onclick="loadPage(${pageIdx('favorites')})">⭐ Mein Plan (${favCount})</button>` : ''}
            </div>
        </div>
        <div class="info-section">
            <h3>📍 Wichtige Infos</h3>
            <div class="info-grid">
                <div class="info-card" onclick="loadPage(${pageIdx('timetable')})">
                    <span class="icon">📅</span>
                    <div class="label">Kulturprogramm</div>
                    <div class="desc">149+ Events über alle Tage</div>
                </div>
                <div class="info-card" onclick="loadPage(${pageIdx('cashless')})">
                    <span class="icon">💳</span>
                    <div class="label">100% Cashless</div>
                    <div class="desc">Lade dein Bändchen vor dem Festival auf</div>
                </div>
                <div class="info-card" onclick="loadPage(${pageIdx('faqs')})">
                    <span class="icon">❓</span>
                    <div class="label">FAQs</div>
                    <div class="desc">Alles was du wissen musst</div>
                </div>
                <div class="info-card" onclick="loadPage(${pageIdx('favorites')})">
                    <span class="icon">⭐</span>
                    <div class="label">Mein Plan</div>
                    <div class="desc">${favCount > 0 ? favCount + ' gespeichert' : 'Favoriten hinzufügen'}</div>
                </div>
            </div>
        </div>
    `;
    // Update countdown
    const festivalStart = new Date('2026-08-13T00:00:00');
    const now = new Date();
    const diff = Math.ceil((festivalStart - now) / (1000 * 60 * 60 * 24));
    const el = document.getElementById('countdown');
    if (el) el.textContent = diff > 0 ? diff : (diff === 0 ? 'Heute!' : 'Vorbei');
}

// ════════════════════════════════════════════════════════════════
// FAVORITES
// ════════════════════════════════════════════════════════════════
function renderFavorites(container) {
    const favs = getFavorites();
    if (favs.length === 0) {
        container.innerHTML = `
            <div class="page-intro"><h3>⭐ Mein Plan</h3>
            <p style="margin-top:12px;">Noch keine Favoriten. Tippe auf den Stern ⭐ bei Events im Programm, um sie hier zu speichern.</p></div>
            <div class="quick-nav"><button class="quick-btn" onclick="loadPage(${pageIdx('timetable')})">📅 Programm</button></div>`;
        return;
    }
    const grouped = {};
    for (const f of favs) {
        if (!grouped[f.page]) grouped[f.page] = [];
        const data = pageData[f.page];
        if (data && data.events && data.events[f.index]) {
            grouped[f.page].push({ ...data.events[f.index], index: f.index, page: f.page });
        } else if (data && data.items && data.items[f.index]) {
            grouped[f.page].push({ ...data.items[f.index], index: f.index, page: f.page });
        }
    }
    let html = '<div class="page-intro"><h3>⭐ Mein Plan</h3></div>';
    for (const [slug, items] of Object.entries(grouped)) {
        const label = PAGES.find(p => p.slug === slug)?.label || slug;
        html += `<div class="fav-group"><div class="fav-group-title">${escapeHtml(label)}</div>`;
        html += items.map(item => {
            const title = item.title || item.question;
            const desc = item.desc || item.answer || item.excerpt || '';
            const meta = item.time ? `<span class="event-meta">${escapeHtml(item.time)} · ${escapeHtml(item.stage_label || '')}</span>` : '';
            const isFav = isFavorite(item.page, item.index);
            return `<div class="grid-card" data-item-index="${item.index}">
                <div class="card-header"><h3>${escapeHtml(title)}</h3>
                <button class="fav-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavFromCard(this, '${item.page}', ${item.index})" title="Favorit">★</button></div>
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
    if (PAGES[currentPage].slug === 'favorites') loadPage(currentPage);
}

// ════════════════════════════════════════════════════════════════
// TIMETABLE — THE BIG ONE
// ════════════════════════════════════════════════════════════════
function getCurrentFestivalDay(days) {
    const now = new Date();
    // Use local date (Europe/Berlin), not UTC ISO string
    const yy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const todayStr = `${yy}-${mm}-${dd}`;
    const festivalDates = ['2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16'];
    if (festivalDates.includes(todayStr)) return todayStr;
    return days[0]?.value || '2026-08-13';
}

function renderTimetable(container) {
    const data = pageData.timetable;
    if (!data || !data.events) {
        container.innerHTML = '<div class="empty">Programm wird geladen…</div>';
        return;
    }

    window._ttFilters = window._ttFilters || {
        day: getCurrentFestivalDay(data.filters.days),
        stage: 'all',
        category: 'all',
        genre: 'all'
    };

    container.innerHTML = `
        <div class="tt-intro">${textToHtml(data.intro)}</div>
        <div class="tt-day-tabs" id="ttDayTabs"></div>
        <div class="tt-events" id="ttEvents"></div>
        <button class="tt-filter-btn" id="ttFilterBtn" onclick="toggleFilterPanel()">🔍 Filter</button>
        <div class="tt-filter-panel" id="ttFilterPanel">
            <div class="tt-filter-head">
                <strong>Filter</strong>
                <button class="tt-filter-close" onclick="toggleFilterPanel()">✕</button>
            </div>
            <div class="tt-filter-group">
                <label>Bühne / Stage</label>
                <select id="filter-stage"><option value="all">Alle Bühnen</option></select>
            </div>
            <div class="tt-filter-group">
                <label>Kategorie</label>
                <select id="filter-category"><option value="all">Alle Kategorien</option></select>
            </div>
            <div class="tt-filter-group">
                <label>Genre</label>
                <select id="filter-genre"><option value="all">Alle Genres</option></select>
            </div>
            <button class="tt-filter-reset" onclick="resetFilters()">Filter zurücksetzen</button>
        </div>
        <div class="tt-filter-backdrop" id="ttFilterBackdrop" onclick="toggleFilterPanel()"></div>
    `;

    const stageSel = document.getElementById('filter-stage');
    data.filters.stages.forEach(s => { const o = document.createElement('option'); o.value = s.value; o.textContent = s.label; stageSel.appendChild(o); });
    const catSel = document.getElementById('filter-category');
    data.filters.categories.forEach(c => { const o = document.createElement('option'); o.value = c.value; o.textContent = c.label; catSel.appendChild(o); });
    const genSel = document.getElementById('filter-genre');
    data.filters.genres.forEach(g => { const o = document.createElement('option'); o.value = g.value; o.textContent = g.label; genSel.appendChild(o); });

    stageSel.value = window._ttFilters.stage;
    catSel.value = window._ttFilters.category;
    genSel.value = window._ttFilters.genre;

    stageSel.addEventListener('change', () => { window._ttFilters.stage = stageSel.value; refreshTimetable(); });
    catSel.addEventListener('change', () => { window._ttFilters.category = catSel.value; refreshTimetable(); });
    genSel.addEventListener('change', () => { window._ttFilters.genre = genSel.value; refreshTimetable(); });

    refreshTimetable();
}

function refreshTimetable() {
    const data = pageData.timetable;
    const filters = window._ttFilters;
    const container = document.getElementById('ttEvents');
    const tabsContainer = document.getElementById('ttDayTabs');
    if (!container || !tabsContainer) return;

    tabsContainer.innerHTML = data.filters.days.map(d => {
        const isActive = d.value === filters.day;
        return `<button class="tt-day-tab ${isActive ? 'active' : ''}" data-day="${d.value}" onclick="setDay('${d.value}')">${d.label}</button>`;
    }).join('');

    let events = data.events.filter(ev => {
        if (filters.day !== 'all' && ev.day !== filters.day) return false;
        if (filters.stage !== 'all' && ev.stage !== filters.stage) return false;
        if (filters.category !== 'all' && ev.type !== filters.category) return false;
        if (filters.genre !== 'all' && ev.genre !== filters.genre) return false;
        return true;
    });

    if (events.length === 0) {
        container.innerHTML = '<div class="empty" style="padding:40px 20px;">Keine Events für diese Auswahl</div>';
        return;
    }

    const hourGroups = {};
    events.forEach(ev => {
        const hour = ev.start_time ? ev.start_time.slice(0, 2) + ':00' : 'Ohne Zeit';
        if (!hourGroups[hour]) hourGroups[hour] = [];
        hourGroups[hour].push(ev);
    });

    const sortedHours = Object.keys(hourGroups).sort((a, b) => {
        if (a === 'Ohne Zeit') return 1;
        if (b === 'Ohne Zeit') return -1;
        return a.localeCompare(b);
    });

    container.innerHTML = sortedHours.map(hour => `
        <div class="tt-hour-group" data-hour="${hour}">
            <div class="tt-hour-label">${hour}</div>
            <div class="tt-hour-events">${hourGroups[hour].map(renderEventCard).join('')}</div>
        </div>
    `).join('');

    scrollToCurrentTime(filters.day);
}

function renderEventCard(ev) {
    const idx = pageData.timetable.events.indexOf(ev);
    const isFav = isFavorite('timetable', idx);
    const hasDetail = ev.description && ev.description.trim().length > 0 && ev.description !== ev.excerpt;
    const langBadges = ev.langs && ev.langs.length ? ev.langs.map(l => `<span class="lang-badge">${l.toUpperCase()}</span>`).join('') : '';
    const hosts = ev.hosts && ev.hosts.length ? `<span class="event-hosts">${ev.hosts.join(', ')}</span>` : '';
    const endTime = ev.end_time ? ` – ${ev.end_time}` : '';

    return `
    <div class="tt-event ${hasDetail ? 'has-detail' : ''}" data-item-index="${idx}">
        <div class="tt-event-header" onclick="toggleEventDetail(this)">
            <div class="tt-event-meta">
                <span class="event-time">${ev.time}${endTime}</span>
                <span class="event-type">${ev.category}</span>
                ${langBadges}
            </div>
            <div class="tt-event-title-row">
                <h3>${ev.title}</h3>
                <div class="tt-event-actions">
                    <button class="fav-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavFromCard(this, 'timetable', ${idx})" title="Favorit">★</button>
                    ${hasDetail ? '<span class="tt-event-toggle">+</span>' : ''}
                </div>
            </div>
            <span class="event-stage">${ev.stage_label}</span>
            ${hosts}
            ${ev.excerpt ? `<p class="event-excerpt">${ev.excerpt.substring(0, 140)}${ev.excerpt.length > 140 ? '...' : ''}</p>` : ''}
        </div>
        ${hasDetail ? `<div class="tt-event-detail"><div class="tt-event-detail-inner">${ev.description}</div></div>` : ''}
    </div>`;
}

function setDay(dayValue) {
    window._ttFilters.day = dayValue;
    refreshTimetable();
}

function toggleEventDetail(header) {
    const item = header.closest('.tt-event');
    const detail = item.querySelector('.tt-event-detail');
    const toggle = header.querySelector('.tt-event-toggle');
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
}

function toggleFilterPanel() {
    const panel = document.getElementById('ttFilterPanel');
    const backdrop = document.getElementById('ttFilterBackdrop');
    const isOpen = panel.classList.contains('open');
    panel.classList.toggle('open', !isOpen);
    backdrop.classList.toggle('open', !isOpen);
}

function resetFilters() {
    window._ttFilters.stage = 'all';
    window._ttFilters.category = 'all';
    window._ttFilters.genre = 'all';
    document.getElementById('filter-stage').value = 'all';
    document.getElementById('filter-category').value = 'all';
    document.getElementById('filter-genre').value = 'all';
    refreshTimetable();
}

function scrollToCurrentTime(selectedDay) {
    const now = new Date();
    // Use local date (Europe/Berlin), not UTC
    const yy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const todayStr = `${yy}-${mm}-${dd}`;
    if (todayStr !== selectedDay) return;

    const currentHour = String(now.getHours()).padStart(2, '0') + ':00';
    const hourGroups = document.querySelectorAll('.tt-hour-group');
    let target = null;
    for (const g of hourGroups) {
        const h = g.dataset.hour;
        if (h === 'Ohne Zeit') continue;
        if (h <= currentHour || !target) target = g;
        if (h >= currentHour) { target = g; break; }
    }
    if (target) {
        setTimeout(() => {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 200);
    }
}

// ════════════════════════════════════════════════════════════════
// FAQ (reused for cashless + faqs)
// ════════════════════════════════════════════════════════════════
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
                        <span>${item.question}</span>
                        <div class="faq-actions">
                            <button class="fav-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavFromCard(this, '${pageSlug}', ${i})" title="Favorit">★</button>
                            <span class="faq-toggle">+</span>
                        </div>
                    </div>
                    <div class="faq-answer ${hasAnswer ? '' : 'empty'}">${hasAnswer ? item.answer : '<em>Details folgen bald.</em>'}</div>
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

// ════════════════════════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════════════════════════
function textToHtml(str) {
    if (!str) return '';
    return escapeHtml(str).replace(/\n/g, '<br>');
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// ════════════════════════════════════════════════════════════════
// INTERACTION
// ════════════════════════════════════════════════════════════════
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

// ════════════════════════════════════════════════════════════════
// INSTALL PROMPT
// ════════════════════════════════════════════════════════════════
let installEvent = null;
let installPromptShown = false;

function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        installEvent = e;
        if (!installPromptShown) { showInstallBtn(); installPromptShown = true; }
    });
    window.addEventListener('appinstalled', () => {
        installEvent = null; hideInstallBtn(); showToast('App installiert');
    });
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) hideInstallBtn();
    else if (isIos) showIosInstallHint();
    const btn = document.getElementById('installBtn');
    const closeBtn = document.getElementById('installClose');
    if (btn) btn.addEventListener('click', (e) => { if (e.target.closest('#installClose')) return; handleInstallClick(); });
    if (closeBtn) closeBtn.addEventListener('click', (e) => { e.stopPropagation(); dismissInstall(); });
}

async function handleInstallClick() {
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIos) { showToast('iOS: Tippe unten auf Teilen → Zum Home-Bildschirm'); return; }
    if (!installEvent) {
        if (window.matchMedia('(display-mode: standalone)').matches) showToast('Bereits installiert');
        else showToast('Chrome/Edge auf Android: Menü → Zum Startbildschirm');
        return;
    }
    installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === 'accepted') { installEvent = null; hideInstallBtn(); showToast('App wird installiert...'); }
    else showToast('Installieren abgebrochen');
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
function dismissInstall() { hideInstallBtn(); sessionStorage.setItem('installDismissed', '1'); }
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
    toast.style.cssText = `position:fixed;bottom:calc(90px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);z-index:400;background:linear-gradient(135deg,#b0327a,#762c8c);color:#f3efdf;padding:12px 20px;border-radius:24px;font-size:0.85rem;font-weight:700;box-shadow:0 4px 16px rgba(0,0,0,0.3);max-width:90vw;text-align:center;opacity:0;`;
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

// ════════════════════════════════════════════════════════════════
// START
// ════════════════════════════════════════════════════════════════
init();
