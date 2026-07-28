import { store } from './store.js';
import { PAGES } from './config.js';
import { t } from './i18n.js';
import { renderHome } from './views/home.js';
import { renderTimetable } from './views/timetable.js';
import { renderGridTimetable } from './views/timetable-grid.js';
import { renderInfo } from './views/info.js';
import { renderFavorites } from './views/favorites.js';
import { getFavorites } from './favorites.js';

export function renderNav() {
    const nav = document.getElementById('pageNav');
    const favCount = getFavorites().length;
    nav.innerHTML = PAGES.map((p, i) => {
        const badge = p.slug === 'favorites' && favCount > 0 ? `<span class="nav-badge">${favCount}</span>` : '';
        return `<button class="${i === store.currentPage ? 'active' : ''}" data-action="load-page" data-page="${i}" data-slug="${p.slug}">
            <span class="nav-icon">${p.icon}${badge}</span>
            <span class="nav-label">${t(p.labelKey)}</span>
        </button>`;
    }).join('');
}

export function loadPage(index) {
    store.currentPage = index;
    const page = PAGES[index];
    document.body.className = `page-${page.slug} ${page.slug !== 'home' ? 'page-sub' : ''}`;
    const container = document.getElementById('content');
    if (page.slug === 'home') renderHome(container);



    const title = document.getElementById('pageTitle');

    title.textContent = t(page.labelKey);

    container.innerHTML = '';
    // document.getElementById('searchResults').innerHTML = '';
    if (page.slug === 'home') renderHome(container);
    else if (page.slug === 'favorites') renderFavorites(container);
    else if (page.slug === 'timetable') renderTimetable(container);
    else if (page.slug === 'grid') renderGridTimetable(container);
    else if (page.slug === 'info') renderInfo(container);
    else container.innerHTML = `<div class="empty">${t('common.noContent')}</div>`;
    renderNav();
}
