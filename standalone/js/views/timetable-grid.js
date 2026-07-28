import { store } from '../store.js';
import { favButton } from '../ui.js';
import { getEffectiveFestivalDay } from '../festival.js';
import { t } from '../i18n.js';

const PX_PER_MIN = 2;
const COL_WIDTH = 130;      // vertical mode: fixed width for every stage column
const AXIS_WIDTH = 52;      // vertical mode: time-axis / corner column width
const STAGE_LABEL_WIDTH = 96; // horizontal mode: stage-label column width
const LANE_HEIGHT = 60;     // horizontal mode: overlap-lane height within a stage row
const DAY_GAP = 28;         // horizontal mode: gap between consecutive day blocks

// Stage acts run around the clock, so hours before this cutoff belong to the
// previous festival night rather than a new calendar day.
const DAY_ROLLOVER_HOUR = 6;

// Every day block spans this same fixed 24h window — 6am through 6am the next
// morning — regardless of whether events fill it. Using the rollover hour as
// both ends (rather than e.g. noon) is what makes consecutive days meet with
// zero gap: day N's block always ends exactly where day N+1's begins.
const DAY_WINDOW_START = DAY_ROLLOVER_HOUR * 60;
const DAY_WINDOW_END = (24 + DAY_ROLLOVER_HOUR) * 60;

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

// Event blocks are colored by type, not by stage — matches the Figma legend
// (Spaces/Music/Workshop/Performance). 'Music' has no data yet (stages/acts
// not imported), so it's a placeholder for when that category shows up.
const CATEGORY_COLORS = {
    'Space': '#e0847a',
    'Music': '#ef8a2c',
    'Workshop': '#e0b400',
    'Performance': '#2ea88a',
    'Talk': '#5a5ad1'
};
function categoryColor(category) { return CATEGORY_COLORS[category] || '#b0327a'; }

function toContinuousMinutes(time) {
    let [h, m] = time.split(':').map(Number);
    if (h < DAY_ROLLOVER_HOUR) h += 24;
    return h * 60 + m;
}

// Horizontal mode's day-block offsets from the most recent render, keyed by day
// value — lets the day tabs jump-scroll the continuous strip, and lets the
// scroll handler below figure out which day is currently in view.
let gridDayOffsets = [];

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
        <div class="gtt-legend">
            <span class="gtt-legend-item"><span class="gtt-legend-swatch" style="background:${categoryColor('Space')}"></span>${t('grid.legendSpace')}</span>
            <span class="gtt-legend-item"><span class="gtt-legend-swatch" style="background:${categoryColor('Music')}"></span>${t('grid.legendMusic')}</span>
            <span class="gtt-legend-item"><span class="gtt-legend-swatch" style="background:${categoryColor('Workshop')}"></span>${t('grid.legendWorkshop')}</span>
            <span class="gtt-legend-item"><span class="gtt-legend-swatch" style="background:${categoryColor('Performance')}"></span>${t('grid.legendPerformance')}</span>
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
// columns) one day at a time; 'horizontal' lays every day out left-to-right as one
// continuous, endlessly scrollable strip (time runs across, stages are rows).
// Switching re-renders the whole grid transposed, not just the pan axis.
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

// In horizontal mode every day already lives on the one continuous strip, so a
// day tab just scrolls there instead of re-rendering. Vertical mode still shows
// one day at a time, so it re-renders as before.
export function setGridDay(dayValue) {
    store.gridDay = dayValue;
    if (store.gridScrollMode === 'horizontal') {
        const target = gridDayOffsets.find(o => o.day === dayValue);
        const scroll = document.getElementById('gttScroll');
        if (target && scroll) scroll.scrollLeft = Math.max(0, target.offset - 8);
    } else {
        refreshGridTimetable();
    }
    document.querySelectorAll('#gttDayTabs .gtt-day-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.day === dayValue);
    });
}

