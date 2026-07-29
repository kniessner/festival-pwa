const PAGES = [
    { slug: 'home', label: 'Home', icon: '🏠' },
    { slug: 'cashless', label: 'Cashless', icon: '💳' },
    { slug: 'performances', label: 'Acts', icon: '🎭' },
    { slug: 'workshops', label: 'Workshops', icon: '🛠️' }
];

let currentPage = 0;
let pageData = {};

async function init() {
    for (const page of PAGES) {
        if (page.dataFile) {
            try {
                const res = await fetch(`data/${page.dataFile}`);
                pageData[page.slug] = await res.json();
            } catch (e) {
                console.error('Failed to load', page.dataFile, e);
            }
        }
    }
    renderNav();
    loadPage(0);
    setupOfflineIndicator();
}

function renderNav() {
    const nav = document.getElementById('pageNav');
    nav.innerHTML = PAGES.map((p, i) =>
        `<button class="${i === currentPage ? 'active' : ''}" data-page="${i}">
            <span class="nav-icon">${p.icon}</span>
            <span class="nav-label">${p.label}</span>
        </button>`
    ).join('');
}

function loadPage(index) {
    currentPage = index;
    const page = PAGES[index];
    const container = document.getElementById('content');
    const title = document.getElementById('pageTitle');

    title.textContent = page.label === 'Home' ? 'Bucht der Träumer*' : page.label;
    container.innerHTML = '';

    if (page.slug === 'home') {
        renderHome(container);
    } else {
        const data = pageData[page.slug];
        if (data) {
            if (data.type === 'faq') renderFAQ(container, data);
            else if (data.type === 'grid') renderGrid(container, data);
        } else {
            container.innerHTML = '<div class="empty">Keine Inhalte verfügbar</div>';
        }
    }

    renderNav();
}

function renderHome(container) {
    container.innerHTML = `
        <div class="hero">
            <div class="hero-logo">🌊</div>
            <h2>Bucht der Träumer*</h2>
            <div class="hero-sub">Festival 2026</div>
            <div class="countdown">33</div>
            <div class="countdown-label">Tage bis zum Festival</div>
            <div class="quick-nav">
                <button class="quick-btn" onclick="loadPage(1)">💳 Cashless</button>
                <button class="quick-btn" onclick="loadPage(2)">🎭 Acts</button>
                <button class="quick-btn" onclick="loadPage(3)">🛠️ Workshops</button>
            </div>
        </div>

        <div class="info-section">
            <h3>📍 Wichtige Infos</h3>
            <div class="info-grid">
                <div class="info-card" onclick="loadPage(1)">
                    <span class="icon">💳</span>
                    <div class="label">100% Cashless</div>
                    <div class="desc">Lade dein Bändchen vor dem Festival auf</div>
                </div>
                <div class="info-card" onclick="loadPage(2)">
                    <span class="icon">🎭</span>
                    <div class="label">22+ Acts</div>
                    <div class="desc">Performances über das Wochenende</div>
                </div>
                <div class="info-card" onclick="loadPage(3)">
                    <span class="icon">🛠️</span>
                    <div class="label">38+ Workshops</div>
                    <div class="desc">Interaktive Workshops & Talks</div>
                </div>
                <div class="info-card">
                    <span class="icon">🎵</span>
                    <div class="label">Musik-Lineup</div>
                    <div class="desc">Wie immer erst auf dem Platz 😉</div>
                </div>
            </div>
        </div>
    `;
}

function renderFAQ(container, data) {
    container.innerHTML = `
        <div class="page-intro">${textToHtml(data.intro)}</div>
        <div class="faq-list">
            ${data.items.map((item, i) => `
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
            const answer = item.querySelector('.faq-answer');
            const toggle = item.querySelector('.faq-toggle');
            const isOpen = item.classList.contains('open');
            container.querySelectorAll('.faq-item').forEach(f => {
                f.classList.remove('open');
                f.querySelector('.faq-answer').style.display = 'none';
                f.querySelector('.faq-toggle').textContent = '+';
            });
            if (!isOpen) {
                item.classList.add('open');
                answer.style.display = 'block';
                toggle.textContent = '−';
            }
        });
    });
}

function renderGrid(container, data) {
    container.innerHTML = `
        <div class="page-intro">${textToHtml(data.intro)}</div>
        <div class="grid-list">
            ${data.items.map(item => `
                <div class="grid-card">
                    <h3>${escapeHtml(item.title)}</h3>
                    ${item.desc ? `<p>${escapeHtml(item.desc.substring(0, 200))}${item.desc.length > 200 ? '...' : ''}</p>` : ''}
                </div>
            `).join('')}
        </div>
    `;
}

function textToHtml(str) {
    if (!str) return '';
    return escapeHtml(str).replace(/\n/g, '<br>');
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

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

init();

// ===== INSTALL PROMPT =====
let installEvent = null;

function setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        installEvent = e;
        showInstallBtn();
    });
    window.addEventListener('appinstalled', () => {
        installEvent = null;
        hideInstallBtn();
    });
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
    sessionStorage.setItem('installDismissed', '1');
}

function showIosInstallHint() {
    const btn = document.getElementById('installBtn');
    if (!btn) return;
    btn.querySelector('.install-text').textContent = 'iOS: Teilen → "Zum Home-Bildschirm"';
    btn.classList.remove('hidden');
}

setupInstallPrompt();
