import { LOCATION_PROMPT_KEY, PUSH_PROMPT_KEY, TENT_INTRO_PROMPT_KEY } from '../config.js';
import { safeGet, safeSet } from './safe-storage.js';

/**
 * Sticky localStorage flags for the onboarding screens (location, then
 * push). Once the user engages (either button) a given screen never
 * appears again for this edition. Rolling *_PROMPT_KEY next edition
 * (see config.js) wipes onboarding state for returning users, matching
 * fusion's posture.
 *
 * Ported from fusion (helper/locationPromptStorage.ts) — same
 * semantics, no banner subsystem in v1 so this file is smaller.
 * The try/catch storage guards live in helpers/safe-storage.js since
 * other modules use the same pattern.
 */

/** True iff the user has engaged with the Location prompt screen. */
export function getLocationPromptCompleted() {
    return safeGet(LOCATION_PROMPT_KEY) === '1';
}

/** Set on either button tap of the Location prompt screen. Sticky. */
export function setLocationPromptCompleted() {
    safeSet(LOCATION_PROMPT_KEY, '1');
}

/** True iff the user has engaged with the Push prompt screen. */
export function getPushPromptCompleted() {
    return safeGet(PUSH_PROMPT_KEY) === '1';
}

/** Set on either button tap of the Push prompt screen. Sticky. */
export function setPushPromptCompleted() {
    safeSet(PUSH_PROMPT_KEY, '1');
}

/** True iff the user has dismissed the tent-intro dialog. */
export function getTentIntroCompleted() {
    return safeGet(TENT_INTRO_PROMPT_KEY) === '1';
}

/** Set when the user taps the tent-intro OK button. Sticky. */
export function setTentIntroCompleted() {
    safeSet(TENT_INTRO_PROMPT_KEY, '1');
}
