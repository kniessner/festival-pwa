import { isFavorite } from './favorites.js';
import { t } from './i18n.js';

export function textToHtml(str) {
    if (!str) return '';
    return escapeHtml(str).replace(/\n/g, '<br>');
}

export function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
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

// Shared by the Home page and My Plan (favorites) — same "what's next"
// card either way, since it's always derived from the same favorited
// program events (see getNextUpcomingFavorite() in favorites.js).
export function nextEventCardHtml(next) {
    if (!next) return '';
    return `<div class="next-event-card" data-action="goto-event" data-index="${next.index}">
        <div class="next-event-label">${next.running ? t('home.runningNow') : t('home.nextEvent')}</div>
        <h3>${escapeHtml(next.ev.title)}</h3>
        <div class="next-event-meta">${escapeHtml(next.ev.time)}${next.ev.stage_label ? ' · ' + escapeHtml(next.ev.stage_label) : ''}</div>
    </div>`;
}

export function favButton(pageSlug, index) {
    const isActive = isFavorite(pageSlug, index);
    const active = isActive ? 'active' : '';
    const icon = isActive ? 'star.svg' : 'star-outline.svg';
    const content = `<span class="fav-star-icon" style="-webkit-mask-image:url(images/${icon});mask-image:url(images/${icon})"></span>`;
    return `<button class="fav-btn ${active}" data-action="toggle-fav" data-page="${pageSlug}" data-index="${index}" title="${t('common.favorite')}">${content}</button>`;
}

export function card({ page, index, title, desc, meta = '', maxDesc = 200 }) {
    const body = desc ? `<p>${escapeHtml(desc.substring(0, maxDesc))}${desc.length > maxDesc ? '...' : ''}</p>` : '';
    return `<div class="grid-card" data-item-index="${index}">
        <div class="card-header"><h3>${escapeHtml(title)}</h3>${favButton(page, index)}</div>
        ${meta}${body}
    </div>`;
}

// One FAQ accordion renderer (was duplicated for cashless + faqs panels + dead renderFAQ)
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
            <div class="faq-answer ${hasAnswer ? '' : 'empty'}">${hasAnswer ? item.answer : `<em>${t('common.detailsSoon')}</em>`}</div>
        </div>`;
    }).join('') + '</div>';
}
