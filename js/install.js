import { showToast } from './ui.js';
import { t } from './i18n.js';

let installEvent = null;
let installPromptShown = false;

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
    const textEl = document.getElementById('installText');
    if (textEl) textEl.textContent = t('install.addToHome');
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        installEvent = e;
        if (!installPromptShown) { showInstallBtn(); installPromptShown = true; }
    });
    window.addEventListener('appinstalled', () => {
        installEvent = null; hideInstallBtn(); showToast(t('install.installed'));
    });
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone) hideInstallBtn();
    else if (isIos) showIosInstallHint();
    const btn = document.getElementById('installBtn');
    const closeBtn = document.getElementById('installClose');
    if (btn) btn.addEventListener('click', (e) => { if (e.target.closest('#installClose')) return; handleInstallClick(); });
    if (closeBtn) closeBtn.addEventListener('click', (e) => { e.stopPropagation(); dismissInstall(); });
}

async function handleInstallClick() {
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIos) { showToast(t('install.iosShareHint')); return; }
    if (!installEvent) {
        if (window.matchMedia('(display-mode: standalone)').matches) showToast(t('install.alreadyInstalled'));
        else showToast(t('install.androidHint'));
        return;
    }
    installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === 'accepted') { installEvent = null; hideInstallBtn(); showToast(t('install.installing')); }
    else showToast(t('install.cancelled'));
}

function showInstallBtn() {
    const btn = document.getElementById('installBtn');
    if (!btn) return;
    if (sessionStorage.getItem('installDismissed') === '1') return;
    btn.classList.remove('hidden');
}
function hideInstallBtn() {
    const btn = document.getElementById('installBtn');
    if (btn) btn.classList.add('hidden');
}
function dismissInstall() { hideInstallBtn(); sessionStorage.setItem('installDismissed', '1'); }
function showIosInstallHint() {
    const text = document.getElementById('installText');
    if (text) text.textContent = t('install.iosHintText');
    showInstallBtn();
}
