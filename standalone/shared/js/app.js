import { loadData, loadManifest, store } from './store.js';
import { loadPage, renderNav } from './router.js';
import { setupSearch } from './search.js';
import { setupInstallPrompt, setupOfflineIndicator } from './install.js';
import { textToHtml, escapeHtml } from './ui.js';

async function init() {
    try {
        await loadData();
    } catch (err) {
        console.error('[PWA] loadData failed', err);
    }
    renderNav();
    goToPage(0);
    setupOfflineIndicator();
    setupInstallPrompt();
    setupUpdateBanner();
    showLastUpdated();
}

function setupUpdateBanner() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.addEventListener('message', event => {
        if (event.data?.type === 'UPDATE_AVAILABLE') {
            showUpdateBanner();
        }
    });

    const swPath = isWordPressPWA() ? '/pwa/sw.js' : 'sw.js';
    navigator.serviceWorker.register(swPath).then(reg => {
        reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    showUpdateBanner(newWorker);
                }
            });
        });
    }).catch(() => {});
}

function isWordPressPWA() {
    return location.pathname.startsWith('/pwa/') ||
           document.querySelector('link[rel="manifest"]')?.getAttribute('href')?.startsWith('/pwa/');
}

let updateWorker = null;
function showUpdateBanner(worker = null) {
    if (document.getElementById('sw-update-banner')) return;
    if (worker) updateWorker = worker;

    const banner = document.createElement('div');
    banner.id = 'sw-update-banner';
    banner.className = 'update-banner';
    banner.innerHTML = `
        <span>Neue Version verfügbar</span>
        <button id="sw-update-now">Aktualisieren</button>
        <button id="sw-update-later">Später</button>
    `;
    document.body.appendChild(banner);

    document.getElementById('sw-update-now').addEventListener('click', () => {
        if (updateWorker) updateWorker.postMessage({ type: 'SKIP_WAITING' });
        banner.remove();
        window.location.reload();
    });
    document.getElementById('sw-update-later').addEventListener('click', () => banner.remove());
}

function goToPage(index) {
    loadPage(index);
    setupSearch();
}

async function showLastUpdated() {
    const el = document.getElementById('lastUpdated');
    if (!el) return;
    const m = store.manifest || await loadManifest();
    if (m && m.synced_at) {
        el.textContent = `Stand: ${new Date(m.synced_at * 1000).toLocaleDateString('de-DE')}`;
    }
}

// Simple FAQ accordion handler for HTML rendered by the server/JSON content.
document.addEventListener('click', e => {
    const item = e.target.closest('.faq-item');
    if (!item) return;
    e.preventDefault();
    const isOpen = item.classList.contains('open');
    const scope = item.closest('.faq-list') || document;
    scope.querySelectorAll('.faq-item.open').forEach(f => {
        f.classList.remove('open');
        const t = f.querySelector('.faq-toggle'); if (t) t.textContent = '+';
        const a = f.querySelector('.faq-answer'); if (a) a.style.display = 'none';
    });
    if (!isOpen) {
        item.classList.add('open');
        const t = item.querySelector('.faq-toggle'); if (t) t.textContent = '−';
        const a = item.querySelector('.faq-answer'); if (a) a.style.display = 'block';
    }
});

init();
