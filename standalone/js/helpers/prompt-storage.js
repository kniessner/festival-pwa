import { LOCATION_PROMPT_KEY } from '../config.js';

/**
 * Sticky localStorage flag for the location-permission onboarding
 * screen. Once the user engages (either button) the prompt never
 * appears again for this edition. Rolling LOCATION_PROMPT_KEY next
 * edition (see config.js) wipes onboarding state for returning users,
 * matching fusion's posture.
 *
 * Ported from fusion (helper/locationPromptStorage.ts) — same
 * semantics, no banner subsystem in v1 so this file is smaller.
 */

/** True iff the user has engaged with the Location prompt screen. */
export function getLocationPromptCompleted() {
    try {
        return localStorage.getItem(LOCATION_PROMPT_KEY) === '1';
    } catch {
        return false;
    }
}

/** Set on either button tap of the Location prompt screen. Sticky. */
export function setLocationPromptCompleted() {
    try {
        localStorage.setItem(LOCATION_PROMPT_KEY, '1');
    } catch {
        // Private mode / quota / etc. — silently fail. Worst case the
        // user sees the prompt again next launch, which is acceptable.
    }
}
