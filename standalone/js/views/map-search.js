// Map-only search UI + matching algorithm.
//
// Trigger surface: the app's shared #searchInput at the top of the
// screen. On /map, js/search.js delegates every keystroke to this
// module instead of opening the timetable search modal. On any other
// route the input keeps its previous modal behaviour.
//
// Result surface: a small cream dropdown anchored beneath the input,
// styled to match the fly-to popover so the two "pick where to fly"
// affordances feel like a single visual system.
//
// Data source: standalone/data/map-search-index.json, generated at
// build time by scripts/build-search-index.mjs. Loaded lazily on the
// first query and cached for the session.
//
// Matching pipeline (see `searchMap` below):
//   1. Normalise the query (lowercase + strip diacritics).
//   2. Synonym pass  → up to 2 "Nearest X" rows resolved by tag.
//   3. Name pass     → exact → prefix → substring, alphabetical inside
//                      each tier. Deduplicated by id.
//   4. Cap the flat list at MAX_RESULTS; overflow becomes a "+N more"
//      indicator row that isn't selectable.
//
// FlyTo dispatch: clicking a result fires a `map:flyTo` CustomEvent on
// `document`. map-interactive.js owns the map instance and handles the
// event (cancels pending pulses, runs the fly, arms the ripple). This
// decouples map-search from any specific map instance.

import { t } from '../i18n.js';
import { store } from '../store.js';
import { getTentPosition } from './tent.js';
import { isNearFestival } from './map-common.js';
import { nearest } from '../helpers/distance.js';

// ─── Configuration ───────────────────────────────────────────────────

const MAX_RESULTS   = 8;
const DEBOUNCE_MS   = 100;
const MIN_QUERY_LEN = 2;

/**
 * Synonym table. Each entry aliases a set of query strings to a
 * single "Nearest X" result whose coord is picked by a `resolver`
 * given the user's fix. Aliases are normalised the same way queries
 * are (lower-cased, diacritics stripped) before matching.
 *
 * The resolver returns `null` if it can't find any matching entry
 * in the index (e.g. the corresponding category was fully blocklisted).
 * Null resolvers are filtered out of the results.
 *
 * `icon` is a filename under standalone/images/. We ship a handful
 * of specific POI icons and fall back to a generic pin for the rest;
 * new-icon requests are on the backlog rather than a blocker.
 */