// Builds one day's stage/lane layout — used directly by vertical mode (single
// day) and as one segment of the continuous strip in horizontal mode.
function buildDayBlock(data, dayValue) {
    // Anything with a real slot (start, end, and a stage) gets plotted — including
    // "Space" installations that run for a set window, e.g. De Loite 10:00-21:00.
    const events = data.events.filter(ev =>
        ev.day === dayValue && ev.start_time && ev.end_time && ev.stage
    );
    if (events.length === 0) return null;

    events.forEach(ev => {
        ev._start = toContinuousMinutes(ev.start_time);
        ev._end = toContinuousMinutes(ev.end_time);
        if (ev._end <= ev._start) ev._end += 24 * 60;
    });

    // Every day always shows the full 6am-to-6am festival window, even the hours
    // no stage has anything on — cropping tightly to the first/last event made
    // quiet stretches (and the gap between one day's block and the next)
    // disappear from the timeline entirely. Real events outside that window
    // (very early risers, very late closers) still
    // expand it rather than getting clipped.
    const gridMin = Math.min(DAY_WINDOW_START, Math.floor(Math.min(...events.map(e => e._start)) / 60) * 60);
    const gridMax = Math.max(DAY_WINDOW_END, Math.ceil(Math.max(...events.map(e => e._end)) / 60) * 60);

    // Group by stage, in the festival's canonical stage order.
    const stageOrder = data.filters.stages.map(s => s.value);
    const byStage = new Map();
    events.forEach(ev => {
        if (!byStage.has(ev.stage)) byStage.set(ev.stage, []);
        byStage.get(ev.stage).push(ev);
    });
    const stages = [...byStage.keys()].sort((a, b) => stageOrder.indexOf(a) - stageOrder.indexOf(b));

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

    return { dayValue, gridMin, gridMax, byStage, stages, stageLanes };
}

