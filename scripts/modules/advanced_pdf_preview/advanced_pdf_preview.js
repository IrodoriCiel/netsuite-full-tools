(function () {
    'use strict';

    const STORAGE_KEY = 'enableAdvancedPdfPreview';

    const IDS = {
        SIDE_TOGGLE: 'nsft-pdf-side-preview',
        LIVE_TOGGLE: 'nsft-pdf-live-preview',
        PREVIEW_BUTTON: 'nsft-pdf-side-preview-button',
        IFRAME: 'nsft-pdf-side-preview-iframe',
        IFRAME_CONTAINER: 'nsft-pdf-side-preview-container'
    };

    let started = false;
    let discreet = false;
    let _diag = false;
    let timer = null;
    let liveHandler = null;

    function isApplicablePage() {
        return /\/pdftemplate\.nl/i.test(location.pathname);
    }
    if (!isApplicablePage()) return;

    chrome.storage.local.get({ [STORAGE_KEY]: true, enableDiscreetMode: false, nsftSelectorDiagnostics: false }, (settings) => {
        discreet = !!settings.enableDiscreetMode;
        _diag = !!settings.nsftSelectorDiagnostics;
        if (settings[STORAGE_KEY] && !discreet) onReady(start);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.nsftSelectorDiagnostics) _diag = !!changes.nsftSelectorDiagnostics.newValue;
        if (changes.enableDiscreetMode) discreet = !!changes.enableDiscreetMode.newValue;
        if (changes[STORAGE_KEY] || changes.enableDiscreetMode) {
            chrome.storage.local.get({ [STORAGE_KEY]: true, enableDiscreetMode: false }, (s) => {
                if (s[STORAGE_KEY] && !s.enableDiscreetMode) onReady(start);
                else teardown();
            });
        }
    });

    function onReady(cb) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cb, { once: true });
        else cb();
    }

    function diag(msg) { if (_diag) console.warn('NSFT advanced pdf preview:', msg); }

    function teardown() {
        if (!started) return;
        started = false;
        if (timer) { clearTimeout(timer); timer = null; }
        if (liveHandler) { window.removeEventListener('keypress', liveHandler); liveHandler = null; }
        document.body.classList.remove('nsft-pdf-side-preview-on');
        document.getElementById('preview-btn')?.classList.remove('nsft-pdf-hidden');
        [IDS.SIDE_TOGGLE, IDS.LIVE_TOGGLE, IDS.PREVIEW_BUTTON, IDS.IFRAME_CONTAINER].forEach(id => {
            document.getElementById(id)?.remove();
        });
    }

    function start() {
        if (started) return;

        const editorTop = document.getElementById('pdfeditor-top');
        const editorEl = document.getElementById('pdftemplate-editor');
        if (!editorTop || !editorEl) {
            diag('editor no encontrado (pdfeditor-top / pdftemplate-editor) — se omite la inyección');
            return;
        }
        started = true;

        const sidePreviewLabel = chrome.i18n.getMessage('apdfPvSide') || 'Side Preview';
        const livePreviewLabel = chrome.i18n.getMessage('apdfPvLive') || 'Live Preview';
        const previewLabel = chrome.i18n.getMessage('apdfPvPreview') || 'Preview';

        const togglesHtml = `
            <div id="${IDS.SIDE_TOGGLE}" class="nsft-pdf-preview-toggle-option" data-nsft-ui data-toggle="false">
                <span>${sidePreviewLabel}</span><div class="nsft-pdf-preview-toggle"></div>
            </div>
            <div id="${IDS.LIVE_TOGGLE}" class="nsft-pdf-preview-toggle-option nsft-pdf-hidden" data-nsft-ui data-toggle="false">
                <span>${livePreviewLabel}</span><div class="nsft-pdf-preview-toggle"></div>
            </div>`;

        const previewBtnHtml = `
            <div id="${IDS.PREVIEW_BUTTON}" class="nsft-pdf-preview-toggle-option nsft-pdf-hidden" data-nsft-ui>
                ${previewLabel}
            </div>`;

        editorTop.insertAdjacentHTML('beforeend', togglesHtml);

        const nsPreviewBtn = document.getElementById('preview-btn');
        nsPreviewBtn?.insertAdjacentHTML('afterend', previewBtnHtml);

        const sideToggleEl = document.getElementById(IDS.SIDE_TOGGLE);
        const liveToggleEl = document.getElementById(IDS.LIVE_TOGGLE);
        const sidePreviewButton = document.getElementById(IDS.PREVIEW_BUTTON);

        sideToggleEl?.addEventListener('click', handleSideToggle);
        liveToggleEl?.addEventListener('click', handleLiveToggle);
        sidePreviewButton?.addEventListener('click', submitPreview);

        const iframeHtml = `
            <div id="${IDS.IFRAME_CONTAINER}" data-nsft-ui>
                <iframe id="${IDS.IFRAME}" name="${IDS.IFRAME}"></iframe>
            </div>`;

        editorEl.insertAdjacentHTML('beforeend', iframeHtml);

        function submitPreview() {
            const action = document.getElementById('pdftemplate-action');
            const form = document.getElementById('pdftemplate-form');
            if (!action || !form) { diag('pdftemplate-action / pdftemplate-form no encontrados'); return; }
            action.value = 'PREVIEW';
            form.setAttribute('target', IDS.IFRAME);
            form.submit();
        }

        function handleSideToggle(event) {
            const sidePreviewEnabled = event.currentTarget.dataset.toggle !== 'true';
            event.currentTarget.dataset.toggle = sidePreviewEnabled;
            const livePreviewEnabled = liveToggleEl.dataset.toggle === 'true';

            if (!sidePreviewEnabled && livePreviewEnabled) liveToggleEl.click();
            liveToggleEl.classList.toggle('nsft-pdf-hidden', !sidePreviewEnabled);

            const iframeContainerEl = document.getElementById(IDS.IFRAME_CONTAINER);
            const nsPreviewButton = document.getElementById('preview-btn');

            if (sidePreviewEnabled) {
                document.body.classList.add('nsft-pdf-side-preview-on');
                iframeContainerEl.classList.remove('nsft-pdf-hidden');
                nsPreviewButton?.classList.add('nsft-pdf-hidden');
                sidePreviewButton.classList.remove('nsft-pdf-hidden');
                updatePreview();
            } else {
                document.body.classList.remove('nsft-pdf-side-preview-on');
                iframeContainerEl.classList.add('nsft-pdf-hidden');
                nsPreviewButton?.classList.remove('nsft-pdf-hidden');
                sidePreviewButton.classList.add('nsft-pdf-hidden');
            }
        }

        function handleLiveToggle(event) {
            const livePreviewEnabled = event.currentTarget.dataset.toggle !== 'true';
            event.currentTarget.dataset.toggle = livePreviewEnabled;
            if (livePreviewEnabled) {
                updatePreview();
                liveHandler = timerForUpdate;
                window.addEventListener('keypress', liveHandler);
            } else if (liveHandler) {
                window.removeEventListener('keypress', liveHandler);
                liveHandler = null;
            }
        }

        function timerForUpdate() {
            if (timer) { clearTimeout(timer); timer = null; }
            timer = setTimeout(updatePreview, 3000);
        }

        function updatePreview() {
            if (timer) { clearTimeout(timer); timer = null; }

            const run = () => {
                const loadingText = chrome.i18n.getMessage('apdfPvGenerating') || 'Generating Preview...';
                const loadingHtml = `
                    <div style="position:fixed; top: 1px; left: 1px; width: 100%; height: 2000px; background-color: #525151db; color: white; font-size: 48px; text-align: center; z-index: 10; padding-top: 100px">
                        ${loadingText}
                    </div>`;

                const iframeEl = document.getElementById(IDS.IFRAME);
                try {
                    iframeEl.contentWindow.document.body.insertAdjacentHTML('beforeend', loadingHtml);
                } catch (e) { diag('no se pudo escribir el overlay de carga en el iframe'); }
                submitPreview();
            };
            if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 500 });
            else run();
        }
    }
})();
