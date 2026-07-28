import { showToast } from './ui.js';
import { t } from './i18n.js';

let installEvent = null;

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

export function setupInstallPrompt() {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone || sessionStorage.getItem('installCardDismissed') === '1') {
        hideInstallCard();
        return;
    }

    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    setCardText(isIos ? t('install.iosShareHint') : t('install.androidHint'));

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        installEvent = e;
        document.getElementById('installCard')?.classList.add('actionable');
        setCardText(t('install.tapToInstall'));
    });

    window.addEventListener('appinstalled', () => {
        installEvent = null;
        hideInstallCard();
        showToast(t('install.installed'));
    });

    const card = document.getElementById('installCard');
    const closeBtn = document.getElementById('installCardClose');
    if (card) card.addEventListener('click', (e) => {
        if (e.target.closest('#installCardClose') || !installEvent) return;
        handleInstallClick();
    });
    if (closeBtn) closeBtn.addEventListener('click', (e) => { e.stopPropagation(); dismissInstallCard(); });
}

async function handleInstallClick() {
    if (!installEvent) return;
    installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === 'accepted') { installEvent = null; hideInstallCard(); showToast(t('install.installing')); }
    else showToast(t('install.cancelled'));
}

function setCardText(message) {
    const title = document.getElementById('installCardTitle');
    const text = document.getElementById('installCardText');
    if (title) title.textContent = t('install.cardTitle');
    if (text) text.textContent = message;
}

function hideInstallCard() {
    document.getElementById('installCard')?.classList.add('hidden');
}

function dismissInstallCard() {
    hideInstallCard();
    sessionStorage.setItem('installCardDismissed', '1');
}