export function refreshGridTimetable() {
    const data = store.pageData.timetable;
    const header = document.getElementById('gttHeader');
    const track = document.getElementById('gttTrack');
    if (!header || !track) return;

    if (store.gridScrollMode === 'horizontal') {
        const blocks = data.filters.days.map(d => buildDayBlock(data, d.value)).filter(Boolean);
        if (blocks.length === 0) {
            header.innerHTML = '';
            track.innerHTML = `<div class="empty" style="padding:40px 20px;">${t('grid.empty')}</div>`;
            return;
        }
        renderHorizontalLayout({ data, header, track, blocks });
    } else {
        const block = buildDayBlock(data, store.gridDay);
        if (!block) {
            header.innerHTML = '';
            track.innerHTML = `<div class="empty" style="padding:40px 20px;">${t('grid.empty')}</div>`;
            return;
        }
        renderVerticalLayout({ data, header, track, ...block });
    }
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

// The continuous, "endless" strip: every festival day laid out left-to-right in
// order, sharing one set of stage rows, separated by a visible gap + divider —
// you scroll straight from one day into the next instead of switching tabs.
function renderHorizontalLayout({ data, header, track, blocks }) {
    let cursor = 0;
    blocks.forEach(b => {
        b._offset = cursor;
        b._width = (b.gridMax - b.gridMin) * PX_PER_MIN;
        cursor += b._width + DAY_GAP;
    });
    const gridWidth = cursor - DAY_GAP;
    const totalWidth = STAGE_LABEL_WIDTH + gridWidth;

    // Stage rows span every day block — union of stages, canonical order.
    const stageOrder = data.filters.stages.map(s => s.value);
    const stageSet = new Set();
    blocks.forEach(b => b.stages.forEach(s => stageSet.add(s)));
    const stages = [...stageSet].sort((a, b) => stageOrder.indexOf(a) - stageOrder.indexOf(b));

    // Hour ticks, continuous across the whole strip — the first tick of each day
    // carries that day's label as a small badge instead of a separate marker row.
    // Vertical gridlines (one per tick) are collected separately and drawn once
    // across the full track height, rather than as a per-row CSS repeating
    // background — a repeating pattern can't restart its phase at each day's
    // offset, so it drifts out of alignment with the real hour boundaries as
    // soon as a day's block width isn't an exact multiple of the tick spacing.
    const hourLabels = [];
    const hourTicks = [];
    blocks.forEach(b => {
        const dayLabel = data.filters.days.find(d => d.value === b.dayValue)?.label || '';
        let first = true;
        for (let m = b.gridMin; m <= b.gridMax; m += 60) {
            const rulerLeft = b._offset + (m - b.gridMin) * PX_PER_MIN;
            const hourText = `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:00`;
            const text = first ? `${dayLabel} ${hourText}` : hourText;
            hourLabels.push(`<div class="gtt-hour-label-h ${first ? 'gtt-hour-label-day' : ''}" style="left:${rulerLeft}px">${text}</div>`);
            // Ticks live inside .gtt-track, not the ruler, so they need the stage-label
            // column's width added to line up with the ruler/row content above/below them.
            if (!first) hourTicks.push(`<div class="gtt-hour-tick" style="left:${STAGE_LABEL_WIDTH + rulerLeft}px"></div>`);
            first = false;
        }
    });

    header.innerHTML = `
        <div class="gtt-corner gtt-corner-day" id="gttCornerDay" style="width:${STAGE_LABEL_WIDTH}px"></div>
        <div class="gtt-hour-ruler" style="width:${gridWidth}px">${hourLabels.join('')}</div>
    `;

    // Row height: the tallest lane-count that stage needs on any single day.
    const rowHeights = stages.map(stage => {
        const maxLanes = Math.max(1, ...blocks.map(b => b.stageLanes.get(stage) || 0));
        return Math.max(LANE_HEIGHT, maxLanes * LANE_HEIGHT);
    });
    const totalHeight = rowHeights.reduce((a, b) => a + b, 0);

    const rows = stages.map((stage, i) => {
        const label = data.filters.stages.find(s => s.value === stage)?.label || stage;
        const height = rowHeights[i];
        const blocksHtml = blocks.map(b => {
            const evs = b.byStage.get(stage);
            return evs ? evs.map(ev => renderEventBlockH(ev, b.gridMin, b._offset)).join('') : '';
        }).join('');
        return `
        <div class="gtt-stagerow-wrap" style="height:${height}px">
            <div class="gtt-stagelabel ${i % 2 === 1 ? 'gtt-alt' : ''}">${label}</div>
            <div class="gtt-stagerow" style="width:${gridWidth}px">${blocksHtml}</div>
        </div>`;
    }).join('');

    // Vertical day-boundary dividers spanning every stage row.
    const dividers = blocks.slice(1).map(b =>
        `<div class="gtt-day-divider" style="left:${STAGE_LABEL_WIDTH + b._offset - DAY_GAP / 2}px"></div>`
    ).join('');

    const todayBlock = blocks.find(b => b.dayValue === getEffectiveFestivalDay());
    let nowLine = '';
    if (todayBlock) {
        const nowMin = currentContinuousMinutes();
        if (nowMin >= todayBlock.gridMin && nowMin <= todayBlock.gridMax) {
            nowLine = `<div class="gtt-now-line-v" style="left:${STAGE_LABEL_WIDTH + todayBlock._offset + (nowMin - todayBlock.gridMin) * PX_PER_MIN}px"></div>`;
        }
    }

    header.style.width = totalWidth + 'px';
    track.className = 'gtt-track gtt-track-h';
    track.style.width = totalWidth + 'px';
    track.style.height = totalHeight + 'px';
    track.innerHTML = rows + hourTicks.join('') + dividers + nowLine;

    gridDayOffsets = blocks.map(b => ({ day: b.dayValue, offset: b._offset }));

    const scroll = document.getElementById('gttScroll');
    if (scroll) {
        if (!scroll._gttScrollBound) {
            scroll.addEventListener('scroll', onGridScroll);
            scroll._gttScrollBound = true;
        }
        scroll.scrollTop = 0;
        if (store.gridDay === getEffectiveFestivalDay() && todayBlock) {
            scrollGridToNow('horizontal');
        } else {
            const target = gridDayOffsets.find(o => o.day === store.gridDay) || gridDayOffsets[0];
            if (target) scroll.scrollLeft = Math.max(0, target.offset - 8);
        }
    }
    onGridScroll();
}

// As the user free-scrolls across the continuous strip, keep the sticky corner
// label and the day-tabs' active state in sync with whichever day is in view.
function onGridScroll() {
    const scroll = document.getElementById('gttScroll');
    const corner = document.getElementById('gttCornerDay');
    if (!scroll || !corner || !gridDayOffsets.length) return;

    const x = scroll.scrollLeft + 8;
    let current = gridDayOffsets[0];
    for (const o of gridDayOffsets) {
        if (x >= o.offset) current = o; else break;
    }

    const label = store.pageData.timetable?.filters.days.find(d => d.value === current.day)?.label || '';
    corner.textContent = label;

    if (store.gridDay !== current.day) {
        store.gridDay = current.day;
        document.querySelectorAll('#gttDayTabs .gtt-day-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.day === current.day);
        });
    }
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
    <div class="gtt-event" data-item-index="${idx}" data-action="toggle-grid-event" style="top:${top}px;height:${height}px;left:${left}px;width:${laneWidth - 4}px;--event-color:${categoryColor(ev.category)}">
        <span class="gtt-event-time">${ev.start_time}</span>
        <span class="gtt-event-title">${ev.title}</span>
    </div>`;
}

function renderEventBlockH(ev, gridMin, dayOffset) {
    const idx = store.pageData.timetable.events.indexOf(ev);
    const left = dayOffset + (ev._start - gridMin) * PX_PER_MIN;
    const width = Math.max(40, (ev._end - ev._start) * PX_PER_MIN);
    const top = ev._lane * LANE_HEIGHT;
    return `
    <div class="gtt-event" data-item-index="${idx}" data-action="toggle-grid-event" style="left:${left}px;width:${width}px;top:${top}px;height:${LANE_HEIGHT - 6}px;--event-color:${categoryColor(ev.category)}">
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
            <div class="gtt-detail-meta">
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
