import { loadData, loadManifest, refreshAllData, refreshTimetableData } from './store.js';
import { loadPage, renderNav } from './router.js';
import { setupSearch, scrollToItem, closeSearchModal } from './search.js';
import { closeMapSearchDropdown } from './views/map-search.js';
import { setDay, toggleFilterPanel, resetFilters, toggleEventDetail, setFilterValue, setEventType, prepareJumpToEvent } from './views/timetable.js';
import { setGridDay, openGridEventDetail, closeGridEventDetail, toggleGridScrollMode, setEventType as setGridEventType } from './views/timetable-grid.js';
import { store } from './store.js';
import { switchInfoTab } from './views/info.js';
import { switchMapView } from './views/map.js';
import { toggleFavFromCard, setFavTab } from './views/favorites.js';
import { setupInstallTracking, setupOfflineIndicator, dismissInstallCard, triggerInstall } from './install.js';
import { showToast } from './ui.js';
import { PAGES, pageIdx } from './config.js';
import { t, setLang } from './i18n.js';
import { maybeShowNotifications, closeNotifications, setupNotificationsRefresh, scrollToNotificationById } from './notifications.js';
import { openMenu, closeMenu } from './menu.js';
import { mergeMusicIntoTimetable, refreshMusic } from './music.js';
import { showLocationPromptIfNeeded, onboardingAllow, onboardingNotNow, showPushPromptIfNeeded, pushOnboardingAllow, pushOnboardingNotNow } from './onboarding.js';
import { dismissTentIntro } from './views/tent-intro.js';
import { loadStages, warnStageNameMismatches } from './helpers/get-stage.js';
import { passwordGateOK, showPasswordGate } from './password-gate.js';
import { togglePush } from './push.js';

const LANG_LABELS = { de: 'De', en: 'Eng' };

async function init() {
    // Temporary pre-launch gate — see password-gate.js for removal steps
    // once the festival is live.
    // if (!passwordGateOK()) await showPasswordGate();

    document.documentElement.lang = store.lang;
    document.getElementById('searchInput').placeholder = t('search.placeholder');
    document.querySelector('.search-modal-header span').textContent = t('search.resultsTitle');
    document.getElementById('notificationsTitle').textContent = t('notifications.title');
    document.getElementById('notificationsDoneBtn').textContent = t('common.done');
    updateLangSwitcherLabel();
    updateHeaderFilterLabel();
    updateMenuRefreshLabel();
    // Parallel-load timetable/info data and stage polygons — they're
    // independent files, no reason to serialise the round-trips.
    await Promise.all([loadData(), loadStages()]);
    // Boot-time sanity check: warn about drift between the timetable's
    // slug universe (filter rows + music events) and the polygons in
    // stages.geojson + sterne.geojson. See helpers/get-stage.js.
    const usedSlugs = new Set();
    for (const s of store.pageData.timetable?.filters?.stages || []) {
        if (s?.value) usedSlugs.add(s.value);
    }
    for (const e of store.pageData.music?.events || []) {
        if (e?.stage) usedSlugs.add(e.stage);
    }
    warnStageNameMismatches(usedSlugs);
    mergeMusicIntoTimetable();
    renderNav();
    // manifest.json's start_url passes ?page=favorites so launching the
    // installed home-screen app opens My Plan directly; a plain browser
    // visit (no query param) still lands on Home as before. ?notif=<id>
    // (a tapped OS push notification's deep link, opened fresh by
    // sw.js's notificationclick via clients.openWindow) takes priority
    // over both — same-tab clicks are instead handled live via the
    // service-worker message listener in setupUpdateBanner() below.
    const params = new URLSearchParams(location.search);
    const notifId = params.get('notif');
    const requestedPage = params.get('page');
    if (notifId) {
        goToNotification(notifId);
    } else {
        goToPage(requestedPage ? Math.max(0, pageIdx(requestedPage)) : 0);
    }
    setupOfflineIndicator();
    setupInstallTracking(refreshInstallCardIfVisible);
    setupUpdateBanner();
    showLastUpdated();
    wireDelegation();
    // Onboarding awaited BEFORE notifications so first-launch users
    // don't see modals stacked. Returning users go through both
    // instantly (sticky flag or already-decided permission). Push is
    // sequenced strictly after location resolves — one screen at a time,
    // never shown simultaneously.
    await showLocationPromptIfNeeded();
    await showPushPromptIfNeeded();
    maybeShowNotifications();
    setupNotificationsRefresh();
    setupTimetableRefresh();
}

