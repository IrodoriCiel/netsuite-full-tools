(function () {
    'use strict';

    const STORAGE_KEY = 'enableCsvResponseViewer';
    const CSV_LINK_SELECTOR = 'a[href*="uploadlogcsv.nl?wqid="], a[onclick*="uploadlogcsv.nl?wqid="]';
    const BOUND_ATTR = 'data-nsft-csv-bound';
    const ORIGINAL_TEXT_ATTR = 'data-nsft-original-text';

    if (!/\/app\/setup\/upload\/csv\//.test(window.location.pathname)) return;

    const IDS = {
        MODAL: 'nsft-csv-response-modal',
        HEADER: 'nsft-csv-response-header',
        TITLE: 'nsft-csv-response-title',
        HELP: 'nsft-csv-response-help',
        MINIMISE: 'nsft-csv-response-minimise',
        FULLSCREEN: 'nsft-csv-response-fullscreen',
        MAXIMISE: 'nsft-csv-response-maximise',
        CLOSE: 'nsft-csv-response-close',
        CONTENT: 'nsft-csv-response-content',
        FOOTER: 'nsft-csv-response-footer',
        DOWNLOAD: 'nsft-csv-response-download',
        RESET: 'nsft-csv-response-reset'
    };

    const state = {
        built: false,
        unsubscribe: null,
        dragHandlers: null,
        modalKeyHandler: null,
        lastFocusedEl: null,
        theme: 'light',
        lastMaxTop: '2.5vh',
        lastMaxLeft: '2.5vw'
    };

    function restoreMaximised(modal) {
        if (!modal) return;
        modal.dataset.state = 'maximised';
        modal.style.top = state.lastMaxTop;
        modal.style.left = state.lastMaxLeft;
        modal.style.right = 'auto';
        modal.style.bottom = 'auto';
    }

    function shouldRun(settings) {
        return !!settings[STORAGE_KEY] && !settings.enableDiscreetMode;
    }

    chrome.storage.local.get({ [STORAGE_KEY]: true, enableDiscreetMode: false, nsftTheme: 'light' }, (settings) => {
        state.theme = settings.nsftTheme === 'dark' ? 'dark' : 'light';
        if (shouldRun(settings)) start();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;

        if (changes.nsftTheme) {
            state.theme = changes.nsftTheme.newValue === 'dark' ? 'dark' : 'light';
            const modal = document.getElementById(IDS.MODAL);
            if (modal) modal.dataset.theme = state.theme;
        }

        if (!changes[STORAGE_KEY] && !changes.enableDiscreetMode) return;
        chrome.storage.local.get({ [STORAGE_KEY]: true, enableDiscreetMode: false }, (settings) => {
            if (shouldRun(settings)) start();
            else stop();
        });
    });

    function start() {
        if (state.built) return;

        if (typeof Papa === 'undefined') {
            const msg = chrome.i18n.getMessage('csvRvUnavailable') || 'CSV viewer unavailable (library not loaded).';
            if (window.NSFT_Clipboard) NSFT_Clipboard.showToast(msg, { type: 'error' });
            return;
        }

        const titleText = chrome.i18n.getMessage('csvRvTitle') || 'CSV Response';
        const downloadText = chrome.i18n.getMessage('csvRvDownload') || 'Download';
        const resetText = chrome.i18n.getMessage('csvRvReset') || 'Reset';

        const TITLE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9.5h18"/><path d="M9 9.5V20"/></svg>';

        const minLabel = chrome.i18n.getMessage('modalMinimise') || 'Minimise';
        const maxLabel = chrome.i18n.getMessage('modalMaximise') || 'Maximise';
        const fsLabel = chrome.i18n.getMessage('sql_fullscreen_enter') || 'Fullscreen';
        const closeLabel = chrome.i18n.getMessage('closeModal') || 'Close';

        const modalHtml = `
            <div id="${IDS.MODAL}" class="nsft-modal nsft-modal--window nsft-csv-response-modal" data-nsft-ui
                 data-theme="${state.theme}" data-state="maximised" tabindex="-1"
                 role="dialog" aria-modal="true" aria-labelledby="${IDS.TITLE}" style="display: none;">
                <div class="nsft-modal-header nsft-csv-response-header" id="${IDS.HEADER}">
                    <span class="nsft-modal-title" id="${IDS.TITLE}">${TITLE_ICON}<span>${escapeHtml(titleText)}</span></span>
                    <span class="nsft-header-actions">
                        <span id="${IDS.MINIMISE}" class="nsft-modal-btn-minimise" role="button" tabindex="0" aria-label="${escapeAttr(minLabel)}" title="${escapeAttr(minLabel)}"></span>
                        <span id="${IDS.FULLSCREEN}" class="nsft-modal-btn-fullscreen" role="button" tabindex="0" aria-label="${escapeAttr(fsLabel)}" title="${escapeAttr(fsLabel)}"></span>
                        <span id="${IDS.MAXIMISE}" class="nsft-modal-btn-maximise" role="button" tabindex="0" aria-label="${escapeAttr(maxLabel)}" title="${escapeAttr(maxLabel)}"></span>
                        <span id="${IDS.CLOSE}" class="nsft-modal-btn-close" role="button" tabindex="0" aria-label="${escapeAttr(closeLabel)}" title="${escapeAttr(closeLabel)}">✕</span>
                    </span>
                    <div class="nsft-modal-header-line"></div>
                </div>
                <div class="nsft-csv-response-content" id="${IDS.CONTENT}"></div>
                <div class="nsft-csv-response-footer" id="${IDS.FOOTER}">
                    <input id="${IDS.DOWNLOAD}" class="nsft-csv-response-button" type="button" value="${escapeAttr(downloadText)}">
                    <input id="${IDS.RESET}" class="nsft-csv-response-button" type="button" value="${escapeAttr(resetText)}">
                </div>
            </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        addDragFunctionality();

        document.getElementById(IDS.MINIMISE).addEventListener('click', () => {
            const modal = document.getElementById(IDS.MODAL);
            modal.dataset.state = 'minimised';
            setTimeout(() => snapToEdge(modal), 10);
        });
        document.getElementById(IDS.MAXIMISE).addEventListener('click', () => {
            restoreMaximised(document.getElementById(IDS.MODAL));
        });
        document.getElementById(IDS.FULLSCREEN).addEventListener('click', () => {
            const modal = document.getElementById(IDS.MODAL);
            if (modal.dataset.state === 'fullscreen') { restoreMaximised(modal); return; }
            modal.dataset.state = 'fullscreen';
        });
        document.getElementById(IDS.CLOSE).addEventListener('click', closeModal);
        document.getElementById(IDS.HEADER).addEventListener('dblclick', () => {
            const el = document.getElementById(IDS.MODAL);
            if (el.dataset.state === 'maximised') {
                el.dataset.state = 'minimised';
                setTimeout(() => snapToEdge(el), 10);
            } else {
                restoreMaximised(el);
            }
        });

        document.getElementById(IDS.DOWNLOAD).addEventListener('click', downloadCsv);
        document.getElementById(IDS.RESET).addEventListener('click', resetCsvData);

        state.modalKeyHandler = handleModalKeydown;
        document.getElementById(IDS.MODAL).addEventListener('keydown', state.modalKeyHandler);

        state.built = true;

        bindCsvLinks();
        if (window.NSFT_Observer) {
            state.unsubscribe = NSFT_Observer.subscribe(bindCsvLinks, { throttle: 250 });
        }
    }

    function bindCsvLinks() {
        const viewText = chrome.i18n.getMessage('csvRvView') || 'View';
        const downloadText = chrome.i18n.getMessage('csvRvDownload') || 'Download';
        const links = document.querySelectorAll(CSV_LINK_SELECTOR);

        links.forEach((link) => {
            if (link.hasAttribute(BOUND_ATTR)) return;
            link.setAttribute(BOUND_ATTR, '1');

            const fileId = extractFileId(link);
            if (!fileId) return;

            if (!link.hasAttribute(ORIGINAL_TEXT_ATTR)) link.setAttribute(ORIGINAL_TEXT_ATTR, link.textContent);
            link.textContent = downloadText;

            const viewLink = document.createElement('a');
            viewLink.href = '#';
            viewLink.className = link.className;
            viewLink.classList.add('nsft-csv-response-view');
            viewLink.textContent = viewText;
            viewLink.dataset.fileId = fileId;

            const sep = document.createElement('span');
            sep.className = 'nsft-csv-response-sep';
            sep.textContent = ' | ';

            link.parentNode.insertBefore(viewLink, link);
            link.parentNode.insertBefore(sep, link);
            viewLink.addEventListener('click', showCSVResponse);
        });
    }

    function extractFileId(link) {
        if (!link || !link.getAttribute) return '';
        const href = link.getAttribute('href') || '';

        if (/uploadlogcsv\.nl\?wqid=/.test(href)) {
            try {
                const url = new URL(href, window.location.origin);
                const id = url.searchParams.get('wqid');
                if (id) return id;
            } catch (e) { }
        }

        const m = (href + ' ' + (link.getAttribute('onclick') || '')).match(/wqid=(\d+)/);
        return m ? m[1] : '';
    }

    function showCSVResponse(evt) {
        evt.preventDefault();
        const viewLink = evt.currentTarget;
        const fileId = viewLink.dataset.fileId;
        if (!fileId) return;

        const modal = document.getElementById(IDS.MODAL);
        state.lastFocusedEl = document.activeElement;

        modal.style.display = 'flex';
        restoreMaximised(modal);
        focusFirstControl(modal);
        if (modal.dataset.fileId === fileId) return;

        modal.dataset.fileId = fileId;
        let [title, messageEl, jobName] = generateModalTitle(viewLink);
        modal.dataset.jobName = jobName || '';
        if (!title) title = chrome.i18n.getMessage('csvRvTitle') || 'CSV Response';
        const tituloEl = modal.querySelector(`#${IDS.TITLE} > span`) || modal.querySelector(`#${IDS.TITLE}`);
        tituloEl.textContent = title;

        displayCsvResponse(modal, fileId, messageEl);
    }

    function displayCsvResponse(modal, fileId, messageEl) {
        const loadingText = chrome.i18n.getMessage('csvRvLoading') || 'Loading...';
        modal.querySelector(`#${IDS.CONTENT}`).textContent = loadingText;

        fetch(`/app/setup/upload/csv/uploadlogcsv.nl?wqid=${encodeURIComponent(fileId)}`)
            .then(response => response.text())
            .then(responseText => {
                let table;
                const csv = Papa.parse(responseText);
                const lines = csv.data;
                modal.dataset.delimiter = (csv.meta && csv.meta.delimiter) || ',';
                const looksLikeCsv = lines.length > 1 && Array.isArray(lines[0]) && lines[0].length > 1;

                if (!looksLikeCsv) {
                    if (!messageEl) messageEl = document.createElement('div');
                    const serverMsg = responseText.trim();
                    const note = document.createElement('div');
                    note.textContent = serverMsg || (chrome.i18n.getMessage('csvRvSuccess') || 'All records imported successfully.');
                    messageEl.appendChild(note);
                } else {
                    table = buildCsvTable(lines);
                }

                const contentEl = modal.querySelector(`#${IDS.CONTENT}`);
                contentEl.innerHTML = '';
                if (messageEl) contentEl.appendChild(messageEl);
                if (table) contentEl.appendChild(table);
            });
    }

    function buildCsvTable(lines) {
        const table = document.createElement('table');
        table.contentEditable = 'true';
        const fragment = document.createDocumentFragment();

        for (let i = 0; i < lines.length; i++) {
            const cells = lines[i];
            const row = document.createElement('tr');
            let rowHasContent = false;

            for (let j = 0; j < cells.length - 1; j++) {
                if (j === 0) {
                    const idxCell = document.createElement('td');
                    idxCell.contentEditable = 'false';
                    idxCell.textContent = i + 1;
                    row.appendChild(idxCell);
                }

                const cell = document.createElement('td');
                const p = document.createElement('p');
                p.textContent = cells[j];
                cell.appendChild(p);
                if (i === 0 || j === 0) cell.contentEditable = 'false';
                row.appendChild(cell);

                if (cells[j]) rowHasContent = true;
            }
            if (rowHasContent) fragment.appendChild(row);
        }

        table.appendChild(fragment);
        return table;
    }

    function generateModalTitle(linkEl) {
        const row = linkEl.closest('tr');
        const cells = row ? row.querySelectorAll('td') : [];
        const date = cells[0]?.textContent || '';
        const jobName = cells[1]?.textContent || '';
        const percentage = cells[3]?.textContent || '';
        const message = cells[4]?.textContent || '';
        const prefix = chrome.i18n.getMessage('csvRvTitle') || 'CSV Response';

        const title = `${prefix} - ${jobName} - ${date} - ${percentage}`;
        const messageEl = document.createElement('div');
        messageEl.textContent = message;
        return [title, messageEl, jobName];
    }

    function resetCsvData() {
        const confirmMsg = chrome.i18n.getMessage('csvRvConfirmReset') || 'Are you sure you want to reset the CSV data?';
        const rehacer = () => {
            const modal = document.getElementById(IDS.MODAL);
            const fileId = modal.dataset.fileId;
            const messageEl = document.querySelector(`.nsft-csv-response-content > div`);
            displayCsvResponse(modal, fileId, messageEl);
        };
        if (window.NSFT_Dialog) {
            window.NSFT_Dialog.confirm({ body: confirmMsg }).then((si) => { if (si) rehacer(); });
        } else if (confirm(confirmMsg)) {
            rehacer();
        }
    }

    function downloadCsv() {
        let downloadElement = null;
        try {
            const modal = document.getElementById(IDS.MODAL);
            let title = ((modal && modal.dataset.jobName) || '').trim().replace(/\.csv$/i, '');
            if (title) title = ` - ${title}`;

            const csv = getCsvData();
            const baseName = chrome.i18n.getMessage('csvRvFileName') || 'Updated CSV Response';

            downloadElement = document.createElement('a');
            downloadElement.style.display = 'none';
            downloadElement.setAttribute('href', `data:text/plain;charset=utf-8,${encodeURIComponent(csv)}`);
            downloadElement.setAttribute('download', `${baseName}${title}.csv`);

            document.body.appendChild(downloadElement);
            downloadElement.click();
            document.body.removeChild(downloadElement);
        } catch (e) {
            const err = chrome.i18n.getMessage('csvRvDownloadError') || 'There was a problem downloading the CSV';
            if (window.NSFT_Dialog) window.NSFT_Dialog.alert({ body: err });
            else alert(err);
            console.error('downloadCsv', e);
        }
    }

    function getCsvData() {
        const table = document.querySelector('.nsft-csv-response-content table');
        const csv = [];
        const rows = table.querySelectorAll('tr');

        for (const row of rows) {
            const cells = row.querySelectorAll('td');
            const csvRow = [];
            for (let j = 0; j < cells.length; j++) {
                if (j === 0 || j === 1) continue;
                csvRow.push(cells[j].textContent);
            }
            csv.push(csvRow);
        }
        const modal = document.getElementById(IDS.MODAL);
        const delimiter = (modal && modal.dataset.delimiter) || ',';
        return Papa.unparse(csv, { delimiter });
    }

    function closeModal() {
        document.getElementById(IDS.MODAL).style.display = 'none';
        if (state.lastFocusedEl && typeof state.lastFocusedEl.focus === 'function') {
            state.lastFocusedEl.focus();
        }
    }

    function focusFirstControl(modal) {
        const focusable = getFocusable(modal);
        if (focusable.length) focusable[0].focus();
    }

    function getFocusable(root) {
        return Array.from(root.querySelectorAll(
            'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )).filter(el => el.offsetParent !== null);
    }

    function handleModalKeydown(e) {
        if (e.key === 'Escape') {
            closeModal();
            return;
        }
        if (e.key !== 'Tab') return;

        const modal = document.getElementById(IDS.MODAL);
        const focusable = getFocusable(modal);
        if (!focusable.length) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }

    function stop() {
        if (!state.built) return;
        if (state.unsubscribe) { state.unsubscribe(); state.unsubscribe = null; }

        document.querySelectorAll('.nsft-csv-response-view, .nsft-csv-response-sep').forEach(el => el.remove());
        document.querySelectorAll(`[${BOUND_ATTR}]`).forEach((link) => {
            const original = link.getAttribute(ORIGINAL_TEXT_ATTR);
            if (original !== null) link.textContent = original;
            link.removeAttribute(BOUND_ATTR);
            link.removeAttribute(ORIGINAL_TEXT_ATTR);
        });

        if (state.dragHandlers) {
            window.removeEventListener('mouseup', state.dragHandlers.up);
            window.removeEventListener('mousemove', state.dragHandlers.move);
            state.dragHandlers = null;
        }
        document.getElementById(IDS.MODAL)?.remove();
        state.built = false;
    }

    function constrainModalToWindow(el) {
        if (!el || (!el.style.left && !el.style.top)) return;
        if (el.dataset.state === 'fullscreen') return;

        const rect = el.getBoundingClientRect();
        let newLeft = rect.left;
        let newTop = rect.top;

        if (newLeft + rect.width > window.innerWidth) newLeft = window.innerWidth - rect.width - 15;
        if (newLeft < 15) newLeft = 15;
        if (newTop + rect.height > window.innerHeight) newTop = window.innerHeight - rect.height - 15;
        if (newTop < 15) newTop = 15;

        if (Math.abs(newLeft - rect.left) > 0.5 || Math.abs(newTop - rect.top) > 0.5) {
            el.style.left = newLeft + 'px';
            el.style.top = newTop + 'px';
        }
    }

    function snapToEdge(el) {
        if (!el) return;
        el.style.right = 'auto';
        el.style.bottom = 'auto';

        const rect = el.getBoundingClientRect();
        const targetWidth = el.dataset.state === 'minimised' ? 165 : rect.width;
        const centerX = rect.left + (rect.width / 2);
        const p = 15;

        el.style.left = (centerX < (window.innerWidth / 2))
            ? p + 'px'
            : (window.innerWidth - targetWidth - p) + 'px';
        constrainModalToWindow(el);
    }

    function addDragFunctionality() {
        let mouseIsDown = false;
        let initialX = 0;
        let initialY = 0;

        document.getElementById(IDS.HEADER).addEventListener('mousedown', (event) => {
            mouseIsDown = true;
            initialX = event.clientX;
            initialY = event.clientY;
        });

        const onUp = () => {
            if (!mouseIsDown) return;
            mouseIsDown = false;
            const el = document.getElementById(IDS.MODAL);
            if (!el) return;
            el.classList.remove('nsft-dragging');
            if (el.dataset.state === 'minimised') requestAnimationFrame(() => snapToEdge(el));
            else constrainModalToWindow(el);
        };
        const onMove = (event) => {
            if (!mouseIsDown) return;
            const el = document.getElementById(IDS.MODAL);
            el.classList.add('nsft-dragging');
            const left = el.offsetLeft - (initialX - event.clientX);
            const top = el.offsetTop - (initialY - event.clientY);
            initialX = event.clientX;
            initialY = event.clientY;
            el.style.top = `${top}px`;
            el.style.left = `${left}px`;
            if (el.dataset.state === 'maximised') {
                state.lastMaxTop = `${top}px`;
                state.lastMaxLeft = `${left}px`;
            }
        };

        window.addEventListener('mouseup', onUp);
        window.addEventListener('mousemove', onMove);
        state.dragHandlers = { up: onUp, move: onMove };
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    function escapeAttr(s) {
        return escapeHtml(s);
    }
})();
