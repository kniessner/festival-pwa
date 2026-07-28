import { store } from '../store.js';
import { PAGES } from '../config.js';
import { escapeHtml, card } from '../ui.js';
import { getFavorites, toggleFavorite } from '../favorites.js';
import { renderNav, loadPage } from '../router.js';
import { renderEventCard } from './timetable.js';
import { t } from '../i18n.js';

function emptyStateCard(message) {
    return `<div class="fav-empty-card">${escapeHtml(message)}</div>`;
}

export function renderFavorites(container) {
    const favs = getFavorites();
    if (favs.length === 0) {
        container.innerHTML = emptyStateCard(t('fav.emptyHint'));
        return;
    }

    const programByDay = {};
    const newsItems = [];
    for (const f of favs) {
        if (f.page === 'timetable') {
            const ev = store.pageData.timetable?.events?.[f.index];
            if (ev) {
                const day = ev.day || 'no-day';
                if (!programByDay[day]) programByDay[day] = [];
                programByDay[day].push(ev);
            }
        } else if (f.page.startsWith('info-')) {
            const sub = f.page.replace('info-', '');
            const item = store.pageData.info?.[sub]?.items?.[f.index];
            if (item) newsItems.push({ item, index: f.index, page: f.page });
        }
    }

    const programCount = Object.values(programByDay).reduce((n, arr) => n + arr.length, 0);
    const newsCount = newsItems.length;

    if (store.favTab === 'program' && programCount === 0 && newsCount > 0) store.favTab = 'news';
    else if (store.favTab === 'news' && newsCount === 0 && programCount > 0) store.favTab = 'program';

    let html = `<div class="fav-tabs">
        <button class="fav-tab ${store.favTab === 'program' ? 'active' : ''}" data-action="set-fav-tab" data-tab="program">${t('fav.tabProgram')}</button>
        <button class="fav-tab ${store.favTab === 'news' ? 'active' : ''}" data-action="set-fav-tab" data-tab="news">${t('fav.tabNews')}</button>
    </div>`;

    if (store.favTab === 'program') {
        if (programCount === 0) {
            html += emptyStateCard(t('fav.emptyHint'));
        } else {
            const dayOrder = (store.pageData.timetable.filters.days || []).map(d => d.value);
            const sortedDays = Object.keys(programByDay).sort((a, b) => {
                const ai = dayOrder.indexOf(a), bi = dayOrder.indexOf(b);
                if (ai === -1) return 1;
                if (bi === -1) return -1;
                return ai - bi;
            });
            html += sortedDays.map(day => {
                const events = programByDay[day];
                if (!events.length) return '';
                const dayLabel = store.pageData.timetable.filters.days.find(d => d.value === day)?.label || t('fav.noDay');
                return `<div class="fav-day-heading">${escapeHtml(dayLabel)}</div>
                    <div class="tt-events">${events.map(renderEventCard).join('')}</div>`;
            }).join('');
        }
    } else {
        if (newsCount === 0) {
            html += emptyStateCard(t('fav.emptyHint'));
        } else {
            html += `<div class="grid-list">${newsItems.map(({ item, index, page }) => {
                const title = item.title || item.question;
                const desc = item.desc || item.answer || item.excerpt || '';
                return card({ page, index, title, desc });
            }).join('')}</div>`;
        }
    }

    container.innerHTML = html;
}

export function setFavTab(tab) {
    store.favTab = tab;
    renderFavorites(document.getElementById('content'));
}

export function toggleFavFromCard(btn, pageSlug, itemIndex) {
    const isNowFav = toggleFavorite(pageSlug, itemIndex);
    btn.classList.toggle('active', isNowFav);
    renderNav();
    if (PAGES[store.currentPage].slug === 'favorites') loadPage(store.currentPage);
}
