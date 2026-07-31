(function () {
    'use strict';

    let MESSAGES = {};
    try {
        const el = document.getElementById('nsft-sae-messages');
        if (el) MESSAGES = JSON.parse(el.textContent);
    } catch (e) {
        console.warn('NSFT: Error parsing save-and-edit messages', e);
    }

    const TXT = {
        SAVING: MESSAGES.btnSaving || 'Saving...',
        FAILED: MESSAGES.btnFailed || 'Failed',
        MODAL_TITLE: MESSAGES.ro_title || 'Record Options',
        BTN_OK: MESSAGES.btnOk || 'OK'
    };

    function escapeHtml(v) {
        if (v === null || v === undefined) return '';
        return String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function showModal(title, message) {
        const modalId = `nsft-sae-modal-${Date.now()}`;
        const btnOkText = escapeHtml(TXT.BTN_OK);
        const html = `
            <div id="${modalId}" class="nsft-sae-modal-overlay">
                <div class="nsft-sae-modal-content">
                    <div class="nsft-sae-modal-header">
                        <span class="nsft-sae-modal-title">${escapeHtml(title)}</span>
                        <button id="${modalId}-close" class="nsft-sae-close-btn">✕</button>
                    </div>
                    <div class="nsft-sae-modal-body">${escapeHtml(message).replace(/\n/g, '<br>')}</div>
                    <div class="nsft-sae-modal-footer">
                        <button id="${modalId}-ok" class="nsft-sae-btn nsft-sae-btn-primary">${btnOkText}</button>
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

    window.nsft_saveAndEdit = function (btnElement) {
        let unloading = false;
        const onBeforeUnload = () => { unloading = true; };
        window.addEventListener('beforeunload', onBeforeUnload);

        const originalVal = btnElement ? (btnElement.tagName === 'INPUT' ? btnElement.value : (btnElement.querySelector('.uir-button-label') || {}).textContent || '') : '';
        const spinner = startSpinner(btnElement, TXT.SAVING);

        setTimeout(function () {
            try {
                const nativeSaveEdit = document.getElementById('submitedit') ||
                    document.getElementById('secondarysubmitedit') ||
                    document.querySelector('input[value="Save & Edit"]');

                if (nativeSaveEdit && typeof nativeSaveEdit.click === 'function') {
                    nativeSaveEdit.click();
                } else {
                    const saveBtn = document.getElementById('submitter') ||
                        document.getElementById('btn_multibutton_submitter') ||
                        document.getElementById('secondarysubmitter') ||
                        document.getElementById('save') ||
                        document.getElementById('completelater');

                    if (saveBtn) {
                        if (typeof setWindowChanged === 'function') {
                            setWindowChanged(window, false);
                        }
                        sessionStorage.setItem('nsftSaeRedirect', window.location.href);
                        saveBtn.click();

                        setTimeout(() => {
                            if (!unloading) {
                                sessionStorage.removeItem('nsftSaeRedirect');
                                stopSpinner(btnElement, spinner, originalVal);
                                window.removeEventListener('beforeunload', onBeforeUnload);
                            }
                        }, 1500);
                    } else {
                        throw new Error('No se encontro el boton de guardado estandar.');
                    }
                }
            } catch (e) {
                console.error('NSFT: Error in saveAndEdit', e);
                showModal(TXT.FAILED, e.message);
                stopSpinner(btnElement, spinner, TXT.FAILED);
                if (btnElement) {
                    setTimeout(() => {
                        if (btnElement.tagName === 'INPUT') btnElement.value = originalVal;
                        else { const lbl = btnElement.querySelector('.uir-button-label'); if (lbl) lbl.textContent = originalVal; }
                    }, 2000);
                }
                window.removeEventListener('beforeunload', onBeforeUnload);
            }
        }, 100);
    };
})();
