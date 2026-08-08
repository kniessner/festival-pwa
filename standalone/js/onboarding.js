import { store } from './store.js';
import { t } from './i18n.js';
import { getGeolocationPermissionState } from './helpers/geolocation-permission.js';
import {
    getLocationPromptCompleted,
    setLocationPromptCompleted,
    getPushPromptCompleted,
    setPushPromptCompleted,
} from './helpers/prompt-storage.js';
import { startLocationWatch } from './location.js';
import { isPushSupported, subscribeToPush } from './push.js';

// Onboarding overlay lifecycle: two sequential screens (location, then
// push), each its own pre-existing DOM node in index.html (#onboardingModal
// / #pushOnboardingModal) — matches the .notifications-modal / .search-modal
// pattern where the shell of the modal lives in the HTML and JS just
// localises the strings and toggles the .open class. Deliberately two
// SEPARATE screens rather than one combined ask: Notification.
// requestPermission() needs its own user gesture, same iOS-PWA rule as
// getCurrentPosition below — bundling both prompts under one button's
// click still satisfies that (both calls happen synchronously on the same
// gesture), but showing one combined screen made the location-specific
// copy/disclaimer/privacy-box read oddly for a "grant push too" ask, so
// they're now two screens shown back to back instead.
//
// Onboarding overlays only ever show on mobile — desktop users can still
// enable either from the drop-up menu (the push toggle) or their browser's
// own site settings (location), but there's no first-launch "screen"
// experience for them.
//
// Ported from fusion's LocationPrompt.tsx: same skip logic (sticky
// completed-flag → skip; granted/denied at OS level → skip and set
// flag), same iOS-PWA gesture rule (getCurrentPosition inside the click
// handler), same optimistic close-on-tap. Deltas from fusion:
//   - No safety bullet (Bucht only sells the timetable jump, not
//     emergency Standortcode).
//   - No banner subsystem (v1 scope).
//   - Punchier privacy copy (product decision, see plan.md).

function isMobileDevice() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

// Resolved by whichever button the user taps on the LOCATION screen. Kept
// in module scope so the delegated action handlers in app.js can resolve
// it without showLocationPromptIfNeeded needing to know the click plumbing.
let pendingResolve = null;

// Same, for the PUSH screen — separate variable since the two screens can
// (briefly) coexist in the DOM, even though only one is ever .open at once.
let pushPendingResolve = null;

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
    // Onboarding screens are a mobile-only experience — on desktop this
    // just resolves immediately without ever rendering anything (though
    // an already-granted permission from a previous mobile session still
    // gets its watcher started below, same as the returning-user path).
    if (!isMobileDevice()) {
        const state = await getGeolocationPermissionState();
        if (state === 'granted') startLocationWatch();
        return;
    }

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
    setText('onboardingFeatureMap', 'onb.featureMap');
    setText('onboardingDisclaimer', 'onb.disclaimer');
    setText('onboardingPrivacyTitle', 'onb.privacyTitle');
    setText('onboardingPrivacyBody', 'onb.privacyBody');
    setText('onboardingBtnAllow', 'onb.buttonAllow');
    setText('onboardingBtnNotNow', 'onb.buttonNotNow');
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
 * "Enable GPS" handler. MUST call getCurrentPosition from inside the
 * click handler for the iOS-PWA gesture rule to fire — otherwise the
 * native dialog is suppressed on installed PWAs. Also starts the
 * watchPosition so subsequent fixes flow into store.userLocation.
 *
 * Called from the delegated action handler in app.js.
 */
export function onboardingAllow() {
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

/**
 * Push counterpart to showLocationPromptIfNeeded() — shown right after
 * the location screen closes (either button), never before it and never
 * bundled into the same screen. Same skip logic: sticky-flag once engaged,
 * skip (and mark completed) if the OS permission is already decided,
 * mobile-only.
 *
 * Called from app.js:init() right after showLocationPromptIfNeeded()
 * resolves, so the two screens show back to back without stacking.
 */
export async function showPushPromptIfNeeded() {
    if (!isMobileDevice() || !isPushSupported()) return;

    if (getPushPromptCompleted()) return;

    if (Notification.permission !== 'default') {
        // Already decided at the OS level — nothing to ask, and no need
        // to keep re-checking every launch.
        setPushPromptCompleted();
        return;
    }

    return new Promise((resolve) => {
        pushPendingResolve = resolve;
        setText('pushOnboardingHeadline', 'pushOnb.headline');
        setText('pushOnboardingIntro', 'pushOnb.intro');
        setText('pushOnboardingFeature', 'pushOnb.feature');
        setText('pushOnboardingBtnAllow', 'pushOnb.buttonAllow');
        setText('pushOnboardingBtnNotNow', 'pushOnb.buttonNotNow');
        document.getElementById('pushOnboardingModal')?.classList.add('open');
    });
}

function closePushOverlay() {
    document.getElementById('pushOnboardingModal')?.classList.remove('open');
    setPushPromptCompleted();
    if (pushPendingResolve) {
        const r = pushPendingResolve;
        pushPendingResolve = null;
        r();
    }
}

/**
 * "Enable" handler for the push screen. subscribeToPush() calls
 * Notification.requestPermission() before its first await, so calling it
 * here — even un-awaited — still runs on this click's call stack,
 * satisfying the same iOS-PWA user-gesture rule as onboardingAllow()'s
 * getCurrentPosition call above.
 */
export function pushOnboardingAllow() {
    subscribeToPush();
    closePushOverlay();
}

/** "Not now" handler. Soft-decline: never request permission. */
export function pushOnboardingNotNow() {
    closePushOverlay();
}
