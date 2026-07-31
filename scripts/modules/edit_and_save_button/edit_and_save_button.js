(function () {
    'use strict';

    const STORAGE_KEY = 'enableEditAndSaveButton';
    const MODE_KEY = 'editAndSaveButtonMode';
    const PRD_CONFIRM_KEY = 'editAndSaveConfirmInPrd';
    const FETCHER_PATH = 'scripts/modules/edit_and_save_button/edit_and_save_button_fetcher.js';
    const CSS_FILE = 'scripts/modules/edit_and_save_button/edit_and_save_button.css';
    const CSS_ID = 'nsft-eas-css';

    const IDS = {
        BTN: 'nsft-edit-and-save-btn',
        BTN_SEC: 'nsft-edit-and-save-btn-secondary',
        TBL: 'nsft-tbl-edit-and-save',
        TBL_SEC: 'nsft-tbl-edit-and-save-secondary'
    };

    const RB = window.NSFT_RecordButtons;
    if (!RB || RB.isExcludedPage() || !RB.hasRecordId() || RB.isEditMode()) return;

    function isPrd() {
        const ENV = window.NSFT_ENV;
        if (!ENV) return false;
        const env = ENV.envFromUrl(window.location.href);
        return !!(env && env.code === 'PRD');
    }

    chrome.storage.local.get({ [STORAGE_KEY]: true, [MODE_KEY]: 'menu', [PRD_CONFIRM_KEY]: false }, (setting) => {
        if (!setting[STORAGE_KEY]) return;
        injectCss();
        injectFetcher(setting[PRD_CONFIRM_KEY]);
        if (setting[MODE_KEY] !== 'menu') addButtons();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[STORAGE_KEY] && changes[STORAGE_KEY].newValue === false) {
            removeButtons();
            return;
        }
        if (changes[MODE_KEY]) {
            chrome.storage.local.get({ [STORAGE_KEY]: true, [PRD_CONFIRM_KEY]: false }, (s) => {
                if (!s[STORAGE_KEY]) return;
                if (changes[MODE_KEY].newValue === 'menu') removeButtons();
                else { injectCss(); injectFetcher(s[PRD_CONFIRM_KEY]); addButtons(); }
            });
        }
    });

    function injectCss() {
        if (document.getElementById(CSS_ID)) return;
        const link = document.createElement('link');
        link.id = CSS_ID;
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = chrome.runtime.getURL(CSS_FILE);
        (document.head || document.documentElement).appendChild(link);
    }

    function removeButtons() {
        [IDS.TBL, IDS.TBL_SEC].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            const td = el.closest('td');
            (td || el).remove();
        });
    }

    let _fetcherInjected = false;
    function injectFetcher(confirmInPrd) {
        if (_fetcherInjected) return;
        _fetcherInjected = true;
        const messages = {
            btnSaving: chrome.i18n.getMessage('ro_btn_saving'),
            btnFailed: chrome.i18n.getMessage('ro_btn_failed'),
            btnOk: chrome.i18n.getMessage('ro_btn_ok'),
            ro_title: chrome.i18n.getMessage('ro_title'),
            errorRecType: chrome.i18n.getMessage('ro_error_rec_type'),
            prdConfirm: chrome.i18n.getMessage('eas_prd_confirm'),
            requirePrdConfirm: !!confirmInPrd && isPrd()
        };

        const msgData = document.createElement('script');
        msgData.id = 'nsft-eas-messages';
        msgData.type = 'application/json';
        msgData.textContent = JSON.stringify(messages);
        (document.head || document.documentElement).appendChild(msgData);

        const script = document.createElement('script');
        script.src = chrome.runtime.getURL(FETCHER_PATH);
        script.onload = function () {
            this.remove();
            msgData.remove();
        };
        (document.head || document.documentElement).appendChild(script);
    }

    function addButtons() {
        const RB = window.NSFT_RecordButtons;
        const DOM = window.NSFT_DOM;
        const msgNotReady = chrome.i18n.getMessage('ro_function_not_loaded');
        const label = chrome.i18n.getMessage('ro_edit_save');
        const onclick = `if(typeof nsft_maoEditAndSave=="function"){nsft_maoEditAndSave(this);}else{alert(${JSON.stringify(msgNotReady)});}`;

        if (!document.getElementById(IDS.BTN)) {
            const anchor = RB.findEditBtn();
            if (anchor) {
                const { table } = RB.createButtonTable({
                    tableId: IDS.TBL,
                    btnId: IDS.BTN,
                    label,
                    onclick,
                    isSecondary: false
                });
                RB.injectAfter(anchor, table);
            } else if (DOM && DOM.isDiagEnabled()) {
                console.warn('[NSFT:selector-miss]', 'edit_and_save_button', 'primary edit anchor', 'tried:', ['#edit', '#tbl_edit']);
            }
        }

        if (!document.getElementById(IDS.BTN_SEC)) {
            const anchor = RB.findSecondaryEditBtn();
            if (anchor) {
                const { table } = RB.createButtonTable({
                    tableId: IDS.TBL_SEC,
                    btnId: IDS.BTN_SEC,
                    label,
                    onclick,
                    isSecondary: true
                });
                RB.injectAfter(anchor, table);
            }
        }
    }
})();
