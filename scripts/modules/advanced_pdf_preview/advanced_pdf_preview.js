(function () {
    'use strict';

    const STORAGE_KEY = 'enableAdvancedPdfPreview';

    const IDS = {
        CONTAINER: 'nsft-pdfp-container',
        EXPAND: 'nsft-pdfp-expand',
        COLLAPSE: 'nsft-pdfp-collapse',
        REFRESH: 'nsft-pdfp-refresh',
        LIVE: 'nsft-pdfp-live',
        DRAGBAR: 'nsft-pdfp-dragbar',
        LOADING: 'nsft-pdfp-loading',
        IFRAME_NAME: 'nsft-pdfp-iframe'
    };

    const ICONS = {
        CHEVRON_UP: '<svg class="nsft-pdfp-icon" viewBox="0 0 24 24" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>',
        CHEVRON_DOWN: '<svg class="nsft-pdfp-icon" viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>',
        REFRESH: '<svg class="nsft-pdfp-icon" viewBox="0 0 24 24" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
        BOLT: '<svg class="nsft-pdfp-icon" viewBox="0 0 24 24" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>'
    };

    const MIN_PANEL_HEIGHT = 160;
    const MIN_PAGE_VISIBLE = 90;

    const state = {
        built: false,
        container: null,
        iframe: null,
        isFirstExpand: true,
        liveHandler: null,
        liveTimer: null,
        dragging: false,
        pointerId: null,
        rafId: 0,
        lastY: null,
        lastHeight: 0,
        resizeRafId: 0,
        onWindowResize: null
    };

    if (!/\/pdftemplate\.nl/i.test(location.pathname)) return;

    function shouldRun(settings) {
        return !!settings[STORAGE_KEY] && !settings.enableDiscreetMode;
    }

    chrome.storage.local.get({ [STORAGE_KEY]: true, enableDiscreetMode: false }, (settings) => {
        if (shouldRun(settings)) onReady(start);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (!changes[STORAGE_KEY] && !changes.enableDiscreetMode) return;
        chrome.storage.local.get({ [STORAGE_KEY]: true, enableDiscreetMode: false }, (s) => {
            if (shouldRun(s)) onReady(start);
            else stop();
        });
    });

    function onReady(cb) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cb, { once: true });
        else cb();
    }

    function i18n(k, f) { return chrome.i18n.getMessage(k) || f; }

    function escapeAttr(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }


    function start() {
        if (state.built) return;
        if (!document.getElementById('pdftemplate-form')) return;

        const expandLabel = i18n('ispExpand', 'Expand');
        const collapseLabel = i18n('ispCollapse', 'Collapse');
        const refreshLabel = i18n('ispRefresh', 'Refresh');
        const liveLabel = i18n('apdfPvLive', 'Live Preview');
        const previewLabel = i18n('apdfPvPreview', 'Preview');
        const resizeLabel = i18n('ispResize', 'Resize preview');

        const html = `
            <div id="${IDS.CONTAINER}" data-nsft-ui data-open="false" role="region" aria-label="${escapeAttr(previewLabel)}">
                <div class="nsft-pdfp-button-container">
                    <button id="${IDS.EXPAND}" class="nsft-pdfp-button" type="button">${ICONS.CHEVRON_UP}<span>${escapeAttr(expandLabel)}</span></button>
                    <button id="${IDS.COLLAPSE}" class="nsft-pdfp-button" type="button" style="display: none;">${ICONS.CHEVRON_DOWN}<span>${escapeAttr(collapseLabel)}</span></button>
                    <button id="${IDS.REFRESH}" class="nsft-pdfp-button" type="button" style="display: none;">${ICONS.REFRESH}<span>${escapeAttr(refreshLabel)}</span></button>
                    <button id="${IDS.LIVE}" class="nsft-pdfp-button" type="button" style="display: none;" aria-pressed="false">${ICONS.BOLT}<span>${escapeAttr(liveLabel)}</span></button>
                </div>
                <div id="${IDS.DRAGBAR}" role="separator" aria-orientation="horizontal" aria-label="${escapeAttr(resizeLabel)}" title="${escapeAttr(resizeLabel)}">&nbsp;</div>
                <div id="${IDS.LOADING}" style="display: none" aria-live="polite">
                    <div class="nsft-pdfp-loading-container">
                        <div class="nsft-pdfp-lds-ring"></div>
                        <span>${escapeAttr(i18n('apdfPvGenerating', 'Generating preview...'))}</span>
                    </div>
                </div>
            </div>`;

        document.body.insertAdjacentHTML('beforeend', html);
        state.container = document.getElementById(IDS.CONTAINER);
        state.built = true;
        state.isFirstExpand = true;
        calculateBodyMargin(true);

        document.getElementById(IDS.EXPAND).addEventListener('click', expand);
        document.getElementById(IDS.COLLAPSE).addEventListener('click', collapse);
        document.getElementById(IDS.REFRESH).addEventListener('click', updatePreview);
        document.getElementById(IDS.LIVE).addEventListener('click', toggleLive);
        document.getElementById(IDS.DRAGBAR).addEventListener('pointerdown', onDragStart);
        state.container.addEventListener('transitionend', onHeightTransitionEnd);

        state.onWindowResize = onWindowResize;
        window.addEventListener('resize', state.onWindowResize);
    }

    function stop() {
        if (!state.built) return;
        onDragEnd();
        setLive(false);
        if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = 0; }
        if (state.resizeRafId) { cancelAnimationFrame(state.resizeRafId); state.resizeRafId = 0; }
        if (state.onWindowResize) {
            window.removeEventListener('resize', state.onWindowResize);
            state.onWindowResize = null;
        }
        if (state.container) state.container.remove();
        document.body.style.removeProperty('padding-bottom');
        state.container = null;
        state.iframe = null;
        state.dragging = false;
        state.built = false;
    }


    function ensureIframe() {
        if (state.iframe) return state.iframe;
        const iframe = document.createElement('iframe');
        iframe.width = '100%';
        iframe.name = IDS.IFRAME_NAME;
        iframe.frameBorder = '0';
        iframe.style.display = 'none';
        iframe.setAttribute('title', i18n('apdfPvPreview', 'Preview'));
        state.container.insertBefore(iframe, document.getElementById(IDS.LOADING));
        iframe.addEventListener('load', onPreviewLoaded);
        state.iframe = iframe;
        return iframe;
    }

    function isOpen() {
        return !!state.container && state.container.dataset.open === 'true';
    }

    function expand() {
        const iframe = ensureIframe();
        state.container.dataset.open = 'true';
        if (state.lastHeight) setPanelHeight(state.lastHeight);
        document.getElementById(IDS.EXPAND).style.display = 'none';
        document.getElementById(IDS.COLLAPSE).style.display = '';
        document.getElementById(IDS.REFRESH).style.display = '';
        document.getElementById(IDS.LIVE).style.display = '';
        iframe.style.display = 'block';
        calculateBodyMargin();
        if (state.isFirstExpand) {
            state.isFirstExpand = false;
            updatePreview();
        }
    }

    function collapse() {
        state.container.dataset.open = 'false';
        state.container.style.removeProperty('height');
        document.getElementById(IDS.EXPAND).style.display = '';
        document.getElementById(IDS.COLLAPSE).style.display = 'none';
        document.getElementById(IDS.REFRESH).style.display = 'none';
        document.getElementById(IDS.LIVE).style.display = 'none';
        setLive(false);
        setLoading(false);
        if (state.iframe) state.iframe.style.display = 'none';
        calculateBodyMargin(true);
    }

    function onHeightTransitionEnd(e) {
        if (e.propertyName !== 'height' || e.target !== state.container) return;
        calculateBodyMargin();
    }


    function submitPreview() {
        const action = document.getElementById('pdftemplate-action');
        const form = document.getElementById('pdftemplate-form');
        if (!action || !form) return;
        action.value = 'PREVIEW';
        form.setAttribute('target', IDS.IFRAME_NAME);
        form.submit();
    }

    function updatePreview() {
        if (state.liveTimer) { clearTimeout(state.liveTimer); state.liveTimer = null; }
        const run = () => {
            ensureIframe();
            setLoading(true);
            submitPreview();
        };
        if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(run, { timeout: 500 });
        else run();
    }

    function onPreviewLoaded() {
        setLoading(false);
    }

    function setLoading(on) {
        const l = document.getElementById(IDS.LOADING);
        if (l) l.style.display = on ? 'flex' : 'none';
        if (state.container) state.container.classList.toggle('nsft-pdfp-loading-on', !!on);
    }


    function toggleLive() {
        setLive(!state.liveHandler);
    }

    function setLive(on) {
        const btn = document.getElementById(IDS.LIVE);
        if (on && !state.liveHandler) {
            state.liveHandler = () => {
                if (state.liveTimer) clearTimeout(state.liveTimer);
                state.liveTimer = setTimeout(updatePreview, 3000);
            };
            window.addEventListener('keypress', state.liveHandler);
            if (btn) { btn.classList.add('is-vivo'); btn.setAttribute('aria-pressed', 'true'); }
            updatePreview();
        } else if (!on && state.liveHandler) {
            window.removeEventListener('keypress', state.liveHandler);
            state.liveHandler = null;
            if (state.liveTimer) { clearTimeout(state.liveTimer); state.liveTimer = null; }
            if (btn) { btn.classList.remove('is-vivo'); btn.setAttribute('aria-pressed', 'false'); }
        }
    }


    function onDragStart(e) {
        if (!isOpen()) return;
        state.dragging = true;
        state.pointerId = e.pointerId;
        state.container.classList.add('nsft-pdfp-resizing');
        const bar = document.getElementById(IDS.DRAGBAR);
        try { bar.setPointerCapture(e.pointerId); } catch (err) { }
        bar.addEventListener('pointermove', onDragMove);
        bar.addEventListener('pointerup', onDragEnd);
        bar.addEventListener('pointercancel', onDragEnd);
        e.preventDefault();
    }

    function onDragMove(e) {
        if (!state.dragging) return;
        state.lastY = e.clientY;
        if (state.rafId) return;
        state.rafId = requestAnimationFrame(() => {
            state.rafId = 0;
            if (!isOpen() || typeof state.lastY !== 'number') return;
            setPanelHeight(window.innerHeight - state.lastY);
            calculateBodyMargin();
        });
    }

    function onDragEnd() {
        if (!state.dragging) return;
        state.dragging = false;
        const bar = document.getElementById(IDS.DRAGBAR);
        if (bar) {
            if (state.pointerId != null) { try { bar.releasePointerCapture(state.pointerId); } catch (e) { } }
            bar.removeEventListener('pointermove', onDragMove);
            bar.removeEventListener('pointerup', onDragEnd);
            bar.removeEventListener('pointercancel', onDragEnd);
        }
        state.pointerId = null;
        if (state.container) state.container.classList.remove('nsft-pdfp-resizing');
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

    function calculateBodyMargin(collapsed) {
        const container = state.container;
        if (!container) return;
        let reserved;
        if (collapsed === true || !isOpen()) {
            const buttons = container.querySelector('.nsft-pdfp-button-container');
            reserved = ((buttons && buttons.offsetHeight) || 34) + 16;
        } else {
            reserved = container.offsetHeight;
        }
        document.body.style.setProperty('padding-bottom', `${reserved}px`, 'important');
    }
})();
