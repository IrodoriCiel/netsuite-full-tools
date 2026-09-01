(function () {
    'use strict';
    const STORAGE_KEY = 'enableFileCabinetDeleteBeta';
    const APPLIED_ATTR = 'data-nsft-fcd-applied';
    const BTN_CLASS = 'nsft-fcd-btn';
    const ROW_DELETED_CLASS = 'nsft-fcd-deleted';

    function isSystemFolderId(id) {
        const n = parseInt(id, 10);
        return Number.isFinite(n) && n < 0;
    }

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
            if (info.isFolder && isSystemFolderId(info.id)) return;
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
            if (a.classList.contains('nsft-fcr-btn')) continue;
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

        const label = chrome.i18n.getMessage('fcd_delete_tooltip') || 'Delete';
        const btn = document.createElement('a');
        btn.className = BTN_CLASS;
        btn.href = '#';
        btn.title = label;
        btn.innerHTML = svgTrash() + (discreet ? '' : '<span class="nsft-fcd-label">' + label + '</span>');
        btn.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            handleDelete(info, row, btn);
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

    async function handleDelete(info, row, btn) {
        ocupado(btn, true);
        try {
            await borrar(info, row, btn);
        } finally {
            ocupado(btn, false);
        }
    }

    async function borrar(info, row, btn) {
        const typeLabel = info.isFolder
            ? (chrome.i18n.getMessage('fcd_type_folder') || 'folder')
            : (chrome.i18n.getMessage('fcd_type_file') || 'file');
        const folderId = getCurrentFolderId();
        const folderSuffix = folderId && folderId.length ? `&folder=${encodeURIComponent(folderId)}` : '';
        const updateUrl = '/app/common/media/updatemediaitems.nl?action=Delete&frame=B' + folderSuffix;

        let doc;
        try {
            const res = await fetch(updateUrl, { credentials: 'include' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const text = await res.text();
            doc = new DOMParser().parseFromString(text, 'text/html');
        } catch (e) {
            await avisar((chrome.i18n.getMessage('fcd_error_generic') || 'Error') + '\n\n' + e.message);
            return;
        }

        const letter = info.isFolder ? 'D' : 'F';
        const checkboxId = `sa${info.id}fld${letter}`;
        const checkbox = doc.getElementById(checkboxId);
        if (!checkbox) {
            await avisar(chrome.i18n.getMessage('fcd_error_not_found') || 'Item not found in delete form');
            return;
        }
        checkbox.checked = true;
        const cell = checkbox.closest('td');
        if (!cell) {
            await avisar(chrome.i18n.getMessage('fcd_error_not_found') || 'Item not found in delete form');
            return;
        }

        const body = {};
        cell.querySelectorAll('input').forEach(input => {
            if (input.type === 'checkbox' && !input.checked) return;
            if (!input.id) return;
            body[input.id] = input.value;
        });

        let contents = '';
        if (info.isFolder) {
            const ns = doc.getElementById('ns' + info.id);
            const nf = doc.getElementById('nf' + info.id);
            const subfolders = ns ? (parseInt(ns.value, 10) - 1) : 0;
            const files = nf ? parseInt(nf.value, 10) : 0;
            const pad = '    ';
            const parts = [];
            if (subfolders > 0) parts.push(`${pad}${chrome.i18n.getMessage('fcd_contents_folders') || 'Folders'}: ${subfolders}`);
            if (files >= 0) parts.push(`${pad}${chrome.i18n.getMessage('fcd_contents_files') || 'Files'}: ${files}`);
            if (parts.length) contents = '\n\n' + (chrome.i18n.getMessage('fcd_contents_header') || 'Contents') + '\n' + parts.join('\n');
        }

        const confirmMsg = `${info.name}\n\n` +
            (chrome.i18n.getMessage('fcd_confirm') || 'Are you sure you want to delete this {type}?').replace('{type}', typeLabel) +
            contents;
        ocupado(btn, false);
        if (!await preguntar(confirmMsg, true)) return;
        ocupado(btn, true);

        row.classList.add(ROW_DELETED_CLASS);
        try {
            const postUrl = '/app/common/media/mediaitemfolders.nl?_grpDelete=T&tn=mediaitemfolder';
            const res = await fetch(postUrl, {
                method: 'POST',
                credentials: 'include',
                headers: { 'content-type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams(body).toString()
            });
            const text = await res.text();
            const errDoc = new DOMParser().parseFromString(text, 'text/html');
            const errMsg = (errDoc.querySelector('.uir-error-page-message')?.textContent || '').trim();
            if (errMsg) {
                row.classList.remove(ROW_DELETED_CLASS);
                await avisar(errMsg);
                return;
            }
            setTimeout(() => row.remove(), 250);
        } catch (e) {
            row.classList.remove(ROW_DELETED_CLASS);
            await avisar((chrome.i18n.getMessage('fcd_error_generic') || 'Error') + '\n\n' + e.message);
        }
    }



    function avisar(texto) {
        if (window.NSFT_Dialog) return window.NSFT_Dialog.alert({ body: texto });
        window.alert(texto);
        return Promise.resolve();
    }

    function preguntar(texto, peligro) {
        if (window.NSFT_Dialog) return window.NSFT_Dialog.confirm({ body: texto, danger: !!peligro });
        return Promise.resolve(window.confirm(texto));
    }


    function ocupado(btn, si) {
        if (!btn) return;
        btn.classList.toggle('is-busy', !!si);
    }

    function svgTrash() {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>';
    }
})();
