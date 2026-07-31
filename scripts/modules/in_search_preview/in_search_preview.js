(function () {
    'use strict';

    const STORAGE_KEY = 'enableInSearchPreview';
    const FETCHER_PATH = 'scripts/modules/in_search_preview/in_search_preview_fetcher.js';
    const STYLE_ID = 'nsft-isp-style';

    const IDS = {
        CONTAINER: 'nsft-isp-container',
        EXPAND: 'nsft-isp-expand',
        COLLAPSE: 'nsft-isp-collapse',
        PREVIEW: 'nsft-isp-preview',
        DRAGBAR: 'nsft-isp-dragbar',
        LOADING: 'nsft-isp-loading',
        IFRAME_NAME: 'nsft-in-search-preview'
    };

    const state = {
        built: false,
        container: null,
        iframe: null,
        isFirstExpand: true,
        dragging: false,
        rafId: 0,
        lastMouse: null,
        docListeners: []
    };

    function shouldRun(settings) {
        return !!settings[STORAGE_KEY] && !settings.enableDiscreetMode;
    }

    chrome.storage.local.get({ [STORAGE_KEY]: true, enableDiscreetMode: false }, (settings) => {
        if (shouldRun(settings) && resolvePreviewButton()) start();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || (!changes[STORAGE_KEY] && !changes.enableDiscreetMode)) return;
        chrome.storage.local.get({ [STORAGE_KEY]: true, enableDiscreetMode: false }, (settings) => {
            if (shouldRun(settings) && resolvePreviewButton()) start();
            else stop();
        });
    });

    function resolvePreviewButton() {
        const direct = [
            'button#submitter[value="Preview"]',
            'input#submitter[value="Preview"]',
            '#submitter[value="Preview"]'
        ];
        for (const sel of direct) {
            const el = document.querySelector(sel);
            if (el) return el;
        }
        const label = (chrome.i18n.getMessage('ispPreview') || 'Preview').trim().toLowerCase();
        const candidates = document.querySelectorAll('#submitter, input[type="button"], input[type="submit"], button[type="button"]');
        for (const el of candidates) {
            const text = (el.value || el.textContent || '').trim().toLowerCase();
            if (text === 'preview' || (label && text === label)) return el;
        }
        return null;
    }

    function getMainForm() {
        return document.querySelector('form#main_form') || document.forms[0] || null;
    }

    function start() {
        if (state.built) return;

        const expandLabel = chrome.i18n.getMessage('ispExpand') || 'Expand';
        const collapseLabel = chrome.i18n.getMessage('ispCollapse') || 'Collapse';
        const previewLabel = chrome.i18n.getMessage('ispPreview') || 'Preview';

        const html = `
            <div id="${IDS.CONTAINER}" data-nsft-ui data-open="false" role="region" aria-label="${escapeAttr(previewLabel)}">
                <div class="nsft-isp-button-container">
                    <input id="${IDS.EXPAND}" class="nsft-isp-button" type="button" value="${escapeAttr(expandLabel)}">
                    <input id="${IDS.COLLAPSE}" class="nsft-isp-button" type="button" value="${escapeAttr(collapseLabel)}" style="display: none;">
                    <input id="${IDS.PREVIEW}" class="nsft-isp-button" type="button" value="${escapeAttr(previewLabel)}">
                </div>
                <div id="${IDS.DRAGBAR}" role="separator" aria-orientation="horizontal" aria-label="${escapeAttr(previewLabel)}">&nbsp;</div>
                <div id="${IDS.LOADING}" width="100%" style="display: none" aria-live="polite">
                    <div class="nsft-isp-loading-container">
                        <div class="nsft-isp-lds-ring" style="margin-left: 46%;">
                            <div></div><div></div><div></div><div></div>
                        </div>
                    </div>
                </div>
            </div>`;

        document.body.insertAdjacentHTML('beforeend', html);
        state.container = document.getElementById(IDS.CONTAINER);
        state.built = true;
        state.isFirstExpand = true;
        calculateBodyMargin(true);

        document.getElementById(IDS.EXPAND).addEventListener('click', ispExpand);
        document.getElementById(IDS.COLLAPSE).addEventListener('click', ispCollapse);
        document.getElementById(IDS.PREVIEW).addEventListener('click', runPreview);
        document.getElementById(IDS.DRAGBAR).addEventListener('mousedown', onDragStart);

        addDocListener('mouseup', onDragEnd);
    }

    function ensureIframe() {
        if (state.iframe) return state.iframe;
        const iframe = document.createElement('iframe');
        iframe.width = '100%';
        iframe.name = IDS.IFRAME_NAME;
        iframe.frameBorder = '0';
        iframe.style.display = 'none';
        iframe.setAttribute('title', chrome.i18n.getMessage('ispPreview') || 'Preview');
        state.container.insertBefore(iframe, document.getElementById(IDS.LOADING));
        iframe.addEventListener('load', ispOnLoad);
        state.iframe = iframe;
        return iframe;
    }

    function openPanel() {
        const iframe = ensureIframe();
        state.container.dataset.open = 'true';
        document.getElementById(IDS.EXPAND).style.display = 'none';
        document.getElementById(IDS.COLLAPSE).style.display = 'inline';
        iframe.style.display = 'block';
        calculateBodyMargin();
    }

    function ispExpand() {
        openPanel();
        if (state.isFirstExpand) {
            state.isFirstExpand = false;
            runPreview();
        }
    }

    function ispCollapse() {
        document.body.style.setProperty('margin-bottom', '15px', 'important');
        state.container.dataset.open = 'false';
        document.getElementById(IDS.EXPAND).style.display = 'inline';
        document.getElementById(IDS.COLLAPSE).style.display = 'none';
        document.getElementById(IDS.LOADING).style.display = 'none';
        if (state.iframe) state.iframe.style.display = 'none';

        const form = getMainForm();
        if (form) {
            form.removeAttribute('target');
            form.action = '/app/common/search/searchresults.nl';
        }
        calculateBodyMargin(true);
    }

    function runPreview() {
        state.isFirstExpand = false;
        openPanel();
        const loading = document.getElementById(IDS.LOADING);
        loading.style.display = 'block';

        injectFetcher(() => {
            const el = resolvePreviewButton();
            const form = getMainForm();
            if (!el || !form) { loading.style.display = 'none'; return; }
            form.target = IDS.IFRAME_NAME;
            el.click();
            form.removeAttribute('target');
            calculateBodyMargin();
        });
    }

    function ispOnLoad() {
        const iframe = state.iframe;
        const iframeContent = iframe.contentWindow || iframe.contentDocument;
        if (!iframeContent || !iframeContent.document) return;
        const iframeDocument = iframeContent.document;

        if (!iframeDocument.getElementById(STYLE_ID)) {
            const styleEl = iframeDocument.createElement('style');
            styleEl.id = STYLE_ID;
            styleEl.textContent = `
                #div__header, #div__alert,
                #footer_actions_form > div.uir_control_bar,
                #body > .uir-page-title, #body > .uir-list-title,
                .uir_filters,
                .uir_list_top_button_bar tr td:first-child,
                div[data-field-type="pagination-select"],
                .uir-list-buttonbar-left,
                .uir-control-bar { display: none; }
                #div__header+#body { margin-top: 0px !important; }`;
            iframeDocument.body.appendChild(styleEl);
        }

        const containerHeight = state.container.offsetHeight;
        const openContainer = document.querySelector(`#${IDS.CONTAINER}[data-open="true"]`);
        if (openContainer) openContainer.style.height = `${containerHeight}px`;
        iframe.style.height = `${containerHeight - 38}px`;
        const loading = document.getElementById(IDS.LOADING);
        if (loading) {
            loading.style.height = `${containerHeight - 38}px`;
            loading.style.display = 'none';
        }
        calculateBodyMargin();
    }

    function onDragStart(e) {
        e.preventDefault();
        state.dragging = true;
        document.getElementById(IDS.LOADING).style.display = 'block';
        addDocListener('mousemove', resizePreview);
        calculateBodyMargin();
    }

    function onDragEnd() {
        if (!state.dragging) return;
        document.getElementById(IDS.LOADING).style.display = 'none';
        removeDocListener('mousemove', resizePreview);
        state.dragging = false;
        if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = 0; }
        calculateBodyMargin();
    }

    function resizePreview(ex) {
        state.lastMouse = ex;
        if (state.rafId) return;
        state.rafId = requestAnimationFrame(() => {
            state.rafId = 0;
            applyResize(state.lastMouse);
        });
    }

    function applyResize(ex) {
        const openContainer = document.querySelector(`#${IDS.CONTAINER}[data-open="true"]`);
        if (!openContainer || !state.iframe) return;
        if (!ex) ex = { clientY: state.iframe.clientHeight + 5 };
        const loading = document.getElementById(IDS.LOADING);
        openContainer.style.height = `${window.innerHeight - ex.clientY + 34}px`;
        state.iframe.style.height = `${window.innerHeight - ex.clientY - 5}px`;
        if (loading) loading.style.height = `${window.innerHeight - ex.clientY - 5}px`;
    }

    function injectFetcher(onReady) {
        let done = false;
        const finish = () => { if (!done) { done = true; onReady(); } };
        try {
            const s = document.createElement('script');
            s.src = chrome.runtime.getURL(FETCHER_PATH);
            s.onload = function () { this.remove(); finish(); };
            s.onerror = function () { this.remove(); finish(); };
            (document.head || document.documentElement).appendChild(s);
        } catch (e) {
            finish();
        }
    }

    function calculateBodyMargin(collapsed) {
        const container = state.container || document.getElementById(IDS.CONTAINER);
        if (!container) return;
        const containerHeight = container.style.height;
        document.body.style.setProperty(
            'padding-bottom',
            collapsed ? '34px' : containerHeight,
            'important'
        );
    }

    function addDocListener(type, fn) {
        document.addEventListener(type, fn);
        state.docListeners.push({ type, fn });
    }

    function removeDocListener(type, fn) {
        document.removeEventListener(type, fn);
        state.docListeners = state.docListeners.filter(l => !(l.type === type && l.fn === fn));
    }

    function stop() {
        if (!state.built) return;
        if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = 0; }
        state.docListeners.forEach(({ type, fn }) => document.removeEventListener(type, fn));
        state.docListeners = [];
        state.container?.remove();
        document.body.style.removeProperty('padding-bottom');
        document.body.style.removeProperty('margin-bottom');
        state.container = null;
        state.iframe = null;
        state.dragging = false;
        state.built = false;
    }

    function escapeAttr(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }
})();
