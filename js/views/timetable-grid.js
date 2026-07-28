import { store } from '../store.js';
import { favButton } from '../ui.js';
import { getEffectiveFestivalDay } from '../festival.js';
import { t } from '../i18n.js';

const PX_PER_MIN = 2;
const COL_WIDTH = 130;      // vertical mode: fixed width for every stage column
const AXIS_WIDTH = 52;      // vertical mode: time-axis / corner column width
const STAGE_LABEL_WIDTH = 96; // horizontal mode: stage-label column width
const LANE_HEIGHT = 60;     // horizontal mode: overlap-lane height within a stage row

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
        container.innerHTML = `<div class="empty">${t('tt.loading')}</div>`;
        return;
    }

    if (!store.gridDay) store.gridDay = getEffectiveFestivalDay();

    // Same day set as the existing Programm list view (incl. Monday's closing acts).
    const days = data.filters.days;

    container.innerHTML = `
        <div class="gtt-toolbar">
            <div class="gtt-daytabs" id="gttDayTabs"></div>
            <button class="gtt-scroll-toggle" id="gttScrollToggle" data-action="toggle-grid-scroll"></button>
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

    updateScrollToggleButton();
    refreshGridTimetable();
}

// Two layouts: 'vertical' stacks events top-to-bottom (time runs down, stages are
// columns); 'horizontal' lays events out left-to-right (time runs across, stages
// are rows). Switching re-renders the whole grid transposed, not just the pan axis.
export function toggleGridScrollMode() {
    store.gridScrollMode = store.gridScrollMode === 'vertical' ? 'horizontal' : 'vertical';
    updateScrollToggleButton();
    refreshGridTimetable();
}

function updateScrollToggleButton() {
    const scroll = document.getElementById('gttScroll');
    const btn = document.getElementById('gttScrollToggle');
    if (!scroll || !btn) return;
    const isVertical = store.gridScrollMode === 'vertical';
    scroll.classList.toggle('scroll-v', isVertical);
    scroll.classList.toggle('scroll-h', !isVertical);
    btn.textContent = isVertical ? '↕' : '↔';
    btn.title = t('grid.toggleTitle');
    btn.setAttribute('aria-label', isVertical ? t('grid.ariaVertical') : t('grid.ariaHorizontal'));
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

    // Anything with a real slot (start, end, and a stage) gets plotted — including
    // "Space" installations that run for a set window, e.g. De Loite 10:00-21:00.
    const events = data.events.filter(ev =>
        ev.day === store.gridDay && ev.start_time && ev.end_time && ev.stage
    );

    if (events.length === 0) {
        header.innerHTML = '';
        track.innerHTML = `<div class="empty" style="padding:40px 20px;">${t('grid.empty')}</div>`;
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

    const ctx = { data, header, track, stages, byStage, stageLanes, gridMin, gridMax };
    if (store.gridScrollMode === 'horizontal') renderHorizontalLayout(ctx);
    else renderVerticalLayout(ctx);
}

function renderVerticalLayout({ data, header, track, stages, byStage, stageLanes, gridMin, gridMax }) {
    const gridHeight = (gridMax - gridMin) * PX_PER_MIN;
    // Every stage column is the same fixed width; a stage with overlapping acts
    // subdivides that width into narrower lanes instead of widening its column.
    const totalWidth = AXIS_WIDTH + stages.length * COL_WIDTH;

    header.innerHTML = '<div class="gtt-corner"></div>' + stages.map(stage => {
        const label = data.filters.stages.find(s => s.value === stage)?.label || stage;
        return `<div class="gtt-stagehead" style="width:${COL_WIDTH}px;--stage-color:${stageColor(stage)}">${label}</div>`;
    }).join('');

    const hourLabels = [];
    for (let m = gridMin; m <= gridMax; m += 60) {
        hourLabels.push(`<div class="gtt-hour-label" style="top:${(m - gridMin) * PX_PER_MIN}px">${String(Math.floor(m / 60) % 24).padStart(2, '0')}:00</div>`);
    }

    const stageColumns = stages.map(stage => {
        const numLanes = stageLanes.get(stage);
        const blocks = byStage.get(stage).map(ev => renderEventBlockV(ev, gridMin, numLanes)).join('');
        return `<div class="gtt-stagecol" style="width:${COL_WIDTH}px;height:${gridHeight}px;--stage-color:${stageColor(stage)}">${blocks}</div>`;
    }).join('');

    let nowLine = '';
    if (store.gridDay === getEffectiveFestivalDay()) {
        const nowMin = currentContinuousMinutes();
        if (nowMin >= gridMin && nowMin <= gridMax) {
            nowLine = `<div class="gtt-now-line" style="top:${(nowMin - gridMin) * PX_PER_MIN}px"></div>`;
        }
    }

    // Header/track must be sized to their full (overflowing) content width explicitly —
    // a flex container's auto width otherwise stays at the scrollport's width, which
    // caps how far position:sticky children can travel before they detach.
    header.style.width = totalWidth + 'px';
    track.className = 'gtt-track gtt-track-v';
    track.style.width = totalWidth + 'px';
    track.style.height = gridHeight + 'px';
    track.innerHTML = `
        <div class="gtt-timeaxis" style="height:${gridHeight}px">${hourLabels.join('')}</div>
        ${stageColumns}
        ${nowLine}
    `;

    const scroll = document.getElementById('gttScroll');
    if (scroll) scroll.scrollLeft = 0;
    if (store.gridDay === getEffectiveFestivalDay()) scrollGridToNow('vertical');
}

function renderHorizontalLayout({ data, header, track, stages, byStage, stageLanes, gridMin, gridMax }) {
    const gridWidth = (gridMax - gridMin) * PX_PER_MIN;
    const totalWidth = STAGE_LABEL_WIDTH + gridWidth;

    const hourLabels = [];
    for (let m = gridMin; m <= gridMax; m += 60) {
        hourLabels.push(`<div class="gtt-hour-label-h" style="left:${(m - gridMin) * PX_PER_MIN}px">${String(Math.floor(m / 60) % 24).padStart(2, '0')}:00</div>`);
    }

    header.innerHTML = `
        <div class="gtt-corner" style="width:${STAGE_LABEL_WIDTH}px"></div>
        <div class="gtt-hour-ruler" style="width:${gridWidth}px">${hourLabels.join('')}</div>
    `;

    const rowHeights = stages.map(stage => Math.max(LANE_HEIGHT, stageLanes.get(stage) * LANE_HEIGHT));
    const totalHeight = rowHeights.reduce((a, b) => a + b, 0);

    const rows = stages.map((stage, i) => {
        const label = data.filters.stages.find(s => s.value === stage)?.label || stage;
        const height = rowHeights[i];
        const blocks = byStage.get(stage).map(ev => renderEventBlockH(ev, gridMin)).join('');
        return `
        <div class="gtt-stagerow-wrap" style="height:${height}px">
            <div class="gtt-stagelabel" style="--stage-color:${stageColor(stage)}">${label}</div>
            <div class="gtt-stagerow" style="width:${gridWidth}px;--stage-color:${stageColor(stage)}">${blocks}</div>
        </div>`;
    }).join('');

    let nowLine = '';
    if (store.gridDay === getEffectiveFestivalDay()) {
        const nowMin = currentContinuousMinutes();
        if (nowMin >= gridMin && nowMin <= gridMax) {
            nowLine = `<div class="gtt-now-line-v" style="left:${STAGE_LABEL_WIDTH + (nowMin - gridMin) * PX_PER_MIN}px"></div>`;
        }
    }

    header.style.width = totalWidth + 'px';
    track.className = 'gtt-track gtt-track-h';
    track.style.width = totalWidth + 'px';
    track.style.height = totalHeight + 'px';
    track.innerHTML = rows + nowLine;

    const scroll = document.getElementById('gttScroll');
    if (scroll) scroll.scrollTop = 0;
    if (store.gridDay === getEffectiveFestivalDay()) scrollGridToNow('horizontal');
}

function currentContinuousMinutes() {
    const now = new Date();
    let nowMin = now.getHours() * 60 + now.getMinutes();
    if (now.getHours() < DAY_ROLLOVER_HOUR) nowMin += 24 * 60;
    return nowMin;
}

function renderEventBlockV(ev, gridMin, numLanes) {
    const idx = store.pageData.timetable.events.indexOf(ev);
    const top = (ev._start - gridMin) * PX_PER_MIN;
    const height = Math.max(24, (ev._end - ev._start) * PX_PER_MIN);
    const laneWidth = COL_WIDTH / numLanes;
    const left = ev._lane * laneWidth;
    return `
    <div class="gtt-event" data-item-index="${idx}" data-action="toggle-grid-event" style="top:${top}px;height:${height}px;left:${left}px;width:${laneWidth - 4}px">
        <span class="gtt-event-time">${ev.start_time}</span>
        <span class="gtt-event-title">${ev.title}</span>
    </div>`;
}

function renderEventBlockH(ev, gridMin) {
    const idx = store.pageData.timetable.events.indexOf(ev);
    const left = (ev._start - gridMin) * PX_PER_MIN;
    const width = Math.max(40, (ev._end - ev._start) * PX_PER_MIN);
    const top = ev._lane * LANE_HEIGHT;
    return `
    <div class="gtt-event" data-item-index="${idx}" data-action="toggle-grid-event" style="left:${left}px;width:${width}px;top:${top}px;height:${LANE_HEIGHT - 6}px">
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

function scrollGridToNow(orientation) {
    setTimeout(() => {
        const scroll = document.getElementById('gttScroll');
        if (!scroll) return;
        if (orientation === 'horizontal') {
            const line = document.querySelector('.gtt-now-line-v');
            if (!line) return;
            scroll.scrollLeft = Math.max(0, line.offsetLeft - STAGE_LABEL_WIDTH - 40);
        } else {
            const line = document.querySelector('.gtt-now-line');
            if (!line) return;
            const headerHeight = document.getElementById('gttHeader')?.offsetHeight || 0;
            scroll.scrollTop = Math.max(0, line.offsetTop - headerHeight - 80);
        }
    }, 150);
}
