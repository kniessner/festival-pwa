const FAV_KEY = 'bucht-favorites';

export function getFavorites() {
    try {
        const raw = localStorage.getItem(FAV_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export function isFavorite(page, index) {
    return getFavorites().some(f => f.page === page && f.index === index);
}

export function toggleFavorite(page, index) {
    const favs = getFavorites();
    const existing = favs.findIndex(f => f.page === page && f.index === index);
    if (existing >= 0) {
        favs.splice(existing, 1);
        localStorage.setItem(FAV_KEY, JSON.stringify(favs));
        return false;
    }
    favs.push({ page, index, savedAt: Date.now() });
    localStorage.setItem(FAV_KEY, JSON.stringify(favs));
    return true;
}

export function favButton(pageSlug, index) {
    const active = isFavorite(pageSlug, index) ? 'active' : '';
    return `<button class="fav-btn ${active}" data-action="toggle-fav" data-page="${pageSlug}" data-index="${index}" title="Favorit">★</button>`;
}
