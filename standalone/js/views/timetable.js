import { store } from '../store.js';
import { textToHtml, favButton } from '../ui.js';
import { isEventRunning, getEffectiveFestivalDay, dayAbbrev } from '../festival.js';
import { isFavorite } from '../favorites.js';
import { t } from '../i18n.js';
import {
    matchesEventType, resetTypeSpecificFilters, stagesForCurrentType, daysForCurrentType, renderEventTypeTabs, isMusicEvent,
} from '../event-type-filter.js';

export function renderTimetable(container) {
    const data = store.pageData.timetable;
    if (!data || !data.events) {
        container.innerHTML = `<div class="empty">${t('tt.loading')}</div>`;
        return;
    }

    // Persist user-changed filters (stage/category) but ALWAYS recompute
    // the day from the actual current date so it stays correct across days —
    // unless a jump (search result / next-event card) just requested a
    // specific day via prepareJumpToEvent(), in which case honor that once.
    store.ttFilters.day = store.ttPendingDay || getEffectiveFestivalDay();
    store.ttPendingDay = null;

    const filterPills = (facet, options) => options.map(opt =>
        `<button class="tt-filter-pill" data-action="set-filter" data-facet="${facet}" data-value="${opt.value}">${opt.label}</button>`
    ).join('');

    container.innerHTML = `
        <div class="tt-intro">${textToHtml(data.intro)}</div>

        ${renderEventTypeTabs('set-event-type')}
        <div class="tt-day-tabs" id="ttDayTabs"></div>
        <div class="tt-events" id="ttEvents"></div>
        <div class="tt-filter-panel" id="ttFilterPanel">
            <div class="tt-filter-head">
                <strong>${t('tt.filterTitle')}</strong>
                <button class="tt-filter-reset" data-action="reset-filters">${t('tt.resetFilters')}</button>
            </div>
            <div class="tt-filter-group" id="ttCategoryGroup">
                <label>${t('tt.categoryLabel')}</label>
                <div class="tt-filter-pills">${filterPills('category', data.filters.categories)}</div>
            </div>
            <div class="tt-filter-group">
                <label>${t('tt.stageLabel')}</label>
                <div class="tt-filter-pills" id="ttStagePills"></div>
            </div>
            <button class="tt-filter-done" data-action="toggle-filter">${t('common.done')}</button>
        </div>
        <div class="tt-filter-backdrop" id="ttFilterBackdrop" data-action="toggle-filter"></div>
    `;

    syncFilterPills();
    refreshTimetable();
}

// Called before navigating to a specific timetable event from elsewhere
// (search results, the next-event card) so the event is actually visible
// once the page renders — otherwise it can be silently hidden by the day
// filter defaulting to "today", the event-type tab sitting on the wrong
// value, or a leftover stage/category filter, and the jump would look like
// nothing happened.
export function prepareJumpToEvent(index) {
    const ev = store.pageData.timetable?.events?.[index];
    if (!ev) return;
    store.ttPendingDay = ev.day || null;
    store.ttFilters.stage = 'all';
    store.ttFilters.category = 'all';
    store.eventTypeFilter = isMusicEvent(ev) ? 'music' : 'culture';
}

export function setEventType(type) {
    store.eventTypeFilter = type;
    resetTypeSpecificFilters(store.ttFilters);
    syncFilterPills();
    document.querySelectorAll('.tt-type-tabs .tt-type-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === type);
    });
    refreshTimetable();
}

// Category is meaningless while Music is active (every music event shares
// one constant value, so filtering by it is a no-op) — its filter group
// hides. The stage pill list is rebuilt to only the stages present for
// the active tab, so there's never a pill that would filter the list
// down to zero results.
function updateTypeSpecificFilterUI(data) {
    const isMusic = store.eventTypeFilter === 'music';
    const categoryGroup = document.getElementById('ttCategoryGroup');
    if (categoryGroup) categoryGroup.classList.toggle('tt-filter-group-hidden', isMusic);

    const stagePills = document.getElementById('ttStagePills');
    if (stagePills) {
        const scoped = stagesForCurrentType(data.events, data.filters.stages);
        stagePills.innerHTML = scoped.map(opt =>
            `<button class="tt-filter-pill ${store.ttFilters.stage === opt.value ? 'active' : ''}" data-action="set-filter" data-facet="stage" data-value="${opt.value}">${opt.label}</button>`
        ).join('');
    }
}

// Keeps the filter pills' active state in sync with store.ttFilters —
// cheaper than re-rendering the whole panel on every filter change.
function syncFilterPills() {
    document.querySelectorAll('.tt-filter-pill').forEach(btn => {
        const isActive = store.ttFilters[btn.dataset.facet] === btn.dataset.value;
        btn.classList.toggle('active', isActive);
    });
}

