import { loadData, loadManifest } from './store.js';
import { loadPage, renderNav } from './router.js';
import { setupSearch, scrollToItem, closeSearchModal } from './search.js';
import { setDay, toggleFilterPanel, resetFilters, toggleEventDetail } from './views/timetable.js';
import { setGridDay, openGridEventDetail, closeGridEventDetail, toggleGridScrollMode } from './views/timetable-grid.js';
import { store } from './store.js';
import { switchInfoTab } from './views/info.js';
import { toggleFavFromCard, setFavTab } from './views/favorites.js';
import { setupInstallPrompt, setupOfflineIndicator } from './install.js';
import { PAGES, pageIdx } from './config.js';
import { t, setLang } from './i18n.js';

async function init() {
    document.documentElement.lang = store.lang;
    document.getElementById('searchInput').placeholder = t('search.placeholder');
    document.querySelector('.search-modal-header span').textContent = t('search.resultsTitle');
    updateLangToggleUI();
    await loadData();
    renderNav();
    goToPage(0);
    setupOfflineIndicator();
    setupInstallPrompt();
    setupUpdateBanner();
    showLastUpdated();
    wireDelegation();
}

function toggleSearchBar() {
    const bar = document.getElementById('searchBar');
    const isOpen = bar.classList.toggle('open');
    if (isOpen) {
        setTimeout(() => document.getElementById('searchInput').focus(), 260);
    } else {
        closeSearchBar();
    }
}

function closeSearchBar() {
    document.getElementById('searchBar').classList.remove('open');
    document.getElementById('searchInput').value = '';
    closeSearchModal();
}

function updateLangToggleUI() {
    document.querySelectorAll('#langToggle button').forEach(b => {
        b.classList.toggle('active', b.dataset.lang === store.lang);
    });
}

async function setLangAndRefresh(lang) {
    if (lang === store.lang) return;
    setLang(lang);
    store.lang = lang;
    updateLangToggleUI();
    document.getElementById('searchInput').placeholder = t('search.placeholder');
    document.querySelector('.search-modal-header span').textContent = t('search.resultsTitle');
    await loadData();
    renderNav();
    goToPage(store.currentPage);
}

function setupUpdateBanner() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.addEventListener('message', event => {
        if (event.data?.type === 'UPDATE_AVAILABLE') {
            showUpdateBanner();
        }
    });

    navigator.serviceWorker.register('sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    showUpdateBanner(newWorker);
                }
            });
        });
    }).catch(() => {});
}

let updateWorker = null;
function showUpdateBanner(worker = null) {
    if (document.getElementById('sw-update-banner')) return;
    if (worker) updateWorker = worker;

    const banner = document.createElement('div');
    banner.id = 'sw-update-banner';
    banner.className = 'update-banner';
    banner.innerHTML = `
        <span>${t('install.updateAvailable')}</span>
        <button id="sw-update-now">${t('install.updateNow')}</button>
        <button id="sw-update-later">${t('install.updateLater')}</button>
    `;
    document.body.appendChild(banner);

    document.getElementById('sw-update-now').addEventListener('click', () => {
        if (updateWorker) updateWorker.postMessage({ type: 'SKIP_WAITING' });
        banner.remove();
        window.location.reload();
    });
    document.getElementById('sw-update-later').addEventListener('click', () => banner.remove());
}

// setupSearch() guards against double-binding its listener, so calling it
// on every navigation is a harmless no-op once #searchInput is already wired.
function goToPage(index) {
    loadPage(index);
    setupSearch();
}

async function showLastUpdated() {
    const el = document.getElementById('lastUpdated');
    if (!el) return;
    const m = await loadManifest();
    if (m && m.synced_at) {
        const date = new Date(m.synced_at * 1000).toLocaleDateString(store.lang === 'en' ? 'en-GB' : 'de-DE');
        el.textContent = t('common.updatedOn', { date });
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
    'set-fav-tab': el => setFavTab(el.dataset.tab),
    'set-day': el => setDay(el.dataset.day),
    'toggle-filter': () => toggleFilterPanel(),
    'reset-filters': () => resetFilters(),
    'toggle-event': el => toggleEventDetail(el),
    'set-grid-day': el => setGridDay(el.dataset.day),
    'toggle-grid-event': el => openGridEventDetail(el),
    'close-grid-detail': () => closeGridEventDetail(),
    'toggle-grid-scroll': () => toggleGridScrollMode(),
    'toggle-faq': el => toggleFaqItem(el),
    'set-lang': el => setLangAndRefresh(el.dataset.lang),
    'switch-info-tab': el => switchInfoTab(el.dataset.tab),
    'toggle-search-bar': () => toggleSearchBar(),
    'close-search-bar': () => closeSearchBar(),
    'search-jump': el => {
        const idx = parseInt(el.dataset.pageIdx, 10);
        const itemIndex = parseInt(el.dataset.index, 10);
        const tab = el.dataset.infoTab;
        closeSearchBar();
        goToPage(idx);
        if (tab) setTimeout(() => { switchInfoTab(tab); scrollToItem(PAGES[idx].slug, itemIndex); }, 400);
        else setTimeout(() => scrollToItem(PAGES[idx].slug, itemIndex), 300);
    },
    'close-search': () => closeSearchModal(),
    'goto-event': el => {
        const itemIndex = parseInt(el.dataset.index, 10);
        if (el.dataset.day) store.ttPendingDay = el.dataset.day;
        const idx = pageIdx('timetable');
        goToPage(idx);
        setTimeout(() => scrollToItem('timetable', itemIndex), 300);
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

init();
