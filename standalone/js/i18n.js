const STRINGS = {
    de: {
        // common
        'common.loading': 'Laden...',
        'common.noContent': 'Keine Inhalte verfügbar',
        'common.favorite': 'Favorit',
        'common.detailsSoon': 'Details folgen bald.',
        'common.updatedOn': 'Stand: {{date}}',
        // nav
        'nav.home': 'Home',
        'nav.timetable': 'Programm',
        'nav.grid': 'Timetable',
        'nav.favorites': 'Mein Plan',
        'nav.info': 'Info',
        // search
        'search.placeholder': 'Suchen...',
        'search.resultsTitle': 'Suchergebnisse',
        'search.noResults': 'Keine Ergebnisse für "{{query}}"',
        // install / offline
        'install.addToHome': 'Zum Startbildschirm',
        'install.updateAvailable': 'Neue Version verfügbar',
        'install.updateNow': 'Aktualisieren',
        'install.updateLater': 'Später',
        'install.offline': 'Offline — Inhalte zwischengespeichert',
        'install.installed': 'App installiert',
        'install.iosShareHint': 'iOS: Tippe unten auf Teilen → Zum Home-Bildschirm',
        'install.alreadyInstalled': 'Bereits installiert',
        'install.androidHint': 'Chrome/Edge auf Android: Menü → Zum Startbildschirm',
        'install.installing': 'App wird installiert...',
        'install.cancelled': 'Installieren abgebrochen',
        'install.iosHintText': 'iOS: Teilen → "Zum Home-Bildschirm"',
        // home
        'home.quickProgram': '📅 Programm',
        'home.quickInfo': 'ℹ️ Info',
        'home.quickMyPlan': '⭐ Mein Plan ({{count}})',
        'home.runningNow': '🔴 Läuft gerade',
        'home.nextEvent': '⭐ Dein nächstes Event',
        'home.importantInfo': '📍 Wichtige Infos',
        'home.cultureProgram': 'Kulturprogramm',
        'home.eventsAcrossDays': '149+ Events über alle Tage',
        'home.cashlessFaqs': 'Cashless & FAQs',
        'home.everythingAboutFestival': 'Alles rund ums Festival',
        'home.newsUpdates': 'News & Updates',
        'home.importantInfoUpdates': 'Wichtige Infos und Updates',
        'home.myPlan': 'Mein Plan',
        'home.savedCount': '{{count}} gespeichert',
        'home.addFavorites': 'Favoriten hinzufügen',
        'home.countdownToday': 'Heute!',
        'home.countdownOver': 'Vorbei',
        // timetable
        'tt.loading': 'Programm wird geladen…',
        'tt.emptySelection': 'Keine Events für diese Auswahl',
        'tt.filterButton': 'Filter',
        'tt.filterTitle': 'Filter',
        'tt.stageLabel': 'Bühne / Stage',
        'tt.allStages': 'Alle Bühnen',
        'tt.categoryLabel': 'Kategorie',
        'tt.allCategories': 'Alle Kategorien',
        'tt.genreLabel': 'Genre',
        'tt.allGenres': 'Alle Genres',
        'tt.resetFilters': 'Filter zurücksetzen',
        'tt.more': '+ Mehr',
        'tt.less': '− Weniger',
        'tt.now': 'JETZT',
        // grid
        'grid.empty': 'Keine geplanten Acts für diesen Tag',
        'grid.toggleTitle': 'Ausrichtung wechseln',
        'grid.ariaVertical': 'Events laufen von oben nach unten – zum Wechseln tippen',
        'grid.ariaHorizontal': 'Events laufen von links nach rechts – zum Wechseln tippen',
        // favorites
        'fav.title': '⭐ Mein Plan',
        'fav.emptyHint': 'Noch keine Favoriten. Tippe auf den Stern ⭐ bei Events im Programm, um sie hier zu speichern.',
        // info
        'info.tabNews': 'News',
        'info.tabCashless': 'Cashless',
        'info.tabFaqs': 'FAQs',
        'info.newsEmpty': 'Aktuelle News werden hier angezeigt, sobald verfügbar.'
    },
    en: {
        'common.loading': 'Loading...',
        'common.noContent': 'No content available',
        'common.favorite': 'Favorite',
        'common.detailsSoon': 'Details coming soon.',
        'common.updatedOn': 'Updated: {{date}}',
        'nav.home': 'Home',
        'nav.timetable': 'Program',
        'nav.grid': 'Timetable',
        'nav.favorites': 'My Plan',
        'nav.info': 'Info',
        'search.placeholder': ' Search...',
        'search.resultsTitle': 'Search results',
        'search.noResults': 'No results for "{{query}}"',
        'install.addToHome': 'Add to Home Screen',
        'install.updateAvailable': 'New version available',
        'install.updateNow': 'Update',
        'install.updateLater': 'Later',
        'install.offline': 'Offline — content cached',
        'install.installed': 'App installed',
        'install.iosShareHint': 'iOS: Tap Share below → Add to Home Screen',
        'install.alreadyInstalled': 'Already installed',
        'install.androidHint': 'Chrome/Edge on Android: Menu → Add to Home Screen',
        'install.installing': 'Installing app...',
        'install.cancelled': 'Install cancelled',
        'install.iosHintText': 'iOS: Share → "Add to Home Screen"',
        'home.quickProgram': '📅 Program',
        'home.quickInfo': 'ℹ️ Info',
        'home.quickMyPlan': '⭐ My Plan ({{count}})',
        'home.runningNow': '🔴 Happening now',
        'home.nextEvent': '⭐ Your next event',
        'home.importantInfo': '📍 Important Info',
        'home.cultureProgram': 'Culture Program',
        'home.eventsAcrossDays': '149+ events across all days',
        'home.cashlessFaqs': 'Cashless & FAQs',
        'home.everythingAboutFestival': 'Everything about the festival',
        'home.newsUpdates': 'News & Updates',
        'home.importantInfoUpdates': 'Important info and updates',
        'home.myPlan': 'My Plan',
        'home.savedCount': '{{count}} saved',
        'home.addFavorites': 'Add favorites',
        'home.countdownToday': 'Today!',
        'home.countdownOver': 'Over',
        'tt.loading': 'Program is loading…',
        'tt.emptySelection': 'No events for this selection',
        'tt.filterButton': ' Filter',
        'tt.filterTitle': 'Filter',
        'tt.stageLabel': 'Stage',
        'tt.allStages': 'All stages',
        'tt.categoryLabel': 'Category',
        'tt.allCategories': 'All categories',
        'tt.genreLabel': 'Genre',
        'tt.allGenres': 'All genres',
        'tt.resetFilters': 'Reset filters',
        'tt.more': '+ More',
        'tt.less': '− Less',
        'tt.now': 'NOW',
        'grid.empty': 'No scheduled acts for this day',
        'grid.toggleTitle': 'Switch orientation',
        'grid.ariaVertical': 'Events run top to bottom – tap to switch',
        'grid.ariaHorizontal': 'Events run left to right – tap to switch',
        'fav.title': '⭐ My Plan',
        'fav.emptyHint': 'No favorites yet. Tap the star ⭐ on events in the program to save them here.',
        'info.tabNews': 'News',
        'info.tabCashless': 'Cashless',
        'info.tabFaqs': 'FAQs',
        'info.newsEmpty': 'Current news will be shown here once available.'
    }
};

const LANG_KEY = 'bucht-lang';

export function getLang() {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === 'de' || stored === 'en') return stored;
    const initial = navigator.language && navigator.language.toLowerCase().startsWith('en') ? 'en' : 'de';
    localStorage.setItem(LANG_KEY, initial);
    return initial;
}

export function setLang(lang) {
    localStorage.setItem(LANG_KEY, lang);
    document.documentElement.lang = lang;
}

export function t(key, vars) {
    const str = STRINGS[getLang()]?.[key] ?? STRINGS.de[key] ?? key;
    if (!vars) return str;
    return Object.entries(vars).reduce((s, [k, v]) => s.replace(`{{${k}}}`, v), str);
}