const SYNONYMS = [
    {
        aliases:  ['toilet', 'toilets', 'wc', 'klo', 'dixi', 'urinal', 'eco toilet', 'plumpsklo'],
        labelKey: 'search.nearestToilet',
        icon:     'images/poi-toilet.svg',
        resolver: (userPos, index) => resolveByTag('toilet', userPos, index),
    },
    {
        aliases:  ['shower', 'showers', 'dusche', 'duschen'],
        labelKey: 'search.nearestShower',
        icon:     'images/poi-generic.svg',
        resolver: (userPos, index) => resolveByTag('shower', userPos, index),
    },
    {
        aliases:  ['bar', 'bars', 'drink', 'drinks', 'cocktail', 'bier', 'beer', 'wine'],
        labelKey: 'search.nearestBar',
        icon:     'images/poi-generic.svg',
        resolver: (userPos, index) => resolveByTag('bar', userPos, index),
    },
    {
        aliases:  ['food', 'essen', 'hunger', 'foodcourt', 'restaurant', 'imbiss'],
        labelKey: 'search.nearestFood',
        icon:     'images/poi-generic.svg',
        resolver: (userPos, index) => resolveByTag('food', userPos, index),
    },
    {
        aliases:  ['first aid', 'firstaid', 'medic', 'doctor', 'drk', 'red cross',
                   'erste hilfe', 'ersthilfe', 'arzt', 'notfall', 'sanitäter', 'sani'],
        labelKey: 'map.flyto.firstAid',
        icon:     'images/poi-firstaid.svg',
        resolver: (userPos, index) => resolveByTag('firstAid', userPos, index),
    },
    {
        aliases:  ['info', 'information', 'help', 'lost and found', 'lost & found', 'lostandfound',
                   'verloren', 'hilfe', 'kiosk'],
        labelKey: 'map.flyto.info',
        icon:     'images/poi-info.svg',
        resolver: (userPos, index) => resolveByTag('info', userPos, index),
    },
    {
        aliases:  ['awareness', 'safe space', 'sicher', 'konsens', 'psycare'],
        labelKey: 'search.awareness',
        icon:     'images/poi-generic.svg',
        resolver: (userPos, index) => resolveByTag('awareness', userPos, index),
    },
    {
        aliases:  ['einlass', 'check-in', 'checkin', 'entry', 'entrance', 'eingang'],
        labelKey: 'search.entrance',
        icon:     'images/poi-generic.svg',
        resolver: (userPos, index) => resolveByTag('entrance', userPos, index),
    },
    {
        aliases:  ['band', 'bänder', 'wristband', 'bänderkontrolle', 'banderkontrolle', 'ticket'],
        labelKey: 'search.wristband',
        icon:     'images/poi-generic.svg',
        resolver: (userPos, index) => resolveByTag('wristband', userPos, index),
    },
    {
        aliases:  ['müll', 'mull', 'muell', 'trash', 'recycling', 'recycle', 'waste', 'abfall'],
        labelKey: 'search.nearestRecycling',
        icon:     'images/poi-generic.svg',
        resolver: (userPos, index) => resolveByTag('recycling', userPos, index),
    },
    {
        // "my tent" isn't in the index — it's whatever coord the tent
        // marker is currently at (persisted in localStorage).
        aliases:  ['tent', 'zelt', 'my tent', 'mein zelt', 'camping', 'mein camp'],
        labelKey: 'map.flyto.tent',
        icon:     'images/poi-tent.svg',
        resolver: () => ({ id: 'my-tent', text: '', category: 'tent', coord: getTentPosition() }),
    },
];

// ─── Index loading ───────────────────────────────────────────────────

let cachedIndex = null;
let inFlight    = null;

async function loadIndex() {
    if (cachedIndex) return cachedIndex;
    if (inFlight) return inFlight;
    inFlight = fetch('data/map-search-index.json')
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`Search index HTTP ${r.status}`)))
        .then(data => { cachedIndex = data; inFlight = null; return data; })
        .catch(err => { inFlight = null; console.warn('[map-search] index load failed', err); return []; });
    return inFlight;
}

// ─── Normalisation ───────────────────────────────────────────────────

function normalise(s) {
    return String(s)
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .trim();
}

// Pre-normalised alias lookup: alias → synonym entry.
// Rebuilt lazily on first query (SYNONYMS is module-const).
let normalisedAliasMap = null;
function getAliasMap() {
    if (normalisedAliasMap) return normalisedAliasMap;
    normalisedAliasMap = new Map();
    for (const syn of SYNONYMS) {
        for (const a of syn.aliases) normalisedAliasMap.set(normalise(a), syn);
    }
    return normalisedAliasMap;
}

// ─── Resolver: tag → nearest entry ───────────────────────────────────

function resolveByTag(tag, userPos, index) {
    const candidates = index.filter(e => e.tags?.includes(tag));
    if (candidates.length === 0) return null;

    // Same rule as the fly-to menu: only use userPos when the user is
    // actually near the festival. Off-site users fall back to the
    // first candidate silently.
    const usable = userPos && isNearFestival(userPos[0], userPos[1]) ? userPos : null;
    const coord  = nearest(usable, candidates.map(c => c.coord), candidates[0].coord);
    // Return a synthetic entry that carries the label + the resolved
    // coord. `category` is the resolver tag so the row can badge itself
    // ("Nearest toilet · Toilet") if needed.
    return { id: `nearest-${tag}`, text: '', category: tag, coord };
}

