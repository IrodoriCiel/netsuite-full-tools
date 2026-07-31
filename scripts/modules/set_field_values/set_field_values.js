(function () {
    'use strict';

    const STORAGE_KEY = 'enableSetFieldValues';
    const AUDIT_KEY = 'enableFieldAuditQuickView';
    const NO_ICON_KEY = 'setFieldValuesNoIcon';
    const NSFT_THEME_KEY = 'nsftTheme';
    let _nsftTheme = 'light';
    let _auditEnabled = true;
    let _noIcon = true;

    function _resolveTheme() {
        return _nsftTheme === 'dark' ? 'dark' : 'light';
    }

    chrome.storage.local.get({
        [STORAGE_KEY]: true,
        [AUDIT_KEY]: true,
        [NO_ICON_KEY]: true,
        [NSFT_THEME_KEY]: 'light'
    }, (items) => {
        if (!items[STORAGE_KEY]) return;
        _nsftTheme = items[NSFT_THEME_KEY] || 'light';
        _auditEnabled = items[AUDIT_KEY] !== false;
        _noIcon = items[NO_ICON_KEY] !== false;
        init(items);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[NSFT_THEME_KEY]) {
            _nsftTheme = changes[NSFT_THEME_KEY].newValue || 'light';
            window.postMessage({ type: 'nsft-set-field-values-theme', theme: _resolveTheme() }, '*');
        }
        if (changes[NO_ICON_KEY]) {
            _noIcon = changes[NO_ICON_KEY].newValue !== false;
            window.postMessage({ type: 'nsft-set-field-values-noicon', noIcon: _noIcon }, '*');
        }
        if (changes[AUDIT_KEY]) {
            _auditEnabled = changes[AUDIT_KEY].newValue !== false;
            window.postMessage({ type: 'nsft-set-field-values-audit', auditEnabled: _auditEnabled }, '*');
        }
    });


    function init(items) {
        injectScript();
    }

    function injectScript() {
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('scripts/modules/set_field_values/set_field_values_fetcher.js');
        script.onload = function () {
            this.remove();

            const translations = {
                sfv_field_value: chrome.i18n.getMessage("sfv_field_value"),
                sfv_value_more: chrome.i18n.getMessage("sfv_value_more"),
                sfv_value_less: chrome.i18n.getMessage("sfv_value_less"),
                sfv_field_text: chrome.i18n.getMessage("sfv_field_text"),
                sfv_enter_new_value: chrome.i18n.getMessage("sfv_enter_new_value"),
                sfv_set: chrome.i18n.getMessage("sfv_set"),
                sfv_internal_id: chrome.i18n.getMessage("sfv_internal_id"),
                sfv_text: chrome.i18n.getMessage("sfv_text"),
                sfv_copy_field_id: chrome.i18n.getMessage("sfv_copy_field_id"),
                sfv_copied: chrome.i18n.getMessage("sfv_copied"),
                sfv_custom_field: chrome.i18n.getMessage("sfv_custom_field"),
                sfv_field_type: chrome.i18n.getMessage("sfv_field_type"),
                sfv_list: chrome.i18n.getMessage("sfv_list"),
                sfv_go_to_source_list: chrome.i18n.getMessage("sfv_go_to_source_list"),
                sfv_formula: chrome.i18n.getMessage("sfv_formula"),
                sfv_mandatory: chrome.i18n.getMessage("sfv_mandatory"),
                sfv_disabled: chrome.i18n.getMessage("sfv_disabled"),
                sfv_yes: chrome.i18n.getMessage("sfv_yes"),
                sfv_no: chrome.i18n.getMessage("sfv_no"),
                sfv_set_mandatory: chrome.i18n.getMessage("sfv_set_mandatory"),
                sfv_set_non_mandatory: chrome.i18n.getMessage("sfv_set_non_mandatory"),
                sfv_set_disabled: chrome.i18n.getMessage("sfv_set_disabled"),
                sfv_set_non_disabled: chrome.i18n.getMessage("sfv_set_non_disabled"),
                sfv_loading: chrome.i18n.getMessage("sfv_loading"),
                sfv_title: chrome.i18n.getMessage("sfv_title"),
                sfv_edit_field_label: chrome.i18n.getMessage("sfv_edit_field_label"),
                sfv_edit_field_btn: chrome.i18n.getMessage("sfv_edit_field_btn"),
                sfv_edit_tooltip: chrome.i18n.getMessage("sfv_edit_tooltip"),
                sfv_copy_tooltip: chrome.i18n.getMessage("sfv_copy_tooltip"),
                sfv_waiting: chrome.i18n.getMessage("sfv_waiting"),
                sfv_searching: chrome.i18n.getMessage("sfv_searching"),
                sfv_not_found: chrome.i18n.getMessage("sfv_not_found"),
                sfv_std_unknown: chrome.i18n.getMessage("sfv_std_unknown"),
                sfv_na: chrome.i18n.getMessage("sfv_na"),
                sfv_std_desc: chrome.i18n.getMessage("sfv_std_desc"),
                sfv_null_error: chrome.i18n.getMessage("sfv_null_error"),
                sfv_copied: chrome.i18n.getMessage("sfv_copied"),
                maximizeModal: chrome.i18n.getMessage("maximizeModal"),
                closeModal: chrome.i18n.getMessage("closeModal"),
                fav_section_title: chrome.i18n.getMessage("fav_section_title"),
                fav_load_btn: chrome.i18n.getMessage("fav_load_btn"),
                fav_hide_btn: chrome.i18n.getMessage("fav_hide_btn"),
                fav_loading: chrome.i18n.getMessage("fav_loading"),
                fav_no_history: chrome.i18n.getMessage("fav_no_history"),
                fav_error: chrome.i18n.getMessage("fav_error"),
                fav_old_value: chrome.i18n.getMessage("fav_old_value"),
                fav_new_value: chrome.i18n.getMessage("fav_new_value"),
                fav_error_permission: chrome.i18n.getMessage("fav_error_permission"),
                fav_filter_all: chrome.i18n.getMessage("fav_filter_all"),
                fav_filter_user: chrome.i18n.getMessage("fav_filter_user"),
                fav_filter_from: chrome.i18n.getMessage("fav_filter_from"),
                fav_filter_to: chrome.i18n.getMessage("fav_filter_to"),
                fav_copy_change: chrome.i18n.getMessage("fav_copy_change")
            };

            window.postMessage({
                type: 'nsft-set-field-values-init',
                translations: translations,
                theme: _resolveTheme(),
                auditEnabled: _auditEnabled,
                noIcon: _noIcon
            }, '*');
        };
        (document.head || document.documentElement).appendChild(script);
    }

})();
