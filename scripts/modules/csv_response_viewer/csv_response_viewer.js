(function () {
    'use strict';

    const STORAGE_KEY = 'enableCsvResponseViewer';
    const CSV_LINK_SELECTOR = 'a[href*="/app/setup/upload/csv/uploadlogcsv.nl?wqid="]';
    const BOUND_ATTR = 'data-nsft-csv-bound';
    const ORIGINAL_TEXT_ATTR = 'data-nsft-original-text';

    if (!/\/app\/setup\/upload\/csv\//.test(window.location.pathname)) return;

    const IDS = {
        MODAL: 'nsft-csv-response-modal',
        HEADER: 'nsft-csv-response-header',
        TITLE: 'nsft-csv-response-title',
        HELP: 'nsft-csv-response-help',
        MINIMISE: 'nsft-csv-response-minimise',
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
        lastFocusedEl: null
    };

    function shouldRun(settings) {
        return !!settings[STORAGE_KEY] && !settings.enableDiscreetMode;
    }

    chrome.storage.local.get({ [STORAGE_KEY]: true, enableDiscreetMode: false }, (settings) => {
        if (shouldRun(settings)) start();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || (!changes[STORAGE_KEY] && !changes.enableDiscreetMode)) return;
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

        const modalHtml = `
            <div id="${IDS.MODAL}" class="nsft-csv-response-modal" data-nsft-ui data-state="maximised"
                 role="dialog" aria-modal="true" aria-labelledby="${IDS.TITLE}" style="display: none;">
                <div class="nsft-csv-response-header" id="${IDS.HEADER}">
                    <span id="${IDS.TITLE}">${escapeHtml(titleText)}</span>
                    <span style="float: right;">
                        <span id="${IDS.MINIMISE}" role="button" tabindex="0" aria-label="Minimise">&nbsp;</span>
                        <span id="${IDS.MAXIMISE}" role="button" tabindex="0" aria-label="Maximise">&nbsp;</span>
                        <span id="${IDS.CLOSE}" role="button" tabindex="0" aria-label="Close">X</span>
                    </span>
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
            document.getElementById(IDS.MODAL).dataset.state = 'minimised';
        });
        document.getElementById(IDS.MAXIMISE).addEventListener('click', () => {
            const modal = document.getElementById(IDS.MODAL);
            modal.style.removeProperty('top');
            modal.style.removeProperty('left');
            modal.dataset.state = 'maximised';
        });
        document.getElementById(IDS.CLOSE).addEventListener('click', closeModal);
        document.getElementById(IDS.HEADER).addEventListener('dblclick', () => {
            const el = document.getElementById(IDS.MODAL);
            el.dataset.state = el.dataset.state === 'maximised' ? 'minimised' : 'maximised';
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

            const fileId = extractFileId(link.href);
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

    function extractFileId(href) {
        try {
            const url = new URL(href, window.location.origin);
            return url.searchParams.get('wqid') || '';
        } catch (e) {
            return '';
        }
    }

    function showCSVResponse(evt) {
        evt.preventDefault();
        const viewLink = evt.currentTarget;
        const fileId = viewLink.dataset.fileId;
        if (!fileId) return;

        const modal = document.getElementById(IDS.MODAL);
        state.lastFocusedEl = document.activeElement;

        modal.style.removeProperty('top');
        modal.style.removeProperty('left');
        modal.style.display = 'block';
        modal.dataset.state = 'maximised';
        focusFirstControl(modal);
        if (modal.dataset.fileId === fileId) return;

        modal.dataset.fileId = fileId;
        let [title, messageEl] = generateModalTitle(viewLink);
        if (!title) title = chrome.i18n.getMessage('csvRvTitle') || 'CSV Response';
        modal.querySelector(`#${IDS.TITLE}`).textContent = title;

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
        return [title, messageEl];
    }

    function resetCsvData() {
        const confirmMsg = chrome.i18n.getMessage('csvRvConfirmReset') || 'Are you sure you want to reset the CSV data?';
        if (!confirm(confirmMsg)) return;

        const modal = document.getElementById(IDS.MODAL);
        const fileId = modal.dataset.fileId;
        const messageEl = document.querySelector(`.nsft-csv-response-content > div`);
        displayCsvResponse(modal, fileId, messageEl);
    }

    function downloadCsv() {
        let downloadElement = null;
        try {
            let title = document.getElementById(IDS.TITLE).textContent.split('-')[2] || '';
            if (title) title = ` - ${title.trim()}`;
            if (title.includes('.csv')) title = title.replace('.csv', '');

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
            alert(chrome.i18n.getMessage('csvRvDownloadError') || 'There was a problem downloading the CSV');
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
        return Papa.unparse(csv);
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

    function addDragFunctionality() {
        let mouseIsDown = false;
        let initialX = 0;
        let initialY = 0;

        document.getElementById(IDS.HEADER).addEventListener('mousedown', (event) => {
            mouseIsDown = true;
            initialX = event.clientX;
            initialY = event.clientY;
        });

        const onUp = () => { mouseIsDown = false; };
        const onMove = (event) => {
            if (!mouseIsDown) return;
            const el = document.getElementById(IDS.MODAL);
            const left = el.offsetLeft - (initialX - event.clientX);
            const top = el.offsetTop - (initialY - event.clientY);
            initialX = event.clientX;
            initialY = event.clientY;
            el.style.top = `${top}px`;
            el.style.left = `${left}px`;
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
