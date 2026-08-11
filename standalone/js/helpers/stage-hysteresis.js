/**
 * Boundary-flap hysteresis state machine for stage detection.
 *
 * On a shared boundary between two adjacent polygons, GPS jitter can
 * flip the reported stage every 1–2 seconds. Without hysteresis the
 * grid would flap. This state machine holds the current stage until
 * a *different* candidate is reported stably for `thresholdMs`.
 *
 * Rules (identical to fusion's TimetableFlat.tsx floor logic, plus a
 * grace period on transient signal loss so a brief accuracy blip
 * doesn't blank the pulse):
 *   - First fix (current === null, incoming is real): commit immediately,
 *     no delay on first paint.
 *   - Same as current: cancel any pending swap.
 *   - Different candidate (real stage OR null-"pending clear"): start /
 *     restart the timer. A *different* new candidate restarts the timer
 *     with the new one; the *same* new candidate leaves the running
 *     timer alone so sustained reads converge to a single commit.
 *   - null / false while nothing is committed: no-op (nothing to clear).
 *
 * Grace-period design: feed(null) is treated as "pending clear" and
 * subject to the same thresholdMs as any other transition. If a real
 * stage fix comes back in during that window (typical: user briefly
 * loses accuracy walking between tents, then reacquires), the pending
 * clear is cancelled and the pulse never blinks off. Only a sustained
 * loss (thresholdMs of continuous null/bad-accuracy fixes) actually
 * clears the committed stage. Matches fusion's floor.ts intent.
 *
 * Factory pattern with injectable clock so tests can drive time with a
 * fake { setTimeout, clearTimeout } and don't need real timers.
 *
 * @param options.thresholdMs   Time (ms) a new stage (or a pending
 *                              clear) must be reported stably before it
 *                              replaces the current one. Default 3000,
 *                              matching fusion's FLOOR_CHANGE_HYSTERESIS_MS.
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
    // NO_PENDING distinguishes "nothing pending" from "pending clear"
    // (a real null value). Without this, the initial state and a
    // pending-clear state would be indistinguishable and the same
    // feed(null) call couldn't tell if it needed to restart the timer
    // or was already running.
    const NO_PENDING = Symbol('no-pending');
    let pendingCandidate = NO_PENDING;
    let pendingTimerId = null;

    function cancelPending() {
        if (pendingTimerId != null) {
            clearT(pendingTimerId);
            pendingTimerId = null;
        }
        pendingCandidate = NO_PENDING;
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

        // Same as current: cancel any in-flight swap (including a pending
        // clear — a real fix returning at the same stage means the
        // grace-period was a false alarm).
        if (normalised === current) {
            cancelPending();
            return;
        }

        // First real fix commits immediately (no flicker on first paint).
        // Guarded on `normalised != null` so we don't spam commit(null)
        // when the very first fix is bad-accuracy and nothing is
        // committed yet.
        if (current == null) {
            if (normalised == null) return;
            cancelPending();
            commit(normalised);
            return;
        }

        // We have a committed stage AND incoming differs from it. This
        // covers three cases uniformly:
        //   1. A different real stage arrives → pending swap.
        //   2. null (bad accuracy / no fix) arrives → pending clear.
        //   3. Same pending candidate keeps arriving → leave timer alone
        //      so sustained reads converge.
        if (normalised !== pendingCandidate) {
            if (pendingTimerId != null) clearT(pendingTimerId);
            pendingCandidate = normalised;
            pendingTimerId = setT(() => {
                const toCommit = pendingCandidate;
                pendingTimerId = null;
                pendingCandidate = NO_PENDING;
                commit(toCommit);
            }, thresholdMs);
        }
    }

    return {
        feed,
        cancel: cancelPending,
        /**
         * Test-only: hard-reset the state machine to "nothing committed,
         * nothing pending". Skips the onCommit callback — callers who
         * need the committed value cleared visibly should invoke it
         * themselves. Named `reset` (not `clear`) to signal the intent
         * is diagnostic, not part of the runtime state model.
         */
        reset() {
            cancelPending();
            current = null;
        },
        get current() { return current; },
    };
}
