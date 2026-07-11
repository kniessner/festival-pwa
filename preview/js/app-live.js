const WP_BASE = 'https://bucht-der-traeumer.de';

const PAGES = [
    { slug: '', label: 'Home', icon: '🏠' },
    { slug: 'cashless', label: 'Cashless & TOP-UP', icon: '💳' },
    { slug: 'performances', label: 'Performances', icon: '🎭' },
    { slug: 'workshops', label: 'Workshops', icon: '🛠️' }
];

let currentPage = 0;
let pageCache = {};

// ===== INIT =====
async function init() {
    renderNav();
    await loadPage(0);
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
async function loadPage(index) {
    const page = PAGES[index];
    const container = document.getElementById('content');
    const title = document.getElementById('pageTitle');

    title.textContent = page.label;
    container.innerHTML = '<div class="loading">Loading...⏳</div>';

    // Check cache first
    if (pageCache[page.slug]) {
        renderContent(pageCache[page.slug]);
        return;
    }

    try {
        const html = await fetchPage(page.slug);
        const data = extractContent(html, page.slug);
        pageCache[page.slug] = data;
        renderContent(data);
    } catch (err) {
        console.error('Failed to load', err);
        container.innerHTML = `
            <div class="empty">
                <p>Failed to load content</p>
                <button onclick="loadPage(${index})" style="margin-top:20px;padding:12px 24px;border-radius:24px;border:none;background:var(--accent);color:var(--bg-dark);font-weight:700;cursor:pointer;">Retry</button>
            </div>`;
    }
}

async function fetchPage(slug) {
    const url = slug ? `${WP_BASE}/${slug}` : WP_BASE;
    // Use a CORS proxy or direct fetch if allowed
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl);
    return res.text();
}

// ===== CONTENT EXTRACTION =====
function extractContent(html, slug) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Remove cookie banners, nav, footer
    doc.querySelectorAll('dialog, [class*="cookie"], [class*="consent"], nav, footer').forEach(el => el.remove());

    const main = doc.querySelector('main') || doc.body;

    if (slug === '') {
        // Homepage - extract countdown and key info
        const countdown = main.querySelector('[class*="countdown"], [class*="timer"]');
        const heroText = main.innerText.substring(0, 500);
        return {
            type: 'home',
            title: 'Bucht der Träumer*',
            countdown: countdown?.textContent?.trim() || '',
            description: heroText
        };
    }

    if (slug === 'cashless') {
        // Extract FAQ items
        const items = [...main.querySelectorAll('h3')].map(h => ({
            question: h.textContent.trim(),
            answer: h.parentElement?.querySelector('p')?.textContent?.trim() || ''
        }));
        const intro = main.querySelector('p')?.textContent?.trim() || '';
        return {
            type: 'faq',
            title: 'Cashless & TOP-UP',
            intro,
            items
        };
    }

    if (slug === 'performances' || slug === 'workshops') {
        // Extract grid items
        const items = [...main.querySelectorAll('h3')].map(h => {
            const card = h.closest('a') || h.parentElement;
            const allText = card?.textContent || '';
            const title = h.textContent.trim();
            const desc = allText.replace(title, '').trim();
            return { title, desc };
        }).filter(i => i.title && i.title !== 'KULTUR­PROGRAMM' && i.title !== slug.toUpperCase());

        const introP = main.querySelectorAll('p');
        const intro = Array.from(introP).slice(0, 2).map(p => p.textContent.trim()).join('\n');

        return {
            type: 'grid',
            title: slug === 'performances' ? 'Performances' : 'Workshops',
            intro,
            items
        };
    }

    return { type: 'raw', html: main.innerHTML };
}

// ===== RENDERING =====
function renderContent(data) {
    const container = document.getElementById('content');

    if (data.type === 'home') {
        container.innerHTML = `
            <div class="hero-section">
                <h2 style="font-size:2rem;color:var(--accent);margin-bottom:16px;">${escapeHtml(data.title)}</h2>
                ${data.countdown ? `<div class="countdown" style="font-size:1.5rem;font-weight:700;margin:20px 0;">${escapeHtml(data.countdown)}</div>` : ''}
                <p style="color:var(--text-muted);line-height:1.6;">${escapeHtml(data.description)}</p>
            </div>`;
    }

    else if (data.type === 'faq') {
        container.innerHTML = `
            <p style="color:var(--text-muted);margin-bottom:20px;line-height:1.6;">${escapeHtml(data.intro)}</p>
            <div class="faq-list">
                ${data.items.map((item, i) => `
                    <div class="faq-item" data-faq="${i}">
                        <div class="faq-question">
                            <span>${escapeHtml(item.question)}</span>
                            <span class="faq-toggle">+</span>
                        </div>
                        <div class="faq-answer" style="display:none">${escapeHtml(item.answer)}</div>
                    </div>
                `).join('')}
            </div>`;

        // Add click handlers
        container.querySelectorAll('.faq-item').forEach(item => {
            item.addEventListener('click', () => {
                const answer = item.querySelector('.faq-answer');
                const toggle = item.querySelector('.faq-toggle');
                const isOpen = answer.style.display === 'block';
                answer.style.display = isOpen ? 'none' : 'block';
                toggle.textContent = isOpen ? '+' : '−';
                item.classList.toggle('open', !isOpen);
            });
        });
    }

    else if (data.type === 'grid') {
        container.innerHTML = `
            <p style="color:var(--text-muted);margin-bottom:20px;line-height:1.6;">${escapeHtml(data.intro)}</p>
            <div class="grid-list">
                ${data.items.map(item => `
                    <div class="grid-card">
                        <h3>${escapeHtml(item.title)}</h3>
                        ${item.desc ? `<p>${escapeHtml(item.desc.substring(0, 120))}${item.desc.length > 120 ? '...' : ''}</p>` : ''}
                    </div>
                `).join('')}
            </div>`;
    }

    else {
        container.innerHTML = `<div style="padding:16px;">${data.html}</div>`;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// ===== INTERACTION =====
document.getElementById('pageNav').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-page]');
    if (!btn) return;
    currentPage = parseInt(btn.dataset.page);
    renderNav();
    loadPage(currentPage);
});

function setupOfflineIndicator() {
    const update = () => {
        const existing = document.querySelector('.offline-badge');
        if (!navigator.onLine) {
            if (!existing) {
                const badge = document.createElement('div');
                badge.className = 'offline-badge';
                badge.textContent = 'Offline — cached content';
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
