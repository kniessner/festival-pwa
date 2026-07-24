import { store } from './store.js';
import { PAGES, pageIdx } from './config.js';
import { escapeHtml } from './ui.js';

export function setupSearch() {
    const input = document.getElementById('searchInput');
    if (!input || input.dataset.searchBound) return;
    input.dataset.searchBound = 'true';
    input.addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        if (q.length < 2) {
            closeSearchModal();
            return;
        }
        doSearch(q);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeSearchModal();
    });
}

export function closeSearchModal() {
    const modal = document.getElementById('searchModal');
    if (modal) modal.classList.remove('open');
    const container = document.getElementById('searchResults');
    if (container) container.innerHTML = '';
}

function openSearchModal() {
    const modal = document.getElementById('searchModal');
    if (modal) modal.classList.add('open');
}

function doSearch(query) {
    const results = [];
    for (const [slug, data] of Object.entries(store.pageData)) {
        if (!data) continue;
        const pageLabel = PAGES.find(p => p.slug === slug)?.label || slug;
        // Timetable events
        if (data.events) {
            data.events.forEach((ev, i) => {
                const text = `${ev.title || ''} ${ev.excerpt || ''} ${ev.description || ''} ${ev.stage_label || ''} ${ev.type_label || ''} ${ev.hosts?.join(' ') || ''}`.toLowerCase();
                if (text.includes(query)) results.push({ page: slug, pageLabel, index: i, item: ev, isEvent: true });
            });
        }
        // Info view sub-sections (news, cashless, faqs)
        if (slug === 'info') {
            ['news', 'cashless', 'faqs'].forEach(sub => {
                const subData = data[sub];
                if (!subData || !subData.items) return;
                subData.items.forEach((item, i) => {
                    const text = `${item.question || ''} ${item.title || ''} ${item.desc || ''}`.toLowerCase();
                    if (text.includes(query)) results.push({ page: slug, pageLabel: `${pageLabel} · ${sub}`, index: i, item, infoTab: sub });
                });
            });
            continue;
        }
        // Direct items (old format fallback)
        if (data.items) {
            data.items.forEach((item, i) => {
                const text = `${item.question || ''} ${item.title || ''} ${item.desc || ''}`.toLowerCase();
                if (text.includes(query)) results.push({ page: slug, pageLabel, index: i, item });
            });
        }
    }
    renderSearchResults(results, query);
}

function renderSearchResults(results, query) {
    const container = document.getElementById('searchResults');
    if (!container) return;
    openSearchModal();
    if (results.length === 0) {
        container.innerHTML = `<div class="empty">Keine Ergebnisse für "${escapeHtml(query)}"</div>`;
        return;
    }
    container.innerHTML = results.map(r => {
        const title = r.item.title || r.item.question || 'Item';
        const desc = r.item.desc || r.item.answer || r.item.excerpt || '';
        const meta = r.item.time ? `${escapeHtml(r.item.time)} · ${escapeHtml(r.item.stage_label || '')}` : '';
        const infoTabAttr = r.infoTab ? ` data-info-tab="${r.infoTab}"` : '';
        return `
        <div class="grid-card search-card" data-action="search-jump" data-page-idx="${pageIdx(r.page)}" data-index="${r.index}"${infoTabAttr}>
            <div class="search-meta">${escapeHtml(r.pageLabel)}${meta ? ' · ' + meta : ''}</div>
            <h3>${escapeHtml(title)}</h3>
            ${desc ? `<p>${escapeHtml(desc.substring(0, 120))}${desc.length > 120 ? '...' : ''}</p>` : ''}
        </div>`;
    }).join('');
}

export function scrollToItem(pageSlug, itemIndex) {
    // Scope to the rendered page and prefer a *visible* match: the News, Cashless
    // and FAQ panels reuse the same data-item-index values, so an unscoped lookup
    // could land on an item inside a hidden (inactive) info panel. The search-jump
    // handler activates the correct info tab before calling this, so the matching
    // item is the one whose panel is currently displayed.
    const candidates = document.querySelectorAll(`#content [data-item-index="${itemIndex}"]`);
    let target = null;
    for (const el of candidates) {
        if (el.offsetParent !== null) { target = el; break; }
    }
    if (!target) target = candidates[0];
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('highlight');
    setTimeout(() => target.classList.remove('highlight'), 2000);
}
