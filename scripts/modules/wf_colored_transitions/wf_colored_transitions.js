(function () {
    'use strict';

    const STORAGE_KEY = 'enableWfColoredTransitions';
    const FETCHER_PATH = 'scripts/modules/wf_colored_transitions/wf_colored_transitions_fetcher.js';

    const DEFAULTS = {
        [STORAGE_KEY]: true,
        enableDiscreetMode: false,
        wfColoredTransitionsPalette: 'vivid',
        wfColoredTransitionsLineStyle: 'solid',
        wfColoredTransitionsLineWidth: 2
    };

    let injected = false;
    let listening = false;

    function isApplicablePage() {
        return /\/app\/common\/workflow\//i.test(location.pathname);
    }
    if (!isApplicablePage()) return;

    chrome.storage.local.get(DEFAULTS, (settings) => {
        if (settings[STORAGE_KEY] && !settings.enableDiscreetMode) enable();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        const cfgChanged = changes.wfColoredTransitionsPalette ||
            changes.wfColoredTransitionsLineStyle || changes.wfColoredTransitionsLineWidth;
        if (changes[STORAGE_KEY] || changes.enableDiscreetMode) {
            chrome.storage.local.get(DEFAULTS, (s) => {
                if (s[STORAGE_KEY] && !s.enableDiscreetMode) enable();
                else teardown();
            });
        } else if (cfgChanged && injected) {
            sendConfig();
        }
    });

    function enable() {
        if (!listening) {
            listening = true;
            window.addEventListener('message', onFetcherMessage);
        }
        if (injected) { sendConfig(); return; }
        injected = true;
        const s = document.createElement('script');
        s.src = chrome.runtime.getURL(FETCHER_PATH);
        s.onload = function () { this.remove(); };
        (document.head || document.documentElement).appendChild(s);
    }

    function onFetcherMessage(ev) {
        const data = ev.data;
        if (!data || data.dest !== 'extension_wfct' || data.type !== 'ready') return;
        sendConfig();
    }

    function sendConfig() {
        chrome.storage.local.get(DEFAULTS, (s) => {
            window.postMessage({
                dest: 'fetcher_wfct',
                type: 'config',
                payload: {
                    palette: s.wfColoredTransitionsPalette || 'vivid',
                    lineStyle: s.wfColoredTransitionsLineStyle || 'solid',
                    lineWidth: s.wfColoredTransitionsLineWidth || 2
                }
            }, '*');
        });
    }

    function teardown() {
        if (!injected) return;
        window.postMessage({ dest: 'fetcher_wfct', type: 'teardown' }, '*');
    }
})();
