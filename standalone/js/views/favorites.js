import { store } from '../store.js';
import { PAGES, pageIdx } from '../config.js';
import { escapeHtml, card } from '../ui.js';
import { getFavorites, toggleFavorite } from '../favorites.js';
import { renderNav, loadPage } from '../router.js';

export function renderFavorites(container) {
    const favs = getFavorites();
    if (favs.length === 0) {
        container.innerHTML = `
            <div class="page-intro"><h3>⭐ Mein Plan</h3>
            <p style="margin-top:12px;">Noch keine Favoriten. Tippe auf den Stern ⭐ bei Events im Programm, um sie hier zu speichern.</p></div>
            <div class="quick-nav"><button class="quick-btn" data-action="load-page" data-page="${pageIdx('timetable')}">📅 Programm</button></div>`;
        return;
    }
    const grouped = {};
    for (const f of favs) {
        if (!grouped[f.page]) grouped[f.page] = [];
        const data = store.pageData[f.page];
        if (data && data.events && data.events[f.index]) {
            grouped[f.page].push({ ...data.events[f.index], index: f.index, page: f.page });
        } else if (data && data.items && data.items[f.index]) {
            grouped[f.page].push({ ...data.items[f.index], index: f.index, page: f.page });
        } else if (f.page.startsWith('info-') && store.pageData.info) {
            const sub = f.page.replace('info-', '');
            const subData = store.pageData.info[sub];
            if (subData && subData.items && subData.items[f.index]) {
                grouped[f.page].push({ ...subData.items[f.index], index: f.index, page: f.page });
            }
        }
    }
    let html = '<div class="page-intro"><h3>⭐ Mein Plan</h3></div>';
    for (const [slug, items] of Object.entries(grouped)) {
        let label = PAGES.find(p => p.slug === slug)?.label;
        if (!label) {
            if (slug === 'info-news') label = 'News';
            else if (slug === 'info-cashless') label = 'Cashless';
            else if (slug === 'info-faqs') label = 'FAQs';
            else label = slug;
        }
        html += `<div class="fav-group"><div class="fav-group-title">${escapeHtml(label)}</div>`;
        html += items.map(item => {
            const title = item.title || item.question;
            const desc = item.desc || item.answer || item.excerpt || '';
            const meta = item.time ? `<span class="event-meta">${escapeHtml(item.time)} · ${escapeHtml(item.stage_label || '')}</span>` : '';
            return card({ page: item.page, index: item.index, title, desc, meta });
        }).join('');
        html += '</div>';
    }
    container.innerHTML = html;
}

export function toggleFavFromCard(btn, pageSlug, itemIndex) {
    const isNowFav = toggleFavorite(pageSlug, itemIndex);
    btn.classList.toggle('active', isNowFav);
    renderNav();
    if (PAGES[store.currentPage].slug === 'favorites') loadPage(store.currentPage);
}
