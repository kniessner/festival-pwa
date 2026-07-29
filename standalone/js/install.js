import { t } from './i18n.js';

// Captured from 'beforeinstallprompt' when the browser offers a real,
// triggerable install flow (Android/desktop Chrome/Edge). Stays null on
// iOS, which has no such API — there, the card is purely instructional.
let deferredPrompt = null;

function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIos() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

export function shouldShowInstallCard() {
    return !isStandalone() && sessionStorage.getItem('installCardDismissed') !== '1';
}

// Renders the card's markup, or '' when it shouldn't show. Views inject
// this directly into their own template (right below their title) rather
// than the card being one persistent global DOM node, since it only ever
// appears on Home and My Plan.
export function installCardHtml() {
    if (!shouldShowInstallCard()) return '';
    const actionable = deferredPrompt !== null;
    const text = actionable ? t('install.tapToInstall') : (isIos() ? t('install.iosShareHint') : t('install.androidHint'));
    const actionAttr = actionable ? ' data-action="trigger-install"' : '';
    return `
    <div class="install-card ${actionable ? 'actionable' : ''}"${actionAttr}>
        <button type="button" class="install-card-close" data-action="dismiss-install-card" aria-label="Close">✕</button>
        <h3>${t('install.cardTitle')}</h3>
        <p>${text}</p>
    </div>`;
}

// Registers the two window-level PWA install events. onUpdate is called
// whenever card-relevant state changes (prompt captured or app installed)
// so the caller can re-render the current page if the card is showing.
export function setupInstallTracking(onUpdate) {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        onUpdate();
    });
    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        onUpdate();
    });
}

export async function triggerInstall() {
    if (!deferredPrompt) return null;
    const evt = deferredPrompt;
    deferredPrompt = null;
    evt.prompt();
    const { outcome } = await evt.userChoice;
    return outcome;
}

export function dismissInstallCard() {
    sessionStorage.setItem('installCardDismissed', '1');
}

export function setupOfflineIndicator() {
    const update = () => {
        const existing = document.querySelector('.offline-badge');
        if (!navigator.onLine) {
            if (!existing) {
                const badge = document.createElement('div');
                badge.className = 'offline-badge';
                badge.textContent = t('install.offline');
                document.body.prepend(badge);
            }
        } else {
            existing?.remove();
        }
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
}
