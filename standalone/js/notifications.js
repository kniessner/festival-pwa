import { store } from './store.js';
import { NOTIFICATIONS_SEEN_KEY } from './config.js';
import { escapeHtml } from './ui.js';

// Notifications are authored via the WP plugin's "PWA Push" post type and
// synced into data/notifications.json — separate from news.json (which is
// scraped from the site's /news/ page) so the two pipelines never collide.
// There's no push-delivery infrastructure yet (see class-notifications.php),
// so "new since last visit" is surfaced as an in-app popup instead, which
// needs nothing beyond what's already here.

function getSeenIds() {
    try { return new Set(JSON.parse(localStorage.getItem(NOTIFICATIONS_SEEN_KEY)) || []); }
    catch { return new Set(); }
}

function getUnseenNotifications() {
    const items = store.pageData.notifications?.items;
    if (!items || !items.length) return [];
    const seen = getSeenIds();
    return items.filter(item => !seen.has(item.id));
}

function markAllNotificationsSeen() {
    const items = store.pageData.notifications?.items || [];
    const seen = getSeenIds();
    items.forEach(item => seen.add(item.id));
    localStorage.setItem(NOTIFICATIONS_SEEN_KEY, JSON.stringify([...seen]));
}

export function maybeShowNotifications() {
    const unseen = getUnseenNotifications();
    if (!unseen.length) return;

    const modal = document.getElementById('notificationsModal');
    const list = document.getElementById('notificationsList');
    if (!modal || !list) return;

    list.innerHTML = unseen.map(item => `
        <div class="news-card ${item.highlight ? 'news-highlight' : ''}">
            <div class="card-header"><h3>${escapeHtml(item.question)}</h3></div>
            ${item.date ? `<span class="news-date">${escapeHtml(item.date)}</span>` : ''}
            <p>${escapeHtml(item.answer)}</p>
        </div>
    `).join('');

    modal.classList.add('open');
}

export function closeNotifications() {
    const modal = document.getElementById('notificationsModal');
    if (modal) modal.classList.remove('open');
    markAllNotificationsSeen();
}
