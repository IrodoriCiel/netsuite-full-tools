
(function () {
    'use strict';
    const STORAGE_KEY = 'enableEditorOpenInNewTab';
    const LINK_CLASS = 'nsft-new-tab-btn';
    const ADV_CLASS = 'nsft-adv-editor-btn';
    const ADV_KEY = 'enableAdvancedEditor';
    const ADV_PARAM = 'nsft-advanced-editor';

    let cachedLinkText = 'Open in new tab';
    let cachedAdvText = 'Open in Advanced Editor';
    let advEnabled = false;
    let observerRef = null;
    let unsubscribeShared = null;
    let _arrancado = false;

    chrome.storage.local.get({
        [STORAGE_KEY]: true,
        [ADV_KEY]: true
    }, (items) => {
        advEnabled = !!items[ADV_KEY];

        if (esPaginaDelEditorDeNetSuite()) {
            if (!advEnabled) return;
            initEnElEditor();
            return;
        }

        if (!items[STORAGE_KEY]) return;
        init();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        if (changes[STORAGE_KEY].newValue === false) {
            document.querySelectorAll('.' + LINK_CLASS + ', .' + ADV_CLASS)
                .forEach((el) => el.remove());
            if (unsubscribeShared) { unsubscribeShared(); unsubscribeShared = null; }
            if (observerRef) { observerRef.disconnect(); observerRef = null; }
            _arrancado = false;
            return;
        }
        if (!_arrancado) init(); else addButtons();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[ADV_KEY]) return;
        advEnabled = !!changes[ADV_KEY].newValue;
        if (!advEnabled) {
            document.querySelectorAll('.' + ADV_CLASS).forEach((el) => el.remove());
        } else {
            addButtons();
        }
    });

    function init() {
        _arrancado = true;
        try {
            cachedLinkText = chrome.i18n.getMessage('openInNewTab') || cachedLinkText;
            cachedAdvText = chrome.i18n.getMessage('adv_open_link') || cachedAdvText;
        } catch (e) { }

        addButtons();

        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            unsubscribeShared = window.NSFT_Observer.subscribe(addButtons);
        } else {
            observerRef = new MutationObserver(addButtons);
            observerRef.observe(document.body, { childList: true, subtree: true });
        }
    }

    function isExtensionContextValid() {
        try {
            return Boolean(chrome.runtime && chrome.runtime.id);
        } catch (e) {
            return false;
        }
    }

    function addButtons() {
        if (!_arrancado) return;
        if (!isExtensionContextValid()) {
            if (observerRef) {
                observerRef.disconnect();
                observerRef = null;
            }
            if (unsubscribeShared) {
                unsubscribeShared();
                unsubscribeShared = null;
            }
            return;
        }

        const editLinks = document.querySelectorAll('a[onclick*="edittextmediaitem.nl"]');

        editLinks.forEach((link) => {
            const url = extractUrl(link.getAttribute('onclick'));
            if (!url || !link.parentNode) return;

            let ultimo = link;

            if (!(link.nextElementSibling && link.nextElementSibling.classList.contains(LINK_CLASS))) {
                const newLink = document.createElement('a');
                newLink.href = url;
                newLink.target = '_blank';
                newLink.className = `${link.className || ''} ${LINK_CLASS}`;
                newLink.textContent = cachedLinkText;
                link.parentNode.insertBefore(newLink, link.nextSibling);
                ultimo = newLink;
            } else {
                ultimo = link.nextElementSibling;
            }

            if (!advEnabled) return;
            if (ultimo.nextElementSibling && ultimo.nextElementSibling.classList.contains(ADV_CLASS)) return;
            const advUrl = urlEditorAvanzado(url);
            if (!advUrl) return;

            const advLink = document.createElement('a');
            advLink.href = advUrl;
            advLink.target = '_blank';
            advLink.className = `${link.className || ''} ${ADV_CLASS}`;
            advLink.textContent = cachedAdvText;
            ultimo.parentNode.insertBefore(advLink, ultimo.nextSibling);
        });
    }


    const BTN_ID = 'nsft-adv-editor-jump';

    function initEnElEditor() {
        try {
            cachedAdvText = chrome.i18n.getMessage('adv_open_link') || cachedAdvText;
        } catch (e) { }

        botonEnElEditor();
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            unsubscribeShared = window.NSFT_Observer.subscribe(botonEnElEditor);
        }
    }

    function esPaginaDelEditorDeNetSuite() {
        try {
            if (!/\/app\/common\/record\/edittextmediaitem\.nl/i.test(location.pathname)) return false;
            const q = new URLSearchParams(location.search);
            if (q.get(ADV_PARAM) === 'T') return false;
            return q.get('syntaxHighlighting') === 'T';
        } catch (e) { return false; }
    }

    function botonEnElEditor() {
        if (!advEnabled) return;
        if (document.getElementById(BTN_ID)) return;

        const destino = urlEditorAvanzado(location.href);
        if (!destino) return;

        const RB = window.NSFT_RecordButtons;
        const guardar = RB && RB.findSaveBtn && RB.findSaveBtn();
        if (!guardar || !RB.createButtonTable || !RB.injectAfter) return;

        const built = RB.createButtonTable({
            tableId: BTN_ID + '-tbl',
            btnId: BTN_ID,
            label: cachedAdvText
        });
        if (!built || !built.table || !built.btn) return;

        built.btn.addEventListener('click', (ev) => {
            ev.preventDefault();
            window.location.href = destino;
        });
        if (RB.attachButtonEffects) { try { RB.attachButtonEffects(built.btn); } catch (e) { } }

        RB.injectAfter(guardar, built.table);
    }

    function urlEditorAvanzado(url) {
        try {
            const u = new URL(url, location.origin);
            if (!/edittextmediaitem\.nl/i.test(u.pathname)) return null;
            u.searchParams.delete('syntaxHighlighting');
            u.searchParams.delete('l');
            u.searchParams.delete('target');
            u.searchParams.set('e', 'T');
            u.searchParams.set(ADV_PARAM, 'T');
            return u.pathname + u.search;
        } catch (e) { return null; }
    }

    function extractUrl(onclickContent) {
        if (!onclickContent) return null;
        const match = onclickContent.match(/nlOpenWindow\s*\(\s*'([^']+)'/);
        return match ? match[1] : null;
    }
})();
