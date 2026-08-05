import { store } from './store.js';
import { safeGet, safeSet } from './helpers/safe-storage.js';

// Client half of OS push delivery — server half (VAPID keys, subscription
// storage, actually sending) lives in the WP plugin's class-push.php. The
// standalone app is served from a different PATH than WordPress but the
// SAME origin (bucht-der-traeumer.de/webapp/ vs bucht-der-traeumer.de/), so
// a root-relative /wp-json/... fetch reaches it correctly without any
// separate base-URL config — it just won't resolve in local dev, where
// there's no WordPress at all (every call here is wrapped accordingly).
const REST_BASE = '/wp-json/festival/v1/push';
const PUSH_SUBSCRIBED_KEY = 'bucht-push-subscribed';

// PushManager wants the VAPID public key as a raw Uint8Array, not the
// base64url string the server hands back.
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

export function isPushSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// Best-effort local mirror of subscription state, so UI (the menu toggle)
// can render synchronously instead of awaiting pushManager.getSubscription()
// on every render. Kept in sync by subscribeToPush/unsubscribeFromPush.
export function isPushSubscribed() {
    return safeGet(PUSH_SUBSCRIBED_KEY) === '1';
}

export async function subscribeToPush() {
    if (!isPushSupported()) return false;
    // 'denied' is permanent from JS's side — only the browser's own site
    // settings UI can undo it, so there's no point re-prompting.
    if (Notification.permission === 'denied') return false;

    const permission = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
    if (permission !== 'granted') return false;

    try {
        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            const res = await fetch(`${REST_BASE}/vapid-public-key`);
            const { publicKey } = await res.json();
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey),
            });
        }

        // lang travels with the subscription so class-push.php's
        // send_to_all() can pick the DE/EN variant per-subscriber, same as
        // every other bilingual feature in this app.
        await fetch(`${REST_BASE}/subscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...subscription.toJSON(), lang: store.lang }),
        });

        safeSet(PUSH_SUBSCRIBED_KEY, '1');
        return true;
    } catch (e) {
        console.error('Push subscribe failed', e);
        return false;
    }
}

export async function unsubscribeFromPush() {
    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
            // Tell the server first — if unsubscribe() below throws, we'd
            // rather have a dead row we still clean up on next send than a
            // subscription the browser dropped but the server keeps
            // pushing to forever.
            await fetch(`${REST_BASE}/unsubscribe`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint: subscription.endpoint }),
            });
            await subscription.unsubscribe();
        }
    } catch (e) {
        console.error('Push unsubscribe failed', e);
    } finally {
        safeSet(PUSH_SUBSCRIBED_KEY, '');
    }
}

export async function togglePush() {
    if (isPushSubscribed()) {
        await unsubscribeFromPush();
        return false;
    }
    return subscribeToPush();
}
