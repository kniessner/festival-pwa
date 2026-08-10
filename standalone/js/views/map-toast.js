// Minimal, self-contained toast for feedback from map controls.
//
// Why not a global toast utility: the app has no toast infrastructure
// today and this is the first surface asking for one. Scoping the
// widget to /map keeps the blast radius small — when we need toasts
// elsewhere we can lift this into a shared helper without churning
// callers here.
//
// DOM model: single <div> appended to the map's stage container,
// positioned just below the top-fade zone so it stays readable. Only
// one toast at a time — a fresh call cancels any pending dismiss and
// replaces the message in place (no queueing).

const CLASS_NAME = 'festival-map-toast';
const DEFAULT_MS = 3000;

// One toast per stage. Keyed by the container element so multiple
// simultaneous map mounts (unlikely but possible during a tab flip)
// don't fight over the same DOM node.
const state = new WeakMap();

/**
 * Show a short message overlaid on a map stage.
 *
 * @param {HTMLElement} stage   The .festival-map container.
 * @param {string}      message Text to display (plain text, no HTML).
 * @param {number}      [ms]    Auto-dismiss delay in ms. Default 3000.
 */
export function showMapToast(stage, message, ms = DEFAULT_MS) {
    if (!stage) return;

    let entry = state.get(stage);
    if (!entry) {
        const el = document.createElement('div');
        el.className = CLASS_NAME;
        // Screen-reader announcement: polite so it doesn't preempt
        // whatever the reader is currently voicing (the button press
        // itself was the user's action, so the toast is confirmation
        // rather than an interruption).
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        stage.appendChild(el);
        entry = { el, timerId: null };
        state.set(stage, entry);
    }

    entry.el.textContent = message;
    entry.el.classList.add('visible');

    if (entry.timerId != null) clearTimeout(entry.timerId);
    entry.timerId = setTimeout(() => {
        entry.el.classList.remove('visible');
        entry.timerId = null;
    }, ms);
}

/**
 * Remove any toast attached to `stage` and clear its timer. Called by
 * the map's cleanup so a pending toast can't fire against a detached
 * node after the user has switched tabs.
 */
export function removeMapToast(stage) {
    const entry = state.get(stage);
    if (!entry) return;
    if (entry.timerId != null) clearTimeout(entry.timerId);
    if (entry.el.parentNode) entry.el.parentNode.removeChild(entry.el);
    state.delete(stage);
}
