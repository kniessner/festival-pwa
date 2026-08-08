// Utilities shared by both /map variants (map-interactive.js and
// map-static.js). Kept intentionally small — anything variant-specific
// stays with the variant.

// Size the map's stage element to fill the remaining viewport under
// whatever page chrome sits above it. Both variants use the exact same
// stage container (`.festival-map`), and the sub-page header is not a
// fixed height (logo + title + language switcher stack differently on
// phone vs desktop), so we measure the stage's y-offset at mount and
// refresh on resize / orientation change.
//
// `gestureState.active` lets the caller suppress mid-gesture relayout
// (on iOS the address bar hides during a pinch and fires `resize`,
// which would otherwise recompute the image size / MapLibre canvas
// right under the user's fingers and cause a visible jump).
//
// Returns a cleanup that detaches the resize listeners — the caller
// composes it with its own teardown (MapLibre .remove(), pointer
// handlers, …) into the single cleanup handed back to the dispatcher.
export function attachStageSizing(stage, gestureState) {
    const sizeStage = () => {
        if (gestureState.active) return;
        const top = stage.getBoundingClientRect().top;
        const h = Math.max(200, window.innerHeight - top);
        stage.style.height = `${h}px`;
    };
    sizeStage();
    const onResize = () => sizeStage();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
        window.removeEventListener('resize', onResize);
        window.removeEventListener('orientationchange', onResize);
    };
}
