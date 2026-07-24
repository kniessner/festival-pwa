import { loadData, loadManifest } from './store.js';
import { loadPage, renderNav } from './router.js';
import { setupSearch, scrollToItem, closeSearchModal } from './search.js';
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
    setupUpdateBanner();
    showLastUpdated();
    wireDelegation();
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
        <span>Neue Version verfügbar</span>
        <button id="sw-update-now">Aktualisieren</button>
        <button id="sw-update-later">Später</button>
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
        closeSearchModal();
        document.getElementById('searchInput').value = '';
        goToPage(idx);
        if (tab) setTimeout(() => { switchInfoTab(tab); scrollToItem(PAGES[idx].slug, itemIndex); }, 400);
        else setTimeout(() => scrollToItem(PAGES[idx].slug, itemIndex), 300);
    },
    'close-search': () => closeSearchModal()
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
