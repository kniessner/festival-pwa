import { loadData, loadManifest } from './store.js';
import { loadPage, renderNav } from './router.js';
import { setupSearch, scrollToItem } from './search.js';
import { setDay, toggleFilterPanel, resetFilters, toggleEventDetail } from './views/timetable.js';
import { switchInfoTab } from './views/info.js';
import { toggleFavFromCard } from './views/favorites.js';
import { setupInstallPrompt, setupOfflineIndicator } from './install.js';
import { PAGES } from './config.js';

async function init() {
    await loadData();
    renderNav();
    goToPage(0);
    setupOfflineIndicator();
    setupInstallPrompt();
    showLastUpdated();
    wireDelegation();
}

// loadPage() re-renders #content via innerHTML, so any page containing a
// #searchInput (currently: timetable) gets a brand-new node each visit.
// setupSearch() binds its 'input' listener directly to that node rather than
// delegating from a stable ancestor, so it must be re-run after every
// navigation for search to keep working (verified: without this, search never
// fires — reproduces identically in the pre-refactor app-v3.js, since its
// setupSearch() call happens once after the initial home-page load too, before
// any #searchInput exists).
function goToPage(index) {
    loadPage(index);
    setupSearch();
}

async function showLastUpdated() {
    const el = document.getElementById('lastUpdated');
    if (!el) return;
    const m = await loadManifest();
    if (m && m.synced_at) {
        el.textContent = `Stand: ${new Date(m.synced_at * 1000).toLocaleDateString('de-DE')}`;
    }
}

// Single accordion toggle for both FAQ panels and timetable events use their own handlers.
function toggleFaqItem(item) {
    const isOpen = item.classList.contains('open');
    const scope = item.closest('.info-panel') || item.closest('.faq-list') || document;
    scope.querySelectorAll('.faq-item.open').forEach(f => {
        f.classList.remove('open');
        const t = f.querySelector('.faq-toggle'); if (t) t.textContent = '+';
    });
    if (!isOpen) {
        item.classList.add('open');
        const t = item.querySelector('.faq-toggle'); if (t) t.textContent = '−';
    }
}

const actions = {
    'load-page': el => goToPage(parseInt(el.dataset.page, 10)),
    'toggle-fav': el => toggleFavFromCard(el, el.dataset.page, parseInt(el.dataset.index, 10)),
    'set-day': el => setDay(el.dataset.day),
    'toggle-filter': () => toggleFilterPanel(),
    'reset-filters': () => resetFilters(),
    'toggle-event': el => toggleEventDetail(el),
    'toggle-faq': el => toggleFaqItem(el),
    'switch-info-tab': el => switchInfoTab(el.dataset.tab),
    'search-jump': el => {
        const idx = parseInt(el.dataset.pageIdx, 10);
        const itemIndex = parseInt(el.dataset.index, 10);
        const tab = el.dataset.infoTab;
        goToPage(idx);
        if (tab) setTimeout(() => { switchInfoTab(tab); scrollToItem(PAGES[idx].slug, itemIndex); }, 400);
        else setTimeout(() => scrollToItem(PAGES[idx].slug, itemIndex), 300);
    }
};

function wireDelegation() {
    document.addEventListener('click', e => {
        const el = e.target.closest('[data-action]');
        if (!el) return;
        const fn = actions[el.dataset.action];
        if (fn) { e.stopPropagation(); fn(el); }
    });
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

init();
