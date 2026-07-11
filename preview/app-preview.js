import { toggleSaved, getSavedIds } from '../pwa/js/db.js';

const DAYS = ['mi','do','fr','sa','so','mo'];
const DAY_LABELS = { mi:'Mi', do:'Do', fr:'Fr', sa:'Sa', so:'So', mo:'Mo' };

let currentDay = 'fr';
let allEvents = [];
let savedIds = [];
let showOnlySaved = false;
let currentModalEvent = null;

// ===== INIT =====
async function init() {
    renderDayNav();
    await loadEvents();
    setupOfflineIndicator();
    setupFilters();
    setupFABs();
    setupModal();
    checkAnnouncement();

    const storedDay = localStorage.getItem('preview_lastDay');
    if (storedDay && DAYS.includes(storedDay)) {
        currentDay = storedDay;
        renderDayNav();
        renderTimetable();
    }
}

// ===== DATA LOADING =====
async function loadEvents() {
    const timetable = document.getElementById('timetable');
    timetable.innerHTML = '<div class="loading">Loading events...</div>';

    try {
        const res = await fetch('./data/events.json');
        allEvents = await res.json();
        console.log('Events loaded:', allEvents.length);
    } catch (err) {
        console.error('Failed to load events', err);
        timetable.innerHTML = '<div class="empty">Failed to load events</div>';
        return;
    }

    savedIds = await getSavedIds();
    populateStageFilter();
    renderTimetable();

    // Simulate announcement
    setTimeout(() => {
        document.getElementById('announceText').textContent =
            'Achtung, dringende Infos zur Hitzewelle und Feuergefahr. Trinkt ausreichend Wasser und haltet Abstand zu offenen Feuerstellen.';
        document.getElementById('announcementModal').style.display = 'flex';
    }, 1500);
}

// ===== RENDERING =====
function renderDayNav() {
    const nav = document.getElementById('dayNav');
    nav.innerHTML = DAYS.map(d =>
        `<button class="${d === currentDay ? 'active' : ''}" data-day="${d}">${DAY_LABELS[d]}</button>`
    ).join('');
}

function renderTimetable() {
    const container = document.getElementById('timetable');
    let events = allEvents.filter(e => e.day === currentDay);

    if (showOnlySaved) {
        events = events.filter(e => savedIds.includes(e.id));
    }

    const stageFilter = document.getElementById('stageFilter').value;
    if (stageFilter) {
        events = events.filter(e => e.stage === stageFilter);
    }

    if (events.length === 0) {
        container.innerHTML = '<div class="empty">No events found</div>';
        return;
    }

    const grouped = groupByTime(events);
    container.innerHTML = Object.entries(grouped).map(([time, evs]) => `
        <div class="time-header">${time}</div>
        ${evs.map(renderEventCard).join('')}
    `).join('');
}

function groupByTime(events) {
    return events
        .sort((a, b) => (a.start || '').localeCompare(b.start || ''))
        .reduce((acc, ev) => {
            const t = ev.start ? ev.start.substring(0, 5) : '??';
            (acc[t] = acc[t] || []).push(ev);
            return acc;
        }, {});
}

