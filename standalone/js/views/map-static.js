// Static illustrated PNG map with a custom pinch-zoom + pan controller.
// Exported alongside renderInteractiveMap (map-interactive.js) so the /map
// route's tab dispatcher (map.js) can mount either variant.

import { t } from '../i18n.js';
import { attachStageSizing } from './map-common.js';

// The map PNG lives in the precached SHELL_ASSETS list so it works offline
// after the SW's install step — see standalone/sw.js.
const MAP_IMAGE = 'images/festival-map.png';

export function renderStaticMap(container) {
    container.innerHTML = `
        <div class="festival-map" id="festivalMap">
            <img
                src="${MAP_IMAGE}"
                alt="${t('nav.festivalmap')}"
                class="festival-map-img"
                id="festivalMapImg"
                loading="eager"
                decoding="async"
                draggable="false" />
            <div class="festival-map-hint" id="festivalMapHint">${t('map.pinchHint')}</div>
        </div>
    `;

    const stage = container.querySelector('#festivalMap');
    const img = container.querySelector('#festivalMapImg');
    const hint = container.querySelector('#festivalMapHint');

    // Shared with attachPinchZoom — sizeStage() (inside attachStageSizing)
    // has to know if a gesture is in progress so it can skip mid-pinch
    // layout thrash on iOS.
    const gestureState = { active: false };
    const detachSizing = attachStageSizing(stage, gestureState);

    attachPinchZoom(stage, img, hint, gestureState);

    // The dispatcher (map.js) owns invocation of this cleanup: it fires
    // once before mounting the other variant, and once from the router
    // on route exit. All pointer/wheel handlers below are attached to
    // `stage` — they're garbage-collected with the DOM node when the
    // dispatcher does `body.innerHTML = ''`, so only the window-level
    // resize listeners (owned by attachStageSizing) need explicit removal.
    return () => detachSizing();
}

