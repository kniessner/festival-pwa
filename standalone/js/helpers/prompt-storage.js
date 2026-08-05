import { LOCATION_PROMPT_KEY } from '../config.js';
import { safeGet, safeSet } from './safe-storage.js';

/**
 * Sticky localStorage flag for the location-permission onboarding
 * screen. Once the user engages (either button) the prompt never
 * appears again for this edition. Rolling LOCATION_PROMPT_KEY next
 * edition (see config.js) wipes onboarding state for returning users,
 * matching fusion's posture.
 *
 * Ported from fusion (helper/locationPromptStorage.ts) — same
 * semantics, no banner subsystem in v1 so this file is smaller.
 * The try/catch storage guards live in helpers/safe-storage.js since
 * three other modules use the same pattern.
 */

/** True iff the user has engaged with the Location prompt screen. */
export function getLocationPromptCompleted() {
    return safeGet(LOCATION_PROMPT_KEY) === '1';
}

/** Set on either button tap of the Location prompt screen. Sticky. */
export function setLocationPromptCompleted() {
    safeSet(LOCATION_PROMPT_KEY, '1');
}
