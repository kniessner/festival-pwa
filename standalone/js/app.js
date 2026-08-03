import { loadData, loadManifest } from './store.js';
import { loadPage, renderNav } from './router.js';
import { setupSearch, scrollToItem, closeSearchModal } from './search.js';
import { setDay, toggleFilterPanel, resetFilters, toggleEventDetail, setFilterValue } from './views/timetable.js';
import { setGridDay, openGridEventDetail, closeGridEventDetail, toggleGridScrollMode } from './views/timetable-grid.js';
import { store } from './store.js';
import { switchInfoTab } from './views/info.js';
import { toggleFavFromCard, setFavTab } from './views/favorites.js';
import { setupInstallTracking, setupOfflineIndicator, dismissInstallCard, triggerInstall } from './install.js';
import { showToast } from './ui.js';
import { PAGES, pageIdx } from './config.js';
import { t, setLang } from './i18n.js';
import { maybeShowNotifications, closeNotifications, setupNotificationsRefresh, showAllNotifications } from './notifications.js';
import { openMenu, closeMenu } from './menu.js';
import { mergeMusicIntoTimetable, refreshMusic } from './music.js';
import { showLocationPromptIfNeeded, onboardingAllow, onboardingNotNow } from './onboarding.js';
import { loadStages, warnStageNameMismatches } from './helpers/get-stage.js';

const LANG_LABELS = { de: 'De', en: 'Eng' };

async function init() {
    document.documentElement.lang = store.lang;
    document.getElementById('searchInput').placeholder = t('search.placeholder');
    document.querySelector('.search-modal-header span').textContent = t('search.resultsTitle');
    document.getElementById('notificationsTitle').textContent = t('notifications.title');
    document.getElementById('notificationsDoneBtn').textContent = t('common.done');
    updateLangSwitcherLabel();
    updateHeaderFilterLabel();
    // Parallel-load timetable/info data and stage polygons — they're
    // independent files, no reason to serialise the round-trips.
    await Promise.all([loadData(), loadStages()]);
    // Boot-time sanity check: warn about drift between timetable.json's
    // stage slugs and stages.geojson polygon names before the nav is
    // interactive, so a fast user who navigates straight to the grid
    // still hits the warning in their console. See helpers/get-stage.js.
    warnStageNameMismatches(store.pageData.timetable?.filters);
    mergeMusicIntoTimetable();
    renderNav();
    // manifest.json's start_url passes ?page=favorites so launching the
    // installed home-screen app opens My Plan directly; a plain browser
    // visit (no query param) still lands on Home as before.
    const requestedPage = new URLSearchParams(location.search).get('page');
    goToPage(requestedPage ? Math.max(0, pageIdx(requestedPage)) : 0);
    setupOfflineIndicator();
    setupInstallTracking(refreshInstallCardIfVisible);
    setupUpdateBanner();
    showLastUpdated();
    wireDelegation();
    // Onboarding awaited BEFORE notifications so first-launch users
    // don't see both modals stacked. Returning users go through this
    // instantly (sticky flag or already-granted permission).
    await showLocationPromptIfNeeded();
    maybeShowNotifications();
    setupNotificationsRefresh();
    setupMusicRefresh();
}

// Merging fresh music into store.pageData.timetable doesn't by itself update
// whatever's already on screen — the Program list / grid Timetable render
// once from a snapshot. If the user is looking at either when new music
// data comes in, re-render so it actually becomes visible without them
// having to navigate away and back.
function setupMusicRefresh() {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        refreshMusic().then(ok => {
            if (ok && ['timetable', 'grid'].includes(PAGES[store.currentPage]?.slug)) {
                goToPage(store.currentPage);
            }
        });
    });
}

// The install card only ever renders on Home/My Plan — re-rendering any
// other page just to refresh install state would needlessly reset it
// (open filter panel, scroll position, etc.).
function refreshInstallCardIfVisible() {
    if (['home', 'favorites'].includes(PAGES[store.currentPage]?.slug)) goToPage(store.currentPage);
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

function updateLangSwitcherLabel() {
    const btn = document.getElementById('langSwitcher');
    if (btn) btn.textContent = LANG_LABELS[store.lang] || store.lang;
}

function updateHeaderFilterLabel() {
    const label = document.getElementById('headerFilterLabel');
    if (label) label.textContent = t('tt.filterButton');
}

async function setLangAndRefresh(lang) {
    if (lang === store.lang) return;
    setLang(lang);
    store.lang = lang;
    updateLangSwitcherLabel();
    updateHeaderFilterLabel();
    document.getElementById('searchInput').placeholder = t('search.placeholder');
    document.querySelector('.search-modal-header span').textContent = t('search.resultsTitle');
    await loadData();
    mergeMusicIntoTimetable();
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
    'load-page': el => { goToPage(parseInt(el.dataset.page, 10)); closeMenu(); },
    'toggle-fav': el => toggleFavFromCard(el, el.dataset.page, parseInt(el.dataset.index, 10)),
    'set-fav-tab': el => setFavTab(el.dataset.tab),
    'set-day': el => setDay(el.dataset.day),
    'toggle-filter': () => toggleFilterPanel(),
    'reset-filters': () => resetFilters(),
    'set-filter': el => setFilterValue(el.dataset.facet, el.dataset.value),
    'toggle-event': el => toggleEventDetail(el),
    'set-grid-day': el => setGridDay(el.dataset.day),
    'toggle-grid-event': el => openGridEventDetail(el),
    'close-grid-detail': () => closeGridEventDetail(),
    'toggle-grid-scroll': () => toggleGridScrollMode(),
    'toggle-faq': el => toggleFaqItem(el),
    'toggle-lang': () => setLangAndRefresh(store.lang === 'de' ? 'en' : 'de'),
    'switch-info-tab': el => switchInfoTab(el.dataset.tab),
    'toggle-search-bar': () => toggleSearchBar(),
    'close-search-bar': () => closeSearchBar(),
    'dismiss-install-card': () => { dismissInstallCard(); refreshInstallCardIfVisible(); },
    'trigger-install': async () => {
        const outcome = await triggerInstall();
        if (outcome === 'accepted') showToast(t('install.installing'));
        else if (outcome === 'dismissed') showToast(t('install.cancelled'));
        refreshInstallCardIfVisible();
    },
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
    'close-notifications': () => closeNotifications(),
    'open-menu': () => openMenu(),
    'close-menu': () => closeMenu(),
    'open-all-notifications': () => showAllNotifications(),
    'onboarding-allow': () => onboardingAllow(),
    'onboarding-not-now': () => onboardingNotNow(),
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
