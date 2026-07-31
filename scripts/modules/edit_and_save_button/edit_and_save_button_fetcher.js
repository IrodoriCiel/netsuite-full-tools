(function () {
    'use strict';

    let MESSAGES = {};
    try {
        const el = document.getElementById('nsft-eas-messages');
        if (el) MESSAGES = JSON.parse(el.textContent);
    } catch (e) {
        console.warn('NSFT: Error parsing edit-and-save messages', e);
    }

    const TXT = {
        SAVING: MESSAGES.btnSaving || 'Saving...',
        FAILED: MESSAGES.btnFailed || 'Failed',
        MODAL_TITLE: MESSAGES.ro_title || 'Record Options',
        BTN_OK: MESSAGES.btnOk || 'OK',
        ERR_REC_TYPE: MESSAGES.errorRecType || 'Could not determine record type',
        PRD_CONFIRM: MESSAGES.prdConfirm || 'You are in PRODUCTION. Run Edit & Save on this record?'
    };
    const REQUIRE_PRD_CONFIRM = !!MESSAGES.requirePrdConfirm;

    function escapeHtml(v) {
        if (v === null || v === undefined) return '';
        return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function showModal(title, message) {
        const modalId = `nsft-eas-modal-${Date.now()}`;
        const btnOkText = escapeHtml(TXT.BTN_OK);
        const html = `
            <div id="${modalId}" class="nsft-eas-modal-overlay">
                <div class="nsft-eas-modal-content">
                    <div class="nsft-eas-modal-header">
                        <span class="nsft-eas-modal-title">${escapeHtml(title)}</span>
                        <button id="${modalId}-close" class="nsft-eas-close-btn">✕</button>
                    </div>
                    <div class="nsft-eas-modal-body">${escapeHtml(message).replace(/\n/g, '<br>')}</div>
                    <div class="nsft-eas-modal-footer">
                        <button id="${modalId}-ok" class="nsft-eas-btn nsft-eas-btn-primary">${btnOkText}</button>
                    </div>
                </div>
            </div>
        `;
        const div = document.createElement('div');
        div.innerHTML = html;
        document.body.appendChild(div.firstElementChild);
        const close = () => { const el = document.getElementById(modalId); if (el) el.remove(); };
        const okBtn = document.getElementById(`${modalId}-ok`);
        if (okBtn) okBtn.addEventListener('click', close);
        const closeBtn = document.getElementById(`${modalId}-close`);
        if (closeBtn) closeBtn.addEventListener('click', close);
        const modalEl = document.getElementById(modalId);
        if (modalEl) modalEl.addEventListener('click', (e) => { if (e.target.id === modalId) close(); });
    }

    function startSpinner(btn, text) {
        if (!btn) return null;
        const sp = document.createElement('span');
        sp.className = 'nsft-btn-spinner';
        if (btn.tagName === 'INPUT') {
            btn.value = text;
            if (btn.parentNode) btn.parentNode.insertBefore(sp, btn);
        } else {
            btn.insertBefore(sp, btn.firstChild);
            const lbl = btn.querySelector('.uir-button-label');
            if (lbl) lbl.textContent = text;
        }
        return sp;
    }
    function stopSpinner(btn, sp, text) {
        if (sp && sp.remove) sp.remove();
        if (!btn) return;
        if (btn.tagName === 'INPUT') { btn.value = text; }
        else { const lbl = btn.querySelector('.uir-button-label'); if (lbl) lbl.textContent = text; }
    }
    function btnLabel(btn) {
        if (!btn) return '';
        if (btn.tagName === 'INPUT') return btn.value;
        const lbl = btn.querySelector('.uir-button-label');
        return lbl ? lbl.textContent : (btn.textContent || '');
    }

    function lookupRecordType(setScriptable) {
        const cacheKey = 'nsftRecType:' + location.pathname;
        try {
            const cached = sessionStorage.getItem(cacheKey);
            if (cached) return cached;
        } catch (e) { }

        let recType = nlapiGetRecordType();
        if (!recType) {
            if (typeof nsapiInitRecords === 'function') nsapiInitRecords();
            if (typeof nsRecordTypes !== 'undefined') {
                for (const key in nsRecordTypes) {
                    if (nsRecordTypes[key].url == location.pathname) {
                        recType = nsRecordTypes[key].id;
                        if (setScriptable) nsRecordTypes[key].scriptable = true;
                    }
                }
            }
        }
        if (recType) {
            try { sessionStorage.setItem(cacheKey, recType); } catch (e) { }
            return recType;
        }
        throw { name: 'OPERATION_FAILED', message: TXT.ERR_REC_TYPE };
    }

    function loadAndSave(recType, recId, onOk, onErr) {
        const ss1 = function () {
            try {
                const record = nlapiLoadRecord(recType, recId);
                nlapiSubmitRecord(record, true);
                onOk();
            } catch (e) { onErr(e); }
        };
        if (typeof require === 'function') {
            try {
                require(['N/record'], function (record) {
                    try {
                        const rec = record.load({ type: recType, id: recId });
                        rec.save({ enableSourcing: true, ignoreMandatoryFields: false });
                        onOk();
                    } catch (e) { onErr(e); }
                }, function () { ss1(); });
                return;
            } catch (e) { }
        }
        ss1();
    }

    window.nsft_maoEditAndSave = function (element) {
        if (REQUIRE_PRD_CONFIRM && !confirm(TXT.PRD_CONFIRM)) return;

        const originalText = btnLabel(element);
        const spinner = startSpinner(element, TXT.SAVING);

        setTimeout(function () {
            let recType;
            try {
                recType = lookupRecordType(true);
            } catch (e) {
                showModal(TXT.FAILED, (e.name ? e.name + '\n\n' : '') + e.message);
                stopSpinner(element, spinner, TXT.FAILED);
                if (element) setTimeout(() => stopSpinner(element, null, originalText), 2000);
                return;
            }

            loadAndSave(recType, nlapiGetRecordId(),
                function () { location.reload(); },
                function (e) {
                    showModal(TXT.FAILED, (e && e.name ? e.name + '\n\n' : '') + (e && e.message ? e.message : String(e)));
                    stopSpinner(element, spinner, TXT.FAILED);
                    if (element) setTimeout(() => stopSpinner(element, null, originalText), 2000);
                });
        }, 100);
    };
})();
