(function () {
    'use strict';

    const AT_KEY = 'nsftInstalledAt';
    const PAGES_KEY = 'nsftRatePages';
    const STATE_KEY = 'nsftRatePrompt';
    const TOAST_ID = 'nsft-rate-prompt';

    const MIN_DAYS = 7;
    const MIN_PAGES = 25;
    const SNOOZE_PAGES = 60;
    const SHOW_DELAY_MS = 4000;

    const STORE_URL = 'https://chromewebstore.google.com/detail/netsuite-full-tools/fgldkomofdfcmkccjgalihlollndjmcc/reviews';
    const COFFEE_URL = 'https://buymeacoffee.com/miguelgarcia93';

    const RB = window.NSFT_RecordButtons;
    if (RB && RB.isHeaderlessPage && RB.isHeaderlessPage()) return;

    if (window.top !== window) return;

    chrome.storage.local.get({
        [AT_KEY]: 0,
        [PAGES_KEY]: 0,
        [STATE_KEY]: null
    }, (items) => {
        if (chrome.runtime.lastError) return;

        const now = Date.now();
        const installedAt = items[AT_KEY] || now;
        const pages = (items[PAGES_KEY] || 0) + 1;
        const state = items[STATE_KEY] || { off: false, snoozeUntil: 0 };

        const patch = { [PAGES_KEY]: pages };
        if (!items[AT_KEY]) patch[AT_KEY] = now;
        chrome.storage.local.set(patch);

        if (state.off) return;
        if (pages < MIN_PAGES) return;
        if (pages < (state.snoozeUntil || 0)) return;
        if ((now - installedAt) / 86400000 < MIN_DAYS) return;

        setTimeout(() => show(pages), SHOW_DELAY_MS);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STATE_KEY]) return;
        const v = changes[STATE_KEY].newValue;
        if (v && (v.off || v.snoozeUntil)) removeToast();
    });

    function silence() {
        try { chrome.storage.local.set({ [STATE_KEY]: { off: true, snoozeUntil: 0 } }); } catch (e) { }
        removeToast();
    }

    function snooze(pages) {
        try {
            chrome.storage.local.set({
                [STATE_KEY]: { off: false, snoozeUntil: pages + SNOOZE_PAGES }
            });
        } catch (e) { }
        removeToast();
    }

    function removeToast() {
        const t = document.getElementById(TOAST_ID);
        if (!t) return;
        t.classList.remove('nsft-rp-visible');
        setTimeout(() => {
            if (!t.isConnected) return;
            if (window.NSFT_Notices) window.NSFT_Notices.unmount(t);
            else t.remove();
        }, 250);
    }

    function t(key, fallback) {
        try {
            const msg = chrome.i18n.getMessage(key);
            if (msg) return msg;
        } catch (e) { }
        return fallback;
    }

    function openTab(url) {
        try { window.open(url, '_blank', 'noopener'); } catch (e) { }
    }

    function show(pages) {
        if (!document.body || document.getElementById(TOAST_ID)) return;

        const toast = document.createElement('div');
        toast.id = TOAST_ID;
        toast.setAttribute('role', 'complementary');

        const logo = document.createElement('img');
        logo.className = 'nsft-rp-logo';
        logo.src = chrome.runtime.getURL('assets/icons/icon48.png');
        logo.alt = '';

        const text = document.createElement('div');
        text.className = 'nsft-rp-text';

        const title = document.createElement('div');
        title.className = 'nsft-rp-title';
        title.textContent = t('rateTitle', '¿Te está sirviendo NetSuite Full Tools?');

        const body = document.createElement('div');
        body.className = 'nsft-rp-body';
        body.textContent = t('rateBody', 'La extensión es gratuita. Una sola calificación marca una gran diferencia.');

        const actions = document.createElement('div');
        actions.className = 'nsft-rp-actions';

        const go = document.createElement('button');
        go.type = 'button';
        go.className = 'nsft-rp-btn nsft-rp-btn-primary';
        go.textContent = t('rateCta', 'Calificar');
        go.addEventListener('click', () => { openTab(STORE_URL); silence(); });

        const coffee = document.createElement('button');
        coffee.type = 'button';
        coffee.className = 'nsft-rp-btn nsft-rp-btn-coffee';
        coffee.textContent = t('rateCoffee', 'Invítame un café');
        coffee.addEventListener('click', () => { openTab(COFFEE_URL); snooze(pages); });

        actions.appendChild(go);
        actions.appendChild(coffee);

        const never = document.createElement('button');
        never.type = 'button';
        never.className = 'nsft-rp-never';
        never.textContent = t('rateNever', 'No volver a mostrar');
        never.addEventListener('click', silence);

        text.appendChild(title);
        text.appendChild(body);
        text.appendChild(actions);
        text.appendChild(never);

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'nsft-rp-close';
        close.title = t('rateCloseTitle', 'Ahora no');
        close.setAttribute('aria-label', t('rateCloseTitle', 'Ahora no'));
        close.textContent = '✕';
        close.addEventListener('click', () => snooze(pages));

        toast.appendChild(logo);
        toast.appendChild(text);
        toast.appendChild(close);
        if (!(window.NSFT_Notices && window.NSFT_Notices.mount(toast))) {
            document.body.appendChild(toast);
        }
        requestAnimationFrame(() => toast.classList.add('nsft-rp-visible'));
    }
})();
