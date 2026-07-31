(function () {
    'use strict';

    function stamp(mode) {
        try {
            const el = document.documentElement;
            if (el) el.setAttribute('data-nsft-theme', mode === 'dark' ? 'dark' : 'light');
        } catch (e) { }
    }

    try {
        stamp(localStorage.getItem('nsftThemeCache'));
    } catch (e) {
        stamp('light');
    }

    try {
        chrome.storage.local.get({ nsftTheme: 'light' }, (items) => {
            const mode = items.nsftTheme === 'dark' ? 'dark' : 'light';
            stamp(mode);
            try { localStorage.setItem('nsftThemeCache', mode); } catch (e) { }
        });
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || !changes.nsftTheme) return;
            stamp(changes.nsftTheme.newValue);
        });
    } catch (e) { }
})();
