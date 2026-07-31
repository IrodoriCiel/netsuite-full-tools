'use strict';

(function () {
    const STORAGE_KEY = 'enableLoadNModule';
    const FETCHER_SCRIPT = 'scripts/modules/load_n_module/load_n_module_fetcher.js';
    const CSS_FILE = 'scripts/modules/load_record_console/load_record_console.css';
    const CUSTOM_EVENT = 'nsft-load-n-module';
    const THEME_KEY = 'nsftTheme';

    if (!/\.app\.netsuite\.com$/.test(location.hostname)) return;

    let _nsftTheme = 'light';
    let _enabled = false;
    let _eventListener = null;
    let _storageListener = null;
    let _messageListener = null;
    let _fetcherInjected = false;
    let _cssInjected = false;

    chrome.storage.local.get({ [STORAGE_KEY]: true, [THEME_KEY]: 'light' }, (items) => {
        _nsftTheme = items[THEME_KEY] || 'light';
        attachStorageListener();
        if (!items[STORAGE_KEY]) return;
        start();
    });

    function start() {
        if (_enabled) return;
        _enabled = true;
        _eventListener = handleLoadN;
        window.addEventListener(CUSTOM_EVENT, _eventListener);

        if (window.NSFT_Shortcuts && window.NSFT_Shortcuts.bind) {
            window.NSFT_Shortcuts.bind('load_n_module', {
                label: chrome.i18n.getMessage('lnm_menu_label') || 'Load N module',
                defaultCombo: { ctrlKey: false, shiftKey: true, altKey: true, code: 'KeyN' },
                storageKey: 'loadNModuleShortcut',
                event: CUSTOM_EVENT,
                group: chrome.i18n.getMessage('cheatsheet_group_global') || 'Global',
                order: 47,
                isEnabled: () => _enabled
            });
        }
        _messageListener = onFetcherMessage;
        window.addEventListener('message', _messageListener);
    }

    function stop() {
        if (!_enabled) return;
        _enabled = false;
        if (_eventListener) {
            window.removeEventListener(CUSTOM_EVENT, _eventListener);
            _eventListener = null;
        }
        if (_messageListener) {
            window.removeEventListener('message', _messageListener);
            _messageListener = null;
        }
        if (_fetcherInjected) {
            window.postMessage({ dest: 'fetcher_lnm', type: 'teardown' }, '*');
        }
    }

    function onFetcherMessage(e) {
        if (e.source !== window) return;
        const d = e.data;
        if (!d || typeof d !== 'object' || d.dest !== 'extension_lnm') return;
        if (!window.NSFT_Clipboard || !window.NSFT_Clipboard.showToast) return;
        if (d.type === 'success') {
            window.NSFT_Clipboard.showToast(d.text || '', { type: 'success' });
        } else if (d.type === 'error') {
            window.NSFT_Clipboard.showToast(d.text || '', { type: 'error' });
        }
    }

    function attachStorageListener() {
        if (_storageListener) return;
        _storageListener = (changes, area) => {
            if (area !== 'local') return;
            if (changes[STORAGE_KEY]) {
                const enabled = changes[STORAGE_KEY].newValue !== false;
                if (!enabled) stop();
                else start();
            }
            if (changes[THEME_KEY]) {
                _nsftTheme = changes[THEME_KEY].newValue || 'light';
                if (_fetcherInjected) {
                    window.postMessage({
                        dest: 'fetcher_lnm',
                        type: 'theme_changed',
                        payload: { theme: resolveTheme() }
                    }, '*');
                }
            }
        };
        chrome.storage.onChanged.addListener(_storageListener);
    }

    function resolveTheme() {
        return _nsftTheme === 'dark' ? 'dark' : 'light';
    }

    function handleLoadN() {
        injectCSS();
        if (window.NSFT_ShortcutCoach) window.NSFT_ShortcutCoach.hint('load_n_module');
        injectFetcher(() => sendInitMessage());
    }

    function sendInitMessage() {
        window.postMessage({
            dest: 'fetcher_lnm',
            type: 'init',
            payload: {
                i18n: {
                    lnm_loaded: chrome.i18n.getMessage('lnm_loaded'),
                    lnm_toast_short: chrome.i18n.getMessage('lnm_toast_short'),
                    lnm_toast_fail_require: chrome.i18n.getMessage('lnm_toast_fail_require'),
                    lnm_toast_fail_error: chrome.i18n.getMessage('lnm_toast_fail_error'),
                    lnm_console_tag: chrome.i18n.getMessage('lnm_console_tag'),
                    lnm_console_loaded: chrome.i18n.getMessage('lnm_console_loaded'),
                    lnm_vars_label: chrome.i18n.getMessage('lnm_vars_label'),
                    lnm_fail_require: chrome.i18n.getMessage('lnm_fail_require'),
                    lnm_fail_error: chrome.i18n.getMessage('lnm_fail_error'),
                    lnm_modal_title: chrome.i18n.getMessage('lnm_modal_title'),
                    lnm_btn_ok: chrome.i18n.getMessage('lnm_btn_ok'),
                    lnm_auto_close: chrome.i18n.getMessage('lnm_auto_close')
                },
                theme: resolveTheme()
            }
        }, '*');
    }

    function injectFetcher(onReady) {
        if (_fetcherInjected) {
            if (typeof onReady === 'function') onReady();
            return;
        }
        const s = document.createElement('script');
        s.src = chrome.runtime.getURL(FETCHER_SCRIPT);
        s.onload = function () {
            this.remove();
            _fetcherInjected = true;
            if (typeof onReady === 'function') onReady();
        };
        appendTo('head').appendChild(s);
    }

    function injectCSS() {
        if (_cssInjected || document.getElementById('nsft-lrc-css')) {
            _cssInjected = true;
            return;
        }
        const link = document.createElement('link');
        link.id = 'nsft-lrc-css';
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = chrome.runtime.getURL(CSS_FILE);
        appendTo('head').appendChild(link);
        _cssInjected = true;
    }

    function appendTo(preferred) {
        return document.head || document[preferred] || document.documentElement;
    }
})();
