(function () {
    'use strict';

    function stamp(mode) {
        try {
            const el = document.documentElement;
            if (el) el.setAttribute('data-nsft-theme', mode === 'dark' ? 'dark' : 'light');
        } catch (e) { }
    }

    try {
        chrome.storage.local.get({ nsftTheme: 'light' }, (items) => {
            stamp(items.nsftTheme);
        });
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || !changes.nsftTheme) return;
            stamp(changes.nsftTheme.newValue);
        });
    } catch (e) {
        stamp('light');
    }
})();
