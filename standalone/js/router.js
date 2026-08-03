import { store } from './store.js';
import { PAGES, pageIdx } from './config.js';
import { t } from './i18n.js';
import { renderHome } from './views/home.js';
import { renderTimetable } from './views/timetable.js';
import { renderGridTimetable } from './views/timetable-grid.js';
import { renderInfo } from './views/info.js';
import { renderFavorites } from './views/favorites.js';
import { countValidFavorites } from './favorites.js';

export function renderNav() {
    const triggerLabel = document.getElementById('menuTriggerLabel');
    if (triggerLabel) triggerLabel.textContent = t(PAGES[store.currentPage]?.labelKey ?? 'nav.home');

    const list = document.getElementById('menuNavList');
    if (!list) return;
    const favCount = countValidFavorites();

    const pageRows = PAGES
        .filter(p => p.slug !== 'home')
        .map(p => {
            const index = pageIdx(p.slug);
            const badge = p.slug === 'favorites' && favCount > 0 ? `<span class="nav-badge">${favCount}</span>` : '';
            return `<button class="${index === store.currentPage ? 'active' : ''}" data-action="load-page" data-page="${index}" data-slug="${p.slug}">
                <span class="menu-item-label">${t(p.labelKey)}${badge}</span>
            </button>`;
        }).join('');

    const festivalmapRow = `<span class="menu-item-disabled" aria-disabled="true">
        <span class="menu-item-label">${t('nav.festivalmap')}</span>
        <span class="menu-item-sublabel">${t('common.comingSoon')}</span>
    </span>`;

    list.innerHTML = pageRows + festivalmapRow;
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