export function setFilterValue(facet, value) {
    store.ttFilters[facet] = store.ttFilters[facet] === value ? 'all' : value;
    syncFilterPills();
    refreshTimetable();
}

export function refreshTimetable() {
    const data = store.pageData.timetable;
    const filters = store.ttFilters;
    const container = document.getElementById('ttEvents');
    const tabsContainer = document.getElementById('ttDayTabs');
    if (!container || !tabsContainer) return;

    tabsContainer.innerHTML = daysForCurrentType(data.events, data.filters.days).map(d => {
        const isActive = d.value === filters.day;
        // Day labels come back as full names now ("Donnerstag"/"Thursday") —
        // abbreviate for the tab pills, matching the scraper's own day_short
        // convention (2 letters in German) rather than a generic 3-char slice.
        return `<button class="tt-day-tab ${isActive ? 'active' : ''}" data-day="${d.value}" data-action="set-day">${dayAbbrev(d.value, d.label)}</button>`;
    }).join('');

    updateTypeSpecificFilterUI(data);

    const filterBtn = document.getElementById('headerFilterBtn');
    if (filterBtn) filterBtn.classList.toggle('active', filters.stage !== 'all' || filters.category !== 'all');

    let events = data.events.filter(matchesEventType).filter(ev => {
        if (filters.day !== 'all' && ev.day !== filters.day) return false;
        if (filters.stage !== 'all' && ev.stage !== filters.stage) return false;
        if (filters.category !== 'all' && ev.type !== filters.category) return false;
        return true;
    });

    if (events.length === 0) {
        container.innerHTML = `<div class="empty" style="padding:40px 20px;">${t('tt.emptySelection')}</div>`;
        return;
    }

    const hourGroups = {};
    events.forEach(ev => {
        const hour = ev.start_time ? ev.start_time.slice(0, 2) + ':00' : 'Ohne Zeit';
        if (!hourGroups[hour]) hourGroups[hour] = [];
        hourGroups[hour].push(ev);
    });

    const sortedHours = Object.keys(hourGroups).sort((a, b) => {
        if (a === 'Ohne Zeit') return 1;
        if (b === 'Ohne Zeit') return -1;
        return a.localeCompare(b);
    });

    container.innerHTML = sortedHours.map(hour => `
        <div class="tt-hour-group" data-hour="${hour}">
            <div class="tt-hour-label">${hour}</div>
            <div class="tt-hour-events">${hourGroups[hour].map(renderEventCard).join('')}</div>
        </div>
    `).join('');

    scrollToCurrentTime(filters.day);
}

export function renderEventCard(ev) {
    const idx = store.pageData.timetable.events.indexOf(ev);
    const hasDetail = ev.description && ev.description.trim().length > 0 && ev.description !== ev.excerpt;
    const runningClass = isEventRunning(ev, store.ttFilters.day) ? 'running' : '';
    const langBadges = ev.langs && ev.langs.length ? ev.langs.map(l => `<span class="lang-badge">${l.toUpperCase()}</span>`).join('') : '';
    const endTime = ev.end_time ? ` – ${ev.end_time}` : '';
    // ev.time is a pre-formatted "DO 10:00"-style (day + time) string the
    // scraper builds for Program events; music.json events only carry plain
    // start_time with no day baked in, so without this the day would just
    // silently disappear for music cards — build the same "<Day> <time>"
    // shape ourselves from ev.day + start_time.
    const dayTag = !ev.time && ev.day
        ? dayAbbrev(ev.day, store.pageData.timetable?.filters?.days?.find(d => d.value === ev.day)?.label)
        : '';
    // Only build a day-prefixed time string when there's actually a
    // start_time to prefix. Without this guard, an event with a day but
    // no start_time (e.g. a Space entry that's "open all day") would
    // render as "DO undefined" in the meta line — real bug caught by
    // the "no time — just the category" test.
    let displayTime = '';
    if (ev.time) displayTime = ev.time;
    else if (ev.start_time) displayTime = dayTag ? `${dayTag} ${ev.start_time}` : ev.start_time;
    const favClass = isFavorite('timetable', idx) ? 'tt-event-fav' : '';

    // Join only the parts that actually have a value — a missing stage
    // (subline) or missing time/category (meta) must not leave a dangling
    // ", " with nothing on one side of it.
    const stageHtml = ev.stage_label ? `<span class="tt-event-stage">${ev.stage_label}</span>` : '';
    // Hosts (the actual performers/artists), not the title again — the
    // title's already the card's h3 heading just above. Sources without
    // hosts (e.g. music.json) simply omit this part rather than repeating
    // the title as a filler.
    const hostsText = ev.hosts && ev.hosts.length ? ev.hosts.join(', ') : '';
    const sublineHtml = [stageHtml, hostsText].filter(Boolean).join(', ');

    const timeText = displayTime ? `${displayTime}${endTime}` : '';
    const timeHtml = timeText ? `<span class="event-time">${timeText}</span>` : '';
    const metaHtml = [timeHtml, ev.category].filter(Boolean).join(', ');

    return `
    <div class="tt-event ${hasDetail ? 'has-detail' : ''} ${runningClass} ${favClass}" data-item-index="${idx}">
        <div class="tt-event-header" data-action="toggle-event">
            <div class="tt-event-title-row">
                <h3>${ev.title}</h3>
                ${favButton('timetable', idx)}
            </div>
            <div class="tt-event-subline">${sublineHtml}</div>
            <div class="tt-event-meta">${metaHtml}</div>
            <div class="tt-event-footer">
                <div class="tt-event-badges">${langBadges}</div>
                ${hasDetail ? `<span class="tt-event-toggle">${t('tt.more')}</span>` : '<span></span>'}
                ${runningClass ? `<span class="tt-now-badge">${t('tt.now')}</span>` : ''}
            </div>
        </div>
        ${hasDetail ? `<div class="tt-event-detail"><div class="tt-event-detail-inner">${ev.description}</div></div>` : ''}
    </div>`;
}

