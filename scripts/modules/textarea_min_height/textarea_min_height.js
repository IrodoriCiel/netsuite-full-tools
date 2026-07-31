(function () {
    'use strict';
    const STORAGE_KEY = 'enableTextareaMinHeightBeta';
    const HTML_CLASS = 'nsft-tamh-on';


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
