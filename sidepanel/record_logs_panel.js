(function () {
    'use strict';

    function stamp(theme) {
        document.documentElement.setAttribute('data-nsft-theme', theme === 'dark' ? 'dark' : 'light');
    }

    chrome.storage.local.get({ nsftTheme: 'light' }, (items) => {
        stamp(items.nsftTheme);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes.nsftTheme) return;
        stamp(changes.nsftTheme.newValue);
    });
})();
