import { store } from '../store.js';
import { favButton } from '../ui.js';
import { getEffectiveFestivalDay } from '../festival.js';
import { FESTIVAL_DATES } from '../config.js';

const PX_PER_MIN = 2;
const COL_WIDTH = 130;
const LANE_WIDTH = 80;
const AXIS_WIDTH = 52;

// Stage acts run around the clock, so hours before this cutoff belong to the
// previous festival night rather than a new calendar day.
const DAY_ROLLOVER_HOUR = 6;

const STAGE_COLORS = {
    'community-corner dezentral': '#5a5ad1',
    'cuddle-poodle': '#b0327a',
    'dezentral': '#0303d5',
    'mirage': '#ff6f21',
    'neuro-divers': '#1fb6a4',
    'schweissperle': '#e0b400',
    'skalahara': '#3ac16e',
    'strandflitzer': '#c23b6b',
    'walking-act': '#762c8c',
    'zirkus-mond': '#e85d75'
};
function stageColor(stage) { return STAGE_COLORS[stage] || '#b0327a'; }

function toContinuousMinutes(time) {
    let [h, m] = time.split(':').map(Number);
    if (h < DAY_ROLLOVER_HOUR) h += 24;
    return h * 60 + m;
}

export function renderGridTimetable(container) {
    const data = store.pageData.timetable;
    if (!data || !data.events) {
        container.innerHTML = '<div class="empty">Programm wird geladen…</div>';
        return;
    }

    if (!store.gridDay) store.gridDay = getEffectiveFestivalDay();

    const days = data.filters.days.filter(d => FESTIVAL_DATES.includes(d.value));

    container.innerHTML = `
        <div class="gtt-toolbar">
            <div class="gtt-daytabs" id="gttDayTabs"></div>
            <button class="gtt-scroll-toggle" id="gttScrollToggle" data-action="toggle-grid-scroll" title="Scrollrichtung wechseln"></button>
        </div>
        <div class="gtt-scroll" id="gttScroll">
            <div class="gtt-header" id="gttHeader"></div>
            <div class="gtt-track" id="gttTrack"></div>
        </div>
        <div class="gtt-detail-backdrop" id="gttDetailBackdrop" data-action="close-grid-detail"></div>
        <div class="gtt-detail" id="gttDetail"></div>
    `;

    const tabsContainer = document.getElementById('gttDayTabs');
    tabsContainer.innerHTML = days.map(d =>
        `<button class="gtt-day-tab ${d.value === store.gridDay ? 'active' : ''}" data-day="${d.value}" data-action="set-grid-day">${d.label}</button>`
    ).join('');

    applyGridScrollMode();
    refreshGridTimetable();
}

// Locks single-finger touch panning to one axis at a time (mouse wheel / trackpad /
// scrollbar still work on both) — avoids accidental diagonal drags on a 2D grid.
export function toggleGridScrollMode() {
    store.gridScrollMode = store.gridScrollMode === 'vertical' ? 'horizontal' : 'vertical';
    applyGridScrollMode();
}

function applyGridScrollMode() {
    const scroll = document.getElementById('gttScroll');
    const btn = document.getElementById('gttScrollToggle');
    if (!scroll || !btn) return;
    const isVertical = store.gridScrollMode === 'vertical';
    scroll.classList.toggle('scroll-v', isVertical);
    scroll.classList.toggle('scroll-h', !isVertical);
    btn.textContent = isVertical ? '↕' : '↔';
    btn.setAttribute('aria-label', isVertical ? 'Scrollt vertikal (Stunden) – zum Wechseln tippen' : 'Scrollt horizontal (Bühnen) – zum Wechseln tippen');
}

export function setGridDay(dayValue) {
    store.gridDay = dayValue;
    refreshGridTimetable();
    document.querySelectorAll('#gttDayTabs .gtt-day-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.day === dayValue);
    });
}

