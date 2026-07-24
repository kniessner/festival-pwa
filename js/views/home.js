import { pageIdx, FESTIVAL_START } from '../config.js';
import { getFavorites, getNextUpcomingFavorite } from '../favorites.js';
import { escapeHtml } from '../ui.js';

export function renderHome(container) {
    const favCount = getFavorites().length;
    const next = getNextUpcomingFavorite();
    container.innerHTML = `
        <div class="hero">
            <div class="hero-logo">🌊</div>
            <h1>Bucht der Träumer*</h1>
            <div class="hero-sub">Festival 2026</div>
            <!-- <div class="countdown" id="countdown">–</div>
            <div class="countdown-label">Tage bis zum Festival</div>-->
            <div class="quick-nav">
                <button class="quick-btn" data-action="load-page" data-page="${pageIdx('timetable')}">📅 Programm</button>
                <button class="quick-btn" data-action="load-page" data-page="${pageIdx('info')}">ℹ️ Info</button>
                ${favCount > 0 ? `<button class="quick-btn quick-btn-accent" data-action="load-page" data-page="${pageIdx('favorites')}">⭐ Mein Plan (${favCount})</button>` : ''}
            </div>
            ${next ? `
            <div class="next-event-card" data-action="goto-event" data-index="${next.index}" data-day="${next.ev.day}">
                <div class="next-event-label">${next.running ? '🔴 Läuft gerade' : '⭐ Dein nächstes Event'}</div>
                <h3>${escapeHtml(next.ev.title)}</h3>
                <div class="next-event-meta">${escapeHtml(next.ev.time)}${next.ev.stage_label ? ' · ' + escapeHtml(next.ev.stage_label) : ''}</div>
            </div>` : ''}
        </div>

         <div class="info-section">
            <h3>📍 Wichtige Infos</h3>
            <div class="info-grid">
                <div class="info-card" data-action="load-page" data-page="${pageIdx('timetable')}">
                    <span class="icon">📅</span>
                    <div class="label">Kulturprogramm</div>
                    <div class="desc">149+ Events über alle Tage</div>
                </div>
                <div class="info-card" data-action="load-page" data-page="${pageIdx('info')}">
                    <span class="icon">💳</span>
                    <div class="label">Cashless & FAQs</div>
                    <div class="desc">Alles rund ums Festival</div>
                </div>
                <div class="info-card" data-action="load-page" data-page="${pageIdx('info')}">
                    <span class="icon">ℹ️</span>
                    <div class="label">News & Updates</div>
                    <div class="desc">Wichtige Infos und Updates</div>
                </div>
                <div class="info-card" data-action="load-page" data-page="${pageIdx('favorites')}">
                    <span class="icon">⭐</span>
                    <div class="label">Mein Plan</div>
                    <div class="desc">${favCount > 0 ? favCount + ' gespeichert' : 'Favoriten hinzufügen'}</div>
                </div>
            </div>
        </div>
        
    `;
    // Update countdown
    const festivalStart = new Date(FESTIVAL_START);
    const now = new Date();
    const diff = Math.ceil((festivalStart - now) / (1000 * 60 * 60 * 24));
    const el = document.getElementById('countdown');
    if (el) el.textContent = diff > 0 ? diff : (diff === 0 ? 'Heute!' : 'Vorbei');
}
