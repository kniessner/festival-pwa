import { store } from './store.js';
import { escapeHtml } from './ui.js';

export function setupSearch() {
    const input = document.getElementById('searchInput');
    if (!input) return;
    // remove old listener if any by cloning
    const clean = input.cloneNode(true);
    input.parentNode.replaceChild(clean, input);
    clean.addEventListener('input', (e) => {
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
    for (const [slug, data] of Object.entries(store.pageData)) {
        if (!data) continue;
        const page = store.pages.find(p => p.slug === slug);
        const pageLabel = page?.label || slug;

        if (data.items) {
            data.items.forEach((item, i) => {
                const text = `${item.question || ''} ${item.title || ''} ${item.desc || ''} ${item.answer || ''}`.toLowerCase();
                if (text.includes(query)) results.push({ page: slug, pageLabel, index: i, item });
            });
        }
        if (data.events) {
            data.events.forEach((ev, i) => {
                const text = `${ev.title || ''} ${ev.excerpt || ''} ${ev.description || ''} ${ev.stage_label || ''}`.toLowerCase();
                if (text.includes(query)) results.push({ page: slug, pageLabel, index: i, item: ev });
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
        const idx = store.pages.findIndex(p => p.slug === r.page);
        return `
        <div class="grid-card search-card" data-action="load-page" data-page="${idx >= 0 ? idx : 0}">
            <div class="search-meta">${escapeHtml(r.pageLabel)}</div>
            <h3>${escapeHtml(title)}</h3>
            ${desc ? `<p>${escapeHtml(desc.substring(0, 120))}${desc.length > 120 ? '...' : ''}</p>` : ''}
        </div>`;
    }).join('');
}

export function scrollToItem(pageSlug, itemIndex) {
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
