/**
 * Query the browser's geolocation permission state defensively.
 *
 * Wraps navigator.permissions.query with fallbacks:
 *   - permissions API missing (old Safari) → 'unknown'
 *   - query throws (Safari private mode, some Firefox flags) → 'unknown'
 *
 * Ported from fusion's helper/geolocationPermission.ts. The onboarding
 * flow treats 'granted' and 'denied' as terminal (skip the prompt),
 * 'prompt' and 'unknown' as "show the prompt".
 *
 * @returns 'granted' | 'denied' | 'prompt' | 'unknown'
 */
export async function getGeolocationPermissionState() {
    if (
        !('permissions' in navigator) ||
        typeof navigator.permissions.query !== 'function'
    ) {
        return 'unknown';
    }
    try {
        const status = await navigator.permissions.query({ name: 'geolocation' });
        return status.state || 'unknown';
    } catch {
        return 'unknown';
    }
}
