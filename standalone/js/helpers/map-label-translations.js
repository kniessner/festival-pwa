// Translation table for on-map geojson labels.
//
// Same shape as js/i18n.js STRINGS for consistency: outer keys are
// language codes, inner keys are the SOURCE (German) strings as they
// live in the geojsons, values are the translated versions.
//
// Scope: only "generic" German labels (produktion, toilet-family,
// checkpoint) that a non-German-speaker won't parse. Proper nouns
// (stages, camps, sterne, gastro place-names) intentionally NOT
// translated \u2014 those are festival identity.
//
// If Berit renames a source string in the geojson, add the DE key
// here so the translation stays wired. Missing entries fall through
// to the German text unchanged.

import { getLang } from '../i18n.js';

export const LABEL_TRANSLATIONS = {
    en: {
        'Einlass / Check-in':   'Entrance / Check-in',
        'Bänderkontrolle':      'Wristband check',
        'Bänderkontrolle 3x3':  'Wristband check 3x3',
        'DRK / Secu Base':      'First aid / Security base',
        'Psycare / DRK zelt':   'Psycare / First aid tent',
        'Dusche':               'Shower',
        'Dusche & WC':          'Shower & WC',
        'Urinale':              'Urinals',
        'Check-in Autos':       'Car check-in',
    },
};

/**
 * Build a MapLibre `text-field` expression for the given language.
 *
 * For German (and any language without translations) this returns the
 * cheapest possible expression \u2014 the raw `text` property lookup, no
 * per-feature branching cost.
 *
 * For any language with translations, it returns a `match` expression
 * that maps German source strings to translated strings, with the
 * German value falling through as the default so proper nouns
 * (Waldtraut, Atlantis, Camp Qualle, l'Amore Pizza\u2026) render
 * unchanged.
 *
 * Rebuilt each time a map is mounted \u2014 the app's language toggle
 * routes through goToPage() \u2192 teardownMap() + renderMap(), so the
 * next mount naturally picks up the new language without a per-layer
 * setLayoutProperty pass.
 *
 * @param {string} [lang]  ISO code; defaults to the current UI lang.
 * @returns {Array}        A MapLibre StyleSpec expression valid as
 *                         a `text-field` value.
 */
export function buildLabelTextFieldExpression(lang = getLang()) {
    const table = LABEL_TRANSLATIONS[lang];
    if (!table || Object.keys(table).length === 0) {
        return ['get', 'text'];
    }
    // Flatten { de: en, ... } into [de, en, de, en, ...] so we can
    // spread it into `match` as the label / output pairs. Default
    // (last) is `['get', 'text']` so anything not in the table
    // renders as its original German string.
    const pairs = [];
    for (const [de, en] of Object.entries(table)) {
        pairs.push(de, en);
    }
    return ['match', ['get', 'text'], ...pairs, ['get', 'text']];
}
