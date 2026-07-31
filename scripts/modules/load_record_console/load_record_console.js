'use strict';

(function () {
    const STORAGE_KEY = 'enableLoadRecordConsole';
    const THEME_KEY = 'nsftTheme';
    const FETCHER_SCRIPT = 'scripts/modules/load_record_console/load_record_console_fetcher.js';
    const CSS_FILE = 'scripts/modules/load_record_console/load_record_console.css';
    const CSS_ID = 'nsft-lrc-css';

    const RB = window.NSFT_RecordButtons;

    let _nsftTheme = 'light';
    let _messagesCache = null;
    let _cssInjected = false;
    let _fetcherReady = false;
    let _fetcherInjecting = false;
    let _pendingCbs = [];

    chrome.storage.local.get({
        [STORAGE_KEY]: true,
        [THEME_KEY]: 'light'
    }, (items) => {
        if (!items[STORAGE_KEY]) return;
        if (RB && RB.isExcludedPage && RB.isExcludedPage()) return;
        _nsftTheme = items[THEME_KEY] || 'light';
        init();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[THEME_KEY]) {
            _nsftTheme = changes[THEME_KEY].newValue || 'light';
            if (_fetcherReady) {
                window.postMessage({ dest: 'fetcher_lrc', type: 'theme', theme: resolveTheme() }, '*');
            }
        }
    });

    function resolveTheme() {
        return _nsftTheme === 'dark' ? 'dark' : 'light';
    }

    function init() {
        injectCSSOnce();
        const coach = (id) => {
            if (window.NSFT_ShortcutCoach) window.NSFT_ShortcutCoach.hint(id);
        };
        window.addEventListener('nsft-load-record-ss1', () => { requestLoad('ss1'); coach('load_record_console_ss1'); });
        window.addEventListener('nsft-load-record-ss2', () => { requestLoad('ss2'); coach('load_record_console_ss2'); });

        if (window.NSFT_Shortcuts && window.NSFT_Shortcuts.bind) {
            const group = chrome.i18n.getMessage('cheatsheet_group_global') || 'Global';
            window.NSFT_Shortcuts.bind('load_record_console_ss1', {
                label: chrome.i18n.getMessage('lrc_menu_ss1') || 'Load record (SS1)',
                defaultCombo: { ctrlKey: false, shiftKey: true, altKey: true, code: 'Digit1' },
                storageKey: 'loadRecordSs1Shortcut',
                event: 'nsft-load-record-ss1',
                group,
                order: 45
            });
            window.NSFT_Shortcuts.bind('load_record_console_ss2', {
                label: chrome.i18n.getMessage('lrc_menu_ss2') || 'Load record (SS2)',
                defaultCombo: { ctrlKey: false, shiftKey: true, altKey: true, code: 'Digit2' },
                storageKey: 'loadRecordSs2Shortcut',
                event: 'nsft-load-record-ss2',
                group,
                order: 46
            });
        }
        window.addEventListener('message', onFetcherMessage);
    }

    function onFetcherMessage(e) {
        if (e.source !== window) return;
        const d = e.data;
        if (!d || typeof d !== 'object' || d.dest !== 'extension_lrc') return;
        if (d.type === 'success' && window.NSFT_Clipboard && window.NSFT_Clipboard.showToast) {
            window.NSFT_Clipboard.showToast(d.text || '', { type: 'success' });
        }
    }

    function getMessages() {
        if (_messagesCache) return _messagesCache;
        _messagesCache = {
            lrc_loaded: chrome.i18n.getMessage('lrc_loaded'),
            lrc_ss1_saved: chrome.i18n.getMessage('lrc_ss1_saved'),
            lrc_ss2_saved: chrome.i18n.getMessage('lrc_ss2_saved'),
            lrc_ss2_unsaved: chrome.i18n.getMessage('lrc_ss2_unsaved'),
            lrc_vars: chrome.i18n.getMessage('lrc_vars'),
            lrc_fail_scriptable: chrome.i18n.getMessage('lrc_fail_scriptable'),
            lrc_fail_error: chrome.i18n.getMessage('lrc_fail_error'),
            lrc_btn_ok: chrome.i18n.getMessage('lrc_btn_ok'),
            lrc_auto_close: chrome.i18n.getMessage('lrc_auto_close'),
            lrc_modal_title: chrome.i18n.getMessage('lrc_modal_title'),
            lrc_vars_label: chrome.i18n.getMessage('lrc_vars_label')
        };
        return _messagesCache;
    }

    function requestLoad(mode) {
        ensureFetcher(() => {
            window.postMessage({
                dest: 'fetcher_lrc',
                type: 'load',
                mode,
                messages: getMessages(),
                theme: resolveTheme()
            }, '*');
        });
    }

    function ensureFetcher(cb) {
        if (_fetcherReady) { cb(); return; }
        _pendingCbs.push(cb);
        if (_fetcherInjecting) return;
        _fetcherInjecting = true;

        const s = document.createElement('script');
        s.src = chrome.runtime.getURL(FETCHER_SCRIPT);
        s.onload = function () {
            this.remove();
            _fetcherReady = true;
            const cbs = _pendingCbs;
            _pendingCbs = [];
            cbs.forEach(fn => { try { fn(); } catch (e) { } });
        };
        (document.head || document.documentElement).appendChild(s);
    }

    function injectCSSOnce() {
        if (_cssInjected || document.getElementById(CSS_ID)) { _cssInjected = true; return; }
        const link = document.createElement('link');
        link.id = CSS_ID;
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = chrome.runtime.getURL(CSS_FILE);
        (document.head || document.documentElement).appendChild(link);
        _cssInjected = true;
    }

})();