// Pinch-to-zoom + drag-to-pan for the festival map.
//
// The whole PWA has `user-scalable=0` on its viewport (so accidental pinches
// elsewhere in the app don't zoom the page), which also kills the browser's
// native pinch on this image. We reimplement it locally with pointer events —
// two active pointers = pinch (scale around the midpoint), one active pointer
// = pan (when zoomed in). Also supports mouse wheel + drag for desktop and
// double-tap to toggle 1× / 2.5×. The transform is applied to the <img> via
// CSS `transform: translate(tx, ty) scale(s)`; the container clips overflow.
function attachPinchZoom(stage, img, hint, gestureState) {
    const MIN_SCALE = 1;
    const MAX_SCALE = 5;

    let scale = 1;
    let tx = 0;
    let ty = 0;

    // Active pointers keyed by pointerId, storing latest client x/y.
    const pointers = new Map();
    // Snapshot at the moment a gesture (pinch or pan) starts, so we can
    // recompute the current transform relative to that anchor without drift.
    let gestureStart = null;
    // Was this gesture ever multi-touch? Used to suppress spurious "tap"
    // detection when the second finger of a pinch lifts — without this the
    // two pointerups from ending a pinch look like a double-tap and reset
    // the zoom, exactly the bug we hit in the field.
    let gestureWasPinch = false;
    // Single-finger tap tracking, kept separate from pinch/pan state.
    let tapCandidate = null; // {id, x, y, t} while a potential tap is live
    let lastTapAt = 0;
    let lastTapPos = null;

    const applyTransform = () => {
        img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    };

    // Prevent the image from being dragged so far that empty space shows
    // around it (once zoomed) — clamp translation to the visible envelope.
    const clampTranslation = () => {
        const stageRect = stage.getBoundingClientRect();
        // Natural (un-transformed) image size on screen.
        const baseW = img.clientWidth;
        const baseH = img.clientHeight;
        const scaledW = baseW * scale;
        const scaledH = baseH * scale;
        const maxX = Math.max(0, (scaledW - stageRect.width) / 2);
        const maxY = Math.max(0, (scaledH - stageRect.height) / 2);
        tx = Math.min(maxX, Math.max(-maxX, tx));
        ty = Math.min(maxY, Math.max(-maxY, ty));
    };

    const setScale = (newScale, anchorClientX, anchorClientY) => {
        const prev = scale;
        scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));
        // Anchor point (in image local coords, relative to its centre) stays
        // put under the finger/cursor while scaling — the classic "zoom
        // toward point" trick: shift translation by anchor * Δscale/prev.
        const stageRect = stage.getBoundingClientRect();
        const cx = stageRect.left + stageRect.width / 2;
        const cy = stageRect.top + stageRect.height / 2;
        const ax = anchorClientX - cx - tx;
        const ay = anchorClientY - cy - ty;
        const k = scale / prev;
        tx -= ax * (k - 1);
        ty -= ay * (k - 1);
        clampTranslation();
        applyTransform();
    };

    const dismissHint = () => {
        if (hint) hint.classList.add('hidden');
    };

    // ── Pointer events (unified touch + mouse) ──
    stage.addEventListener('pointerdown', (e) => {
        // Only accept touch + mouse; explicitly ignore right/middle clicks.
        if (e.button && e.button !== 0) return;
        // Best-effort pointer capture — iOS has been observed to throw
        // InvalidPointerId here when the browser loses the pointer
        // between dispatch and this callback. A missed capture only
        // costs us fine-grained event routing (a pointerup outside
        // `stage` won't reach us), which is bearable; a thrown
        // exception here would tear the whole gesture down.
        try { stage.setPointerCapture(e.pointerId); } catch (_) { /* pointer gone */ }
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        gestureState.active = true;

        if (pointers.size === 1) {
            gestureStart = { mode: 'pan', startTx: tx, startTy: ty,
                             x: e.clientX, y: e.clientY };
            gestureWasPinch = false;
            // Arm a potential tap; will be cancelled if a second finger
            // joins, if the pointer moves too far, or if it lingers too long.
            tapCandidate = { id: e.pointerId, x: e.clientX, y: e.clientY,
                             t: Date.now() };
        } else if (pointers.size === 2) {
            const [p1, p2] = [...pointers.values()];
            const dx = p2.x - p1.x, dy = p2.y - p1.y;
            gestureStart = {
                mode: 'pinch',
                startDist: Math.hypot(dx, dy),
                startScale: scale,
                startTx: tx, startTy: ty,
                cx: (p1.x + p2.x) / 2,
                cy: (p1.y + p2.y) / 2,
            };
            gestureWasPinch = true;
            tapCandidate = null; // multi-touch is never a tap
        }
        dismissHint();
    });

    stage.addEventListener('pointermove', (e) => {
        if (!pointers.has(e.pointerId)) return;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        // Any real movement disqualifies a tap.
        if (tapCandidate && e.pointerId === tapCandidate.id) {
            const dx = e.clientX - tapCandidate.x;
            const dy = e.clientY - tapCandidate.y;
            if (Math.hypot(dx, dy) > 8) tapCandidate = null;
        }

        if (pointers.size === 2 && gestureStart?.mode === 'pinch') {
            const [p1, p2] = [...pointers.values()];
            const dx = p2.x - p1.x, dy = p2.y - p1.y;
            const dist = Math.hypot(dx, dy);
            const newScale = gestureStart.startScale * (dist / gestureStart.startDist);
            // Restore translation snapshot before applying the anchored zoom
            // — otherwise successive pointermove events would compound.
            tx = gestureStart.startTx;
            ty = gestureStart.startTy;
            setScale(newScale, gestureStart.cx, gestureStart.cy);
            e.preventDefault();
        } else if (pointers.size === 1 && gestureStart?.mode === 'pan' && scale > 1) {
            tx = gestureStart.startTx + (e.clientX - gestureStart.x);
            ty = gestureStart.startTy + (e.clientY - gestureStart.y);
            clampTranslation();
            applyTransform();
            e.preventDefault();
        }
    });

    const handleTap = (e) => {
        // Only accept as a tap if:
        //  • no other finger is currently down (we're back to 0 pointers),
        //  • the gesture was never multi-touch (avoids the pinch-release trap),
        //  • the pointer didn't move much (tapCandidate still non-null),
        //  • it lifted quickly (< 400 ms).
        if (pointers.size !== 0 || gestureWasPinch || !tapCandidate) return;
        if (Date.now() - tapCandidate.t > 400) return;
        const now = Date.now();
        // Double-tap: two taps within 320 ms, close to each other.
        if (
            lastTapPos &&
            now - lastTapAt < 320 &&
            Math.hypot(e.clientX - lastTapPos.x, e.clientY - lastTapPos.y) < 40
        ) {
            const target = scale > 1.05 ? 1 : 2.5;
            if (target === 1) {
                tx = 0; ty = 0; scale = 1; applyTransform();
            } else {
                setScale(target, e.clientX, e.clientY);
            }
            lastTapAt = 0;
            lastTapPos = null;
            dismissHint();
        } else {
            lastTapAt = now;
            lastTapPos = { x: e.clientX, y: e.clientY };
        }
    };

    const endPointer = (e) => {
        if (!pointers.has(e.pointerId)) return;
        pointers.delete(e.pointerId);
        if (pointers.size === 1) {
            // Second finger lifted — the remaining one continues as a pan
            // from its current position, not the original pinch anchor.
            const [p] = [...pointers.values()];
            gestureStart = { mode: 'pan', startTx: tx, startTy: ty,
                             x: p.x, y: p.y };
            // Still mid-gesture; don't try to interpret this as a tap.
            tapCandidate = null;
        } else if (pointers.size === 0) {
            handleTap(e);
            gestureStart = null;
            gestureWasPinch = false;
            tapCandidate = null;
            gestureState.active = false;
            // If somehow scale drifted below 1 (rounding), snap back so a
            // second interaction starts clean.
            if (scale < MIN_SCALE + 0.001) {
                scale = 1; tx = 0; ty = 0; applyTransform();
            }
        }
    };
    stage.addEventListener('pointerup', endPointer);
    stage.addEventListener('pointercancel', endPointer);
    stage.addEventListener('pointerleave', endPointer);

    // ── Desktop: wheel to zoom (Ctrl/⌘+wheel or trackpad pinch → wheel) ──
    stage.addEventListener('wheel', (e) => {
        // Trackpad pinch fires wheel with ctrlKey=true on macOS Safari/Chrome.
        // Ignore plain scrolling so the page can still scroll around the map.
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        const delta = -e.deltaY;
        const factor = Math.exp(delta * 0.005);
        setScale(scale * factor, e.clientX, e.clientY);
        dismissHint();
    }, { passive: false });
}
