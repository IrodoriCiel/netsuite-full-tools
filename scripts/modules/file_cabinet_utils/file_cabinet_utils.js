(function () {
    const STORAGE_KEY = 'enableFileCabinetUtils';
    const TABLE_SELECTOR = '#div__body, .uir-list-body';
    const ROW_SELECTOR = 'tr.uir-list-row-tr';
    const LINK_CLASS = 'nsft-copy-link';

    const ICON_CLIPBOARD = `
        <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-right:2px; opacity:0.5;">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
        </svg>`;
    const ICON_SUCCESS_SMALL = `<span style="color:green;">✔</span>`;

    let _unsub = null;
    let _started = false;
    let _applied = new WeakSet();
    let _idColHeaderRef = null;
    let _idColIndex = -1;

    function isApplicablePage() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isExcludedPage && NSFT_RecordButtons.isExcludedPage()) return false;
        } catch (e) { }
        return /media|fileitem|filecabinet/i.test(location.pathname);
    }

    chrome.storage.local.get({ [STORAGE_KEY]: true }, (items) => {
        if (!items[STORAGE_KEY] || !isApplicablePage()) return;
        start();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        if (changes[STORAGE_KEY].newValue) { if (isApplicablePage()) start(); }
        else teardown();
    });

    function start() {
        if (_started) return;
        _started = true;
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            _unsub = window.NSFT_Observer.subscribe(applyClickToCopy, { throttle: 250, immediate: true });
        } else {
            const mo = new MutationObserver(applyClickToCopy);
            mo.observe(document.body, { childList: true, subtree: true });
            _unsub = () => mo.disconnect();
            applyClickToCopy();
        }
    }

    function teardown() {
        _started = false;
        if (_unsub) { _unsub(); _unsub = null; }
        _applied = new WeakSet();
        _idColHeaderRef = null;
        _idColIndex = -1;
        document.querySelectorAll('.' + LINK_CLASS).forEach(link => {
            const cell = link.parentElement;
            if (cell) cell.textContent = link.dataset.nsftId || (link.textContent || '').trim();
        });
    }

    const escapeHtml = (window.NSFT_DOM && window.NSFT_DOM.escapeHtml) ||
        ((v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c])));

    function applyClickToCopy() {
        if (!_started) return;
        const table = document.querySelector(TABLE_SELECTOR);
        if (!table) return;

        const idColumnIndex = getIdColumnIndex(table);
        if (idColumnIndex < 0) return;

        const rows = table.querySelectorAll(ROW_SELECTOR);
        rows.forEach(row => {
            const cell = row.cells && row.cells[idColumnIndex];
            if (!cell || _applied.has(cell)) return;
            if (cell.getAttribute('data-list-cell-type') !== 'numerickey') return;

            const raw = (cell.textContent || '').trim();
            if (!raw || !/^-?\d+$/.test(raw)) return;

            const editLink = row.querySelector('a[href*="mediaitem"]');
            const isFolder = !!(editLink && /mediaitemfolder\.nl/i.test(editLink.getAttribute('href') || ''));

            makeCellClickable(cell, raw, isFolder);
            _applied.add(cell);
        });
    }

    function getIdColumnIndex(table) {
        const headerRow = table.querySelector('thead tr, .uir-list-headerrow');
        if (!headerRow) return -1;
        if (headerRow === _idColHeaderRef && _idColIndex >= 0) return _idColIndex;
        _idColHeaderRef = headerRow;
        const ths = headerRow.children;
        _idColIndex = -1;
        for (let i = 0; i < ths.length; i++) {
            if (ths[i].getAttribute && ths[i].getAttribute('data-nsps-id') === 'columnheader__nkey') { _idColIndex = i; break; }
        }
        return _idColIndex;
    }

    function makeCellClickable(cell, id, isFolder) {
        const title = isFolder
            ? (chrome.i18n.getMessage('fcu_copy_folder_id') || 'Copiar ID de carpeta')
            : (chrome.i18n.getMessage('fcu_copy_file_id') || 'Copiar ID de archivo');

        const link = document.createElement('a');
        link.href = '#';
        link.className = 'dottedlink ' + LINK_CLASS;
        link.title = title;
        link.dataset.nsftId = id;
        link.innerHTML = `${ICON_CLIPBOARD}<span>${escapeHtml(id)}</span>`;
        link.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const onSuccess = () => {
                const original = link.innerHTML;
                link.innerHTML = ICON_SUCCESS_SMALL;
                setTimeout(() => { link.innerHTML = original; }, 1000);
            };
            if (window.NSFT_Clipboard) {
                window.NSFT_Clipboard.copy(id, { onSuccess });
            } else if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(id).then(onSuccess).catch(() => { });
            }
        });

        cell.textContent = '';
        cell.appendChild(link);
    }
})();