function readUserPos() {
    const loc = store.userLocation;
    if (loc && typeof loc.longitude === 'number' && typeof loc.latitude === 'number' && loc.error == null) {
        return [loc.longitude, loc.latitude];
    }
    return null;
}

// ─── Matching pipeline ───────────────────────────────────────────────

/**
 * Given a raw query, return the ranked result list (up to MAX_RESULTS).
 * Async because the index is fetched lazily on first call.
 */
export async function searchMap(rawQuery) {
    const query = normalise(rawQuery);
    if (query.length < MIN_QUERY_LEN) return { results: [], total: 0 };
    const index = await loadIndex();
    const userPos = readUserPos();

    // ── Synonym pass ────────────────────────────────────────────────
    const synResults = [];
    const aliasMap = getAliasMap();
    for (const [alias, syn] of aliasMap) {
        // A synonym fires if the query IS an alias or starts with it,
        // OR the alias starts with the query (so partial typing works
        // — "toi" fires the toilet synonym after 3 chars).
        if (query === alias || query.startsWith(alias) || alias.startsWith(query)) {
            const resolved = syn.resolver(userPos, index);
            if (!resolved) continue;
            // Dedup: multiple aliases for the same synonym only fire
            // once (e.g. "toilet" and "wc" resolve to the same "nearest
            // toilet" row).
            if (synResults.some(r => r.synonymKey === syn.labelKey)) continue;
            synResults.push({
                kind: 'synonym',
                synonymKey: syn.labelKey,
                labelKey: syn.labelKey,
                icon: syn.icon,
                coord: resolved.coord,
                sortKey: 0,
            });
        }
    }

    // ── Name pass ───────────────────────────────────────────────────
    const nameResults = [];
    for (const entry of index) {
        const name = normalise(entry.text);
        let sortKey;
        if (name === query)         sortKey = 1;   // exact
        else if (name.startsWith(query)) sortKey = 2;   // prefix
        else if (name.includes(query))   sortKey = 3;   // substring
        else continue;

        nameResults.push({
            kind: 'entry',
            id: entry.id,
            text: entry.text,
            category: entry.category,
            icon: iconForCategory(entry.category),
            coord: entry.coord,
            sortKey,
        });
    }

    // Sort: sortKey ASC, then text ASC.
    nameResults.sort((a, b) => a.sortKey - b.sortKey || a.text.localeCompare(b.text));

    // Merge synonym first, then names. Cap to MAX_RESULTS.
    const merged = [...synResults, ...nameResults];
    const total  = merged.length;
    return { results: merged.slice(0, MAX_RESULTS), total };
}

// Icons per category. `poi-generic.svg` is a small pin used as the
// fallback when a category doesn't have a dedicated icon (yet).
function iconForCategory(cat) {
    switch (cat) {
        case 'toilet':     return 'images/poi-toilet.svg';
        case 'firstAid':   return 'images/poi-firstaid.svg';
        case 'info':       return 'images/poi-info.svg';
        case 'tent':
        case 'camp':       return 'images/poi-tent.svg';
        default:           return 'images/poi-generic.svg';
    }
}

// ─── Dropdown UI ─────────────────────────────────────────────────────

const DROPDOWN_CLASS = 'festival-map-search-dropdown';
let dropdownEl = null;
let docClickHandler = null;
let debounceId = null;

/**
 * Debounced entry point. Called by js/search.js on every `input`
 * event when the current route is /map.
 */
export function onMapSearchInput(inputEl, rawQuery) {
    if (debounceId) clearTimeout(debounceId);
    debounceId = setTimeout(() => {
        debounceId = null;
        run(inputEl, rawQuery);
    }, DEBOUNCE_MS);
}

