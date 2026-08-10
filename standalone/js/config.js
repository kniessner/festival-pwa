export const PAGES = [
    { slug: 'home', labelKey: 'nav.home', icon: '🏠' },
    { slug: 'favorites', labelKey: 'nav.favorites', icon: 'plan.svg' },
    { slug: 'timetable', labelKey: 'nav.timetable', icon: 'program.svg' },
    { slug: 'grid', labelKey: 'nav.grid', icon: 'timetable.svg' },
    { slug: 'info', labelKey: 'nav.info', icon: 'info.svg' },
    { slug: 'map', labelKey: 'nav.festivalmap', icon: 'plan.svg' }
];
export const DATA_FILES = { info: 'info.json', timetable: 'timetable.json', notifications: 'notifications.json', music: 'music.json' };
export const FAV_KEY = 'bucht-favorites';
export const NOTIFICATIONS_SEEN_KEY = 'bucht-notifications-seen';
// Sticky flag: user engaged with the Location prompt overlay (either
// button). Rolls per festival edition — bumping 2026 → 2027 next year
// wipes onboarding state for returning users.
export const LOCATION_PROMPT_KEY = 'bucht-2026-location-prompt-completed';
// Same sticky-once semantics, own flag — the push prompt is a separate
// screen/permission from location, shown right after it.
export const PUSH_PROMPT_KEY = 'bucht-2026-push-prompt-completed';

// Sticky flag for the one-shot "where is my tent?" intro dialog shown on
// the first Interactive-map visit. Roll alongside the other *_PROMPT_KEYs
// when a new edition needs returning users to see the intro again.
export const TENT_INTRO_PROMPT_KEY = 'bucht-2026-tent-intro-completed';
export const FESTIVAL_DATES = ['2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16'];
export const FESTIVAL_START = '2026-08-13T00:00:00';
export function pageIdx(slug) { return PAGES.findIndex(p => p.slug === slug); }
