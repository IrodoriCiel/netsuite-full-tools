(function () {
    'use strict';

    const STORAGE_KEY = 'enableSuiteletTools';

    if (!/\/scriptlet\.nl(?:\?|$)/.test(location.pathname + location.search)) return;

    let fetcherInjected = false;
    let storageListener = null;

    chrome.storage.local.get({ [STORAGE_KEY]: true }, (items) => {
        attachStorageListener();
        if (!items[STORAGE_KEY]) return;
        init();
    });

    function init() {
        injectStyles();
        injectScript();
        attachFetchRelay();
    }

    let fetchRelayAttached = false;
    function attachFetchRelay() {
        if (fetchRelayAttached) return;
        fetchRelayAttached = true;
        window.addEventListener('message', (ev) => {
            if (ev.source !== window) return;
            const d = ev.data;
            if (!d || d.type !== 'nsft-suitelet-tools-fetch' || typeof d.url !== 'string') return;
            const reqId = d.reqId;
            const reply = (ok, text) => {
                window.postMessage({ type: 'nsft-suitelet-tools-fetch-result', reqId, ok: !!ok, text: ok ? text : null }, '*');
            };
            try {
                chrome.runtime.sendMessage({ action: 'nsftFetchScriptingHtml', url: d.url }, (resp) => {
                    const ok = !chrome.runtime.lastError && resp && resp.ok;
                    reply(ok, ok ? resp.text : null);
                });
            } catch (e) {
                reply(false, null);
            }
        });
    }

    function attachStorageListener() {
        if (storageListener) return;
        storageListener = (changes, area) => {
            if (area !== 'local') return;
            if (!changes[STORAGE_KEY]) return;
            const enabled = changes[STORAGE_KEY].newValue !== false;
            if (!enabled) {
                window.postMessage({ type: 'nsft-suitelet-tools-teardown' }, '*');
            } else if (!fetcherInjected) {
                init();
            } else {
                postInitMessage();
            }
        };
        chrome.storage.onChanged.addListener(storageListener);
    }

    function injectStyles() {
        if (document.getElementById('nsft-suitelet-tools-style')) return;
        const link = document.createElement('link');
        link.id = 'nsft-suitelet-tools-style';
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('scripts/modules/suitelet_tools/suitelet_tools.css');
        document.head.appendChild(link);
    }

    function injectScript() {
        if (fetcherInjected) {
            postInitMessage();
            return;
        }
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('scripts/modules/suitelet_tools/suitelet_tools_fetcher.js');
        script.onload = function () {
            this.remove();
            fetcherInjected = true;
            postInitMessage();
        };
        (document.head || document.documentElement).appendChild(script);
    }

    function postInitMessage() {
        const translations = {
            st_suitelet_actions: chrome.i18n.getMessage('st_suitelet_actions'),
            st_open_script_record: chrome.i18n.getMessage('st_open_script_record'),
            st_open_deploy_record: chrome.i18n.getMessage('st_open_deploy_record'),
            st_edit_script_file: chrome.i18n.getMessage('st_edit_script_file'),
            st_view_suitelet_logs: chrome.i18n.getMessage('st_view_suitelet_logs')
        };
        window.postMessage({
            type: 'nsft-suitelet-tools-init',
            translations: translations,
            iconUrl: chrome.runtime.getURL('assets/img/logomini.png')
        }, '*');
    }

})();
