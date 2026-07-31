(function () {
    'use strict';

    const STORAGE_KEY = 'enableRefreshSublist';
    const BTN_CLASS = 'nsft-refresh-sublist-btn';
    const OVERLAY_CLASS = 'nsft-refresh-sublist-overlay';
    const FETCHER_ID = 'nsft-refresh-sublist-fetcher';
    const FETCHER_DEST = 'fetcher_refreshsublist';
    const PAGE_DEST = 'extension_refreshsublist';
    const OVERLAY_FALLBACK_MS = 4000;

    const RB = window.NSFT_RecordButtons;
    if (RB && RB.isExcludedPage()) return;

    let booted = false;
    let unsubObserver = null;
    let reqSeq = 0;
    const overlayObservers = new Map();

    chrome.storage.local.get({ [STORAGE_KEY]: true }, (settings) => {
        if (settings[STORAGE_KEY]) enable();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        if (changes[STORAGE_KEY].newValue === false) disable();
        else if (changes[STORAGE_KEY].newValue === true) enable();
    });

    function enable() {
        if (booted) return;
        booted = true;
        injectFetcher();
        window.addEventListener('message', onFetcherMessage);

        const run = () => scanAndInject();
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', run, { once: true });
        } else {
            run();
        }
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            unsubObserver = window.NSFT_Observer.subscribe(run, { throttle: 250 });
        } else {
            const mo = new MutationObserver(() => run());
            const start = () => mo.observe(document.body, { childList: true, subtree: true });
            if (document.body) start();
            else document.addEventListener('DOMContentLoaded', start, { once: true });
            unsubObserver = () => mo.disconnect();
        }
    }

    function disable() {
        if (!booted) return;
        booted = false;
        if (unsubObserver) { unsubObserver(); unsubObserver = null; }
        window.removeEventListener('message', onFetcherMessage);
        overlayObservers.forEach((mo) => mo.disconnect());
        overlayObservers.clear();
        document.querySelectorAll('.' + BTN_CLASS).forEach((el) => {
            const td = el.closest('td');
            (td || el).remove();
        });
        document.querySelectorAll('.' + OVERLAY_CLASS).forEach((o) => o.remove());
    }

    function injectFetcher() {
        if (document.getElementById(FETCHER_ID)) return;
        const s = document.createElement('script');
        s.id = FETCHER_ID;
        s.src = chrome.runtime.getURL('scripts/modules/refresh_sublist/refresh_sublist_fetcher.js');
        s.onload = () => s.remove();
        (document.head || document.documentElement).appendChild(s);
    }

    function scanAndInject() {
        let bars;
        try {
            bars = document.querySelectorAll(
                '.uir-list-control-bar:not(:has(.' + BTN_CLASS + ')):not(:has([onclick^="refreshmachine("]))'
            );
        } catch (e) {
            bars = Array.prototype.filter.call(
                document.querySelectorAll('.uir-list-control-bar'),
                (bar) => !bar.querySelector('.' + BTN_CLASS) && !bar.querySelector('[onclick^="refreshmachine("]')
            );
        }
        bars.forEach((bar) => {
            const innerRow = bar.querySelector(':scope > table > tbody > tr > td > table > tbody > tr');
            if (innerRow) injectButton(innerRow, bar);
        });
    }

    function injectButton(innerRow, bar) {
        const layerEl = innerRow.closest('[data-nsps-layer]');
        const machine = layerEl && layerEl.dataset.nspsLayer;
        if (!layerEl || !machine) return;

        const label = chrome.i18n.getMessage('refreshSublistBtn') || 'Actualizar';
        const title = chrome.i18n.getMessage('refreshSublistTitle') || 'Actualizar esta sublista';

        const td = document.createElement('td');
        if (isRedwoodToolbar(bar)) {
            td.innerHTML = `<button type="button" class="uir-button ${BTN_CLASS}" data-button-type="default" data-with-icon="false" data-with-label="true" title="${esc(title)}"><span class="uir-button-label">${esc(label)}</span></button>`;
        } else {
            td.innerHTML = `<table class="uir-button ${BTN_CLASS}"><tbody><tr class="pgBntG pgBntB"><td class="bntBgB" height="20" valign="top"><input class="rndbuttoninpt bntBgT" type="button" value="${esc(label)}" title="${esc(title)}"></td></tr></tbody></table>`;
        }

        const clickable = td.querySelector('button, input');
        if (clickable) {
            clickable.addEventListener('click', (e) => {
                e.preventDefault();
                requestRefresh(layerEl, machine);
            });
        }
        innerRow.appendChild(td);
    }

    function isRedwoodToolbar(bar) {
        if (bar.querySelector('button.uir-button[data-button-type]')) return true;
        if (bar.querySelector('input.rndbuttoninpt')) return false;
        return !!document.querySelector('button.uir-button[data-button-type]');
    }

    function requestRefresh(layerEl, machine) {
        const reqId = ++reqSeq;
        showOverlay(layerEl, reqId);
        window.postMessage({ dest: FETCHER_DEST, reqId, payload: { machine } }, '*');
        setTimeout(() => clearOverlay(layerEl, reqId), OVERLAY_FALLBACK_MS);
    }

    function onFetcherMessage(ev) {
        if (ev.source !== window) return;
        const d = ev.data;
        if (!d || d.dest !== PAGE_DEST) return;

        if (d.type === 'error') {
            clearOverlayById(d.reqId);
            const msg = chrome.i18n.getMessage('refreshSublistError') || 'No se pudo actualizar la sublista.';
            if (window.NSFT_Clipboard && NSFT_Clipboard.showToast) {
                NSFT_Clipboard.showToast(msg, { type: 'error' });
            }
        }
    }

    function showOverlay(layerEl, reqId) {
        if (!layerEl) return;
        if (getComputedStyle(layerEl).position === 'static') {
            layerEl.style.position = 'relative';
        }
        let overlay = layerEl.querySelector(':scope > .' + OVERLAY_CLASS);
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = OVERLAY_CLASS;
            overlay.innerHTML = '<div class="nsft-refresh-sublist-spinner"></div>';
            layerEl.appendChild(overlay);
        }
        overlay.dataset.req = String(reqId);

        const mo = new MutationObserver((mutations) => {
            for (const m of mutations) {
                const nodes = [...m.addedNodes, ...m.removedNodes];
                const onlyOverlay = nodes.length > 0 && nodes.every((n) => n === overlay || overlay.contains(n));
                if (!onlyOverlay) {
                    clearOverlay(layerEl, reqId);
                    return;
                }
            }
        });
        mo.observe(layerEl, { childList: true, subtree: true });
        overlayObservers.set(reqId, mo);
    }

    function clearOverlay(layerEl, reqId) {
        const mo = overlayObservers.get(reqId);
        if (mo) { mo.disconnect(); overlayObservers.delete(reqId); }
        if (!layerEl) return;
        const overlay = layerEl.querySelector(':scope > .' + OVERLAY_CLASS);
        if (overlay && overlay.dataset.req === String(reqId)) overlay.remove();
    }

    function clearOverlayById(reqId) {
        const overlay = document.querySelector('.' + OVERLAY_CLASS + '[data-req="' + reqId + '"]');
        const mo = overlayObservers.get(reqId);
        if (mo) { mo.disconnect(); overlayObservers.delete(reqId); }
        if (overlay) overlay.remove();
    }

    function esc(s) {
        if (window.NSFT_DOM && typeof NSFT_DOM.escapeHtml === 'function') return NSFT_DOM.escapeHtml(s);
        return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
})();