// Re-fetching timetable.json/music.json doesn't by itself update whatever's
// already on screen — the Program list / grid Timetable render once from a
// snapshot. If the user is looking at either when new data comes in
// (edited timetable.json, a new/changed music.json entry), re-render so it
// actually becomes visible without them having to navigate away and back.
// Both files are re-fetched every time (not just music) since either can
// change independently and mergeMusicIntoTimetable() needs a fresh
// store.pageData.timetable as its base or a stale one gets re-merged.
function setupTimetableRefresh() {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') return;
        Promise.all([refreshTimetableData(), refreshMusic()]).then(([ttOk, musicOk]) => {
            mergeMusicIntoTimetable();
            if ((ttOk || musicOk) && ['timetable', 'grid'].includes(PAGES[store.currentPage]?.slug)) {
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
    // Close the map-search dropdown too — same input, two possible
    // result surfaces depending on the current route.
    closeMapSearchDropdown();
}

function updateLangSwitcherLabel() {
    const btn = document.getElementById('langSwitcher');
    if (btn) btn.textContent = LANG_LABELS[store.lang] || store.lang;
}

function updateHeaderFilterLabel() {
    const label = document.getElementById('headerFilterLabel');
    if (label) label.textContent = t('tt.filterButton');
}

function updateMenuRefreshLabel() {
    const btn = document.getElementById('menuRefreshBtn');
    if (btn) btn.setAttribute('aria-label', t('nav.refresh'));
}

async function setLangAndRefresh(lang) {
    if (lang === store.lang) return;
    setLang(lang);
    store.lang = lang;
    updateLangSwitcherLabel();
    updateHeaderFilterLabel();
    updateMenuRefreshLabel();
    document.getElementById('searchInput').placeholder = t('search.placeholder');
    document.querySelector('.search-modal-header span').textContent = t('search.resultsTitle');
    await loadData();
    mergeMusicIntoTimetable();
    renderNav();
    goToPage(store.currentPage);
}

// Guards against a double-tap firing two overlapping refreshes — the
// button itself is also disabled for the same reason, belt-and-suspenders
// since disabled buttons can still be re-clicked before the DOM update
// from the previous tap has painted.
let isRefreshing = false;
async function refreshData(triggerEl) {
    if (isRefreshing) return;
    isRefreshing = true;
    if (triggerEl) triggerEl.disabled = true;
    closeMenu();
    showToast(t('common.refreshing'));
    const { failed } = await refreshAllData();
    mergeMusicIntoTimetable();
    renderNav();
    goToPage(store.currentPage);
    showToast(failed.length ? t('common.refreshFailed') : t('common.refreshSuccess'));
    isRefreshing = false;
    if (triggerEl) triggerEl.disabled = false;
}

function setupUpdateBanner() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.addEventListener('message', event => {
        if (event.data?.type === 'UPDATE_AVAILABLE') {
            showUpdateBanner();
        } else if (event.data?.type === 'notification-click') {
            // Tab was already open — sw.js focused it and sent this instead
            // of the fresh ?notif= page load the cold-start path gets, so
            // route there live instead of relying on location.search.
            const notifId = new URL(event.data.url, location.origin).searchParams.get('notif');
            if (notifId) goToNotification(notifId);
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

// Shared by both notification-click paths (cold-start ?notif= param and
// the same-tab postMessage above) — same 300ms delay as the other
// goToPage-then-scroll actions (goto-news, goto-event) below, giving the
// News panel's DOM time to render before scrollToNotificationById looks
// for it.
function goToNotification(id) {
    closeMenu();
    goToPage(pageIdx('info'));
    setTimeout(() => {
        switchInfoTab('news');
        scrollToNotificationById(parseInt(id, 10));
    }, 300);
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
    'set-event-type': el => setEventType(el.dataset.type),
    'set-grid-event-type': el => setGridEventType(el.dataset.type),
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
    'switch-map-view': el => switchMapView(el.dataset.view),
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
        if (PAGES[idx].slug === 'timetable') prepareJumpToEvent(itemIndex);
        goToPage(idx);
        if (tab) setTimeout(() => { switchInfoTab(tab); scrollToItem(PAGES[idx].slug, itemIndex); }, 400);
        else setTimeout(() => scrollToItem(PAGES[idx].slug, itemIndex), 300);
    },
    'close-search': () => closeSearchModal(),
    'close-notifications': () => closeNotifications(),
    'open-menu': () => openMenu(),
    'close-menu': () => closeMenu(),
    'refresh-data': el => refreshData(el),
    'toggle-push': async () => {
        const nowSubscribed = await togglePush();
        showToast(nowSubscribed ? t('push.enabled') : t('push.disabled'));
        renderNav();
    },
    'goto-news': () => {
        closeMenu();
        goToPage(pageIdx('info'));
        setTimeout(() => switchInfoTab('news'), 300);
    },
    'onboarding-allow': () => onboardingAllow(),
    'onboarding-not-now': () => onboardingNotNow(),
    'push-onboarding-allow': () => pushOnboardingAllow(),
    'push-onboarding-not-now': () => pushOnboardingNotNow(),
    'tent-intro-ok': () => dismissTentIntro(),
    'goto-event': el => {
        const itemIndex = parseInt(el.dataset.index, 10);
        prepareJumpToEvent(itemIndex);
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