export function setDay(dayValue) {
    store.ttFilters.day = dayValue;
    refreshTimetable();
}

export function toggleEventDetail(header) {
    const item = header.closest('.tt-event');
    const detail = item.querySelector('.tt-event-detail');
    const toggle = header.querySelector('.tt-event-toggle');
    if (!detail) return;
    const isOpen = item.classList.contains('open');
    if (isOpen) {
        item.classList.remove('open');
        detail.style.display = 'none';
        if (toggle) toggle.textContent = t('tt.more');
    } else {
        item.classList.add('open');
        detail.style.display = 'block';
        if (toggle) toggle.textContent = t('tt.less');
    }
}

export function toggleFilterPanel() {
    const panel = document.getElementById('ttFilterPanel');
    const backdrop = document.getElementById('ttFilterBackdrop');
    const isOpen = panel.classList.contains('open');
    panel.classList.toggle('open', !isOpen);
    backdrop.classList.toggle('open', !isOpen);
}

export function resetFilters() {
    store.ttFilters.stage = 'all';
    store.ttFilters.category = 'all';
    syncFilterPills();
    refreshTimetable();
}

function scrollToCurrentTime(selectedDay) {
    const now = new Date();

    // Only auto-scroll when the user is viewing today's mapped day
    if (selectedDay !== getEffectiveFestivalDay()) return;

    const currentHour = now.getHours();
    const currentHourStr = String(currentHour).padStart(2, '0') + ':00';
    const hourGroups = document.querySelectorAll('.tt-hour-group');

    // Find the hour group that matches current hour (or closest before it)
    let targetGroup = null;
    for (const g of hourGroups) {
        const h = g.dataset.hour;
        if (h === 'Ohne Zeit') continue;
        const hourNum = parseInt(h.split(':')[0], 10);
        if (hourNum <= currentHour) {
            targetGroup = g;
        }
    }

    // If current hour group exists, find the specific event closest to now
    if (targetGroup) {
        setTimeout(() => {
            targetGroup.scrollIntoView({ behavior: 'smooth', block: 'start' });
            // Highlight the closest event within this hour
            const events = targetGroup.querySelectorAll('.tt-event');
            let closestEvent = null;
            let closestDiff = Infinity;
            for (const ev of events) {
                const timeEl = ev.querySelector('.event-time');
                if (!timeEl) continue;
                const t = timeEl.textContent.trim().split('–')[0].trim();
                if (t) {
                    const [h, m] = t.split(':');
                    const evMinutes = (parseInt(h) * 60) + parseInt(m);
                    const nowMinutes = (now.getHours() * 60) + now.getMinutes();
                    const diff = Math.abs(evMinutes - nowMinutes);
                    if (diff < closestDiff) {
                        closestDiff = diff;
                        closestEvent = ev;
                    }
                }
            }
            if (closestEvent) {
                closestEvent.classList.add('highlight');
                setTimeout(() => closestEvent.classList.remove('highlight'), 4000);
            }
        }, 200);
    }
}
