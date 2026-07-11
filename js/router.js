import { store } from './store.js';
import { PAGES } from './config.js';
import { renderHome } from './views/home.js';
import { renderTimetable } from './views/timetable.js';
import { renderInfo } from './views/info.js';
import { renderFavorites } from './views/favorites.js';
import { getFavorites } from './favorites.js';

export function renderNav() {
    const nav = document.getElementById('pageNav');
    const favCount = getFavorites().length;
    nav.innerHTML = PAGES.map((p, i) => {
        const badge = p.slug === 'favorites' && favCount > 0 ? `<span class="nav-badge">${favCount}</span>` : '';
        return `<button class="${i === store.currentPage ? 'active' : ''}" data-action="load-page" data-page="${i}">
            <span class="nav-icon">${p.icon}${badge}</span>
            <span class="nav-label">${p.label}</span>
        </button>`;
    }).join('');
}

export function loadPage(index) {
    store.currentPage = index;
    const page = PAGES[index];
    const appHeader = document.getElementById('app-header');
    const container = document.getElementById('content');
    const title = document.getElementById('pageTitle');
    appHeader.style.display = page.slug === 'home' ? 'none' : '';
    title.textContent = page.label;
    container.innerHTML = '';
    document.getElementById('searchResults').innerHTML = '';
    if (page.slug === 'home') renderHome(container);
    else if (page.slug === 'favorites') renderFavorites(container);
    else if (page.slug === 'timetable') renderTimetable(container);
    else if (page.slug === 'info') renderInfo(container);
    else container.innerHTML = '<div class="empty">Keine Inhalte verfügbar</div>';
    renderNav();
}