function renderEventCard(ev) {
    const saved = savedIds.includes(ev.id);
    const colors = {
        'DJ': '#c4703a',
        'Live': '#7ab86c',
        'Workshop': '#6c9ab8'
    };
    const dotColor = colors[ev.category] || 'var(--accent)';

    return `
    <div class="event-card" data-id="${ev.id}">
        <div class="info">
            <h3>${escapeHtml(ev.title)}</h3>
            <div class="meta">
                <span class="cat"><span class="dot" style="background:${dotColor}"></span>${escapeHtml(ev.category || 'Event')}</span>
                <span>${escapeHtml(ev.start || '')}–${escapeHtml(ev.end || '')}</span>
                <span>${escapeHtml(ev.stage || '')}</span>
            </div>
        </div>
        <div class="event-actions">
            <button class="btn-save ${saved ? 'saved' : ''}" data-id="${ev.id}">${saved ? '✓' : '+'}</button>
        </div>
    </div>`;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// ===== INTERACTION =====
document.getElementById('timetable').addEventListener('click', async (e) => {
    const btn = e.target.closest('.btn-save');
    const card = e.target.closest('.event-card');

    if (btn) {
        const id = parseInt(btn.dataset.id);
        const saved = await toggleSaved(id);
        savedIds = await getSavedIds();
        renderTimetable();
        return;
    }

    if (card) {
        const id = parseInt(card.dataset.id);
        const ev = allEvents.find(e => e.id === id);
        if (ev) openEventModal(ev);
    }
});

document.getElementById('dayNav').addEventListener('click', (e) => {
    if (e.target.dataset.day) {
        currentDay = e.target.dataset.day;
        showOnlySaved = false;
        localStorage.setItem('preview_lastDay', currentDay);
        renderDayNav();
        renderTimetable();
    }
});

function setupFABs() {
    document.getElementById('btnMyPlan').addEventListener('click', () => {
        showOnlySaved = !showOnlySaved;
        document.getElementById('btnMyPlan').classList.toggle('active', showOnlySaved);
        renderTimetable();
    });

    document.getElementById('btnFilter').addEventListener('click', () => {
        document.getElementById('filterBar').classList.toggle('visible');
    });
}

function setupFilters() {
    document.getElementById('stageFilter').addEventListener('change', renderTimetable);
    document.getElementById('btnResetFilters').addEventListener('click', () => {
        document.getElementById('stageFilter').value = '';
        showOnlySaved = false;
        document.getElementById('btnMyPlan').classList.remove('active');
        document.getElementById('filterBar').classList.remove('visible');
        renderTimetable();
    });
}

function populateStageFilter() {
    const select = document.getElementById('stageFilter');
    const stages = [...new Set(allEvents.map(e => e.stage).filter(Boolean))].sort();
    select.innerHTML = '<option value="">All Stages</option>' +
        stages.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
}

// ===== MODAL =====
function setupModal() {
    document.getElementById('btnCloseEvent').addEventListener('click', closeEventModal);
    document.getElementById('eventModal').addEventListener('click', (e) => {
        if (e.target.id === 'eventModal') closeEventModal();
    });
    document.getElementById('btnModalSave').addEventListener('click', async () => {
        if (!currentModalEvent) return;
        const saved = await toggleSaved(currentModalEvent.id);
        savedIds = await getSavedIds();
        updateModalSaveButton();
        renderTimetable();
    });

    document.getElementById('btnCloseAnnounce').addEventListener('click', () => {
        document.getElementById('announcementModal').style.display = 'none';
    });
    document.getElementById('announcementModal').addEventListener('click', (e) => {
        if (e.target.id === 'announcementModal') document.getElementById('announcementModal').style.display = 'none';
    });
}

function openEventModal(ev) {
    currentModalEvent = ev;
    document.getElementById('modalTitle').textContent = ev.title;
    document.getElementById('modalCatText').textContent = ev.category || 'Event';
    document.getElementById('modalTime').textContent = `${ev.start}–${ev.end}`;
    document.getElementById('modalStage').textContent = ev.stage || '';
    document.getElementById('modalDesc').textContent = ev.description || '';
    updateModalSaveButton();
    document.getElementById('eventModal').style.display = 'flex';
}

function updateModalSaveButton() {
    const btn = document.getElementById('btnModalSave');
    const saved = currentModalEvent && savedIds.includes(currentModalEvent.id);
    btn.textContent = saved ? '✓ Saved to My Plan' : '+ Add to My Plan';
    btn.style.background = saved ? 'var(--text)' : 'var(--accent)';
    btn.style.color = saved ? 'var(--accent)' : 'var(--bg-dark)';
}

function closeEventModal() {
    document.getElementById('eventModal').style.display = 'none';
    currentModalEvent = null;
}

function checkAnnouncement() {
    // Handled by simulated announcement in loadEvents
}

// ===== OFFLINE INDICATOR =====
function setupOfflineIndicator() {
    const update = () => {
        const existing = document.querySelector('.offline-badge');
        if (!navigator.onLine) {
            if (!existing) {
                const badge = document.createElement('div');
                badge.className = 'offline-badge';
                badge.textContent = 'Offline — cached data';
                document.body.prepend(badge);
            }
        } else {
            existing?.remove();
        }
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
}

// ===== START =====
init();