export function refreshGridTimetable() {
    const data = store.pageData.timetable;
    const header = document.getElementById('gttHeader');
    const track = document.getElementById('gttTrack');
    if (!header || !track) return;

    const events = data.events.filter(ev =>
        ev.day === store.gridDay && ev.start_time && ev.end_time && ev.stage && ev.type !== 'space'
    );

    if (events.length === 0) {
        header.innerHTML = '';
        track.innerHTML = '<div class="empty" style="padding:40px 20px;">Keine geplanten Acts für diesen Tag</div>';
        return;
    }

    // Group by stage, in the festival's canonical stage order.
    const stageOrder = data.filters.stages.map(s => s.value);
    const byStage = new Map();
    events.forEach(ev => {
        if (!byStage.has(ev.stage)) byStage.set(ev.stage, []);
        byStage.get(ev.stage).push(ev);
    });
    const stages = [...byStage.keys()].sort((a, b) => stageOrder.indexOf(a) - stageOrder.indexOf(b));

    events.forEach(ev => {
        ev._start = toContinuousMinutes(ev.start_time);
        ev._end = toContinuousMinutes(ev.end_time);
        if (ev._end <= ev._start) ev._end += 24 * 60;
    });

    const gridMin = Math.floor(Math.min(...events.map(e => e._start)) / 60) * 60;
    const gridMax = Math.ceil(Math.max(...events.map(e => e._end)) / 60) * 60;
    const gridHeight = (gridMax - gridMin) * PX_PER_MIN;

    // Assign overlap lanes per stage (greedy interval partitioning, calendar-style).
    const stageLanes = new Map();
    stages.forEach(stage => {
        const stageEvents = byStage.get(stage).sort((a, b) => a._start - b._start);
        const laneEnds = [];
        stageEvents.forEach(ev => {
            let lane = laneEnds.findIndex(end => end <= ev._start);
            if (lane === -1) lane = laneEnds.length;
            laneEnds[lane] = ev._end;
            ev._lane = lane;
        });
        stageLanes.set(stage, laneEnds.length);
    });

    header.innerHTML = '<div class="gtt-corner"></div>' + stages.map(stage => {
        const label = data.filters.stages.find(s => s.value === stage)?.label || stage;
        const width = Math.max(COL_WIDTH, stageLanes.get(stage) * LANE_WIDTH);
        return `<div class="gtt-stagehead" style="width:${width}px;--stage-color:${stageColor(stage)}">${label}</div>`;
    }).join('');

    const hourLabels = [];
    for (let m = gridMin; m <= gridMax; m += 60) {
        hourLabels.push(`<div class="gtt-hour-label" style="top:${(m - gridMin) * PX_PER_MIN}px">${String(Math.floor(m / 60) % 24).padStart(2, '0')}:00</div>`);
    }

    const stageColumns = stages.map(stage => {
        const width = Math.max(COL_WIDTH, stageLanes.get(stage) * LANE_WIDTH);
        const blocks = byStage.get(stage).map(ev => renderEventBlock(ev, gridMin)).join('');
        return `<div class="gtt-stagecol" style="width:${width}px;height:${gridHeight}px;--stage-color:${stageColor(stage)}">${blocks}</div>`;
    }).join('');

    let nowLine = '';
    if (store.gridDay === getEffectiveFestivalDay()) {
        const now = new Date();
        let nowMin = now.getHours() * 60 + now.getMinutes();
        if (now.getHours() < DAY_ROLLOVER_HOUR) nowMin += 24 * 60;
        if (nowMin >= gridMin && nowMin <= gridMax) {
            nowLine = `<div class="gtt-now-line" style="top:${(nowMin - gridMin) * PX_PER_MIN}px"></div>`;
        }
    }

    track.innerHTML = `
        <div class="gtt-timeaxis" style="height:${gridHeight}px">${hourLabels.join('')}</div>
        ${stageColumns}
        ${nowLine}
    `;

    if (store.gridDay === getEffectiveFestivalDay()) scrollGridToNow(gridMin);
}

function renderEventBlock(ev, gridMin) {
    const idx = store.pageData.timetable.events.indexOf(ev);
    const top = (ev._start - gridMin) * PX_PER_MIN;
    const height = Math.max(24, (ev._end - ev._start) * PX_PER_MIN);
    const left = ev._lane * LANE_WIDTH;
    return `
    <div class="gtt-event" data-item-index="${idx}" data-action="toggle-grid-event" style="top:${top}px;height:${height}px;left:${left}px;width:${LANE_WIDTH - 4}px">
        <span class="gtt-event-time">${ev.start_time}</span>
        <span class="gtt-event-title">${ev.title}</span>
    </div>`;
}

export function openGridEventDetail(el) {
    const idx = parseInt(el.dataset.itemIndex, 10);
    const ev = store.pageData.timetable.events[idx];
    if (!ev) return;

    const detail = document.getElementById('gttDetail');
    const backdrop = document.getElementById('gttDetailBackdrop');
    const hosts = ev.hosts && ev.hosts.length ? `<span class="event-hosts">${ev.hosts.join(', ')}</span>` : '';
    const desc = ev.description || ev.excerpt || '';

    detail.innerHTML = `
        <div class="gtt-detail-panel">
            <button class="gtt-detail-close" data-action="close-grid-detail">✕</button>
            <div class="tt-event-meta">
                <span class="event-time">${ev.start_time}${ev.end_time ? ` – ${ev.end_time}` : ''}</span>
                <span class="event-type">${ev.category}</span>
            </div>
            <h3>${ev.title}</h3>
            <span class="event-stage">${ev.stage_label}</span>
            ${hosts}
            ${desc ? `<div class="tt-event-detail-inner">${desc}</div>` : ''}
            <div class="gtt-detail-actions">${favButton('timetable', idx)}</div>
        </div>
    `;
    detail.classList.add('open');
    backdrop.classList.add('open');
}

export function closeGridEventDetail() {
    const detail = document.getElementById('gttDetail');
    const backdrop = document.getElementById('gttDetailBackdrop');
    if (detail) detail.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
}

function scrollGridToNow(gridMin) {
    setTimeout(() => {
        const scroll = document.getElementById('gttScroll');
        const line = document.querySelector('.gtt-now-line');
        if (!scroll || !line) return;
        const headerHeight = document.getElementById('gttHeader')?.offsetHeight || 0;
        scroll.scrollTop = Math.max(0, line.offsetTop - headerHeight - 80);
    }, 150);
}
