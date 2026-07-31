(function () {
    'use strict';

    const STORAGE_KEY = 'enableAdvancedPdfAutocomplete';
    const FETCHER_PATH = 'scripts/modules/advanced_pdf_autocomplete/advanced_pdf_autocomplete_fetcher.js';

    let injected = false;
    let _unsub = null;

    function isApplicablePage() {
        return /\/pdftemplate\.nl/i.test(location.pathname);
    }
    if (!isApplicablePage()) return;

    chrome.storage.local.get({ [STORAGE_KEY]: true, enableDiscreetMode: false, nsftSelectorDiagnostics: false }, (settings) => {
        if (settings.nsftSelectorDiagnostics) document.documentElement.dataset.nsftApdfacDiag = '1';
        if (settings[STORAGE_KEY] && !settings.enableDiscreetMode) enable();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.nsftSelectorDiagnostics) {
            if (changes.nsftSelectorDiagnostics.newValue) document.documentElement.dataset.nsftApdfacDiag = '1';
            else delete document.documentElement.dataset.nsftApdfacDiag;
        }
        if (!changes[STORAGE_KEY] && !changes.enableDiscreetMode) return;
        chrome.storage.local.get({ [STORAGE_KEY]: true, enableDiscreetMode: false }, (s) => {
            if (s[STORAGE_KEY] && !s.enableDiscreetMode) enable();
            else teardown();
        });
    });

    function enable() {
        if (injected) return;
        if (document.getElementById('pdftemplate-editor')) {
            injectFetcher();
        } else if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            _unsub = window.NSFT_Observer.subscribe(() => {
                if (document.getElementById('pdftemplate-editor')) {
                    if (_unsub) { _unsub(); _unsub = null; }
                    injectFetcher();
                }
            }, { throttle: 300 });
        } else {
            injectFetcher();
        }
    }

    function teardown() {
        if (_unsub) { _unsub(); _unsub = null; }
        window.postMessage({ dest: 'fetcher_apdfac', type: 'teardown' }, '*');
        injected = false;
    }

    function injectFetcher() {
        if (injected) return;
        injected = true;
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL(FETCHER_PATH);
        script.onload = function () { this.remove(); };
        (document.head || document.documentElement).appendChild(script);
    }
})();
