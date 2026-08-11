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

    const ICONS = {
        CHEVRON_UP: '<svg class="nsft-isp-icon" viewBox="0 0 24 24" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>',
        CHEVRON_DOWN: '<svg class="nsft-isp-icon" viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>',
        REFRESH: '<svg class="nsft-isp-icon" viewBox="0 0 24 24" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>'
    };

    const MIN_PANEL_HEIGHT = 160;
    const MIN_PAGE_VISIBLE = 90;

    const state = {
        built: false,
        container: null,
        iframe: null,
        isFirstExpand: true,
        dragging: false,
        pointerId: null,
        rafId: 0,
        lastY: null,
        lastHeight: 0,
        resizeRafId: 0,
        onWindowResize: null
    };

    function shouldRun(settings) {
        return !!settings[STORAGE_KEY] && !settings.enableDiscreetMode;
    }

    if (!/\/app\/common\/search\/search\.nl$/i.test(window.location.pathname)) return;

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

    const PREVIEW_IDS = ['submitter', 'secondarysubmitter'];

    const BUTTON_QUERY = 'input[type="button"], input[type="submit"], input[type="image"], button';
    const PREVIEW_ATTRS = ['id', 'name', 'onclick', 'data-button-id', 'data-testid'];
    const PREVIEW_RE = /preview/i;

    function isButtonLike(el) {
        if (!el) return false;
        if (el.tagName === 'BUTTON') return true;
        return el.tagName === 'INPUT' && /^(button|submit|image)$/i.test(el.type || '');
    }

    function isPreviewButton(el) {
        for (const attr of PREVIEW_ATTRS) {
            if (PREVIEW_RE.test(el.getAttribute(attr) || '')) return true;
        }
        const wrapper = el.closest('table[id], td[id]');
        return !!wrapper && PREVIEW_RE.test(wrapper.id);
    }

    function resolvePreviewButton() {
        for (const id of PREVIEW_IDS) {
            const el = document.getElementById(id);
            if (isButtonLike(el)) return el;
        }
        for (const el of document.querySelectorAll(BUTTON_QUERY)) {
            if (isPreviewButton(el)) return el;
        }
        if (window.NSFT_DOM && window.NSFT_DOM.isDiagEnabled()) {
            console.warn('[NSFT:selector-miss]', 'in_search_preview', 'boton de vista previa',
                'probado:', PREVIEW_IDS, 'y atributos', PREVIEW_ATTRS.join(' / '));
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
        const refreshLabel = chrome.i18n.getMessage('ispRefresh') || 'Refresh';
        const resizeLabel = chrome.i18n.getMessage('ispResize') || 'Resize preview';

        const html = `
            <div id="${IDS.CONTAINER}" data-nsft-ui data-open="false" role="region" aria-label="${escapeAttr(previewLabel)}">
                <div class="nsft-isp-button-container">
                    <button id="${IDS.EXPAND}" class="nsft-isp-button" type="button">${ICONS.CHEVRON_UP}<span>${escapeAttr(expandLabel)}</span></button>
                    <button id="${IDS.COLLAPSE}" class="nsft-isp-button" type="button" style="display: none;">${ICONS.CHEVRON_DOWN}<span>${escapeAttr(collapseLabel)}</span></button>
                    <button id="${IDS.PREVIEW}" class="nsft-isp-button" type="button">${ICONS.REFRESH}<span>${escapeAttr(refreshLabel)}</span></button>
                </div>
                <div id="${IDS.DRAGBAR}" role="separator" aria-orientation="horizontal" aria-label="${escapeAttr(resizeLabel)}" title="${escapeAttr(resizeLabel)}">&nbsp;</div>
                <div id="${IDS.LOADING}" style="display: none" aria-live="polite">
                    <div class="nsft-isp-loading-container">
                        <div class="nsft-isp-lds-ring">
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
        document.getElementById(IDS.DRAGBAR).addEventListener('pointerdown', onDragStart);
        state.container.addEventListener('transitionend', onHeightTransitionEnd);

        state.onWindowResize = onWindowResize;
        window.addEventListener('resize', state.onWindowResize);
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
        if (state.lastHeight) setPanelHeight(state.lastHeight);
        document.getElementById(IDS.EXPAND).style.display = 'none';
        document.getElementById(IDS.COLLAPSE).style.display = '';
        iframe.style.display = 'block';
        calculateBodyMargin();
    }

    function isOpen() {
        return !!state.container && state.container.dataset.open === 'true';
    }

    function onHeightTransitionEnd(e) {
        if (e.propertyName !== 'height' || e.target !== state.container) return;
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
        state.container.dataset.open = 'false';
        state.container.style.removeProperty('height');
        document.getElementById(IDS.EXPAND).style.display = '';
        document.getElementById(IDS.COLLAPSE).style.display = 'none';
        setLoading(false);
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
        setLoading(true);

        injectFetcher(() => {
            const el = resolvePreviewButton();
            const form = getMainForm();
            if (!el || !form) { setLoading(false); return; }
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

        setLoading(false);
        calculateBodyMargin();
    }

    function setLoading(on) {
        const loading = document.getElementById(IDS.LOADING);
        if (loading) loading.style.display = on ? 'flex' : 'none';
        state.container?.classList.toggle('nsft-isp-loading-on', !!on);
    }

    function onDragStart(e) {
        if (!isOpen() || state.dragging) return;
        e.preventDefault();

        const bar = document.getElementById(IDS.DRAGBAR);
        if (!bar) return;

        state.dragging = true;
        state.pointerId = e.pointerId;
        state.lastY = e.clientY;
        try { bar.setPointerCapture(e.pointerId); } catch (err) { }

        state.container.classList.add('nsft-isp-resizing');
        if (state.iframe) state.iframe.style.pointerEvents = 'none';

        bar.addEventListener('pointermove', resizePreview);
        bar.addEventListener('pointerup', onDragEnd);
        bar.addEventListener('pointercancel', onDragEnd);
        bar.addEventListener('lostpointercapture', onDragEnd);
    }

    function onDragEnd() {
        if (!state.dragging) return;
        state.dragging = false;

        const bar = document.getElementById(IDS.DRAGBAR);
        if (bar) {
            bar.removeEventListener('pointermove', resizePreview);
            bar.removeEventListener('pointerup', onDragEnd);
            bar.removeEventListener('pointercancel', onDragEnd);
            bar.removeEventListener('lostpointercapture', onDragEnd);
            if (state.pointerId !== null) {
                try { bar.releasePointerCapture(state.pointerId); } catch (err) { }
            }
        }
        state.pointerId = null;

        if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = 0; }
        if (state.iframe) state.iframe.style.pointerEvents = '';
        state.container?.classList.remove('nsft-isp-resizing');
        calculateBodyMargin();
    }

    function resizePreview(ex) {
        if (!state.dragging) return;
        state.lastY = ex.clientY;
        if (state.rafId) return;
        state.rafId = requestAnimationFrame(() => {
            state.rafId = 0;
            applyResize(state.lastY);
        });
    }

    function applyResize(clientY) {
        if (!isOpen() || typeof clientY !== 'number') return;
        setPanelHeight(window.innerHeight - clientY);
        calculateBodyMargin();
    }

    function setPanelHeight(height) {
        state.lastHeight = clampHeight(height);
        state.container.style.height = `${state.lastHeight}px`;
    }

    function clampHeight(height) {
        const max = Math.max(MIN_PANEL_HEIGHT, window.innerHeight - MIN_PAGE_VISIBLE);
        return Math.min(Math.max(height, MIN_PANEL_HEIGHT), max);
    }

    function onWindowResize() {
        if (!isOpen() || state.resizeRafId) return;
        state.resizeRafId = requestAnimationFrame(() => {
            state.resizeRafId = 0;
            if (!isOpen()) return;
            const clamped = clampHeight(state.container.offsetHeight);
            if (clamped !== state.container.offsetHeight) setPanelHeight(clamped);
            calculateBodyMargin();
        });
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
        let reserved;
        if (collapsed === true || !isOpen()) {
            const buttons = container.querySelector('.nsft-isp-button-container');
            reserved = ((buttons && buttons.offsetHeight) || 34) + 16;
        } else {
            reserved = container.offsetHeight;
        }
        document.body.style.setProperty('padding-bottom', `${reserved}px`, 'important');
    }

    function stop() {
        if (!state.built) return;
        onDragEnd();
        if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = 0; }
        if (state.resizeRafId) { cancelAnimationFrame(state.resizeRafId); state.resizeRafId = 0; }
        if (state.onWindowResize) {
            window.removeEventListener('resize', state.onWindowResize);
            state.onWindowResize = null;
        }
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
