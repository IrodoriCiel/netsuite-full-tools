(function () {
    'use strict';

    const STORAGE_KEY = 'enableFindFieldById';
    const SHORTCUT_KEY = 'findFieldByIdShortcut';
    const COLOR_KEY = 'findFieldHighlightColor';
    const PERSIST_KEY = 'findFieldHighlightPersist';
    const NSFT_THEME_KEY = 'nsftTheme';
    const DEFAULT_SHORTCUT = { ctrlKey: true, shiftKey: true, altKey: false, code: 'KeyF' };
    let _nsftTheme = 'light';
    let _shortcut = DEFAULT_SHORTCUT;
    let _moduleEnabled = false;
    let _hlColor = 'green';
    let _hlPersist = false;

    chrome.storage.local.get({
        [STORAGE_KEY]: true,
        [SHORTCUT_KEY]: null,
        [COLOR_KEY]: 'green',
        [PERSIST_KEY]: false,
        [NSFT_THEME_KEY]: 'light'
    }, (items) => {
        if (!items[STORAGE_KEY]) return;
        if (window.NSFT_RecordButtons && window.NSFT_RecordButtons.isExcludedPage && window.NSFT_RecordButtons.isExcludedPage()) return;
        _moduleEnabled = true;
        _shortcut = (items[SHORTCUT_KEY] && typeof items[SHORTCUT_KEY] === 'object')
            ? items[SHORTCUT_KEY] : DEFAULT_SHORTCUT;
        _hlColor = items[COLOR_KEY] || 'green';
        _hlPersist = items[PERSIST_KEY] === true;
        _nsftTheme = items[NSFT_THEME_KEY] || 'light';
        init(items);
        registerShortcut();
        publishShortcutToRegistry();
    });

    function registerShortcut() {
        document.addEventListener('keydown', (e) => {
            if (!_moduleEnabled) return;
            if (window.NSFT_Shortcuts && window.NSFT_Shortcuts.matches(e, _shortcut)) {
                e.preventDefault();
                e.stopPropagation();
                if (window.NSFT_ShortcutCoach) window.NSFT_ShortcutCoach.noteUsed('find_field_by_id');
                window.postMessage({ type: 'nsft-find-field-by-id-show' }, '*');
            }
        }, true);
    }

    function publishShortcutToRegistry() {
        if (!window.NSFT_Shortcuts) return;
        window.NSFT_Shortcuts.unregisterModule('find_field_by_id');
        window.NSFT_Shortcuts.register(
            'find_field_by_id',
            chrome.i18n.getMessage('cheatsheet_item_findfield') || 'Find Field by ID',
            _shortcut,
            {
                group: chrome.i18n.getMessage('cheatsheet_group_global') || 'Global',
                configurable: true,
                storageKey: SHORTCUT_KEY,
                action: 'nsft-show-find-field-by-id',
                order: 20
            }
        );
    }

    function resolveTheme() {
        return _nsftTheme === 'dark' ? 'dark' : 'light';
    }

    function postThemeUpdate() {
        window.postMessage({ type: 'nsft-find-field-by-id-theme', theme: resolveTheme() }, '*');
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[NSFT_THEME_KEY]) {
            _nsftTheme = changes[NSFT_THEME_KEY].newValue || 'light';
            postThemeUpdate();
        }
        if (changes[SHORTCUT_KEY]) {
            _shortcut = (changes[SHORTCUT_KEY].newValue && typeof changes[SHORTCUT_KEY].newValue === 'object')
                ? changes[SHORTCUT_KEY].newValue : DEFAULT_SHORTCUT;
            publishShortcutToRegistry();
        }
        if (changes[COLOR_KEY] || changes[PERSIST_KEY]) {
            if (changes[COLOR_KEY]) _hlColor = changes[COLOR_KEY].newValue || 'green';
            if (changes[PERSIST_KEY]) _hlPersist = changes[PERSIST_KEY].newValue === true;
            window.postMessage({ type: 'nsft-find-field-by-id-config', highlightColor: _hlColor, highlightPersist: _hlPersist }, '*');
        }
    });


    function init(items) {
        injectScript();
        window.addEventListener('nsft-show-find-field-by-id', () => {
            window.postMessage({ type: 'nsft-find-field-by-id-show' }, '*');
            if (window.NSFT_ShortcutCoach) window.NSFT_ShortcutCoach.hint('find_field_by_id');
        });
    }

    function injectScript() {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('scripts/modules/find_field_by_id/find_field_by_id_fetcher.js');
        script.onload = function () {
            this.remove();

            const translations = {
                ffi_prompt_generic: chrome.i18n.getMessage("ffi_prompt_generic"),
                ffi_field_not_found: chrome.i18n.getMessage("ffi_field_not_found"),
                ffi_copy_manual: chrome.i18n.getMessage("ffi_copy_manual"),
                ffi_placeholder: chrome.i18n.getMessage("ffi_placeholder"),
                ffi_btn_cancel: chrome.i18n.getMessage("ffi_btn_cancel"),
                ffi_btn_search: chrome.i18n.getMessage("ffi_btn_search"),
                ffi_id_copied: chrome.i18n.getMessage("ffi_id_copied"),
                ffi_feature_enabled_log: chrome.i18n.getMessage("ffi_feature_enabled_log")
            };

            window.postMessage({
                type: 'nsft-find-field-by-id-init',
                translations: translations,
                theme: resolveTheme(),
                highlightColor: _hlColor,
                highlightPersist: _hlPersist
            }, '*');
        };
        (document.head || document.documentElement).appendChild(script);
    }
})();