async function run(inputEl, rawQuery) {
    const q = rawQuery.trim();
    if (q.length < MIN_QUERY_LEN) {
        closeMapSearchDropdown();
        return;
    }
    const { results, total } = await searchMap(q);
    renderDropdown(inputEl, results, total, q);
}

export function closeMapSearchDropdown() {
    if (dropdownEl && dropdownEl.parentNode) dropdownEl.parentNode.removeChild(dropdownEl);
    dropdownEl = null;
    if (docClickHandler) {
        document.removeEventListener('click', docClickHandler);
        docClickHandler = null;
    }
}

function renderDropdown(inputEl, results, total, query) {
    // Rebuild in place; simpler than a diff and cheap for ≤ 8 rows.
    if (!dropdownEl) {
        dropdownEl = document.createElement('div');
        dropdownEl.className = DROPDOWN_CLASS;
        // A dedicated stacking context matters here because the app's
        // search-bar has its own z-index, and the dropdown must sit
        // ABOVE all other page content but BELOW the drop-up menu
        // modal (which is z 1000002).
        dropdownEl.setAttribute('role', 'listbox');
        document.body.appendChild(dropdownEl);

        // Close on outside click. Same reasoning as the fly-to menu:
        // registered via document listener (not on a bg-scrim) so the
        // map underneath stays fully interactive.
        docClickHandler = (e) => {
            if (dropdownEl && !dropdownEl.contains(e.target) && !inputEl.contains(e.target)) {
                closeMapSearchDropdown();
            }
        };
        // rAF so the same click that focused the input doesn't
        // immediately fire this handler.
        requestAnimationFrame(() => document.addEventListener('click', docClickHandler));
    }

    // Position under the input every render (in case the input moved
    // due to viewport resize / route change during a query).
    positionDropdown(inputEl);

    if (results.length === 0) {
        dropdownEl.innerHTML = `<div class="festival-map-search-empty">${escapeHtml(t('search.noMatches'))}</div>`;
        return;
    }

    const rows = results.map(r => renderRow(r)).join('');
    const overflow = total > results.length
        ? `<div class="festival-map-search-overflow">${escapeHtml(t('search.moreResults', { n: total - results.length }))}</div>`
        : '';
    dropdownEl.innerHTML = rows + overflow;

    // Wire clicks. One delegated listener per render, freshly bound.
    dropdownEl.querySelectorAll('[data-map-search-row]').forEach((row) => {
        row.addEventListener('click', () => {
            const lng = parseFloat(row.dataset.lng);
            const lat = parseFloat(row.dataset.lat);
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
            closeMapSearchDropdown();
            // Clear the input per Jacob's UX call.
            inputEl.value = '';
            // Also close the app's search-bar wrapper so the map is
            // fully visible after selection.
            document.getElementById('searchBar')?.classList.remove('open');
            document.dispatchEvent(new CustomEvent('map:flyTo', { detail: { coord: [lng, lat] } }));
        });
    });
}

function renderRow(r) {
    const label = r.kind === 'synonym' ? t(r.labelKey) : r.text;
    const category = r.kind === 'entry' ? t(`search.category.${r.category}`) : null;
    const meta = category ? `<span class="festival-map-search-cat"> · ${escapeHtml(category)}</span>` : '';
    const [lng, lat] = r.coord;
    return `
        <button type="button" class="festival-map-search-row"
                data-map-search-row
                data-lng="${lng}" data-lat="${lat}"
                role="option">
            <img src="${r.icon}" alt="" class="festival-map-search-icon" width="24" height="24">
            <span class="festival-map-search-label">${escapeHtml(label)}${meta}</span>
        </button>
    `;
}

function positionDropdown(inputEl) {
    const r = inputEl.getBoundingClientRect();
    dropdownEl.style.position = 'fixed';
    dropdownEl.style.top      = `${r.bottom + 8}px`;
    dropdownEl.style.left     = `${r.left}px`;
    dropdownEl.style.width    = `${Math.max(240, r.width)}px`;
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
