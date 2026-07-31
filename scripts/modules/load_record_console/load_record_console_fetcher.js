'use strict';

(function () {
    if (window.__nsftLrcFetcherLoaded) return;
    window.__nsftLrcFetcherLoaded = true;

    let MSG = {};
    let NSFT_THEME = 'light';

    window.addEventListener('message', function (e) {
        if (e.source !== window) return;
        const d = e.data;
        if (!d || typeof d !== 'object' || d.dest !== 'fetcher_lrc') return;

        if (d.type === 'load') {
            MSG = d.messages || {};
            NSFT_THEME = d.theme || 'light';
            if (d.mode === 'ss1') runSS1();
            else if (d.mode === 'ss2') runSS2();
        } else if (d.type === 'theme') {
            NSFT_THEME = d.theme || NSFT_THEME;
            document.querySelectorAll('.nsft-lrc-modal-overlay').forEach((el) => {
                el.setAttribute('data-theme', NSFT_THEME);
            });
        }
    });

    window.addEventListener('beforeunload', function () {
        try {
            delete window.objRecord;
            delete window.recordType;
            delete window.recordId;
        } catch (e) { }
    });

    function runSS1() {
        let currentRecord = null;
        let recordType = null;
        let recordId = null;

        try {
            if (typeof nlapiLoadRecord === 'undefined' || !nlapiLoadRecord) return;

            recordType = nlapiGetRecordType();
            recordId = nlapiGetRecordId();

            if (recordType && recordId) {
                currentRecord = nlapiLoadRecord(recordType, recordId);
            } else if (recordId && !recordType) {
                console.warn('[NSFT] load_record_console: usando fallback nsRecordTypes (recordType ausente).');
                if (!window.nsRecordTypes) nsapiInitRecords();
                const url = window.location.pathname;
                for (const rec in window.nsRecordTypes) {
                    if (url.includes(window.nsRecordTypes[rec].url)) {
                        if (!window.nsRecordTypes[rec].scriptable) window.nsRecordTypes[rec].scriptable = true;
                        try {
                            currentRecord = nlapiLoadRecord(window.nsRecordTypes[rec].id, rec);
                            recordType = window.nsRecordTypes[rec].id;
                            break;
                        } catch (e) { }
                    }
                }
            }

            outputRecord(recordType, recordId, currentRecord, MSG.lrc_ss1_saved);
        } catch (e) {
            handleError(e);
        }
    }

    function runSS2() {
        if (typeof require === 'undefined' || !require) return;
        require(['N/record', 'N/currentRecord'], function (record, currentRecord) {
            try {
                let objRecord = currentRecord.get();
                const recordId = objRecord.id;
                const recordType = objRecord.type;

                if (recordId) {
                    objRecord = record.load({ type: recordType, id: recordId });
                    outputRecord(recordType, recordId, objRecord, MSG.lrc_ss2_saved);
                } else if (objRecord) {
                    outputRecord(objRecord.type, objRecord.id, objRecord, MSG.lrc_ss2_unsaved);
                }
            } catch (e) {
                handleError(e);
            }
        });
    }

    function outputRecord(type, id, rec, text) {
        if (!rec) {
            showModal(MSG.lrc_fail_scriptable);
            return;
        }

        notifySuccess(MSG.lrc_loaded);

        const varsLabel = MSG.lrc_vars_label || 'Variables:';
        console.log(
            `%c[NSFT]%c ${text}.\n${varsLabel} \n%crecordType%c, %crecordId%c, %cobjRecord%c`,
            'color: #ff9f43; font-weight: bold;',
            'color: inherit;',
            'color: #2ecc71; font-weight: bold;',
            'color: inherit;',
            'color: #2ecc71; font-weight: bold;',
            'color: inherit;',
            'color: #2ecc71; font-weight: bold;',
            'color: inherit;'
        );

        window.recordType = type;
        window.recordId = id;
        window.objRecord = rec;
    }

    function notifySuccess(text) {
        window.postMessage({ dest: 'extension_lrc', type: 'success', text: text || '' }, '*');
    }

    function handleError(e) {
        const errorMsg = MSG.lrc_fail_error || '$1';
        showModal(errorMsg.replace('$1', (e && e.message) || String(e)));
    }

    function escapeHtml(v) {
        if (v === null || v === undefined) return '';
        return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function showModal(message) {
        const modalId = `nsft-lrc-modal-${Date.now()}`;
        let countdown = 3;

        const autoCloseText = MSG.lrc_auto_close;
        const modalTitle = escapeHtml(MSG.lrc_modal_title);
        const btnOkText = escapeHtml(MSG.lrc_btn_ok);

        const html = `
            <div id="${modalId}" class="nsft-lrc-modal-overlay" data-theme="${escapeHtml(NSFT_THEME)}">
                <div class="nsft-lrc-modal-content">
                    <div class="nsft-lrc-modal-header">
                        <span class="nsft-lrc-modal-title">${modalTitle}</span>
                        <button id="${modalId}-close" class="nsft-lrc-close-btn">✕</button>
                    </div>
                    <div class="nsft-lrc-modal-body">
                        ${escapeHtml(message)}
                    </div>
                    <div class="nsft-lrc-modal-footer">
                        <span id="${modalId}-timer" class="nsft-lrc-timer"></span>
                        <button id="${modalId}-ok" class="nsft-lrc-btn nsft-lrc-btn-primary">${btnOkText}</button>
                    </div>
                </div>
            </div>
        `;

        const div = document.createElement('div');
        div.innerHTML = html;
        const modalEl = div.firstElementChild;
        document.body.appendChild(modalEl);

        let interval;
        const close = () => {
            if (interval) clearInterval(interval);
            if (modalEl) modalEl.remove();
        };

        const updateTimer = () => {
            const timerEl = document.getElementById(`${modalId}-timer`);
            if (timerEl) {
                timerEl.textContent = autoCloseText ? autoCloseText.replace('{1}', countdown.toString()) : '';
            }
            if (countdown <= 0) close();
            countdown--;
        };

        updateTimer();
        interval = setInterval(updateTimer, 1000);

        const okBtn = document.getElementById(`${modalId}-ok`);
        if (okBtn) okBtn.addEventListener('click', close);

        const closeBtn = document.getElementById(`${modalId}-close`);
        if (closeBtn) closeBtn.addEventListener('click', close);

        modalEl.addEventListener('click', function (e) {
            if (e.target === modalEl) close();
        });
    }

})();
