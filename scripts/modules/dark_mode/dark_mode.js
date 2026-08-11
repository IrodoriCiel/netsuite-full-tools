(function () {
    'use strict';

    const STORAGE_KEY = 'enableDarkMode';
    const STYLE_KEY = 'darkModeStyle';
    const SCOPE_KEY = 'darkModeScope';
    const HTML_CLASS = 'nsft-dark-on';
    const BLACK_CLASS = 'nsft-dark-black';
    const ANIM_CLASS = 'nsft-dark-anim';
    const ANIM_MS = 320;

    if (/\/(?:print\/|NLSPrintForm|hotprint|barcodeprinter)/i.test(location.pathname)) return;

    if (document.contentType && !/html/i.test(document.contentType)) return;

    const IS_SUITELET = /\/app\/site\/hosting\/scriptlet\.nl/i.test(location.pathname);
    const NS_FORM_MARKERS = '#main_form, form[name="main_form"], #div__header, #div__body, .uir-page-title, .uir-outside-title-table, #NS_MENU';
    let formSeen = !IS_SUITELET;
    let wanted = false;
    let scopeAll = true;

    function watchForNsForm() {
        const check = () => {
            if (!document.querySelector(NS_FORM_MARKERS)) return false;
            formSeen = true;
            stop();
            sync();
            return true;
        };
        let mo = null;
        const stop = () => { if (mo) { mo.disconnect(); mo = null; } };
        if (check()) return;
        mo = new MutationObserver(check);
        mo.observe(document.documentElement, { childList: true, subtree: true });
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', stop, { once: true });
        } else {
            stop();
        }
    }
    if (IS_SUITELET) watchForNsForm();

    chrome.storage.local.get({ [STORAGE_KEY]: false, [STYLE_KEY]: 'gray', [SCOPE_KEY]: 'all' }, (items) => {
        scopeAll = items[SCOPE_KEY] !== 'nsft';
        applyStyle(items[STYLE_KEY]);
        apply(!!items[STORAGE_KEY]);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (!changes[STYLE_KEY] && !changes[STORAGE_KEY] && !changes[SCOPE_KEY]) return;
        armTransition();
        if (changes[STYLE_KEY]) applyStyle(changes[STYLE_KEY].newValue);
        if (changes[SCOPE_KEY]) scopeAll = changes[SCOPE_KEY].newValue !== 'nsft';
        if (changes[STORAGE_KEY]) wanted = !!changes[STORAGE_KEY].newValue;
        sync();
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
        wanted = !!on;
        sync();
    }

    function sync() {
        const el = document.documentElement;
        if (!el) return;
        el.classList.toggle(HTML_CLASS, wanted && scopeAll && formSeen);
    }

    function applyStyle(style) {
        const el = document.documentElement;
        if (!el) return;
        el.classList.toggle(BLACK_CLASS, style === 'black');
    }
})();
