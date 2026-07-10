const PAGES = [
    { slug: 'home', label: 'Home', icon: '🏠', dataFile: null },
    { slug: 'cashless', label: 'Cashless & TOP-UP', icon: '💳', dataFile: 'cashless.json' },
    { slug: 'performances', label: 'Performances', icon: '🎭', dataFile: 'performances.json' },
    { slug: 'workshops', label: 'Workshops', icon: '🛠️', dataFile: 'workshops.json' }
];

let currentPage = 0;
let pageData = {};
let pageCache = {};

// ===== INIT =====
async function init() {
    // Load all page data upfront
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

// ===== NAVIGATION =====
function renderNav() {
    const nav = document.getElementById('pageNav');
    nav.innerHTML = PAGES.map((p, i) =>
        `<button class="${i === currentPage ? 'active' : ''}" data-page="${i}">
            <span class="nav-icon">${p.icon}</span>
            <span class="nav-label">${p.label}</span>
        </button>`
    ).join('');
}

// ===== PAGE LOADING =====
function loadPage(index) {
    currentPage = index;
    const page = PAGES[index];
    const container = document.getElementById('content');
    const title = document.getElementById('pageTitle');

    title.textContent = page.label;
    container.innerHTML = '';

    if (page.slug === 'home') {
        renderHome(container);
    } else {
        const data = pageData[page.slug];
        if (data) {
            if (data.type === 'faq') renderFAQ(container, data);
            else if (data.type === 'grid') renderGrid(container, data);
        } else {
            container.innerHTML = '<div class="empty">Failed to load content</div>';
        }
    }

    renderNav();
}

// ===== HOME =====
function renderHome(container) {
    container.innerHTML = `
        <div class="hero-card">
            <div class="hero-logo" style="font-size:4rem;text-align:center;margin-bottom:12px;">🌊</div>
            <h2 style="text-align:center;color:var(--accent);font-size:1.6rem;margin-bottom:8px;">Bucht der Träumer*</h2>
            <p style="text-align:center;color:var(--text-muted);font-size:0.9rem;">Festival 2026</p>
            <div class="countdown" style="text-align:center;margin:24px 0;font-size:1.8rem;font-weight:700;color:var(--accent);">
                33 TAGE
            </div>
            <p style="text-align:center;color:var(--text-muted);line-height:1.6;padding:0 20px;">
                Dein Guide für das Festival.\nAlle Infos offline verfügbar.
            </p>
            <div style="display:flex;gap:12px;justify-content:center;margin-top:24px;flex-wrap:wrap;">
                <button onclick="loadPage(1)" style="padding:14px 24px;border-radius:24px;border:none;background:var(--accent);color:var(--bg-dark);font-weight:700;font-size:0.95rem;cursor:pointer;">💳 Cashless</button>
                <button onclick="loadPage(2)" style="padding:14px 24px;border-radius:24px;border:none;background:var(--accent);color:var(--bg-dark);font-weight:700;font-size:0.95rem;cursor:pointer;">🎭 Performances</button>
                <button onclick="loadPage(3)" style="padding:14px 24px;border-radius:24px;border:none;background:var(--accent);color:var(--bg-dark);font-weight:700;font-size:0.95rem;cursor:pointer;">🛠️ Workshops</button>
            </div>
        </div>

        <div class="section-card" style="margin-top:16px;">
            <h3 style="color:var(--accent);margin-bottom:12px;font-size:1.1rem;">📍 Wichtige Infos</h3>
            <div class="info-grid" style="display:grid;gap:12px;">
                <div class="info-item" style="background:rgba(196,112,58,0.1);border-radius:12px;padding:16px;">
                    <div style="font-size:1.4rem;margin-bottom:8px;">💳</div>
                    <div style="font-weight:700;color:var(--text);">100% Cashless</div>
                    <div style="font-size:0.85rem;color:var(--text-muted);margin-top:4px;">Lade dein Bändchen vor dem Festival auf</div>
                </div>
                <div class="info-item" style="background:rgba(196,112,58,0.1);border-radius:12px;padding:16px;">
                    <div style="font-size:1.4rem;margin-bottom:8px;">🎭</div>
                    <div style="font-weight:700;color:var(--text);">Performances</div>
                    <div style="font-size:0.85rem;color:var(--text-muted);margin-top:4px;">22+ Acts über das Wochenende</div>
                </div>
                <div class="info-item" style="background:rgba(196,112,58,0.1);border-radius:12px;padding:16px;">
                    <div style="font-size:1.4rem;margin-bottom:8px;">🛠️</div>
                    <div style="font-weight:700;color:var(--text);">Workshops</div>
                    <div style="font-size:0.85rem;color:var(--text-muted);margin-top:4px;">38+ interaktive Workshops & Talks</div>
                </div>
                <div class="info-item" style="background:rgba(196,112,58,0.1);border-radius:12px;padding:16px;">
                    <div style="font-size:1.4rem;margin-bottom:8px;">🎵</div>
                    <div style="font-weight:700;color:var(--text);">Musik-Lineup</div>
                    <div style="font-size:0.85rem;color:var(--text-muted);margin-top:4px;">Wie immer erst auf dem Platz 😉</div>
                </div>
            </div>
        </div>
    `;
}

// ===== FAQ =====
function renderFAQ(container, data) {
    container.innerHTML = `
        <p style="color:var(--text-muted);margin-bottom:20px;line-height:1.6;font-size:0.95rem;">${escapeHtml(data.intro)}</p>
        <div class="faq-list">
            ${data.items.map((item, i) => `
                <div class="faq-item" data-faq="${i}">
                    <div class="faq-question">
                        <span>${escapeHtml(item.question)}</span>
                        <span class="faq-toggle">+</span>
                    </div>
                    <div class="faq-answer" style="display:none">${item.answer ? escapeHtml(item.answer) : 'Details werden noch hinzugefügt.'}</div>
                </div>
            `).join('')}
        </div>
    `;

    container.querySelectorAll('.faq-item').forEach(item => {
        item.addEventListener('click', () => {
            const answer = item.querySelector('.faq-answer');
            const toggle = item.querySelector('.faq-toggle');
            const isOpen = answer.style.display === 'block';
            // Close all others
            container.querySelectorAll('.faq-answer').forEach(a => a.style.display = 'none');
            container.querySelectorAll('.faq-toggle').forEach(t => t.textContent = '+');
            // Open this one
            answer.style.display = isOpen ? 'none' : 'block';
            toggle.textContent = isOpen ? '+' : '−';
        });
    });
}

// ===== GRID =====
function renderGrid(container, data) {
    container.innerHTML = `
        <p style="color:var(--text-muted);margin-bottom:20px;line-height:1.6;font-size:0.95rem;">${escapeHtml(data.intro)}</p>
        <div class="grid-list">
            ${data.items.map((item, i) => `
                <div class="grid-card">
                    <h3>${escapeHtml(item.title)}</h3>
                    ${item.desc ? `<p>${escapeHtml(item.desc.substring(0, 200))}${item.desc.length > 200 ? '...' : ''}</p>` : ''}
                </div>
            `).join('')}
        </div>
    `;
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

// ===== START =====
init();
