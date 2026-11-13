(function () {
    'use strict';

    const STORAGE_KEY = 'enableEditorCloseAfterSave';
    const CLOSE_AFTER_SAVE_KEY = 'nsftEditorCloseAfterSavePending';
    const SAVE_INTENT_KEY = 'nsftEditorCloseAfterSaveIntent';

    if (!/\/app\/common\/record\/edittextmediaitem/.test(window.location.pathname)) return;

    chrome.storage.local.get({ [STORAGE_KEY]: true }, (items) => {
        if (items[STORAGE_KEY]) enableCloseAfterSave();
    });

    function enableCloseAfterSave() {
        try {
            const pendingClose = sessionStorage.getItem(CLOSE_AFTER_SAVE_KEY) === '1';
            if (pendingClose) {
                sessionStorage.removeItem(CLOSE_AFTER_SAVE_KEY);
                setTimeout(() => {
                    requestCloseEditorWindow();
                }, 120);
            }

            let _submitCloseFallback = null;

            const markSaveIntent = () => {
                sessionStorage.setItem(SAVE_INTENT_KEY, '1');
            };

            const isSaveButton = (el) => {
                if (!el || !el.id) return false;
                return [
                    'submitter',
                    'secondarysubmitter',
                    'btn_multibutton_submitter',
                    'secondary_btn_multibutton_submitter'
                ].includes(el.id);
            };

            if (document.documentElement && document.documentElement.dataset.nsftSaveClickBound !== '1') {
                document.documentElement.dataset.nsftSaveClickBound = '1';
                document.addEventListener('click', (event) => {
                    const target = event.target;
                    if (!(target instanceof Element)) return;

                    const buttonLike = target.closest('input,button,a');
                    if (buttonLike && isSaveButton(buttonLike)) {
                        markSaveIntent();
                    }
                }, true);
            }

            if (document.documentElement && document.documentElement.dataset.nsftBeforeUnloadBound !== '1') {
                document.documentElement.dataset.nsftBeforeUnloadBound = '1';
                window.addEventListener('beforeunload', () => {
                    if (sessionStorage.getItem(SAVE_INTENT_KEY) === '1') {
                        sessionStorage.setItem(CLOSE_AFTER_SAVE_KEY, '1');
                    }
                    if (_submitCloseFallback) {
                        clearTimeout(_submitCloseFallback);
                        _submitCloseFallback = null;
                    }
                });
            }

            const form = document.getElementById('main_form');
            if (!form || form.dataset.nsftCloseAfterSaveBound === '1') return;

            form.dataset.nsftCloseAfterSaveBound = '1';
            form.addEventListener('submit', () => {
                sessionStorage.setItem(SAVE_INTENT_KEY, '1');
                sessionStorage.setItem(CLOSE_AFTER_SAVE_KEY, '1');
                _submitCloseFallback = setTimeout(requestCloseEditorWindow, 10000);
            }, true);
        } catch (e) {
            console.warn('[NSFT] Close-after-save hook warning', e);
        }
    }

    function requestCloseEditorWindow() {
        try {
            chrome.runtime.sendMessage({ action: 'nsftCloseSenderTab' }, (response) => {
                if (chrome.runtime.lastError || !response || !response.ok) {
                    window.close();
                }
            });
        } catch (e) {
            window.close();
        }
    }
})();
