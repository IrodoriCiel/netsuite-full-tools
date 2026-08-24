(function () {
    'use strict';
    const STORAGE_KEY = 'enableFileCabinetCopyPathBeta';
    const APPLIED_ATTR = 'data-nsft-fcp-applied';
    const BTN_CLASS = 'nsft-fcp-btn';
    const COPIED_CLASS = 'nsft-fcp-copied';
    const BRIDGE_URL = '/app/common/scripting/PlatformClientScriptHandler.nl';

    let enabled = false;
    let folderPath = null;
    let folderId = null;
    let fetchAttempted = false;
    let _unsub = null;
    let _diag = false;
    let _applied = new WeakSet();

    function isApplicablePage() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isExcludedPage && NSFT_RecordButtons.isExcludedPage()) return false;
        } catch (e) { }
        return /mediaitemfolders|media/i.test(location.pathname);
    }

    chrome.storage.local.get({ [STORAGE_KEY]: false, nsftSelectorDiagnostics: false }, (items) => {
        enabled = !!items[STORAGE_KEY];
        _diag = !!items.nsftSelectorDiagnostics;
        if (enabled && isApplicablePage()) init();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.nsftSelectorDiagnostics) _diag = !!changes.nsftSelectorDiagnostics.newValue;
        if (!changes[STORAGE_KEY]) return;
        enabled = !!changes[STORAGE_KEY].newValue;
        if (enabled) {
            if (isApplicablePage()) init();
        } else {
            teardown();
        }
    });

    function teardown() {
        if (_unsub) { _unsub(); _unsub = null; }
        _applied = new WeakSet();
        fetchAttempted = false;
        document.querySelectorAll('.' + BTN_CLASS).forEach(b => b.remove());
    }

    async function init() {
        folderId = getFolderIdFromUrl();
        if (folderId == null) return;

        if (!folderPath && !fetchAttempted) {
            fetchAttempted = true;
            folderPath = await fetchFolderAppfolder(folderId);
        }
        if (!folderPath) return;

        runOnce();
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            _unsub = window.NSFT_Observer.subscribe(runOnce, { throttle: 300 });
        } else {
            const mo = new MutationObserver(runOnce);
            mo.observe(document.body, { childList: true, subtree: true });
            _unsub = () => mo.disconnect();
        }
    }

    function getFolderIdFromUrl() {
        try {
            const q = new URLSearchParams(location.search);
            const f = q.get('folder');
            if (f && /^-?\d+$/.test(f)) return f;
        } catch (e) { }
        return null;
    }

    async function fetchFolderAppfolder(id) {
        try {
            const query = `SELECT appfolder FROM mediaitemfolder WHERE id = ${parseInt(id, 10)}`;
            const innerParams = JSON.stringify([query, "[]", "SUITE_QL", ""]);
            const body = {
                method: 'remoteObject.bridgeCall',
                params: ['queryApiBridge', 'runSuiteQL', innerParams]
            };
            const res = await fetch(BRIDGE_URL, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'accept': '*/*',
                    'content-type': 'application/json',
                    'nsxmlhttprequest': 'NSXMLHttpRequest',
                    'cache-control': 'no-cache',
                    'pragma': 'no-cache'
                },
                body: JSON.stringify(body)
            });
            if (!res.ok) return null;
            const data = await res.json();
            if (data && data.result === 'error') return null;
            const r = data && data.result && data.result.result;
            if (!r || !r.count || !r.aliases) return null;
            const row = r.v0;
            if (!Array.isArray(row) || row.length === 0) return null;
            return String(row[0] || '').trim();
        } catch (e) {
            if (_diag) console.warn('NSFT file cabinet copy path:', e);
            return null;
        }
    }

    function runOnce() {
        if (!enabled || !folderPath) return;

        document.querySelectorAll('tr.uir-list-row-tr').forEach(row => {
            if (_applied.has(row)) return;
            const nameLink = findNameLink(row);
            if (!nameLink) return;
            const name = extractNameFromLink(nameLink);
            if (!name) return;

            _applied.add(row);
            const btn = createButton(name);
            const cell = nameLink.closest('td') || nameLink.parentElement;
            if (cell) cell.insertBefore(btn, cell.firstChild);
        });
    }

    function findNameLink(row) {
        const anchors = row.querySelectorAll('a');
        for (const a of anchors) {
            const href = a.getAttribute('href') || '';
            const text = (a.textContent || '').trim();
            if (!text) continue;
            if (/^Editar$|^Edit$|^Descargar$|^Download$/i.test(text)) continue;
            if (a.classList.contains('nsft-copy-link')) continue;
            if (href === '#' || href.startsWith('javascript:')) continue;
            if (href.includes('mediaitem') || (a.onclick && /showFolderContents/.test(a.onclick.toString()))
                || href.match(/^\d+\?folder=/)) {
                return a;
            }
            return a;
        }
        return null;
    }

    function extractNameFromLink(a) {
        return (a.textContent || '').trim();
    }

    function createButton(name) {
        const btn = document.createElement('span');
        btn.className = BTN_CLASS;
        btn.title = chrome.i18n.getMessage('fcp_copy_tooltip') || 'Copy path';
        btn.setAttribute('role', 'button');
        btn.innerHTML = svgCopy();
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const fullPath = joinPath(folderPath, name);
            if (window.NSFT_Clipboard) {
                window.NSFT_Clipboard.copy(fullPath, {
                    toast: { preview: fullPath },
                    onSuccess: () => flash(btn, true),
                    onError: () => flash(btn, false)
                });
            } else if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(fullPath).then(() => flash(btn, true));
            } else {
                const ta = document.createElement('textarea');
                ta.value = fullPath;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                try { document.execCommand('copy'); flash(btn, true); }
                catch (err) { flash(btn, false); }
                ta.remove();
            }
        });
        return btn;
    }

    function joinPath(base, name) {
        const b = String(base || '').replace(/\/+$/, '');
        const n = String(name || '').replace(/^\/+/, '');
        return b + '/' + n;
    }

    function flash(btn, ok) {
        btn.classList.add(COPIED_CLASS);
        const prev = btn.innerHTML;
        btn.innerHTML = ok ? svgCheck() : svgCopy();
        setTimeout(() => {
            btn.classList.remove(COPIED_CLASS);
            btn.innerHTML = prev;
        }, 1100);
    }

    function svgCopy() {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    }

    function svgCheck() {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    }
})();
