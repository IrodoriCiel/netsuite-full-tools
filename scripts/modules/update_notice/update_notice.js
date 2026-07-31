(function () {
    'use strict';

    const STORAGE_KEY = 'enableUpdateNotice';
    const SEEN_KEY = 'nsftUpdateSeenVersion';

    const RB = window.NSFT_RecordButtons;
    if (RB && RB.isHeaderlessPage && RB.isHeaderlessPage()) return;

    const VERSION = (chrome.runtime.getManifest && chrome.runtime.getManifest().version) || '';
    if (!VERSION) return;

    chrome.storage.local.get({ [STORAGE_KEY]: true, [SEEN_KEY]: '' }, (items) => {
        if (!items[STORAGE_KEY]) return;
        if (items[SEEN_KEY] === VERSION) return;
        setTimeout(show, 1500);
    });

    function markSeen() {
        try { chrome.storage.local.set({ [SEEN_KEY]: VERSION }); } catch (e) { }
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[SEEN_KEY]) return;
        if (changes[SEEN_KEY].newValue === VERSION) removeToast();
    });

    function removeToast() {
        const t = document.getElementById('nsft-update-notice');
        if (!t) return;
        t.classList.remove('nsft-un-visible');
        setTimeout(() => t.remove(), 250);
    }

    function show() {
        if (!document.body || document.getElementById('nsft-update-notice')) return;

        const toast = document.createElement('div');
        toast.id = 'nsft-update-notice';

        const logo = document.createElement('img');
        logo.className = 'nsft-un-logo';
        logo.src = chrome.runtime.getURL('assets/icons/icon48.png');
        logo.alt = '';

        const text = document.createElement('div');
        text.className = 'nsft-un-text';
        const title = document.createElement('div');
        title.className = 'nsft-un-title';
        title.textContent = chrome.i18n.getMessage('un_toast_title', [VERSION]);
        const body = document.createElement('div');
        body.className = 'nsft-un-body';
        body.textContent = chrome.i18n.getMessage('un_toast_body');
        const list = document.createElement('ul');
        list.className = 'nsft-un-list';
        ['un_hl_1', 'un_hl_2', 'un_hl_3', 'un_hl_4', 'un_hl_5', 'un_hl_6',
         'un_hl_7', 'un_hl_8'].forEach((k) => {
            const msg = chrome.i18n.getMessage(k);
            if (!msg) return;
            const li = document.createElement('li');
            li.textContent = msg;
            list.appendChild(li);
        });
        const thanksMsg = chrome.i18n.getMessage('un_thanks');
        let thanks = null;
        if (thanksMsg) {
            thanks = document.createElement('div');
            thanks.className = 'nsft-un-thanks';
            thanks.textContent = thanksMsg;
        }

        const see = document.createElement('button');
        see.type = 'button';
        see.className = 'nsft-un-btn';
        see.textContent = chrome.i18n.getMessage('un_toast_btn');
        see.addEventListener('click', () => {
            try { window.open(chrome.runtime.getURL('popup/changelog.html'), '_blank', 'noopener'); } catch (e) { }
            markSeen();
            removeToast();
        });
        text.appendChild(title);
        text.appendChild(body);
        text.appendChild(list);
        if (thanks) text.appendChild(thanks);
        text.appendChild(see);

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'nsft-un-close';
        close.title = chrome.i18n.getMessage('un_toast_close');
        close.textContent = '✕';
        close.addEventListener('click', () => { markSeen(); removeToast(); });

        toast.appendChild(logo);
        toast.appendChild(text);
        toast.appendChild(close);
        document.body.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('nsft-un-visible'));
    }
})();
