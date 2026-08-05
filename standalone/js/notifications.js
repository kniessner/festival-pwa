import { store, fetchLocalized } from './store.js';
import { NOTIFICATIONS_SEEN_KEY, DATA_FILES } from './config.js';
import { escapeHtml } from './ui.js';
import { t } from './i18n.js';
import { safeGetJSON, safeSetJSON } from './helpers/safe-storage.js';

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
    return new Set(safeGetJSON(NOTIFICATIONS_SEEN_KEY, []));
}

// Only "Highlight this notification" items are popup-worthy — the News tab
// (js/views/info.js) still lists every item regardless of highlight, this
// is just the interruptive on-open popup's own scope.
function getUnseenHighlighted() {
    const items = store.pageData.notifications?.items;
    if (!items || !items.length) return [];
    const seen = getSeenIds();
    return items.filter(item => item.highlight && !seen.has(item.id));
}

// The popup shows at most ONE card, not every qualifying item stacked —
// items is newest-first (same assumption getLatestNotification() makes
// about this feed), so [0] is the most recent unseen highlighted one.
function getPopupNotification() {
    return getUnseenHighlighted()[0] || null;
}

function markAllNotificationsSeen() {
    // Only highlighted items are ever tracked here — a non-highlighted item
    // must stay "unseen" so that if it's highlighted later, it still shows
    // up in the popup instead of having already been silently marked seen
    // by an earlier, unrelated popup close. Marks every unseen highlighted
    // item as seen on close (not just the one shown), so an older
    // highlighted item that lost out to a newer one doesn't awkwardly pop
    // up on the next launch.
    const items = getUnseenHighlighted();
    const seen = getSeenIds();
    items.forEach(item => seen.add(item.id));
    // safeSetJSON swallows write failures (Safari private mode / quota
    // exceeded / etc.). Worst case the user sees the same notifications
    // again on next launch, which is acceptable.
    safeSetJSON(NOTIFICATIONS_SEEN_KEY, [...seen]);
}

function renderNotificationCards(items) {
    if (!items.length) return `<div class="page-intro" style="margin-top:0">${t('info.newsEmpty')}</div>`;
    // item.answer is admin-authored HTML (WP_editor + wp_kses_post server-side
    // — see class-notifications.php's English Translation meta box), not
    // escaped here so its formatting (bold, lists, etc.) actually renders.
    return items.map(item => `
        <div class="news-card ${item.highlight ? 'news-highlight' : ''}">
            <div class="card-header"><h3>${escapeHtml(item.question)}</h3></div>
            ${item.date ? `<span class="news-date">${escapeHtml(formatNotificationDate(item))}</span>` : ''}
            <div class="news-answer">${item.answer}</div>
        </div>
    `).join('');
}

export function maybeShowNotifications() {
    const item = getPopupNotification();
    if (!item) return;

    const modal = document.getElementById('notificationsModal');
    const list = document.getElementById('notificationsList');
    if (!modal || !list) return;

    list.innerHTML = renderNotificationCards([item]);
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

// Deep-link target for an OS push notification's click (see sw.js's
// notificationclick and app.js's ?notif= handling) — looked up by the
// item's stable WP post ID rather than its array index, since the feed can
// gain newer entries between when a push was sent and when it's tapped,
// which would shift indexes but never IDs.
export function scrollToNotificationById(id) {
    const target = document.querySelector(`#content [data-item-id="${id}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('highlight', 'highlight-quick');
    setTimeout(() => target.classList.remove('highlight', 'highlight-quick'), 1000);
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
