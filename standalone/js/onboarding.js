import { store } from './store.js';
import { t } from './i18n.js';
import { getGeolocationPermissionState } from './helpers/geolocation-permission.js';
import {
    getLocationPromptCompleted,
    setLocationPromptCompleted,
} from './helpers/prompt-storage.js';
import { startLocationWatch } from './location.js';
import { isPushSupported, subscribeToPush } from './push.js';

// Onboarding overlay lifecycle. Rendered as a pre-existing DOM node in
// index.html (#onboardingModal) — matches the .notifications-modal /
// .search-modal pattern where the shell of the modal lives in the HTML
// and JS just localises the strings and toggles the .open class.
//
// Ported from fusion's LocationPrompt.tsx: same skip logic (sticky
// completed-flag → skip; granted/denied at OS level → skip and set
// flag), same iOS-PWA gesture rule (getCurrentPosition inside the click
// handler), same optimistic close-on-tap. Deltas from fusion:
//   - No safety bullet (Bucht only sells the timetable jump, not
//     emergency Standortcode).
//   - No banner subsystem (v1 scope).
//   - Punchier privacy copy (product decision, see plan.md).

// Resolved by whichever button the user taps. Kept in module scope so
// the delegated action handlers in app.js can resolve it without
// showLocationPromptIfNeeded needing to know the click plumbing.
let pendingResolve = null;

/**
 * Show the overlay if the user hasn't engaged with it yet AND the OS
 * permission state is 'prompt' or 'unknown'. Otherwise resolves
 * immediately without rendering anything.
 *
 * Awaited by app.js:init() before maybeShowNotifications() so the two
 * modals never stack. Returning users go through this instantly.
 *
 * @returns Promise<void> resolving when the user has engaged (or when
 *          skipping without showing).
 */
export async function showLocationPromptIfNeeded() {
    // Sticky-flag check first — cheap, synchronous. Once the user
    // engaged in a previous session, never re-show, regardless of OS
    // state. Matches fusion's deliberately non-naggy posture. If
    // permission is already granted, also start the watcher for this
    // session (returning users need location just like new grants).
    if (getLocationPromptCompleted()) {
        const state = await getGeolocationPermissionState();
        if (state === 'granted') startLocationWatch();
        return;
    }

    const state = await getGeolocationPermissionState();
    if (state === 'granted' || state === 'denied') {
        // Nothing to ask. Mark completed so we don't re-check next launch.
        setLocationPromptCompleted();
        if (state === 'granted') startLocationWatch();
        return;
    }

    // 'prompt' / 'unknown' — render the overlay and wait for a button.
    return new Promise((resolve) => {
        pendingResolve = resolve;
        localiseAndOpen();
    });
}

function setText(id, key) {
    const el = document.getElementById(id);
    if (el) el.textContent = t(key);
}

function localiseAndOpen() {
    // Null-guard each lookup so a future edit that drops one of these
    // IDs from index.html leaves the modal in a half-localised state
    // instead of throwing mid-init(). Users still see the modal (with
    // one missing string), and the flow completes.
    setText('onboardingHeadline', 'onb.headline');
    setText('onboardingIntro', 'onb.intro');
    setText('onboardingFeatureTimetable', 'onb.featureTimetable');
    setText('onboardingDisclaimer', 'onb.disclaimer');
    setText('onboardingPrivacyTitle', 'onb.privacyTitle');
    setText('onboardingPrivacyBody', 'onb.privacyBody');
    setText('onboardingBtnAllow', 'onb.buttonAllow');
    setText('onboardingBtnNotNow', 'onb.buttonNotNow');

    // Browsers without Web Push support (notably Safari on iOS below 16.4,
    // or not yet added to the Home Screen) would only ever see this bullet
    // followed by a silent no-op tap — hide it rather than promise
    // something "Allow" can't actually deliver there.
    const pushRow = document.getElementById('onboardingFeaturePushRow');
    if (pushRow) pushRow.style.display = isPushSupported() ? '' : 'none';
    if (isPushSupported()) setText('onboardingFeaturePush', 'onb.featurePush');

    document.getElementById('onboardingModal')?.classList.add('open');
}

function closeOverlay() {
    document.getElementById('onboardingModal')?.classList.remove('open');
    setLocationPromptCompleted();
    if (pendingResolve) {
        const r = pendingResolve;
        pendingResolve = null;
        r();
    }
}

/**
 * "Enable" handler — location AND push together, matching the combined
 * feature-badge list above (badge 1 = location, badge 2 = push). Both
 * permission requests MUST fire from inside this click handler for the
 * iOS-PWA gesture rule: getCurrentPosition/requestPermission called
 * asynchronously (e.g. after an awaited fetch) get silently suppressed on
 * installed PWAs instead of prompting. subscribeToPush() calls
 * Notification.requestPermission() before its first await, so invoking it
 * here — even un-awaited — still runs on this same click's call stack.
 *
 * Called from the delegated action handler in app.js.
 */
export function onboardingAllow() {
    if (isPushSupported()) subscribeToPush();

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { longitude, latitude, accuracy } = position.coords;
                store.userLocation = { longitude, latitude, accuracy, error: null };
                document.dispatchEvent(new CustomEvent('locationchange', {
                    detail: { longitude, latitude, accuracy },
                }));
            },
            () => {
                // Hard-deny in the OS dialog, or transient error. Silent —
                // the timetable auto-scroll step 2 will just no-op.
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
        );
        // Start the watcher NOW rather than waiting for getCurrentPosition
        // to resolve. On a slow first fix the user might already have
        // navigated to the grid by the time success fires; without the
        // eager start the watcher isn't running and step 2 stays cold
        // until they navigate again. startLocationWatch is idempotent, so
        // an eventual second call from anywhere is a no-op.
        startLocationWatch();
    }
    // Close optimistically. The OS dialog renders on its own layer;
    // the user's response fires the callback above asynchronously.
    closeOverlay();
}

/** "Not now" handler. Soft-decline: never call geolocation. */
export function onboardingNotNow() {
    closeOverlay();
}
