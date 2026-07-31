(function () {
    'use strict';
    const STORAGE_KEY = 'enableFloatingFieldGroupsBeta';
    const HTML_CLASS = 'nsft-ffg-on';

    const SUPPORTS_HAS = (() => {
        try { return !!(window.CSS && CSS.supports && CSS.supports('selector(:has(*))')); }
        catch (e) { return false; }
    })();

    function isApplicablePage() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isExcludedPage && NSFT_RecordButtons.isExcludedPage()) return false;
        } catch (e) { }
        return /\.nl$/.test(window.location.pathname);
    }

    if (!SUPPORTS_HAS || !isApplicablePage()) return;

    chrome.storage.local.get({ [STORAGE_KEY]: true }, (items) => {
        apply(items[STORAGE_KEY]);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        apply(changes[STORAGE_KEY].newValue);
    });

    function apply(enabled) {
        document.documentElement.classList.toggle(HTML_CLASS, !!enabled);
    }
})();
