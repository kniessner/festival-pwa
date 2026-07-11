import { showToast } from './ui.js';

let installEvent = null;
let installPromptShown = false;

export function setupOfflineIndicator() {
    const update = () => {
        const existing = document.querySelector('.offline-badge');
        if (!navigator.onLine) {
            if (!existing) {
                const badge = document.createElement('div');
                badge.className = 'offline-badge';
                badge.textContent = 'Offline — Inhalte zwischengespeichert';
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
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        installEvent = e;
        if (!installPromptShown) { showInstallBtn(); installPromptShown = true; }
    });
    window.addEventListener('appinstalled', () => {
        installEvent = null; hideInstallBtn(); showToast('App installiert');
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
    if (isIos) { showToast('iOS: Tippe unten auf Teilen → Zum Home-Bildschirm'); return; }
    if (!installEvent) {
        if (window.matchMedia('(display-mode: standalone)').matches) showToast('Bereits installiert');
        else showToast('Chrome/Edge auf Android: Menü → Zum Startbildschirm');
        return;
    }
    installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === 'accepted') { installEvent = null; hideInstallBtn(); showToast('App wird installiert...'); }
    else showToast('Installieren abgebrochen');
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
    if (text) text.textContent = 'iOS: Teilen → "Zum Home-Bildschirm"';
    showInstallBtn();
}
