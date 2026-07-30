/**
 * Boundary-flap hysteresis state machine for stage detection.
 *
 * On a shared boundary between two adjacent polygons, GPS jitter can
 * flip the reported stage every 1–2 seconds. Without hysteresis the
 * grid would flap. This state machine holds the current stage until
 * a *different* candidate is reported stably for `thresholdMs`.
 *
 * Rules (identical to fusion's TimetableFlat.tsx floor logic):
 *   - First fix (current === null): commit immediately, no delay on
 *     first paint.
 *   - Same as current: cancel any pending swap.
 *   - New candidate: start / restart the timer. A *different* new
 *     candidate restarts the timer with the new one; the *same* new
 *     candidate leaves the running timer alone so sustained reads
 *     converge to a single commit.
 *   - Coord-null (feed(null) or feed(false)): clear immediately,
 *     cancel any pending.
 *
 * Factory pattern with injectable clock so tests can drive time with a
 * fake { setTimeout, clearTimeout } and don't need real timers.
 *
 * @param options.thresholdMs   Time (ms) a new stage must be reported
 *                              stably before it replaces the current
 *                              one. Default 3000, matching fusion's
 *                              FLOOR_CHANGE_HYSTERESIS_MS.
 * @param options.setTimeout    Injectable. Default: window.setTimeout.
 * @param options.clearTimeout  Injectable. Default: window.clearTimeout.
 * @param options.onCommit      Callback(nextStage) invoked whenever the
 *                              committed value changes. Not called for
 *                              same-stage no-ops. Receives null when the
 *                              committed value clears.
 * @returns { feed, cancel, current }
 */
export function createStageHysteresis({
    thresholdMs = 3000,
    setTimeout: setT = (fn, ms) => window.setTimeout(fn, ms),
    clearTimeout: clearT = (id) => window.clearTimeout(id),
    onCommit = () => {},
} = {}) {
    let current = null;
    let pendingCandidate = null;
    let pendingTimerId = null;

    function cancelPending() {
        if (pendingTimerId != null) {
            clearT(pendingTimerId);
            pendingTimerId = null;
        }
        pendingCandidate = null;
    }

    function commit(next) {
        if (next === current) return;
        current = next;
        onCommit(current);
    }

    /**
     * Feed a fresh detection into the state machine.
     * @param detected string | false | null — the raw output of
     *        getStage(). false and null are treated identically.
     */
    function feed(detected) {
        const normalised = detected === false ? null : detected;

        // Coord-null / no-fix: clear immediately.
        if (normalised == null) {
            cancelPending();
            commit(null);
            return;
        }

        // First fix commits immediately (no flicker on first paint).
        if (current == null) {
            cancelPending();
            commit(normalised);
            return;
        }

        // Same as current: cancel any in-flight swap.
        if (normalised === current) {
            cancelPending();
            return;
        }

        // New candidate. If it's the *same* candidate we're already
        // waiting on, leave the timer alone so sustained reads converge.
        // If it's a *different* new candidate, restart with the new one.
        if (normalised !== pendingCandidate) {
            if (pendingTimerId != null) clearT(pendingTimerId);
            pendingCandidate = normalised;
            pendingTimerId = setT(() => {
                const toCommit = pendingCandidate;
                pendingTimerId = null;
                pendingCandidate = null;
                commit(toCommit);
            }, thresholdMs);
        }
    }

    return {
        feed,
        cancel: cancelPending,
        get current() { return current; },
    };
}
