import { t } from './i18n.js';

// Temporary pre-launch deterrent — NOT real security. The password lives
// in this file's source and is visible to anyone who opens dev tools or
// reads the network response; it only stops casual visitors and search
// engines from wandering into the app before launch. To remove once the
// festival is live: delete this file and its one call site in
// app.js's init() (`if (!passwordGateOK()) await showPasswordGate();`).

const GATE_KEY = 'bucht-2026-gate-passed';
const GATE_PASSWORD = 'bucht26';

export function passwordGateOK() {
    try { return localStorage.getItem(GATE_KEY) === '1'; }
    catch { return false; }
}

function markGatePassed() {
    try { localStorage.setItem(GATE_KEY, '1'); } catch { /* Safari private mode etc. — re-prompts next visit, acceptable */ }
}

// Resolves once the correct password is entered. Callers should await this
// before doing anything else (loading data, rendering) so nothing appears
// behind the overlay while it's up.
export function showPasswordGate() {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'password-gate';
        overlay.innerHTML = `
            <form class="password-gate-form" id="passwordGateForm">
                <h1 class="password-gate-title">${t('gate.title')}</h1>
                <input type="password" class="password-gate-input" id="passwordGateInput"
                    autocomplete="off" placeholder="${t('gate.placeholder')}" autofocus>
                <button type="submit" class="password-gate-submit">${t('gate.submit')}</button>
                <p class="password-gate-error" id="passwordGateError" style="display:none">${t('gate.error')}</p>
            </form>
        `;
        document.body.appendChild(overlay);

        const input = overlay.querySelector('#passwordGateInput');
        const error = overlay.querySelector('#passwordGateError');

        overlay.querySelector('#passwordGateForm').addEventListener('submit', e => {
            e.preventDefault();
            if (input.value === GATE_PASSWORD) {
                markGatePassed();
                overlay.remove();
                resolve();
            } else {
                error.style.display = 'block';
                input.value = '';
                input.focus();
            }
        });
    });
}
