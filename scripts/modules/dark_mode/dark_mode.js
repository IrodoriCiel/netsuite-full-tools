(function () {
    'use strict';

    const STORAGE_KEY = 'enableDarkMode';
    const STYLE_KEY = 'darkModeStyle';
    const HTML_CLASS = 'nsft-dark-on';
    const BLACK_CLASS = 'nsft-dark-black';
    const ANIM_CLASS = 'nsft-dark-anim';
    const ANIM_MS = 320;

    if (/\/(?:print\/|NLSPrintForm|hotprint|barcodeprinter)/i.test(location.pathname)) return;

    chrome.storage.local.get({ [STORAGE_KEY]: false, [STYLE_KEY]: 'gray' }, (items) => {
        applyStyle(items[STYLE_KEY]);
        apply(!!items[STORAGE_KEY]);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (!changes[STYLE_KEY] && !changes[STORAGE_KEY]) return;
        armTransition();
        if (changes[STYLE_KEY]) applyStyle(changes[STYLE_KEY].newValue);
        if (changes[STORAGE_KEY]) apply(!!changes[STORAGE_KEY].newValue);
    });

    let _animTimer = null;

    function armTransition() {
        const el = document.documentElement;
        if (!el) return;
        el.classList.add(ANIM_CLASS);
        void el.offsetWidth;
        if (_animTimer) clearTimeout(_animTimer);
        _animTimer = setTimeout(() => {
            el.classList.remove(ANIM_CLASS);
            _animTimer = null;
        }, ANIM_MS + 80);
    }

    function apply(on) {
        const el = document.documentElement;
        if (!el) return;
        el.classList.toggle(HTML_CLASS, on);
    }

    function applyStyle(style) {
        const el = document.documentElement;
        if (!el) return;
        el.classList.toggle(BLACK_CLASS, style === 'black');
    }
})();
