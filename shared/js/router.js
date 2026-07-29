import { store } from './store.js';
import { PAGES } from './config.js';
import { escapeHtml, textToHtml } from './ui.js';

export function renderNav() {
    const nav = document.getElementById('pageNav');
    const pages = store.pages.length ? store.pages : PAGES;
    nav.innerHTML = pages.map((p, i) => `
        <button class="${i === store.currentPage ? 'active' : ''}" data-action="load-page" data-page="${i}">
            <span class="nav-icon">${p.icon || '📄'}</span>
            <span class="nav-label">${p.label}</span>
        </button>
    `).join('');
}

export function loadPage(index) {
    store.currentPage = index;
    const pages = store.pages.length ? store.pages : PAGES;
    const page = pages[index];
    const appHeader = document.getElementById('app-header');
    const container = document.getElementById('content');
    const title = document.getElementById('pageTitle');
    const searchResults = document.getElementById('searchResults');

    if (!page) {
        container.innerHTML = '<div class="empty">Seite nicht gefunden</div>';
        return;
    }

    appHeader.style.display = page.slug === 'home' ? 'none' : '';
    title.textContent = page.label;
    container.innerHTML = '<div class="loading">Laden...⏳</div>';
    if (searchResults) searchResults.innerHTML = '';

    const data = store.pageData[page.slug];
    if (data) {
        renderContent(container, page, data);
    } else {
        container.innerHTML = `<div class="empty">
            <p>Keine Inhalte für "${escapeHtml(page.label)}" verfügbar.</p>
            <p style="font-size:0.85em;color:var(--text-muted);margin-top:8px;">Bitte im WordPress-Admin unter „Festival PWA“ die Seiten auswählen und „Sync Content Now“ klicken.</p>
        </div>`;
    }
    renderNav();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderContent(container, page, data) {
    const type = data.type || 'generic';

    if (type === 'raw') {
        renderRaw(container, data);
    } else if (type === 'snapshot') {
        renderSnapshot(container, data);
    } else if (type === 'faq') {
        renderFaq(container, page, data);
    } else if (type === 'grid') {
        renderGrid(container, page, data);
    } else if (type === 'home' || page.slug === 'home') {
        renderHome(container, page, data);
    } else {
        renderGeneric(container, page, data);
    }
}

function renderRaw(container, data) {
    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'raw-content';
    container.appendChild(wrapper);

    const shadow = wrapper.attachShadow({ mode: 'open' });
    (data.styles || []).forEach(style => {
        if (style.type === 'inline' && style.css) {
            const s = document.createElement('style');
            s.textContent = style.css;
            shadow.appendChild(s);
        } else if (style.type === 'link' && style.href) {
            const l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = style.href;
            shadow.appendChild(l);
        }
    });
    const reset = document.createElement('style');
    reset.textContent = `
        :host { display: block; color: var(--text, #f3efdf); font-family: var(--font-body, 'Lato', sans-serif); }
        img { max-width: 100%; height: auto; }
        a { color: inherit; }
        * { box-sizing: border-box; }
    `;
    shadow.appendChild(reset);
    const main = document.createElement('main');
    main.innerHTML = data.html || '<p>Kein Inhalt verfügbar.</p>';
    shadow.appendChild(main);
}

function renderSnapshot(container, data) {
    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'snapshot-content-host';
    const shadow = wrapper.attachShadow({ mode: 'open' });

    const render = (html) => {
        shadow.innerHTML = html;
    };

    const showError = (err) => {
        shadow.innerHTML = `<div style="padding:20px;color:#f3efdf;">
            <p>Fehler beim Laden des Snapshots.</p>
            <p style="font-size:0.85em;color:var(--text-muted);">${escapeHtml(err.message)}</p>
        </div>`;
    };

    if (data.fragment_url) {
        fetch(data.fragment_url)
            .then(res => { if (!res.ok) throw new Error(`Fragment HTTP ${res.status}`); return res.text(); })
            .then(render)
            .catch(err => {
                if (data.snapshot_url) {
                    fetch(data.snapshot_url)
                        .then(res => { if (!res.ok) throw new Error(`Snapshot HTTP ${res.status}`); return res.text(); })
                        .then(render)
                        .catch(showError);
                } else {
                    showError(err);
                }
            });
    } else if (data.snapshot_url) {
        fetch(data.snapshot_url)
            .then(res => { if (!res.ok) throw new Error(`Snapshot HTTP ${res.status}`); return res.text(); })
            .then(render)
            .catch(showError);
    } else {
        showError(new Error('No snapshot URL'));
    }

    container.appendChild(wrapper);
}

function renderHome(container, page, data) {
    const pages = store.pages.length ? store.pages.filter(p => p.slug !== 'home') : PAGES.slice(1);
    container.innerHTML = `
        <div class="hero">
            <div class="hero-logo">🌊</div>
            <h2>${escapeHtml(data.title || page.label || 'Bucht der Träumer*')}</h2>
            <div class="hero-sub">Festival 2026</div>
            ${data.countdown ? `<div class="countdown">${escapeHtml(data.countdown)}</div>` : ''}
            <div class="countdown-label">Tage bis zum Festival</div>
            <div class="quick-nav">${pages.map((p, i) => `
                <button class="quick-btn" data-action="load-page" data-page="${i + 1}">${p.icon || ''} ${escapeHtml(p.label)}</button>
            `).join('')}</div>
        </div>
        <div class="info-section">
            <h3>📍 Wichtige Infos</h3>
            <div class="info-grid">${pages.map(p => `
                <div class="info-card" data-action="load-page" data-page="${store.pages.findIndex(x => x.slug === p.slug) || (PAGES.findIndex(x => x.slug === p.slug) + 1)}">
                    <span class="icon">${p.icon || '📄'}</span>
                    <div class="label">${escapeHtml(p.label)}</div>
                    <div class="desc">${escapeHtml(p.slug)}</div>
                </div>
            `).join('')}</div>
        </div>
    `;
}

function renderFaq(container, page, data) {
    container.innerHTML = `
        <div class="page-intro">${textToHtml(data.intro)}</div>
        <div class="faq-list">
            ${(data.items || []).map((item, i) => `
                <div class="faq-item" data-faq="${i}">
                    <div class="faq-question">
                        <span>${escapeHtml(item.question)}</span>
                        <span class="faq-toggle">+</span>
                    </div>
                    <div class="faq-answer" style="display:none;">${item.answer ? escapeHtml(item.answer) : 'Details folgen bald.'}</div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderGrid(container, page, data) {
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

function renderGeneric(container, page, data) {
    container.innerHTML = `
        <div class="page-intro">
            <h2>${escapeHtml(data.title || page.label)}</h2>
            <div style="margin-top:12px;line-height:1.7;color:var(--text-muted);">${textToHtml(data.content || '')}</div>
        </div>
    `;
}

export function gotoPage(slug) {
    const idx = store.pages.findIndex(p => p.slug === slug);
    if (idx >= 0) loadPage(idx);
}
