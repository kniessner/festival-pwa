import { FAV_KEY } from './config.js';

export function getFavorites() {
    try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; }
    catch { return []; }
}

export function toggleFavorite(pageSlug, itemIndex) {
    const favs = getFavorites();
    const idx = favs.findIndex(f => f.page === pageSlug && f.index === itemIndex);
    if (idx >= 0) { favs.splice(idx, 1); }
    else { favs.push({ page: pageSlug, index: itemIndex }); }
    localStorage.setItem(FAV_KEY, JSON.stringify(favs));
    return idx < 0;
}

export function isFavorite(pageSlug, itemIndex) {
    return getFavorites().some(f => f.page === pageSlug && f.index === itemIndex);
}
