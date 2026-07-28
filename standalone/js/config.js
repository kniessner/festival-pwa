export const PAGES = [
    { slug: 'home', labelKey: 'nav.home', icon: '🏠' },
    { slug: 'favorites', labelKey: 'nav.favorites', icon: '⭐' },
    { slug: 'timetable', labelKey: 'nav.timetable', icon: '📅' },
    { slug: 'grid', labelKey: 'nav.grid', icon: '▦' },
    { slug: 'info', labelKey: 'nav.info', icon: 'ℹ️' }
];
export const DATA_FILES = { info: 'info.json', timetable: 'timetable.json' };
export const FAV_KEY = 'bucht-favorites';
export const FESTIVAL_DATES = ['2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16'];
export const FESTIVAL_START = '2026-08-13T00:00:00';
export function pageIdx(slug) { return PAGES.findIndex(p => p.slug === slug); }
