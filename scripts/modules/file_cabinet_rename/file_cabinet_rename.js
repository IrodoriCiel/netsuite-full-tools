(function () {
    'use strict';
    const STORAGE_KEY = 'enableFileCabinetRenameBeta';
    const APPLIED_ATTR = 'data-nsft-fcr-applied';
    const BTN_CLASS = 'nsft-fcr-btn';
    const FILE_URL = '/app/common/media/mediaitem.nl';
    const FOLDER_URL = '/app/common/media/mediaitemfolder.nl';

    let enabled = false;
    let discreet = false;
    let _unsub = null;
    let _applied = new WeakSet();

    function isApplicablePage() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isExcludedPage && NSFT_RecordButtons.isExcludedPage()) return false;
        } catch (e) { }
        return /mediaitemfolders|media|filecabinet/i.test(location.pathname);
    }

    chrome.storage.local.get({ [STORAGE_KEY]: false, enableDiscreetMode: false }, (items) => {
        enabled = !!items[STORAGE_KEY];
        discreet = !!items.enableDiscreetMode;
        if (enabled && isApplicablePage()) init();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.enableDiscreetMode) discreet = !!changes.enableDiscreetMode.newValue;
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
        document.querySelectorAll('.' + BTN_CLASS).forEach(b => b.remove());
        document.querySelectorAll(`[${APPLIED_ATTR}]`).forEach(el => el.removeAttribute(APPLIED_ATTR));
    }

    function init() {
        runOnce();
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            _unsub = window.NSFT_Observer.subscribe(runOnce, { throttle: 300 });
        } else {
            const mo = new MutationObserver(runOnce);
            mo.observe(document.body, { childList: true, subtree: true });
            _unsub = () => mo.disconnect();
        }
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

    function runOnce() {
        if (!enabled) return;
        document.querySelectorAll('tr.uir-list-row-tr').forEach(row => {
            if (_applied.has(row)) return;
            const info = analyzeRow(row);
            if (!info || !info.id) return;
            _applied.add(row);
            insertButton(row, info);
        });
    }

    function analyzeRow(row) {
        let id = null;
        let isFolder = false;
        let fallbackId = null;
        let fallbackIsFolder = false;
        const editCandidates = row.querySelectorAll('a[href*="mediaitem"]');
        for (const a of editCandidates) {
            let url;
            try {
                url = new URL(a.getAttribute('href') || '', location.origin);
            } catch (e) { continue; }
            const itemId = url.searchParams.get('id');
            if (!itemId) continue;
            const txt = (a.textContent || '').trim();
            if (/^Editar$|^Edit$/i.test(txt)) {
                id = itemId;
                isFolder = /mediaitemfolder\.nl/i.test(url.pathname);
                break;
            }
            if (fallbackId == null && /[?&]e=T\b/i.test(url.search)) {
                fallbackId = itemId;
                fallbackIsFolder = /mediaitemfolder\.nl/i.test(url.pathname);
            }
        }
        if (!id && fallbackId) { id = fallbackId; isFolder = fallbackIsFolder; }

        if (!id) isFolder = !!row.querySelector('img[src*="folder.gif"]');

        let name = '';
        let nameAnchor = null;
        const anchors = row.querySelectorAll('a');
        for (const a of anchors) {
            const href = a.getAttribute('href') || '';
            const txt = (a.textContent || '').trim();
            if (!txt) continue;
            if (/^Editar$|^Edit$|^Descargar$|^Download$/i.test(txt)) continue;
            if (/downloadfolder\.nl/.test(href)) continue;
            if (a.classList.contains('nsft-copy-link')) continue;
            if (a.classList.contains('nsft-fcef-btn')) continue;
            if (a.classList.contains(BTN_CLASS)) continue;
            name = txt;
            nameAnchor = a;
            break;
        }

        return { id, isFolder, name, nameAnchor };
    }

    function insertButton(row, info) {
        const bar = getOrCreateActionsBar(row, info.nameAnchor);
        if (!bar) return;
        if (bar.querySelector('.' + BTN_CLASS)) return;

        const label = chrome.i18n.getMessage('fcr_rename_tooltip') || 'Rename';
        const btn = document.createElement('a');
        btn.className = BTN_CLASS;
        btn.href = '#';
        btn.title = label;
        btn.innerHTML = svgRename() + (discreet ? '' : '<span class="nsft-fcr-label">' + label + '</span>');
        btn.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            handleRename(info, row);
        });
        bar.appendChild(btn);
    }

    function getOrCreateActionsBar(row, nameAnchor) {
        let bar = row.querySelector('.nsft-fc-actions-bar');
        if (bar) return bar;
        bar = document.createElement('div');
        bar.className = 'nsft-fc-actions-bar';
        if (nameAnchor && nameAnchor.parentNode) {
            nameAnchor.insertAdjacentElement('afterend', bar);
        } else {
            const firstCell = row.querySelector('td');
            if (firstCell) firstCell.appendChild(bar);
            else return null;
        }
        return bar;
    }

    async function handleRename(info, row) {
        const typeLabel = info.isFolder
            ? (chrome.i18n.getMessage('fcr_type_folder') || 'Folder')
            : (chrome.i18n.getMessage('fcr_type_file') || 'File');
        const promptMsg = (chrome.i18n.getMessage('fcr_prompt') || 'Rename {type}').replace('{type}', typeLabel);

        await renameLoop(info, typeLabel, promptMsg, info.name, null, row);
    }

    async function renameLoop(info, typeLabel, promptMsg, currentName, prevError, row) {
        const full = prevError ? prevError + '\n\n' + promptMsg : promptMsg;
        const newName = window.prompt(full, currentName || '');
        if (newName == null) return;
        const trimmed = newName.trim();
        if (!trimmed || trimmed === currentName) return;

        const ILLEGAL = /[\/\\:*?"<>|]/;
        if (ILLEGAL.test(trimmed)) {
            const errIllegal = chrome.i18n.getMessage('fcr_error_illegal') ||
                'The name cannot contain any of these characters: / \\ : * ? " < > |';
            return renameLoop(info, typeLabel, promptMsg, trimmed, errIllegal, row);
        }

        const targetUrl = info.isFolder ? FOLDER_URL : FILE_URL;
        let csrf;
        try {
            csrf = await fetchCsrf(targetUrl, { e: 'T', id: info.id });
        } catch (e) {
            window.alert((chrome.i18n.getMessage('fcr_error_generic') || 'Error') + '\n\n' + e.message);
            return;
        }
        if (!csrf) {
            window.alert(chrome.i18n.getMessage('fcr_error_csrf') || 'Could not retrieve security token');
            return;
        }

        const folderId = getCurrentFolderId();
        const body = {
            id: info.id,
            name: trimmed,
            _csrf: csrf
        };
        if (info.isFolder) {
            body.parent = folderId;
            body.foldertype = 'DEFAULT';
        } else {
            body.folder = folderId;
            body.uploadrectype = 'filecabinet';
        }

        try {
            const res = await fetch(targetUrl, {
                method: 'POST',
                credentials: 'include',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams(body).toString()
            });
            const text = await res.text();
            const doc = new DOMParser().parseFromString(text, 'text/html');
            const errMsg = (doc.querySelector('.uir-error-page-message')?.textContent || '').trim();
            if (errMsg) {
                return renameLoop(info, typeLabel, promptMsg, trimmed, errMsg, row);
            }
            applyRenameToRow(info, trimmed);
        } catch (e) {
            window.alert((chrome.i18n.getMessage('fcr_error_generic') || 'Error') + '\n\n' + e.message);
        }
    }

    function applyRenameToRow(info, newName) {
        if (info.nameAnchor) {
            let replaced = false;
            for (let i = info.nameAnchor.childNodes.length - 1; i >= 0; i--) {
                const n = info.nameAnchor.childNodes[i];
                if (n.nodeType === Node.TEXT_NODE) {
                    n.nodeValue = newName;
                    replaced = true;
                    break;
                }
            }
            if (!replaced) info.nameAnchor.appendChild(document.createTextNode(newName));
        }
        info.name = newName;

        const editBtn = info.nameAnchor?.closest('tr')?.querySelector('.nsft-fcef-btn');
        if (editBtn && editBtn.title) {
            editBtn.title = editBtn.title.replace(/ — .*$/, ' — ' + newName);
        }
    }

    async function fetchCsrf(url, params) {
        const qs = new URLSearchParams({ l: 'T', ...params }).toString();
        const res = await fetch(url + '?' + qs, { credentials: 'include' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const text = await res.text();
        const doc = new DOMParser().parseFromString(text, 'text/html');
        const input = doc.querySelector('#_csrf');
        return input ? input.value : null;
    }

    function svgRename() {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10Z"></path><circle cx="7" cy="7" r="1.4" fill="currentColor"></circle></svg>';
    }
})();
