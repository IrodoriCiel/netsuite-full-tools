(function () {
    'use strict';
    const STORAGE_KEY = 'enableFileCabinetEditFileBeta';
    const APPLIED_ATTR = 'data-nsft-fcef-applied';
    const BTN_CLASS = 'nsft-fcef-btn';

    const TEXT_EXTS = new Set([
        'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx',
        'html', 'htm', 'xhtml',
        'css', 'scss', 'sass', 'less',
        'json', 'jsonl', 'ndjson',
        'xml', 'xsl', 'xslt', 'xsd', 'ftl',
        'csv', 'tsv',
        'txt', 'md', 'markdown', 'log',
        'sql', 'suiteql',
        'yml', 'yaml', 'ini', 'conf', 'cfg', 'env',
        'svg'
    ]);

    const NON_EDITABLE_EXTS = new Set([
        'pdf', 'zip', 'tar', 'gz', 'rar', '7z',
        'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'ico', 'tiff', 'tif',
        'mp3', 'mp4', 'avi', 'mov', 'wav', 'ogg', 'webm',
        'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
        'exe', 'dll', 'bin'
    ]);

    let enabled = false;
    let _unsub = null;
    let _applied = new WeakSet();

    function isApplicablePage() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isExcludedPage && NSFT_RecordButtons.isExcludedPage()) return false;
        } catch (e) { }
        return /mediaitemfolders|media|filecabinet/i.test(location.pathname);
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

    function runOnce() {
        if (!enabled) return;
        document.querySelectorAll('tr.uir-list-row-tr').forEach(row => {
            if (_applied.has(row)) return;
            const info = analyzeRow(row);
            if (!info || info.isFolder || !info.editable || !info.fileId) return;
            _applied.add(row);
            insertButton(row, info);
        });
    }

    function analyzeRow(row) {
        let fileId = null;
        let fileIdFallback = null;
        const editCandidates = row.querySelectorAll('a[href*="mediaitem"]');
        for (const a of editCandidates) {
            const href = a.getAttribute('href') || '';
            if (/mediaitemfolder\.nl/i.test(href)) continue;
            let id = null;
            try {
                const url = new URL(href, location.origin);
                id = url.searchParams.get('id');
            } catch (e) { }
            if (!id) continue;
            const txt = (a.textContent || '').trim();
            if (/^Editar$|^Edit$/i.test(txt)) { fileId = id; break; }
            if (fileIdFallback == null && /[?&]e=T\b/i.test(href)) fileIdFallback = id;
        }
        if (!fileId) fileId = fileIdFallback;

        const isFolder = !!row.querySelector('img[src*="folder.gif"]');

        let filename = '';
        let nameAnchor = null;
        const anchors = row.querySelectorAll('a');
        for (const a of anchors) {
            const href = a.getAttribute('href') || '';
            const txt = (a.textContent || '').trim();
            if (!txt) continue;
            if (/^Editar$|^Edit$|^Descargar$|^Download$/i.test(txt)) continue;
            if (/downloadfolder\.nl/.test(href)) continue;
            if (a.classList.contains('nsft-copy-link')) continue;
            filename = txt;
            nameAnchor = a;
            break;
        }

        const m = (filename || '').match(/\.([a-z0-9]{1,10})$/i);
        const ext = m ? m[1].toLowerCase() : '';

        let editable = true;
        if (ext && NON_EDITABLE_EXTS.has(ext)) editable = false;

        return { fileId, isFolder, editable, filename, ext, nameAnchor };
    }

    function insertButton(row, info) {
        const bar = getOrCreateActionsBar(row, info.nameAnchor);
        if (!bar) return;
        if (bar.querySelector('.' + BTN_CLASS)) return;

        const label = chrome.i18n.getMessage('fcef_edit_btn') || 'Editar archivo';
        const btn = document.createElement('a');
        btn.className = BTN_CLASS;
        btn.href = '/app/common/record/edittextmediaitem.nl?id=' +
                   encodeURIComponent(info.fileId) + '&e=T&l=T&target=filesize';
        btn.target = '_blank';
        btn.rel = 'noopener noreferrer';
        btn.title = (chrome.i18n.getMessage('fcef_edit_tooltip') || 'Edit this file') +
                    (info.filename ? ' — ' + info.filename : '');
        btn.innerHTML = svgEdit() + '<span class="nsft-fcef-label">' + label + '</span>';
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

    function svgEdit() {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path></svg>';
    }
})();
