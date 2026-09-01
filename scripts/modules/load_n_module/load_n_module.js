'use strict';

(function () {
    const STORAGE_KEY = 'enableLoadNModule';
    const FETCHER_SCRIPT = 'scripts/modules/load_n_module/load_n_module_fetcher.js';
    const CSS_FILE = 'scripts/modules/load_record_console/load_record_console.css';
    const CSS_FILE_OWN = 'scripts/modules/load_n_module/load_n_module.css';
    const CUSTOM_EVENT = 'nsft-load-n-module';
    const THEME_KEY = 'nsftTheme';
    const ALIASES_KEY = 'nsftLnmAliases';

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

        if (d.type === 'aliases') {
            const list = d.payload && d.payload.aliases;
            if (Array.isArray(list)) {
                try { chrome.storage.local.set({ [ALIASES_KEY]: list }); } catch (e) { }
            }
            return;
        }

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
        chrome.storage.local.get({ [ALIASES_KEY]: null }, (items) => {
            const saved = items && items[ALIASES_KEY];
            postInit(Array.isArray(saved) ? saved : null);
        });
    }

    const MODULE_KEYS = [
        'action', 'auth', 'bignumber', 'cache', 'config', 'crypto', 'currency',
        'currentRecord', 'dataset', 'datasetLink', 'email', 'encode', 'error', 'file',
        'format', 'http', 'https', 'log', 'plugin', 'portlet', 'query', 'record',
        'recordContext', 'redirect', 'render', 'runtime', 'search', 'sftp', 'sso',
        'suiteAppInfo', 'task', 'transaction', 'translation', 'ui', 'url', 'util',
        'workbook', 'workflow', 'xml'
    ];

    function buildDescriptions() {
        const out = {};
        MODULE_KEYS.forEach((k) => {
            const msg = chrome.i18n.getMessage('lnm_mod_' + k.toLowerCase());
            if (msg) out[k] = msg;
        });
        return out;
    }

    function postInit(aliases) {
        window.postMessage({
            dest: 'fetcher_lnm',
            type: 'init',
            payload: {
                aliases: aliases,
                descriptions: buildDescriptions(),
                i18n: {
                    lnm_loaded: chrome.i18n.getMessage('lnm_loaded'),
                    lnm_toast_short: chrome.i18n.getMessage('lnm_toast_short', ['$1']),
                    lnm_toast_fail_require: chrome.i18n.getMessage('lnm_toast_fail_require'),
                    lnm_toast_fail_error: chrome.i18n.getMessage('lnm_toast_fail_error', ['$1']),
                    lnm_console_tag: chrome.i18n.getMessage('lnm_console_tag'),
                    lnm_console_loaded: chrome.i18n.getMessage('lnm_console_loaded'),
                    lnm_vars_label: chrome.i18n.getMessage('lnm_vars_label'),
                    lnm_fail_require: chrome.i18n.getMessage('lnm_fail_require'),
                    lnm_fail_error: chrome.i18n.getMessage('lnm_fail_error', ['$1']),
                    lnm_modal_title: chrome.i18n.getMessage('lnm_modal_title'),
                    lnm_btn_ok: chrome.i18n.getMessage('lnm_btn_ok'),
                    lnm_auto_close: chrome.i18n.getMessage('lnm_auto_close'),
                    lnm_pick_intro: chrome.i18n.getMessage('lnm_pick_intro'),
                    lnm_pick_all: chrome.i18n.getMessage('lnm_pick_all'),
                    lnm_pick_none: chrome.i18n.getMessage('lnm_pick_none'),
                    lnm_pick_recommended: chrome.i18n.getMessage('lnm_pick_recommended'),
                    lnm_pick_taken: chrome.i18n.getMessage('lnm_pick_taken'),
                    lnm_pick_badge: chrome.i18n.getMessage('lnm_pick_badge'),
                    lnm_pick_count: chrome.i18n.getMessage('lnm_pick_count', ['$1', '$2']),
                    lnm_pick_search: chrome.i18n.getMessage('lnm_pick_search'),
                    ro_clear_search: chrome.i18n.getMessage('ro_clear_search'),
                    lnm_pick_foot: chrome.i18n.getMessage('lnm_pick_foot'),
                    lnm_btn_load: chrome.i18n.getMessage('lnm_btn_load', ['$1']),
                    lnm_btn_cancel: chrome.i18n.getMessage('lnm_btn_cancel')
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
        injectTextSearch();
        const s = document.createElement('script');
        s.src = chrome.runtime.getURL(FETCHER_SCRIPT);
        s.async = false;
        s.onload = function () {
            this.remove();
            _fetcherInjected = true;
            if (typeof onReady === 'function') onReady();
        };
        appendTo('head').appendChild(s);
    }

    function injectTextSearch() {
        if (document.getElementById('nsft-text-search-mw')) return;
        const s = document.createElement('script');
        s.id = 'nsft-text-search-mw';
        s.src = chrome.runtime.getURL('scripts/modules/_shared/nsft_text_search.js');
        s.async = false;
        s.onload = function () { this.remove(); };
        appendTo('head').appendChild(s);
    }

    function injectCSS() {
        if (_cssInjected) return;
        linkOnce('nsft-lrc-css', CSS_FILE);
        linkOnce('nsft-lnm-css', CSS_FILE_OWN);
        _cssInjected = true;
    }

    function linkOnce(id, file) {
        if (document.getElementById(id)) return;
        const link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = chrome.runtime.getURL(file);
        appendTo('head').appendChild(link);
    }

    function appendTo(preferred) {
        return document.head || document[preferred] || document.documentElement;
    }
})();
