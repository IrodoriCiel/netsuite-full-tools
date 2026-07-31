(function () {
    'use strict';

    let MESSAGES = {};
    try {
        const el = document.getElementById('nsft-del-messages');
        if (el) MESSAGES = JSON.parse(el.textContent);
    } catch (e) {
        console.warn('NSFT: Error parsing delete messages', e);
    }

    const TXT = {
        DELETING: MESSAGES.btnDeleting || 'Deleting...',
        FAILED: MESSAGES.btnFailed || 'Failed',
        CONFIRM_DELETE: MESSAGES.confirmDelete || 'Delete the current Record?',
        DELETE_ERROR_PREFIX: MESSAGES.deleteError || 'Error deleting record: ',
        MODAL_TITLE: MESSAGES.ro_title || 'Record Options',
        BTN_OK: MESSAGES.btnOk || 'OK',
        ERR_REC_TYPE: MESSAGES.errorRecType || 'Could not determine record type',
        CONFIRM_TITLE: MESSAGES.confirmTitle || 'Delete record',
        CONFIRM_CANCEL: MESSAGES.confirmCancel || 'Cancel',
        CONFIRM_DELETE_BTN: MESSAGES.confirmDeleteBtn || 'Delete',
        LABEL_TYPE: MESSAGES.labelType || 'Type',
        LABEL_ID: MESSAGES.labelId || 'ID',
        LABEL_NAME: MESSAGES.labelName || 'Name',
        PRD_WARNING: MESSAGES.prdWarning || 'You are in PRODUCTION. This deletion is permanent.',
        TYPE_WORD: MESSAGES.typePromptWord || 'DELETE',
        TYPE_PROMPT: MESSAGES.typePrompt || 'Type the confirmation word to enable deletion.',
        SUCCESS_TOAST: MESSAGES.successToast || 'Record deleted'
    };
    const LIST_LABELS = Array.isArray(MESSAGES.listLabels) && MESSAGES.listLabels.length
        ? MESSAGES.listLabels
        : [MESSAGES.listLabel || 'Lista'];
    const IS_PRD = !!MESSAGES.isPrd;
    const REQUIRE_TYPE_CONFIRM = !!MESSAGES.requireTypeConfirm;

    function escapeHtml(v) {
        if (v === null || v === undefined) return '';
        return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function showModal(title, message) {
        const modalId = `nsft-del-error-modal-${Date.now()}`;
        const btnOkText = escapeHtml(TXT.BTN_OK);
        const html = `
            <div id="${modalId}" class="nsft-del-modal-overlay">
                <div class="nsft-del-modal-content">
                    <div class="nsft-del-modal-header">
                        <span class="nsft-del-modal-title">${escapeHtml(title)}</span>
                        <button id="${modalId}-close" class="nsft-del-close-btn">✕</button>
                    </div>
                    <div class="nsft-del-modal-body">${escapeHtml(message).replace(/\n/g, '<br>')}</div>
                    <div class="nsft-del-modal-footer">
                        <button id="${modalId}-ok" class="nsft-del-btn nsft-del-btn-danger">${btnOkText}</button>
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

    function showDeletingOverlay() {
        const id = 'nsft-del-progress-overlay';
        let el = document.getElementById(id);
        if (el) return el;
        el = document.createElement('div');
        el.id = id;
        el.className = 'nsft-del-progress-overlay';
        el.innerHTML = `
            <div class="nsft-del-progress-box">
                <div class="nsft-del-progress-spinner"></div>
                <div class="nsft-del-progress-text">${escapeHtml(TXT.DELETING)}</div>
            </div>`;
        document.body.appendChild(el);
        return el;
    }
    function hideDeletingOverlay() {
        const el = document.getElementById('nsft-del-progress-overlay');
        if (el) el.remove();
    }

    function showToast(message) {
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:10px 18px;border-radius:8px;font:13px/1.4 "Inter",-apple-system,sans-serif;z-index:1000000;box-shadow:0 6px 20px rgba(0,0,0,0.25);';
        document.body.appendChild(toast);
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 4000);
    }

    function showConfirmModal(info, onConfirm) {
        const modalId = `nsft-del-confirm-modal-${Date.now()}`;
        const needType = IS_PRD && REQUIRE_TYPE_CONFIRM;
        const prdBlock = IS_PRD ? `<div class="nsft-del-prd-warning">${escapeHtml(TXT.PRD_WARNING)}</div>` : '';
        const typeBlock = needType
            ? `<div>${escapeHtml(TXT.TYPE_PROMPT)}</div><input id="${modalId}-type" class="nsft-del-type-confirm" type="text" autocomplete="off" spellcheck="false">`
            : '';
        const nameRow = info.name ? `<div><b>${escapeHtml(TXT.LABEL_NAME)}:</b> ${escapeHtml(info.name)}</div>` : '';
        const html = `
            <div id="${modalId}" class="nsft-del-modal-overlay">
                <div class="nsft-del-modal-content">
                    <div class="nsft-del-modal-header">
                        <span class="nsft-del-modal-title">⚠ ${escapeHtml(TXT.CONFIRM_TITLE)}</span>
                        <button id="${modalId}-close" class="nsft-del-close-btn">✕</button>
                    </div>
                    <div class="nsft-del-modal-body">
                        <div>${escapeHtml(TXT.CONFIRM_DELETE)}</div>
                        <div class="nsft-del-record-info">
                            <div><b>${escapeHtml(TXT.LABEL_TYPE)}:</b> ${escapeHtml(info.type)}</div>
                            <div><b>${escapeHtml(TXT.LABEL_ID)}:</b> ${escapeHtml(info.id)}</div>
                            ${nameRow}
                        </div>
                        ${prdBlock}
                        ${typeBlock}
                    </div>
                    <div class="nsft-del-modal-footer">
                        <button id="${modalId}-cancel" class="nsft-del-btn nsft-del-btn-cancel">${escapeHtml(TXT.CONFIRM_CANCEL)}</button>
                        <button id="${modalId}-ok" class="nsft-del-btn nsft-del-btn-danger">${escapeHtml(TXT.CONFIRM_DELETE_BTN)}</button>
                    </div>
                </div>
            </div>
        `;
        const div = document.createElement('div');
        div.innerHTML = html;
        document.body.appendChild(div.firstElementChild);

        const close = () => { const el = document.getElementById(modalId); if (el) el.remove(); };
        const okBtn = document.getElementById(`${modalId}-ok`);
        const typeInput = document.getElementById(`${modalId}-type`);

        if (needType && okBtn && typeInput) {
            okBtn.disabled = true;
            const check = () => { okBtn.disabled = typeInput.value.trim().toUpperCase() !== String(TXT.TYPE_WORD).toUpperCase(); };
            typeInput.addEventListener('input', check);
            setTimeout(() => typeInput.focus(), 50);
        }

        if (okBtn) okBtn.addEventListener('click', () => {
            if (okBtn.disabled) return;
            close();
            onConfirm();
        });
        const cancelBtn = document.getElementById(`${modalId}-cancel`);
        if (cancelBtn) cancelBtn.addEventListener('click', close);
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

    function getRecordName() {
        try {
            if (typeof nlapiGetFieldText === 'function') {
                const candidate = nlapiGetFieldText('entityid') || nlapiGetFieldValue('entityid') ||
                    nlapiGetFieldValue('name') || nlapiGetFieldValue('title') || nlapiGetFieldValue('tranid');
                if (candidate) return candidate;
            }
        } catch (e) { }
        const h1 = document.querySelector('.uir-record-type, h1.uir-page-title-firstline, #div__bodytab h1');
        if (h1 && h1.textContent) return h1.textContent.trim();
        return '';
    }

    function deleteRecord(recType, recId, onOk, onErr) {
        const ss1 = function () {
            try { nlapiDeleteRecord(recType, recId); onOk(); }
            catch (e) { onErr(e); }
        };
        if (typeof require === 'function') {
            try {
                require(['N/record'], function (record) {
                    try { record.delete({ type: recType, id: recId }); onOk(); }
                    catch (e) { onErr(e); }
                }, function () { ss1(); });
                return;
            } catch (e) { }
        }
        ss1();
    }

    function redirectToList() {
        let listUrl = null;
        for (const label of LIST_LABELS) {
            const direct = document.querySelector(`li[data-nsps-label="${label}"] a`);
            if (direct && direct.href) { listUrl = direct.href; break; }
        }
        if (!listUrl) {
            const links = document.querySelectorAll('.ns-menuitem a');
            for (const link of links) {
                const t = link.textContent ? link.textContent.trim() : '';
                if (t && LIST_LABELS.includes(t) && link.href) { listUrl = link.href; break; }
            }
        }
        if (listUrl) {
            window.location.href = listUrl;
        } else {
            showToast(TXT.SUCCESS_TOAST);
            setTimeout(() => { window.location.href = '/app/center/card.nl'; }, 900);
        }
    }

    function performDelete(btnElement) {
        const originalText = btnLabel(btnElement);
        const spinner = startSpinner(btnElement, TXT.DELETING);
        showDeletingOverlay();

        const run = function () {
            let recType;
            try {
                recType = lookupRecordType(true);
            } catch (e) {
                hideDeletingOverlay();
                showModal(TXT.FAILED, TXT.DELETE_ERROR_PREFIX + '\n' + e.message);
                stopSpinner(btnElement, spinner, TXT.FAILED);
                if (btnElement) setTimeout(() => stopSpinner(btnElement, null, originalText), 2000);
                return;
            }
            deleteRecord(recType, nlapiGetRecordId(),
                function () { redirectToList(); },
                function (e) {
                    hideDeletingOverlay();
                    showModal(TXT.FAILED, TXT.DELETE_ERROR_PREFIX + '\n' + (e && e.message ? e.message : String(e)));
                    stopSpinner(btnElement, spinner, TXT.FAILED);
                    if (btnElement) setTimeout(() => stopSpinner(btnElement, null, originalText), 2000);
                });
        };

        requestAnimationFrame(function () { requestAnimationFrame(run); });
    }

    window.nsft_deleteRecord = function (btnElement) {
        let info;
        try {
            info = { type: lookupRecordType(false), id: nlapiGetRecordId(), name: getRecordName() };
        } catch (e) {
            info = { type: '', id: nlapiGetRecordId ? nlapiGetRecordId() : '', name: getRecordName() };
        }
        showConfirmModal(info, () => performDelete(btnElement));
    };
})();
