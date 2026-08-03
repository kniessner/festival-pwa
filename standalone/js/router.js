import { store } from './store.js';
import { PAGES, pageIdx } from './config.js';
import { t } from './i18n.js';
import { renderHome } from './views/home.js';
import { renderTimetable } from './views/timetable.js';
import { renderGridTimetable } from './views/timetable-grid.js';
import { renderInfo } from './views/info.js';
import { renderFavorites } from './views/favorites.js';
import { countValidFavorites } from './favorites.js';

// External link, not an in-app route — opens in a real browser tab (via
// target="_blank") even when the PWA is running installed/standalone,
// rather than trying to load a payment widget inside the app's webview.
const CASHLESS_URL = 'https://widget.weezevent.com/pay/410675/widgets/c17f233e-6562-413e-9187-b6663d72afd2/login';

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

    const cashlessRow = `<a class="menu-item-link" href="${CASHLESS_URL}" target="_blank" rel="noopener noreferrer">
        <span class="menu-item-label">${t('nav.cashless')}</span>
        <span class="menu-item-external" aria-hidden="true">↗</span>
    </a>`;

    const festivalmapRow = `<span class="menu-item-disabled" aria-disabled="true">
        <span class="menu-item-label">${t('nav.festivalmap')}</span>
        <span class="menu-item-sublabel">${t('common.comingSoon')}</span>
    </span>`;

    list.innerHTML = pageRows + cashlessRow + festivalmapRow;
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
