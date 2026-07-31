(function () {
    'use strict';

    const STORAGE_KEY = 'enableTurboMode';
    const HTML_CLASS = 'nsft-turbo';

    chrome.storage.local.get({ [STORAGE_KEY]: false }, (items) => {
        apply(!!items[STORAGE_KEY]);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        apply(!!changes[STORAGE_KEY].newValue);
    });

    function apply(on) {
        const el = document.documentElement;
        if (el) el.classList.toggle(HTML_CLASS, on);
    }
})();
