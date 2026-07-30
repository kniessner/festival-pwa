import { store } from './store.js';
import { t } from './i18n.js';
import { getGeolocationPermissionState } from './helpers/geolocation-permission.js';
import {
    getLocationPromptCompleted,
    setLocationPromptCompleted,
} from './helpers/prompt-storage.js';
import { startLocationWatch } from './location.js';

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

function localiseAndOpen() {
    document.getElementById('onboardingHeadline').textContent = t('onb.headline');
    document.getElementById('onboardingIntro').textContent = t('onb.intro');
    document.getElementById('onboardingFeatureTimetable').textContent = t('onb.featureTimetable');
    document.getElementById('onboardingDisclaimer').textContent = t('onb.disclaimer');
    document.getElementById('onboardingPrivacyTitle').textContent = t('onb.privacyTitle');
    document.getElementById('onboardingPrivacyBody').textContent = t('onb.privacyBody');
    document.getElementById('onboardingBtnAllow').textContent = t('onb.buttonAllow');
    document.getElementById('onboardingBtnNotNow').textContent = t('onb.buttonNotNow');
    document.getElementById('onboardingModal').classList.add('open');
}

function closeOverlay() {
    document.getElementById('onboardingModal').classList.remove('open');
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
