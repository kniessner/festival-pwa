import { store } from './store.js';
import { PAGES, pageIdx } from './config.js';
import { escapeHtml } from './ui.js';
import { t } from './i18n.js';

export function setupSearch() {
    const input = document.getElementById('searchInput');
    if (!input || input.dataset.searchBound) return;
    input.dataset.searchBound = 'true';
    input.addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        if (q.length < 2) {
            closeSearchModal();
            return;
        }
        doSearch(q);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeSearchModal();
    });
}

export function closeSearchModal() {
    const modal = document.getElementById('searchModal');
    if (modal) modal.classList.remove('open');
    const container = document.getElementById('searchResults');
    if (container) container.innerHTML = '';
}

function openSearchModal() {
    const modal = document.getElementById('searchModal');
    if (modal) modal.classList.add('open');
}

// Deliberately an allowlist, not "iterate everything in store.pageData" —
// search is scoped to exactly Program (+ merged-in music events), FAQ, and
// News, matching only each item's title (and stage for Program events), not
// full descriptions/excerpts/hosts. Cashless and any other page are out of
// scope on purpose.
function doSearch(query) {
    const results = [];

    const timetableEntry = PAGES.find(p => p.slug === 'timetable');
    const timetableLabel = timetableEntry ? t(timetableEntry.labelKey) : 'timetable';
    const infoEntry = PAGES.find(p => p.slug === 'info');
    const infoLabel = infoEntry ? t(infoEntry.labelKey) : 'info';

    // Program — store.pageData.timetable.events already includes music.json's
    // events (merged client-side, see js/music.js).
    (store.pageData.timetable?.events || []).forEach((ev, i) => {
        const text = `${ev.title || ''} ${ev.stage_label || ''}`.toLowerCase();
        if (text.includes(query)) results.push({ page: 'timetable', pageLabel: timetableLabel, index: i, item: ev, isEvent: true });
    });

    // FAQ
    (store.pageData.info?.faqs?.items || []).forEach((item, i) => {
        const text = `${item.question || ''}`.toLowerCase();
        if (text.includes(query)) results.push({ page: 'info', pageLabel: `${infoLabel} · faqs`, index: i, item, infoTab: 'faqs' });
    });

    // News — notifications.json, shown in the Info page's News tab.
    (store.pageData.notifications?.items || []).forEach((item, i) => {
        const text = `${item.question || ''}`.toLowerCase();
        if (text.includes(query)) results.push({ page: 'info', pageLabel: `${infoLabel} · news`, index: i, item, infoTab: 'news' });
    });

    renderSearchResults(results, query);
}

function renderSearchResults(results, query) {
    const container = document.getElementById('searchResults');
    if (!container) return;
    openSearchModal();
    if (results.length === 0) {
        container.innerHTML = `<div class="empty">${t('search.noResults', { query: escapeHtml(query) })}</div>`;
        return;
    }
    container.innerHTML = results.map(r => {
        const title = r.item.title || r.item.question || 'Item';
        const desc = r.item.desc || r.item.answer || r.item.excerpt || '';
        // r.item.time is the scraper's pre-formatted "DO 10:00" string —
        // music events (no such field) fall back to start/end_time, shown
        // as a range since that's the more useful signal for a DJ set.
        const timeLabel = r.item.time || (r.item.start_time ? `${r.item.start_time}${r.item.end_time ? ' – ' + r.item.end_time : ''}` : '');
        const meta = timeLabel ? `${escapeHtml(timeLabel)} · ${escapeHtml(r.item.stage_label || '')}` : '';
        const infoTabAttr = r.infoTab ? ` data-info-tab="${r.infoTab}"` : '';
        return `
        <div class="grid-card search-card" data-action="search-jump" data-page-idx="${pageIdx(r.page)}" data-index="${r.index}"${infoTabAttr}>
            <div class="search-meta">${escapeHtml(r.pageLabel)}${meta ? ' · ' + meta : ''}</div>
            <h3>${escapeHtml(title)}</h3>
            ${desc ? `<p>${escapeHtml(desc.substring(0, 120))}${desc.length > 120 ? '...' : ''}</p>` : ''}
        </div>`;
    }).join('');
}

export function scrollToItem(pageSlug, itemIndex) {
    // Scope to the rendered page and prefer a *visible* match: the News, Cashless
    // and FAQ panels reuse the same data-item-index values, so an unscoped lookup
    // could land on an item inside a hidden (inactive) info panel. The search-jump
    // handler activates the correct info tab before calling this, so the matching
    // item is the one whose panel is currently displayed.
    const candidates = document.querySelectorAll(`#content [data-item-index="${itemIndex}"]`);
    let target = null;
    for (const el of candidates) {
        if (el.offsetParent !== null) { target = el; break; }
    }
    if (!target) target = candidates[0];
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // .highlight-quick overrides .highlight's animation-duration so the
    // pulse actually completes within 1s instead of being cut off mid-fade
    // (the shared .highlight class's default 2s animation is also used by
    // timetable.js's "scroll to now" highlight, which should stay as-is).
    target.classList.add('highlight', 'highlight-quick');
    setTimeout(() => target.classList.remove('highlight', 'highlight-quick'), 1000);
}
