(function () {
    'use strict';
    const STORAGE_KEY = 'enableLoggedoutRedirectBeta';

    chrome.storage.local.get({ [STORAGE_KEY]: true, nsftSelectorDiagnostics: false }, (items) => {
        if (!items[STORAGE_KEY]) return;
        redirectIfFromAccount(!!items.nsftSelectorDiagnostics);
    });

    function redirectIfFromAccount(diag) {
        try {
            const ref = document.referrer;
            if (!ref) return;
            const host = new URL(ref).host;
            if (host === location.host) return;
            if (/^[\da-z-]+\.app\.netsuite\.com$/i.test(host)) {
                location.href = ref;
            }
        } catch (e) {
            if (diag) console.warn('NSFT loggedout redirect:', e);
        }
    }
})();
