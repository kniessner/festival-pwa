import { store } from '../store.js';
import { escapeHtml, textToHtml, favButton, renderFaqList } from '../ui.js';
import { t } from '../i18n.js';

export function renderInfo(container) {
    const info = store.pageData.info;
    const cashless = info ? info.cashless : null;
    const faqs = info ? info.faqs : null;
    // The News tab shows admin-authored notifications ("PWA Push" CPT) instead
    // of the scraped /news/ page content — that scrape still runs and info.news
    // still exists in the data, it's just not what's displayed here anymore.
    const news = store.pageData.notifications;

    let html = '<div class="info-tabs" id="infoTabs">';
    html += `<button class="info-tab active" data-tab="news" data-action="switch-info-tab">${t('info.tabNews')}</button>`;
    html += `<button class="info-tab" data-tab="cashless" data-action="switch-info-tab">${t('info.tabCashless')}</button>`;
    html += `<button class="info-tab" data-tab="faqs" data-action="switch-info-tab">${t('info.tabFaqs')}</button>`;
    html += '</div>';

    // ── News ──
    html += '<div class="info-panel active" id="panel-news">';
    if (news && news.items && news.items.length) {
        html += news.items.map((item, i) => {
            const date = item.date ? `<span class="news-date">${escapeHtml(item.date)}</span>` : '';
            const highlight = item.highlight ? 'news-highlight' : '';
            return `<div class="news-card ${highlight}" data-item-index="${i}">
                <div class="card-header"><h3>${escapeHtml(item.question)}</h3>
                ${favButton('notifications', i)}</div>
                ${date}
                <p>${escapeHtml(item.answer)}</p>
            </div>`;
        }).join('');
    } else {
        html += `<div class="page-intro" style="margin-top:0">${t('info.newsEmpty')}</div>`;
    }
    html += '</div>';

    // ── Cashless ──
    html += '<div class="info-panel" id="panel-cashless">';
    if (cashless) {
        html += `<div class="page-intro" style="margin-top:0">${textToHtml(cashless.intro)}</div>`;
        html += renderFaqList(cashless.items, 'info-cashless');
    }
    html += '</div>';

    // ── FAQs ──
    html += '<div class="info-panel" id="panel-faqs">';
    if (faqs && faqs.items) {
        html += renderFaqList(faqs.items, 'info-faqs');
    }
    html += '</div>';

    container.innerHTML = html;
}

export function switchInfoTab(tab) {
    document.querySelectorAll('.info-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.querySelectorAll('.info-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + tab));
}
