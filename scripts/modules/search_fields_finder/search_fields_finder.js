(function () {
    'use strict';
    const STORAGE_KEY = 'enableSearchFieldsFinder';
    const DISCREET_KEY = 'enableDiscreetMode';
    const SETTINGS_INPUT_ID = 'nsft-field-finder-settings';


    let _enabled = false;
    let _discreet = false;
    let _started = false;

    chrome.storage.local.get({
        [STORAGE_KEY]: true,
        [DISCREET_KEY]: false
    }, (items) => {
        _enabled = items[STORAGE_KEY] !== false;
        _discreet = !!items[DISCREET_KEY];
        attachStorageListener();
        evaluate();
    });

    function attachStorageListener() {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            if (changes[STORAGE_KEY]) {
                _enabled = changes[STORAGE_KEY].newValue !== false;
                evaluate();
            }
            if (changes[DISCREET_KEY]) {
                _discreet = !!changes[DISCREET_KEY].newValue;
                evaluate();
            }
        });
    }

    function onFetcherMessage(event) {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.dest !== 'extension_ff' || data.type !== 'copied') return;

        const clip = window.NSFT_Clipboard;
        if (!clip || typeof clip.showToast !== 'function') return;

        const payload = data.payload || {};
        if (payload.ok) {
            clip.showToast(
                chrome.i18n.getMessage('nsft_clipboard_copied') || 'Copied',
                { preview: String(payload.text || '') }
            );
        } else {
            clip.showToast(
                chrome.i18n.getMessage('nsft_clipboard_fail') || 'Copy failed',
                { type: 'error' }
            );
        }
    }

    function evaluate() {
        const shouldRun = _enabled && !_discreet;
        if (shouldRun && !_started) start();
        else if (!shouldRun && _started) teardown();
    }

    function start() {
        if (_started) return;
        _started = true;

        window.addEventListener('message', onFetcherMessage);

        const i18n = {
            btn_standard: chrome.i18n.getMessage("ff_btn_standard"),
            btn_custom: chrome.i18n.getMessage("ff_btn_custom"),
            btn_related: chrome.i18n.getMessage("ff_btn_related"),
            btn_formula: chrome.i18n.getMessage("ff_btn_formula"),
            placeholder: chrome.i18n.getMessage("ff_placeholder"),
            clear_search: chrome.i18n.getMessage("ro_clear_search"),
            showing_prefix: chrome.i18n.getMessage("ff_showing_prefix"),
            showing_middle: chrome.i18n.getMessage("ff_showing_middle"),
            showing_suffix: chrome.i18n.getMessage("ff_showing_suffix"),
            title_text: chrome.i18n.getMessage("ff_title_text"),
            related: chrome.i18n.getMessage("ff_related"),
            custom: chrome.i18n.getMessage("ff_custom"),
            custom_body: chrome.i18n.getMessage("ff_custom_body"),
            custom_col: chrome.i18n.getMessage("ff_custom_col"),
            formula: chrome.i18n.getMessage("ff_formula"),
            standard: chrome.i18n.getMessage("ff_standard"),
            error_http: chrome.i18n.getMessage("ff_error_http"),
            error_generic: chrome.i18n.getMessage("ff_error_generic"),
            settings_error: chrome.i18n.getMessage("ff_settings_error"),
            type_all: chrome.i18n.getMessage("ff_type_all"),
            type_prefix: chrome.i18n.getMessage("ff_type_prefix"),
            btn_empty_type: chrome.i18n.getMessage("ff_btn_empty_type")
        };

        const settings = {
            enabled: true,
            features: { multiSelect: true, relatedTableExpansion: true },
            attributes: { fieldId: true, fieldType: true, dataType: true },
            i18n: i18n
        };

        let input = document.getElementById(SETTINGS_INPUT_ID);
        if (!input) {
            input = document.createElement("input");
            input.id = SETTINGS_INPUT_ID;
            input.type = "hidden";
            (document.head || document.documentElement).appendChild(input);
        }
        input.setAttribute("data-options", JSON.stringify(settings));

        if (!document.getElementById('nsft-text-search-mw')) {
            const ts = document.createElement('script');
            ts.id = 'nsft-text-search-mw';
            ts.src = chrome.runtime.getURL('scripts/modules/_shared/nsft_text_search.js');
            ts.async = false;
            ts.onload = function () { this.remove(); };
            (document.head || document.documentElement).appendChild(ts);
        }

        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('scripts/modules/search_fields_finder/search_fields_finder_fetcher.js');
        script.async = false;
        script.onload = function () { this.remove(); };
        (document.head || document.documentElement).appendChild(script);
    }

    function teardown() {
        if (!_started) return;
        _started = false;
        window.removeEventListener('message', onFetcherMessage);
        const input = document.getElementById(SETTINGS_INPUT_ID);
        if (input) input.remove();
        document.querySelectorAll('.nsft-ff-div').forEach((el) => el.remove());
    }
})();
