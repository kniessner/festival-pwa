import { store } from '../store.js';
import { textToHtml, favButton } from '../ui.js';
import { isEventRunning, getEffectiveFestivalDay } from '../festival.js';

export function renderTimetable(container) {
    const data = store.pageData.timetable;
    if (!data || !data.events) {
        container.innerHTML = '<div class="empty">Programm wird geladen…</div>';
        return;
    }

    // Persist user-changed filters (stage/category/genre) but ALWAYS recompute
    // the day from the actual current date so it stays correct across days —
    // unless a jump (search/next-event) requested a specific day to land on.
    if (store.ttPendingDay) {
        store.ttFilters.day = store.ttPendingDay;
        store.ttPendingDay = null;
    } else {
        store.ttFilters.day = getEffectiveFestivalDay();
    }

    container.innerHTML = `
        <div class="tt-intro">${textToHtml(data.intro)}</div>
    
        <div class="tt-day-tabs" id="ttDayTabs"></div>
        <div class="tt-events" id="ttEvents"></div>
        <button class="tt-filter-btn" id="ttFilterBtn" data-action="toggle-filter">🔍 Filter</button>
        <div class="tt-filter-panel" id="ttFilterPanel">
            <div class="tt-filter-head">
                <strong>Filter</strong>
                <button class="tt-filter-close" data-action="toggle-filter">✕</button>
            </div>
            <div class="tt-filter-group">
                <label>Bühne / Stage</label>
                <select id="filter-stage"><option value="all">Alle Bühnen</option></select>
            </div>
            <div class="tt-filter-group">
                <label>Kategorie</label>
                <select id="filter-category"><option value="all">Alle Kategorien</option></select>
            </div>
            <div class="tt-filter-group">
                <label>Genre</label>
                <select id="filter-genre"><option value="all">Alle Genres</option></select>
            </div>
            <button class="tt-filter-reset" data-action="reset-filters">Filter zurücksetzen</button>
        </div>
        <div class="tt-filter-backdrop" id="ttFilterBackdrop" data-action="toggle-filter"></div>
    `;

    const stageSel = document.getElementById('filter-stage');
    data.filters.stages.forEach(s => { const o = document.createElement('option'); o.value = s.value; o.textContent = s.label; stageSel.appendChild(o); });
    const catSel = document.getElementById('filter-category');
    data.filters.categories.forEach(c => { const o = document.createElement('option'); o.value = c.value; o.textContent = c.label; catSel.appendChild(o); });
    const genSel = document.getElementById('filter-genre');
    data.filters.genres.forEach(g => { const o = document.createElement('option'); o.value = g.value; o.textContent = g.label; genSel.appendChild(o); });

    stageSel.value = store.ttFilters.stage;
    catSel.value = store.ttFilters.category;
    genSel.value = store.ttFilters.genre;

    stageSel.addEventListener('change', () => { store.ttFilters.stage = stageSel.value; refreshTimetable(); });
    catSel.addEventListener('change', () => { store.ttFilters.category = catSel.value; refreshTimetable(); });
    genSel.addEventListener('change', () => { store.ttFilters.genre = genSel.value; refreshTimetable(); });

    refreshTimetable();
}

export function refreshTimetable() {
    const data = store.pageData.timetable;
    const filters = store.ttFilters;
    const container = document.getElementById('ttEvents');
    const tabsContainer = document.getElementById('ttDayTabs');
    if (!container || !tabsContainer) return;

    tabsContainer.innerHTML = data.filters.days.map(d => {
        const isActive = d.value === filters.day;
        return `<button class="tt-day-tab ${isActive ? 'active' : ''}" data-day="${d.value}" data-action="set-day">${d.label}</button>`;
    }).join('');

    let events = data.events.filter(ev => {
        if (filters.day !== 'all' && ev.day !== filters.day) return false;
        if (filters.stage !== 'all' && ev.stage !== filters.stage) return false;
        if (filters.category !== 'all' && ev.type !== filters.category) return false;
        if (filters.genre !== 'all' && ev.genre !== filters.genre) return false;
        return true;
    });

    if (events.length === 0) {
        container.innerHTML = '<div class="empty" style="padding:40px 20px;">Keine Events für diese Auswahl</div>';
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

function renderEventCard(ev) {
    const idx = store.pageData.timetable.events.indexOf(ev);
    const hasDetail = ev.description && ev.description.trim().length > 0 && ev.description !== ev.excerpt;
    const runningClass = isEventRunning(ev, store.ttFilters.day) ? 'running' : '';
    const langBadges = ev.langs && ev.langs.length ? ev.langs.map(l => `<span class="lang-badge">${l.toUpperCase()}</span>`).join('') : '';
    const hosts = ev.hosts && ev.hosts.length ? `<span class="event-hosts">${ev.hosts.join(', ')}</span>` : '';
    const endTime = ev.end_time ? ` – ${ev.end_time}` : '';

    return `
    <div class="tt-event ${hasDetail ? 'has-detail' : ''} ${runningClass}" data-item-index="${idx}">
        <div class="tt-event-header" data-action="toggle-event">
            <div class="tt-event-meta">
                <span class="event-time">${ev.time}${endTime}</span>
                <span class="event-type">${ev.category}</span>
                ${langBadges}
            </div>
            <div class="tt-event-title-row">
                <h3>${ev.title}</h3>
                <div class="tt-event-actions">
                    ${favButton('timetable', idx)}
                    ${hasDetail ? '<span class="tt-event-toggle">+</span>' : ''}
                </div>
            </div>
            <span class="event-stage">${ev.stage_label}</span>
            ${hosts}
            ${ev.excerpt ? `<p class="event-excerpt">${ev.excerpt.substring(0, 140)}${ev.excerpt.length > 140 ? '...' : ''}</p>` : ''}
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
        if (toggle) toggle.textContent = '+';
    } else {
        item.classList.add('open');
        detail.style.display = 'block';
        if (toggle) toggle.textContent = '−';
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
    store.ttFilters.genre = 'all';
    document.getElementById('filter-stage').value = 'all';
    document.getElementById('filter-category').value = 'all';
    document.getElementById('filter-genre').value = 'all';
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
