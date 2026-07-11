import { store } from './store.js';

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

export function showToast(message) {
    const existing = document.querySelector('.toast-message');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast-message';
    toast.textContent = message;
    toast.style.cssText = `position:fixed;bottom:calc(90px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);z-index:400;background:linear-gradient(135deg,#b0327a,#762c8c);color:#f3efdf;padding:12px 20px;border-radius:24px;font-size:0.85rem;font-weight:700;box-shadow:0 4px 16px rgba(0,0,0,0.3);max-width:90vw;text-align:center;opacity:0;`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
        toast.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
    });
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(20px)';
        setTimeout(() => toast.remove(), 350);
    }, 3000);
}

export function textToHtml(str) {
    if (!str) return '';
    return escapeHtml(str).replace(/\n/g, '<br>');
}

export function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

export function card({ page, index, title, desc, meta = '', maxDesc = 200 }) {
    const body = desc ? `<p>${escapeHtml(desc.substring(0, maxDesc))}${desc.length > maxDesc ? '...' : ''}</p>` : '';
    return `<div class="grid-card" data-item-index="${index}">
        <div class="card-header"><h3>${escapeHtml(title)}</h3>${favButton(page, index)}</div>
        ${meta}${body}
    </div>`;
}

export function renderFaqList(items, pageSlug) {
    return '<div class="faq-list">' + items.map((item, i) => {
        const hasAnswer = item.answer && item.answer.trim() && item.answer !== 'Details folgen bald.';
        return `<div class="faq-item" data-action="toggle-faq" data-faq="${i}" data-item-index="${i}">
            <div class="faq-question">
                <span>${item.question}</span>
                <div class="faq-actions">
                    ${favButton(pageSlug, i)}
                    <span class="faq-toggle">+</span>
                </div>
            </div>
            <div class="faq-answer ${hasAnswer ? '' : 'empty'}">${hasAnswer ? item.answer : '<em>Details folgen bald.</em>'}</div>
        </div>`;
    }).join('') + '</div>';
}
