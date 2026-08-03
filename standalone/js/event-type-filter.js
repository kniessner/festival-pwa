import { store } from './store.js';
import { t } from './i18n.js';

// Music events (merged in from music.json by music.js) always carry
// category === 'Music' — every other event (scraped by
// _build_timetable.py: Performance/Workshop/Talk/Space) is "culture".
// Confirmed unambiguous: no non-music source ever produces this value.
export function isMusicEvent(ev) {
    return ev.category === 'Music';
}

export function matchesEventType(ev) {
    return store.eventTypeFilter === 'music' ? isMusicEvent(ev) : !isMusicEvent(ev);
}

// Stage/category selections from one tab can be meaningless (or simply
// absent) under the other — e.g. a music-only stage doesn't exist in the
// culture event set. Reset them to 'all' on every tab switch so the user
// never lands on a silent, filtered-to-nothing view.
export function resetTypeSpecificFilters(filters) {
    filters.stage = 'all';
    filters.category = 'all';
}

// Stage options scoped to whichever tab is active — avoids showing a
// stage pill that would filter the list down to zero results (e.g. a
// music-only stage while viewing Culture, or vice versa).
export function stagesForCurrentType(events, stageOptions) {
    const present = new Set(events.filter(matchesEventType).map(ev => ev.stage));
    return stageOptions.filter(s => present.has(s.value));
}

// Shared markup for both views (Program list / grid Timetable) — only the
// action name differs, since each view wires its own setEventType()
// wrapper (same convention as the existing per-view setDay/setGridDay).
export function renderEventTypeTabs(actionName) {
    const music = store.eventTypeFilter === 'music';
    return `
        <div class="tt-type-tabs">
            <button class="tt-type-tab ${music ? 'active' : ''}" data-action="${actionName}" data-type="music">${t('evt.music')}</button>
            <button class="tt-type-tab ${!music ? 'active' : ''}" data-action="${actionName}" data-type="culture">${t('evt.culture')}</button>
        </div>
    `;
}
