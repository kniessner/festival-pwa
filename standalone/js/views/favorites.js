import { store } from '../store.js';
import { PAGES } from '../config.js';
import { escapeHtml, card, nextEventCardHtml } from '../ui.js';
import { getFavorites, toggleFavorite, getNextUpcomingFavorite, eventStartMinutes } from '../favorites.js';
import { renderNav, loadPage } from '../router.js';
import { renderEventCard } from './timetable.js';
import { t } from '../i18n.js';
import { installCardHtml } from '../install.js';

function emptyStateCard(message) {
    return `<div class="fav-empty-card">${escapeHtml(message)}</div>`;
}

export function renderFavorites(container) {
    const installCard = installCardHtml();
    // Same "what's next" card as the Home page — naturally empty (null)
    // here too when there are no favorites yet, so no special-casing
    // needed between this and the early-return branch below.
    const nextCard = nextEventCardHtml(getNextUpcomingFavorite());
    const favs = getFavorites();
    if (favs.length === 0) {
        container.innerHTML = installCard + nextCard + emptyStateCard(t('fav.emptyHint'));
        return;
    }

    const programByDay = {};
    const newsItems = [];
    for (const f of favs) {
        if (f.page === 'timetable') {
            const ev = store.pageData.timetable?.events?.find(e => e.id === f.id);
            if (ev) {
                const day = ev.day || 'no-day';
                if (!programByDay[day]) programByDay[day] = [];
                programByDay[day].push(ev);
            }
        } else if (f.page === 'notifications') {
            const item = store.pageData.notifications?.items?.[f.index];
            if (item) newsItems.push({ item, index: f.index, page: f.page });
        } else if (f.page.startsWith('info-')) {
            const sub = f.page.replace('info-', '');
            const item = store.pageData.info?.[sub]?.items?.[f.index];
            if (item) newsItems.push({ item, index: f.index, page: f.page });
        }
    }

    // Favorites are stored in toggle order, not schedule order — sort each
    // day's events by start time (rollover-aware, so an after-midnight act
    // still lands after a 23:00 one instead of before it).
    Object.values(programByDay).forEach(events => events.sort((a, b) => eventStartMinutes(a) - eventStartMinutes(b)));

    const programCount = Object.values(programByDay).reduce((n, arr) => n + arr.length, 0);
    const newsCount = newsItems.length;

    if (store.favTab === 'program' && programCount === 0 && newsCount > 0) store.favTab = 'news';
    else if (store.favTab === 'news' && newsCount === 0 && programCount > 0) store.favTab = 'program';

    // Nothing to switch between when only one type has any favorites —
    // the auto-switch above already points favTab at whichever one does.
    let html = (programCount > 0 && newsCount > 0) ? `<div class="fav-tabs">
        <button class="fav-tab ${store.favTab === 'program' ? 'active' : ''}" data-action="set-fav-tab" data-tab="program">${t('fav.tabProgram')}</button>
        <button class="fav-tab ${store.favTab === 'news' ? 'active' : ''}" data-action="set-fav-tab" data-tab="news">${t('fav.tabNews')}</button>
    </div>` : '';

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

    container.innerHTML = installCard + nextCard + html;
}

export function setFavTab(tab) {
    store.favTab = tab;
    renderFavorites(document.getElementById('content'));
}

export function toggleFavFromCard(btn, pageSlug, itemIndex) {
    const isNowFav = toggleFavorite(pageSlug, itemIndex);
    btn.classList.toggle('active', isNowFav);
    // classList above only recolors the icon (currentColor through the CSS
    // mask) — the star's actual shape is a separate SVG baked into this
    // mask-image at render time (see favButton() in ui.js), so it has to be
    // swapped here too or it stays outline/filled until the next full
    // re-render instead of flipping the instant the button is tapped.
    const icon = btn.querySelector('.fav-star-icon');
    if (icon) {
        const iconFile = isNowFav ? 'star.svg' : 'star-outline.svg';
        icon.style.webkitMaskImage = `url(images/${iconFile})`;
        icon.style.maskImage = `url(images/${iconFile})`;
    }
    // Program list cards nest their fav button directly inside .tt-event,
    // so the glow can update immediately without a full re-render. The
    // grid Timetable's fav button lives in the separate #gttDetail
    // overlay, not inside its .gtt-event block, so the same trick
    // doesn't reach it there — that class only refreshes on next render,
    // same as before this glow existed.
    const card = btn.closest('.tt-event');
    if (card) card.classList.toggle('tt-event-fav', isNowFav);
    renderNav();
    if (PAGES[store.currentPage].slug === 'favorites') loadPage(store.currentPage);
}
