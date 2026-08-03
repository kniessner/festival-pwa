import { store, fetchLocalized } from './store.js';
import { NOTIFICATIONS_SEEN_KEY, DATA_FILES } from './config.js';
import { escapeHtml } from './ui.js';
import { t } from './i18n.js';

// Notifications are authored via the WP plugin's "PWA Push" post type and
// synced into data/notifications.json — separate from news.json (which is
// scraped from the site's /news/ page) so the two pipelines never collide.
// There's no push-delivery infrastructure yet (see class-notifications.php),
// so "new since last visit" is surfaced as an in-app popup instead, which
// needs nothing beyond what's already here.

// Shared by the popup here and the Info page's News tab (js/views/info.js),
// which both render the same notifications.items entries.
export function formatNotificationDate(item) {
    if (!item.date) return '';
    return item.time ? `${item.date} · ${item.time}` : item.date;
}

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
    try {
        localStorage.setItem(NOTIFICATIONS_SEEN_KEY, JSON.stringify([...seen]));
    } catch {
        // Safari private mode / quota exceeded / etc. Swallow silently
        // — matches the pattern in helpers/prompt-storage.js. Worst case
        // the user sees the same notifications again on next launch,
        // which is acceptable.
    }
}

function renderNotificationCards(items) {
    if (!items.length) return `<div class="page-intro" style="margin-top:0">${t('info.newsEmpty')}</div>`;
    return items.map(item => `
        <div class="news-card ${item.highlight ? 'news-highlight' : ''}">
            <div class="card-header"><h3>${escapeHtml(item.question)}</h3></div>
            ${item.date ? `<span class="news-date">${escapeHtml(formatNotificationDate(item))}</span>` : ''}
            <p>${escapeHtml(item.answer)}</p>
        </div>
    `).join('');
}

export function maybeShowNotifications() {
    const unseen = getUnseenNotifications();
    if (!unseen.length) return;

    const modal = document.getElementById('notificationsModal');
    const list = document.getElementById('notificationsList');
    if (!modal || !list) return;

    list.innerHTML = renderNotificationCards(unseen);
    modal.classList.add('open');
}

// Single most recent item, regardless of seen/unseen state — used by the
// drop-up menu's news-preview card. items is assumed newest-first (the
// same assumption js/views/info.js's News tab already makes about this
// feed).
export function getLatestNotification() {
    const items = store.pageData.notifications?.items;
    return items && items.length ? items[0] : null;
}

export function closeNotifications() {
    const modal = document.getElementById('notificationsModal');
    if (modal) modal.classList.remove('open');
    markAllNotificationsSeen();
}

// Re-fetches just notifications.json (not the full page data) and re-checks
// for unseen entries — the service worker serves this one network-first, so
// this actually gets whatever was most recently published, not last visit's
// cached copy.
export async function refreshNotifications() {
    try {
        store.pageData.notifications = await fetchLocalized(DATA_FILES.notifications, store.lang);
        maybeShowNotifications();
    } catch (e) {
        console.error('Failed to refresh notifications', e);
    }
}

// Catches "app was closed/backgrounded, a notification got published,
// app is opened/foregrounded again" — without this, the initial load's
// result would just sit there until a full reload.
export function setupNotificationsRefresh() {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') refreshNotifications();
    });
}
