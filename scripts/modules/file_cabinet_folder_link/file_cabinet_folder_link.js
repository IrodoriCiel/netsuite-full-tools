(function () {
    'use strict';
    const STORAGE_KEY = 'enableFileCabinetFolderLinkBeta';
    const BTN_CLASS = 'nsft-fcfl-btn';
    const COPIED_CLASS = 'nsft-fcfl-copied';

    let enabled = false;
    let _unsub = null;

    function isApplicablePage() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isExcludedPage && NSFT_RecordButtons.isExcludedPage()) return false;
        } catch (e) { }
        return /mediaitemfolders/i.test(location.pathname);
    }

    chrome.storage.local.get({ [STORAGE_KEY]: false }, (items) => {
        enabled = !!items[STORAGE_KEY];
        if (enabled && isApplicablePage()) init();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        enabled = !!changes[STORAGE_KEY].newValue;
        if (enabled) {
            if (isApplicablePage()) init();
        } else {
            teardown();
        }
    });

    function teardown() {
        if (_unsub) { _unsub(); _unsub = null; }
        document.querySelectorAll('.' + BTN_CLASS).forEach(b => b.remove());
    }

    function init() {
        if (_unsub) return;
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            _unsub = window.NSFT_Observer.subscribe(runOnce, { throttle: 300, immediate: true });
        } else {
            const mo = new MutationObserver(runOnce);
            mo.observe(document.body, { childList: true, subtree: true });
            _unsub = () => mo.disconnect();
            runOnce();
        }
    }

    function runOnce() {
        if (!enabled) return false;
        const header = document.getElementById('medialisthdr_t');
        if (!header) return false;
        if (header.querySelector('.' + BTN_CLASS)) return true;

        const folderId = getCurrentFolderId();
        if (!folderId) return false;

        header.appendChild(createButton(folderId));
        return true;
    }

    function getCurrentFolderId() {
        const input = document.getElementById('folder');
        if (input && input.value != null && input.value !== '') return String(input.value);
        try {
            const q = new URLSearchParams(location.search);
            const f = q.get('folder');
            if (f && /^-?\d+$/.test(f)) return f;
        } catch (e) { }
        return '';
    }

    function buildPermalink(folderId) {
        return location.origin + '/app/common/media/mediaitemfolders.nl?folder=' + encodeURIComponent(folderId);
    }

    function createButton(folderId) {
        const label = chrome.i18n.getMessage('fcfl_copy_label') || 'Copiar permalink';
        const btn = document.createElement('a');
        btn.className = BTN_CLASS;
        btn.href = '#';
        btn.title = chrome.i18n.getMessage('fcfl_copy_tooltip') || 'Copy folder permalink';
        btn.setAttribute('role', 'button');
        btn.innerHTML = svgLink() + '<span class="nsft-fcfl-label">' + label + '</span>';
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const url = buildPermalink(folderId);
            if (window.NSFT_Clipboard) {
                window.NSFT_Clipboard.copy(url, { onSuccess: () => flash(btn, true), onError: () => flash(btn, false) });
            } else {
                copyToClipboard(url).then(ok => flash(btn, ok));
            }
        });
        return btn;
    }

    async function copyToClipboard(text) {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (e) { }
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            ta.remove();
            return ok;
        } catch (e) { return false; }
    }

    function flash(btn, ok) {
        btn.classList.add(COPIED_CLASS);
        const prev = btn.innerHTML;
        const label = chrome.i18n.getMessage(ok ? 'fcfl_copied_label' : 'fcfl_copy_label')
            || (ok ? '¡Copiado!' : 'Copiar permalink');
        btn.innerHTML = (ok ? svgCheck() : svgLink()) + '<span class="nsft-fcfl-label">' + label + '</span>';
        setTimeout(() => {
            btn.classList.remove(COPIED_CLASS);
            btn.innerHTML = prev;
        }, 1100);
    }

    function svgLink() {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>';
    }

    function svgCheck() {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    }
})();
