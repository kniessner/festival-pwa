/**
 * Lightweight re-implementation of the festival timetable interactions
 * for raw pages rendered inside a Shadow DOM.
 *
 * Exposed as window.initFestivalTimetable(root).
 */
window.initFestivalTimetable = function (root) {
    if (!root) root = document;

    const accordion = root.querySelector('.festival-accordion');
    if (!accordion) return;

    function toggleItem(wrapper, forceOpen) {
        const title = wrapper.querySelector('.eb-accordion-title-wrapper, .festival-accordion-title-wrapper');
        const content = wrapper.querySelector('.eb-accordion-content-wrapper, .festival-accordion-content-wrapper');
        const icon = wrapper.querySelector('.eb-accordion-icon');
        if (!content) return;

        const isOpen = wrapper.classList.contains('open') || wrapper.classList.contains('active');
        const open = forceOpen !== undefined ? forceOpen : !isOpen;

        wrapper.classList.toggle('open', open);
        wrapper.classList.toggle('active', open);
        wrapper.classList.toggle('eb-accordion-hidden', !open);
        if (title) title.setAttribute('aria-expanded', open ? 'true' : 'false');
        content.setAttribute('data-collapsed', open ? 'false' : 'true');
        content.style.maxHeight = open ? 'none' : '0';
        content.style.overflow = open ? 'visible' : 'hidden';

        if (icon) {
            icon.classList.toggle('dashicons-plus-alt2', !open);
            icon.classList.toggle('dashicons-minus', open);
        }
    }

    // Accordion toggles
    accordion.querySelectorAll('.eb-accordion-wrapper, .festival-accordion-item').forEach(item => {
        const title = item.querySelector('.eb-accordion-title-wrapper, .festival-accordion-title-wrapper');
        if (!title) return;
        title.addEventListener('click', () => toggleItem(item));
        title.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleItem(item);
            }
        });
    });

    // Filter state
    const state = {
        day: 'all',
        type: 'all',
        lang: 'all',
        stage: 'all'
    };

    function matchesFilter(item, dimension, value) {
        if (value === 'all') return true;
        const attrMap = {
            day: 'data-day',
            type: 'data-types',
            lang: 'data-langs',
            stage: 'data-stages'
        };
        const raw = item.getAttribute(attrMap[dimension]);
        if (!raw) return false;
        const vals = raw.split(/\s+/).filter(Boolean);
        return vals.includes(value);
    }

    function applyFilters() {
        accordion.querySelectorAll('.festival-accordion__day').forEach(day => {
            const daySlug = day.getAttribute('data-day') || 'no-day';
            let dayHasVisible = false;

            day.querySelectorAll('.festival-accordion-item, .eb-accordion-wrapper').forEach(item => {
                const ok = matchesFilter(item, 'day', state.day === 'all' ? 'all' : state.day) &&
                           matchesFilter(item, 'type', state.type) &&
                           matchesFilter(item, 'lang', state.lang) &&
                           matchesFilter(item, 'stage', state.stage);
                item.style.display = ok ? '' : 'none';
                if (ok) dayHasVisible = true;
            });

            if (state.day === 'all') {
                day.style.display = dayHasVisible ? '' : 'none';
            } else {
                day.style.display = (daySlug === state.day) ? '' : 'none';
            }
        });
    }

    function updateButtonActive(groupSelector, dimension, value) {
        const group = accordion.querySelector(groupSelector);
        if (!group) return;
        const map = {
            day: 'data-day-filter',
            type: 'data-filter',
            lang: 'data-lang-filter',
            stage: 'data-stage-filter'
        };
        group.querySelectorAll('.festival-accordion__filter').forEach(btn => {
            btn.classList.toggle('is-active', btn.getAttribute(map[dimension]) === value);
        });
    }

    function bindFilters(groupSelector, dimension, attr) {
        const group = accordion.querySelector(groupSelector);
        if (!group) return;
        group.addEventListener('click', e => {
            const btn = e.target.closest('.festival-accordion__filter');
            if (!btn) return;
            state[dimension] = btn.getAttribute(attr) || 'all';
            updateButtonActive(groupSelector, dimension, state[dimension]);
            applyFilters();
        });
    }

    bindFilters('.festival-accordion__days',   'day',   'data-day-filter');
    bindFilters('.festival-accordion__types',    'type',  'data-filter');
    bindFilters('.festival-accordion__langs',    'lang',  'data-lang-filter');
    bindFilters('.festival-accordion__stages',   'stage', 'data-stage-filter');

    // Toggle for additional filters panel
    const filterToggle = accordion.querySelector('.festival-accordion__filter-toggle');
    const moreFilters = accordion.querySelector('.festival-accordion__more-filters');
    if (filterToggle && moreFilters) {
        filterToggle.addEventListener('click', () => {
            const expanded = filterToggle.getAttribute('aria-expanded') === 'true';
            filterToggle.setAttribute('aria-expanded', !expanded);
            moreFilters.style.display = expanded ? 'none' : 'block';
        });
    }

    // Start collapsed, all items visible
    accordion.querySelectorAll('.eb-accordion-wrapper, .festival-accordion-item').forEach(item => {
        toggleItem(item, false);
    });
    applyFilters();
};
