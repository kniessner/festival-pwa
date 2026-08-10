import { t } from '../i18n.js';
import { getTentIntroCompleted, setTentIntroCompleted } from '../helpers/prompt-storage.js';
import { hasStoredTentPosition } from './tent.js';

// One-shot "where is my tent?" onboarding dialog.
//
// Rendered inside the pre-existing #tentIntroModal in index.html (the
// same .onboarding-modal shell the location / push prompts use), so
// the palette, backdrop, and .open toggle mechanics stay consistent.
//
// Gate is dual, matching fusion's MapContainer.tsx pattern:
//   1. hasStoredTentPosition() — has the user actually dropped a tent?
//      If yes, the intro is obsolete and never shows again.
//   2. getTentIntroCompleted() — has the user dismissed the dialog?
//      If yes, don't nag on subsequent map visits, even if they never
//      placed a tent. Prevents an infinite "you keep telling me!"
//      loop for a user who just wants to browse.
//
// Called by renderMap() at the end of the interactive-map mount, so
// the dialog paints over an already-live map (matches fusion's UX
// where the tent icon is visible underneath the modal, hinting at
// what the user is about to interact with).

function setText(id, key) {
    const el = document.getElementById(id);
    if (el) el.textContent = t(key);
}

/**
 * Show the tent-intro modal iff BOTH gates allow it. No-op otherwise.
 * Idempotent — safe to call on every interactive-map mount; the
 * getTentIntroCompleted() flag makes subsequent calls silent.
 */
export function maybeShowTentIntro() {
    if (getTentIntroCompleted()) return;
    if (hasStoredTentPosition()) return;
    setText('tentIntroHeadline', 'tentIntro.headline');
    setText('tentIntroBody',     'tentIntro.body');
    setText('tentIntroBtnOk',    'tentIntro.buttonOk');
    document.getElementById('tentIntroModal')?.classList.add('open');
}

/**
 * Close the modal AND set the sticky flag. Wired to the data-action=
 * "tent-intro-ok" click delegation in js/app.js — same pattern as the
 * onboarding-allow / onboarding-not-now handlers.
 */
export function dismissTentIntro() {
    document.getElementById('tentIntroModal')?.classList.remove('open');
    setTentIntroCompleted();
}
