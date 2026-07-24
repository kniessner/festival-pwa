export const PAGES = [
    { slug: 'home', label: 'Home', icon: '🏠' },
    { slug: 'timetable', label: 'Programm', icon: '📅' },
    { slug: 'grid', label: 'Timetable', icon: '▦' },
    { slug: 'favorites', label: 'Mein Plan', icon: '⭐' },
    { slug: 'info', label: 'Info', icon: 'ℹ️' }
];
export const DATA_FILES = { info: 'info.json', timetable: 'timetable.json' };
export const FAV_KEY = 'bucht-favorites';
export const FESTIVAL_DATES = ['2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16'];
export const WEEKDAY_MAP = { 0: '2026-08-16', 4: '2026-08-13', 5: '2026-08-14', 6: '2026-08-15' };
export const FESTIVAL_START = '2026-08-13T00:00:00';
export function pageIdx(slug) { return PAGES.findIndex(p => p.slug === slug); }
