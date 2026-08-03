import { renderNav } from './router.js';
import { getLatestNotification, formatNotificationDate } from './notifications.js';
import { escapeHtml } from './ui.js';
import { t } from './i18n.js';

// Drop-up nav menu — replaces the old fixed bottom-nav icon row. Follows
// the same fixed-backdrop + .open-toggled panel convention as
// #searchModal / #notificationsModal / #onboardingModal. See
// docs/superpowers/specs/2026-08-03-dropup-nav-menu-design.md.

function renderNewsPreview() {
    const content = document.getElementById('menuNewsPreviewContent');
    if (!content) return;
    const latest = getLatestNotification();
    content.innerHTML = latest
        ? `<div class="news-card ${latest.highlight ? 'news-highlight' : ''}">
               <div class="card-header"><h3>${escapeHtml(latest.question)}</h3></div>
               ${latest.date ? `<span class="news-date">${escapeHtml(formatNotificationDate(latest))}</span>` : ''}
               <p>${escapeHtml(latest.answer)}</p>
           </div>`
        : `<div class="menu-news-preview-empty">${t('info.newsEmpty')}</div>`;
}

export function openMenu() {
    renderNav();
    renderNewsPreview();
    const title = document.getElementById('menuModalTitle');
    if (title) title.textContent = t('menu.title');
    const modal = document.getElementById('menuModal');
    if (modal) modal.classList.add('open');
}

export function closeMenu() {
    const modal = document.getElementById('menuModal');
    if (modal) modal.classList.remove('open');
}
