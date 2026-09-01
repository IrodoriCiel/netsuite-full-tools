(function () {
    'use strict';

    const STORAGE_KEY = 'enableDeleteRecordButton';
    const MODE_KEY = 'deleteRecordButtonMode';
    const PRD_TYPE_CONFIRM_KEY = 'deleteRecordRequireTypeConfirm';
    const FETCHER_PATH = 'scripts/modules/delete_record_button/delete_record_button_fetcher.js';

    const IDS = {
        BTN: 'nsft-delete-btn',
        BTN_SEC: 'nsft-delete-btn-secondary',
        TBL: 'nsft-tbl-delete',
        TBL_SEC: 'nsft-tbl-delete-secondary',
        TR: 'nsft-tr-delete',
        TD_BODY: 'nsft-tdbody-delete'
    };

    const RED_ANCHOR_IDS = [
        'nsft-save-and-edit-btn',
        'nsft-edit-and-save-btn',
        'submitter',
        'btn_multibutton_submitter',
        'edit',
        'tbl_edit'
    ];
    const RED_ANCHOR_IDS_SEC = [
        'nsft-save-and-edit-btn-secondary',
        'nsft-edit-and-save-btn-secondary',
        'secondarysubmitter',
        'secondary_btn_multibutton_submitter',
        'secondaryedit'
    ];

    const RB = window.NSFT_RecordButtons;
    if (!RB || RB.isExcludedPage()) return;
    if (window.location.pathname.includes('/app/setup/adminmessage.nl')) return;
    if (!RB.hasRecordId()) return;

    let _obsUnsub = null;

    function isPrd() {
        const ENV = window.NSFT_ENV;
        if (!ENV) return false;
        const env = ENV.envFromUrl(window.location.href);
        return !!(env && env.code === 'PRD');
    }

    chrome.storage.local.get({ [STORAGE_KEY]: true, [MODE_KEY]: 'menu', [PRD_TYPE_CONFIRM_KEY]: true }, (setting) => {
        if (!setting[STORAGE_KEY]) return;
        injectFetcher(setting[PRD_TYPE_CONFIRM_KEY]);
        if (setting[MODE_KEY] !== 'menu') enableButtonMode();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[STORAGE_KEY] && changes[STORAGE_KEY].newValue === false) {
            disableButtonMode();
            return;
        }
        if (changes[MODE_KEY]) {
            chrome.storage.local.get({ [STORAGE_KEY]: true, [PRD_TYPE_CONFIRM_KEY]: true }, (s) => {
                if (!s[STORAGE_KEY]) return;
                if (changes[MODE_KEY].newValue === 'menu') {
                    disableButtonMode();
                } else {
                    injectFetcher(s[PRD_TYPE_CONFIRM_KEY]);
                    enableButtonMode();
                }
            });
        }
    });

    function enableButtonMode() {
        addButtons();
        if (!_obsUnsub && window.NSFT_Observer) {
            _obsUnsub = window.NSFT_Observer.subscribe(ensureDeleteIsLast, { throttle: 200 });
        }
    }

    function disableButtonMode() {
        if (_obsUnsub) {
            _obsUnsub();
            _obsUnsub = null;
        }
        removeButtons();
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
    function injectFetcher(requireTypeConfirm) {
        if (_fetcherInjected) return;
        _fetcherInjected = true;
        const messages = {
            confirmDelete: chrome.i18n.getMessage('ro_confirm_delete'),
            deleteError: chrome.i18n.getMessage('ro_delete_error'),
            btnDeleting: chrome.i18n.getMessage('ro_btn_deleting'),
            btnFailed: chrome.i18n.getMessage('ro_btn_failed'),
            btnOk: chrome.i18n.getMessage('ro_btn_ok'),
            ro_title: chrome.i18n.getMessage('ro_title'),
            listLabel: chrome.i18n.getMessage('ro_list_label'),
            errorRecType: chrome.i18n.getMessage('ro_error_rec_type'),
            confirmTitle: chrome.i18n.getMessage('del_confirm_title'),
            confirmCancel: chrome.i18n.getMessage('del_confirm_cancel'),
            confirmDeleteBtn: chrome.i18n.getMessage('del_confirm_delete_btn'),
            labelType: chrome.i18n.getMessage('del_label_record_type'),
            labelId: chrome.i18n.getMessage('del_label_record_id'),
            labelName: chrome.i18n.getMessage('del_label_record_name'),
            prdWarning: chrome.i18n.getMessage('del_prd_warning'),
            typePromptWord: chrome.i18n.getMessage('del_type_confirm_word'),
            typePrompt: chrome.i18n.getMessage('del_type_confirm_prompt', [chrome.i18n.getMessage('del_type_confirm_word')]),
            successToast: chrome.i18n.getMessage('del_success_toast'),
            listLabels: ['Lista', 'List', 'Liste', 'Listă', 'Lijst', 'Lista', 'リスト', '列表', '목록', 'Список', 'Liste'],
            isPrd: isPrd(),
            requireTypeConfirm: !!requireTypeConfirm
        };

        const msgData = document.createElement('script');
        msgData.id = 'nsft-del-messages';
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

    function findAnchor(ids) {
        for (const id of ids) {
            const el = document.getElementById(id);
            if (el) return el;
        }
        return null;
    }

    function addButtons() {
        const RB = window.NSFT_RecordButtons;
        const msgNotReady = chrome.i18n.getMessage('ro_delete_function_not_ready');
        const label = chrome.i18n.getMessage('btn_delete');
        const onclick = `if(typeof nsft_deleteRecord=="function"){nsft_deleteRecord(this);}else{this.dispatchEvent(new CustomEvent(${JSON.stringify('nsft-fn-not-ready')},{bubbles:true}));}`;
        escuchaAvisoNoListo(msgNotReady);

        if (!document.getElementById(IDS.BTN)) {
            const anchor = findAnchor(RED_ANCHOR_IDS);
            if (anchor) {
                const built = RB.createButtonTable({
                    tableId: IDS.TBL,
                    btnId: IDS.BTN,
                    label,
                    onclick,
                    isSecondary: false,
                    variant: 'danger'
                });
                if (built.tr !== built.btn) {
                    built.tr.id = IDS.TR;
                    built.tdBody.id = IDS.TD_BODY;
                }
                RB.injectAfter(anchor, built.table);
            }
        }

        if (!document.getElementById(IDS.BTN_SEC)) {
            const anchor = findAnchor(RED_ANCHOR_IDS_SEC);
            if (anchor) {
                const built = RB.createButtonTable({
                    tableId: IDS.TBL_SEC,
                    btnId: IDS.BTN_SEC,
                    label,
                    onclick,
                    isSecondary: true,
                    variant: 'danger'
                });
                if (built.tr !== built.btn) {
                    built.tr.classList.add('nsft-del-danger-redwood');
                    built.tdLeft.classList.add('nsft-del-danger-redwood');
                    built.tdBody.classList.add('nsft-del-danger-redwood');
                    built.tdRight.classList.add('nsft-del-danger-redwood');
                    built.btn.classList.add('nsft-del-danger-redwood');
                }
                RB.injectAfter(anchor, built.table);
            }
        }

        ensureDeleteIsLast();
    }

    function ensureDeleteIsLast() {
        repositionAfterPreferredAnchor(document.getElementById(IDS.BTN), RED_ANCHOR_IDS);
        repositionAfterPreferredAnchor(document.getElementById(IDS.BTN_SEC), RED_ANCHOR_IDS_SEC);
    }

    function getOuterWrapperTd(btn) {
        if (!btn) return null;
        const innerTable = btn.closest('table.uir-button');
        if (!innerTable) return null;
        const outerTd = innerTable.parentNode;
        return outerTd && outerTd.tagName === 'TD' ? outerTd : null;
    }

    function repositionAfterPreferredAnchor(btn, anchorIds) {
        const deleteTd = getOuterWrapperTd(btn);
        if (!deleteTd) return;

        let anchorTd = null;
        for (const id of anchorIds) {
            const el = document.getElementById(id);
            if (!el || el === btn) continue;
            const td = getOuterWrapperTd(el) || (window.NSFT_RecordButtons && window.NSFT_RecordButtons.getWrapperTd(el));
            if (td && td !== deleteTd && td.parentNode === deleteTd.parentNode) {
                anchorTd = td;
                break;
            }
        }
        if (!anchorTd) return;
        if (deleteTd.previousElementSibling === anchorTd) return;
        anchorTd.parentNode.insertBefore(deleteTd, anchorTd.nextSibling);
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
