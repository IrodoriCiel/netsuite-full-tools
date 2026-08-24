(function () {
    'use strict';

    if (window.NSFT_DOM) return;

    const DIAG_KEY = 'nsftSelectorDiagnostics';
    let diagEnabled = false;

    try {
        chrome.storage?.local?.get({ [DIAG_KEY]: false }, (items) => {
            diagEnabled = !!items[DIAG_KEY];
        });
        chrome.storage?.onChanged?.addListener?.((changes, area) => {
            if (area === 'local' && changes[DIAG_KEY]) diagEnabled = !!changes[DIAG_KEY].newValue;
        });
    } catch (e) { }

    function toArray(sel) {
        return Array.isArray(sel) ? sel : [sel];
    }

    function logMiss(scope, purpose, selectors) {
        if (!diagEnabled) return;
        try {
            console.warn('[NSFT:selector-miss]', scope || '(unknown)', purpose || '', 'tried:', selectors);
        } catch (e) { }
    }

    function logFallback(scope, purpose, matched, index) {
        if (!diagEnabled || index === 0) return;
        try {
            console.info('[NSFT:selector-fallback]', scope || '(unknown)', purpose || '', 'matched[' + index + ']:', matched);
        } catch (e) { }
    }

    function q(selectors, opts) {
        const list = toArray(selectors);
        const root = (opts && opts.root) || document;
        const scope = opts && opts.module;
        const purpose = opts && opts.purpose;
        for (let i = 0; i < list.length; i++) {
            const sel = list[i];
            if (!sel) continue;
            let el = null;
            try { el = root.querySelector(sel); } catch (e) { continue; }
            if (el) {
                logFallback(scope, purpose, sel, i);
                return el;
            }
        }
        logMiss(scope, purpose, list);
        if (opts && opts.required) {
            try { console.warn('[NSFT:required-miss]', scope, purpose); } catch (e) { }
        }
        return null;
    }

    function qAll(selectors, opts) {
        const list = toArray(selectors);
        const root = (opts && opts.root) || document;
        const scope = opts && opts.module;
        const purpose = opts && opts.purpose;
        for (let i = 0; i < list.length; i++) {
            const sel = list[i];
            if (!sel) continue;
            let nodes = null;
            try { nodes = root.querySelectorAll(sel); } catch (e) { continue; }
            if (nodes && nodes.length > 0) {
                logFallback(scope, purpose, sel, i);
                return nodes;
            }
        }
        logMiss(scope, purpose, list);
        return root.querySelectorAll(':not(*)');
    }

    function observe(callback, opts) {
        const target = (opts && opts.target) || document.body;
        if (!target) return null;
        const observer = new MutationObserver(callback);
        observer.observe(target, {
            childList: (opts && opts.childList) !== false,
            subtree: (opts && opts.subtree) !== false,
            attributes: !!(opts && opts.attributes),
            attributeFilter: opts && opts.attributeFilter
        });
        return observer;
    }

    function isDiagEnabled() { return diagEnabled; }

    const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
    }

    function textNode(tag, text, className) {
        const el = document.createElement(tag || 'span');
        if (className) el.className = className;
        el.textContent = value(text);
        return el;
    }

    function value(v) { return v === null || v === undefined ? '' : String(v); }

    function isTransparentColor(color) {
        if (!color) return true;
        const c = String(color).replace(/\s+/g, '');
        if (c === 'transparent') return true;
        return /^rgba\(\d+,\d+,\d+,(?:0|0?\.0+)\)$/.test(c);
    }

    function firstOpaqueBackground(el) {
        for (let node = el; node; node = node.parentElement) {
            const bg = getComputedStyle(node).backgroundColor;
            if (!isTransparentColor(bg)) return bg;
        }
        return '';
    }

    window.NSFT_DOM = {
        q, qAll, observe, isDiagEnabled, escapeHtml, textNode,
        isTransparentColor, firstOpaqueBackground
    };
})();
