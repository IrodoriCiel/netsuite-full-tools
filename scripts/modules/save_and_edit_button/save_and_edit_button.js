(function () {
    'use strict';

    const STORAGE_KEY = 'enableSaveAndEditButton';
    const MODE_KEY = 'saveAndEditButtonMode';
    const FETCHER_PATH = 'scripts/modules/save_and_edit_button/save_and_edit_button_fetcher.js';
    const CSS_FILE = 'scripts/modules/save_and_edit_button/save_and_edit_button.css';
    const CSS_ID = 'nsft-sae-css';
    const REDIRECT_KEY = 'nsftSaeRedirect';

    const IDS = {
        BTN: 'nsft-save-and-edit-btn',
        BTN_SEC: 'nsft-save-and-edit-btn-secondary',
        TBL: 'nsft-tbl-save-and-edit',
        TBL_SEC: 'nsft-tbl-save-and-edit-secondary'
    };

    const RB = window.NSFT_RecordButtons;
    if (!RB || RB.isExcludedPage()) return;

    chrome.storage.local.get({ [STORAGE_KEY]: true, [MODE_KEY]: 'menu' }, (setting) => {
        if (!setting[STORAGE_KEY]) return;
        handleRedirect();
        if (!RB.isEditMode()) return;
        injectCss();
        injectFetcher();
        if (setting[MODE_KEY] !== 'menu') addButtons();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[STORAGE_KEY] && changes[STORAGE_KEY].newValue === false) {
            removeButtons();
            return;
        }
        if (changes[MODE_KEY] && RB.isEditMode()) {
            chrome.storage.local.get({ [STORAGE_KEY]: true }, (s) => {
                if (!s[STORAGE_KEY]) return;
                if (changes[MODE_KEY].newValue === 'menu') {
                    removeButtons();
                } else {
                    injectCss();
                    injectFetcher();
                    addButtons();
                }
            });
        }
    });

    function handleRedirect() {
        const redirectUrl = sessionStorage.getItem(REDIRECT_KEY);
        if (!redirectUrl) return;
        sessionStorage.removeItem(REDIRECT_KEY);
        try {
            const target = new URL(redirectUrl, window.location.origin);
            const here = new URL(window.location.href);
            const sameRecord = target.pathname === here.pathname &&
                target.searchParams.get('id') === here.searchParams.get('id');
            const alreadyEditing = /[?&]e=[Tt]/.test(here.search);
            if (sameRecord && alreadyEditing) return;
            window.location.href = redirectUrl;
        } catch (e) {
            window.location.href = redirectUrl;
        }
    }

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
    function injectFetcher() {
        if (_fetcherInjected) return;
        _fetcherInjected = true;
        const messages = {
            btnSaving: chrome.i18n.getMessage('ro_btn_saving'),
            btnFailed: chrome.i18n.getMessage('ro_btn_failed'),
            btnOk: chrome.i18n.getMessage('ro_btn_ok'),
            ro_title: chrome.i18n.getMessage('ro_title')
        };

        const msgData = document.createElement('script');
        msgData.id = 'nsft-sae-messages';
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
        const label = chrome.i18n.getMessage('saveAndEdit');
        const onclick = `if(typeof nsft_saveAndEdit=="function"){nsft_saveAndEdit(this);}else{this.dispatchEvent(new CustomEvent(${JSON.stringify('nsft-fn-not-ready')},{bubbles:true}));}`;
        escuchaAvisoNoListo(msgNotReady);

        if (!document.getElementById(IDS.BTN)) {
            const anchor = RB.findSaveBtn();
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
                console.warn('[NSFT:selector-miss]', 'save_and_edit_button', 'primary save anchor', 'tried:', ['#submitter', '#btn_multibutton_submitter']);
            }
        }

        if (!document.getElementById(IDS.BTN_SEC)) {
            const anchor = RB.findSecondarySaveBtn();
            if (anchor) {
                const { table } = RB.createButtonTable({
                    tableId: IDS.TBL_SEC,
                    btnId: IDS.BTN_SEC,
                    label,
                    onclick,
                    isSecondary: true
                });
                RB.injectAfter(anchor, table);
            } else if (DOM && DOM.isDiagEnabled()) {
                console.warn('[NSFT:selector-miss]', 'save_and_edit_button', 'secondary save anchor', 'tried:', ['#secondarysubmitter', '#secondary_btn_multibutton_submitter']);
            }
        }
    }

    let _oyenteAvisoPuesto = false;
    function escuchaAvisoNoListo(mensaje) {
        if (_oyenteAvisoPuesto) return;
        _oyenteAvisoPuesto = true;
        document.addEventListener('nsft-fn-not-ready', () => {
            if (window.NSFT_Dialog) window.NSFT_Dialog.alert({ body: mensaje });
            else window.alert(mensaje);
        });
    }

})();
