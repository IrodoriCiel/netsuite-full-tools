(function () {
    'use strict';

    const I18N_FALLBACK = {
        dropText: 'Soltar script aquí',
        errFileMismatchName: 'El nombre no coincide',
        errFileMismatchMsg: 'El archivo soltado no coincide con el nombre del archivo en el registro de Script.',
        errNoFolderName: 'Carpeta no encontrada',
        errNoFolderMsg: 'No se pudo determinar la carpeta destino para subir el archivo.',
        errUploadName: 'Error al subir el archivo',
        errUploadMsg: 'Revisa la consola para ver detalles.',
        successTitle: 'Archivo subido',
        successUploadedAt: 'Subido el:',
        diffTitle: 'Confirmar reemplazo',
        diffSubtitle: 'Comparando el archivo actual con el nuevo. Revisa los cambios antes de subir.',
        diffLeft: 'Actual',
        diffRight: 'Nuevo',
        diffCancel: 'Cancelar',
        diffConfirm: 'Subir y reemplazar',
        diffNoChanges: 'Sin cambios. El archivo es idéntico al actual.',
        diffTooLarge: 'Archivo demasiado grande para mostrar el diff completo. Se mostrarán solo las primeras 5000 líneas.',
        diffLoadFailed: 'No se pudo obtener el archivo actual. Se mostrará solo el nuevo contenido.'
    };

    let initialI18n = I18N_FALLBACK;
    let initialTheme = 'auto';
    try {
        const ds = document.currentScript && document.currentScript.dataset;
        const raw = ds && ds.nsftI18n;
        if (raw) initialI18n = Object.assign({}, I18N_FALLBACK, JSON.parse(raw));
        if (ds && ds.nsftTheme) initialTheme = ds.nsftTheme;
    } catch (e) { }

    if (window.__nsftScriptUpload) {
        window.__nsftScriptUpload.refreshI18n(initialI18n);
        if (window.__nsftScriptUpload.refreshTheme) window.__nsftScriptUpload.refreshTheme(initialTheme);
        window.__nsftScriptUpload.ensureMounted();
        return;
    }

    if (typeof require === 'undefined' || typeof require !== 'function') return;

    require(['N/ui/message'], function (nMessage) {
        'use strict';

        const FOLDER_CACHE_KEY = 'nsftScriptUploadFolderCache:';
        const FOLDER_CACHE_TTL_MS = 60 * 60 * 1000;

        const DROP_ZONE_ID = 'nsft-script-drop-zone';
        const IFRAME_ID = 'nsft-script-upload-iframe';
        const FILE_INPUT_ID = 'nsft-script-upload-input';
        const CONTAINER_ID = 'nsft-script-upload-container';
        const ROW_CLASS = 'nsft-script-upload-row';
        const IFRAME_SRC = '/app/common/media/mediaitem.nl';

        let i18n = initialI18n;
        let _theme = initialTheme;
        let scriptName = '';
        let folder = null;
        let file = null;
        let message = null;
        let iframeLoaded = false;
        let iframeLoadPromise = null;

        function resolveTheme() {
            if (_theme === 'light' || _theme === 'dark') return _theme;
            return document.documentElement.getAttribute('data-nsft-theme') === 'dark' ? 'dark' : 'light';
        }

        function applyTheme(newTheme) {
            _theme = newTheme || 'light';
            const overlay = document.getElementById(PREVIEW_OVERLAY_ID);
            if (overlay) overlay.setAttribute('data-theme', resolveTheme());
        }

        window.__nsftScriptUpload = {
            refreshI18n: (newI18n) => { i18n = Object.assign({}, I18N_FALLBACK, newI18n || {}); },
            refreshTheme: applyTheme,
            ensureMounted: ensureMounted,
            teardown: teardown
        };

        const onMessage = (event) => {
            if (event.source !== window) return;
            const data = event.data;
            if (!data || typeof data.type !== 'string') return;
            if (data.type === 'nsft-script-upload-reinit') {
                if (data.i18n) i18n = Object.assign({}, I18N_FALLBACK, data.i18n);
                if (data.theme) applyTheme(data.theme);
                ensureMounted();
            } else if (data.type === 'nsft-script-upload-theme') {
                applyTheme(data.theme);
            } else if (data.type === 'nsft-script-upload-teardown') {
                teardown();
            }
        };
        window.addEventListener('message', onMessage);

        ensureMounted();

        function ensureMounted() {
            if (document.getElementById(DROP_ZONE_ID)) return;
            initialise();
        }

        function initialise() {
            const scriptFileWrapper = document.querySelector('.uir-field-wrapper[data-field-name="scriptfile"]');
            const scriptFileRow = scriptFileWrapper && scriptFileWrapper.closest('tr');

            const dropContainer = document.createElement('div');
            dropContainer.id = CONTAINER_ID;

            const dropZone = document.createElement('div');
            dropZone.id = DROP_ZONE_ID;
            dropZone.setAttribute('role', 'button');
            dropZone.setAttribute('tabindex', '0');
            const dropText = document.createElement('p');
            dropText.textContent = i18n.dropText;
            dropZone.appendChild(dropText);

            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.id = FILE_INPUT_ID;
            fileInput.accept = '.js,.ts,.json,.xml,.txt,.html,.css,.sdf,.zip';
            fileInput.style.display = 'none';

            dropContainer.appendChild(dropZone);
            dropContainer.appendChild(fileInput);

            if (scriptFileRow) {
                const row = document.createElement('tr');
                row.className = 'uir-field-wrapper-cell ' + ROW_CLASS;
                const cell = document.createElement('td');
                cell.appendChild(dropContainer);
                row.appendChild(cell);
                scriptFileRow.insertAdjacentElement('afterend', row);
            } else {
                const fallback = document.body.dataset.pageTheme === 'redwood'
                    ? document.querySelector('.uir-tab-list')
                    : document.querySelector('.uir-table-block.uir_form_tab_container.uir-tabs');
                if (!fallback) return;
                fallback.insertAdjacentElement('beforebegin', dropContainer);
            }

            const zone = document.getElementById(DROP_ZONE_ID);
            const input = document.getElementById(FILE_INPUT_ID);
            if (!zone || !input) return;

            zone.addEventListener('drop', dropHandler);
            zone.addEventListener('dragover', enterDropZone);
            zone.addEventListener('dragleave', leaveDropZone);
            zone.addEventListener('click', () => input.click());
            zone.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    input.click();
                }
            });
            input.addEventListener('change', () => {
                const picked = input.files && input.files[0];
                if (!picked) return;
                processFile(picked);
                input.value = '';
            });

            getScriptName();
        }

        function getScriptName() {
            try { scriptName = (typeof nlapiGetFieldText !== 'undefined' && nlapiGetFieldText('scriptfile')) || ''; } catch (e) { scriptName = ''; }
            if (!scriptName && typeof nlapiLookupField !== 'undefined' && typeof nlapiGetRecordId !== 'undefined') {
                try { scriptName = nlapiLookupField('script', nlapiGetRecordId(), 'scriptfile', true) || ''; } catch (e) { }
            }
        }

        function dropHandler(ev) {
            file = null;
            leaveDropZone(ev);
            ev.preventDefault();
            if (ev.dataTransfer.items) {
                for (const item of ev.dataTransfer.items) {
                    if (item.kind === 'file') { file = item.getAsFile(); break; }
                }
            } else {
                file = ev.dataTransfer.files[0];
            }
            if (!file) return;
            processFile(file);
        }

        async function processFile(picked) {
            file = picked;
            if (scriptName && !namesMatch(picked.name, scriptName)) {
                displayErrorMessage({
                    name: i18n.errFileMismatchName,
                    message: i18n.errFileMismatchMsg
                });
                return;
            }
            if (isTextFile(picked.name)) {
                let newContent = '';
                try { newContent = await picked.text(); } catch (e) { newContent = ''; }

                let current = { state: 'none', content: '' };
                try {
                    current = await fetchCurrentFileContent();
                } catch (e) {
                    current = { state: 'failed', content: '' };
                }

                const confirmed = await showDiffModal(current, newContent, picked.name);
                const zone = document.getElementById(DROP_ZONE_ID);
                if (zone) zone.dataset.state = '';
                if (!confirmed) return;
                uploadFileToNetSuite(picked);
                return;
            }
            uploadFileToNetSuite(picked);
        }

        const MAX_FETCH_SIZE = 1024 * 1024;

        async function fetchCurrentFileContent() {
            let fileId = null;
            try { fileId = typeof nlapiGetFieldValue !== 'undefined' ? nlapiGetFieldValue('scriptfile') : null; } catch (e) { }
            if (!fileId) {
                let scriptId = null;
                try { scriptId = typeof nlapiGetRecordId !== 'undefined' ? nlapiGetRecordId() : null; } catch (e) { }
                if (scriptId && typeof nlapiLookupField !== 'undefined') {
                    try { fileId = nlapiLookupField('script', scriptId, 'scriptfile'); } catch (e) { }
                }
            }
            if (!fileId || !/^\d+$/.test(String(fileId))) return { state: 'none', content: '' };

            const pageRes = await fetch('/app/common/media/mediaitem.nl?id=' + encodeURIComponent(fileId), { credentials: 'same-origin' });
            if (!pageRes.ok) return { state: 'failed', content: '' };
            const html = await pageRes.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');

            const selectors = [
                'a[target="fldUrlWindow"]',
                'a[href*="/core/media/media.nl"][download]',
                'a[href*="/core/media/media.nl"]',
                'a.dottedlink[href*="media.nl?"][href*="id="]'
            ];
            let link = null;
            for (const sel of selectors) { link = doc.querySelector(sel); if (link) break; }
            if (!link) return { state: 'failed', content: '' };
            const href = link.getAttribute('href');
            if (!href) return { state: 'failed', content: '' };

            let fileUrl;
            try { fileUrl = new URL(href, location.origin).toString(); } catch (e) { return { state: 'failed', content: '' }; }

            const contentRes = await fetch(fileUrl, { credentials: 'same-origin' });
            if (!contentRes.ok) return { state: 'failed', content: '' };
            const clen = parseInt(contentRes.headers.get('Content-Length') || '0', 10);
            if (clen && clen > MAX_FETCH_SIZE) return { state: 'failed', content: '' };
            const text = await contentRes.text();
            if (text.length > MAX_FETCH_SIZE) return { state: 'failed', content: '' };
            return { state: 'ok', content: text };
        }

        const TEXT_EXTENSIONS = new Set(['js', 'ts', 'json', 'xml', 'txt', 'html', 'css', 'sdf']);
        function isTextFile(fileName) {
            const m = String(fileName || '').match(/\.([^.]+)$/);
            return !!(m && TEXT_EXTENSIONS.has(m[1].toLowerCase()));
        }

        function namesMatch(a, b) {
            return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
        }

        function enterDropZone(ev) {
            if (ev.target.id === DROP_ZONE_ID) ev.target.dataset.state = 'hover';
            else if (ev.target.parentElement) ev.target.parentElement.dataset.state = 'hover';
            ev.preventDefault();
        }

        function leaveDropZone(ev) {
            if (ev.target.id === DROP_ZONE_ID) ev.target.dataset.state = '';
            else if (ev.target.parentElement) ev.target.parentElement.dataset.state = '';
            ev.preventDefault();
        }

        function ensureIframe() {
            if (iframeLoadPromise) return iframeLoadPromise;
            iframeLoadPromise = new Promise((resolve) => {
                let iframe = document.getElementById(IFRAME_ID);
                if (iframe) {
                    if (iframeLoaded) { resolve(iframe); return; }
                    iframe.addEventListener('load', () => { iframeLoaded = true; resolve(iframe); }, { once: true });
                    return;
                }
                iframe = document.createElement('iframe');
                iframe.id = IFRAME_ID;
                iframe.src = IFRAME_SRC;
                iframe.style.display = 'none';
                iframe.addEventListener('load', () => { iframeLoaded = true; resolve(iframe); }, { once: true });
                const container = document.getElementById(CONTAINER_ID);
                (container || document.body).appendChild(iframe);
            });
            return iframeLoadPromise;
        }

        function readFolderCache(scriptId) {
            try {
                const raw = sessionStorage.getItem(FOLDER_CACHE_KEY + scriptId);
                if (!raw) return null;
                const parsed = JSON.parse(raw);
                if (!parsed || typeof parsed !== 'object') return null;
                if (Date.now() - (parsed.ts || 0) > FOLDER_CACHE_TTL_MS) return null;
                return parsed.folderId || null;
            } catch (e) { return null; }
        }

        function writeFolderCache(scriptId, folderId) {
            try {
                sessionStorage.setItem(FOLDER_CACHE_KEY + scriptId, JSON.stringify({
                    ts: Date.now(),
                    folderId
                }));
            } catch (e) { }
        }

        async function uploadFileToNetSuite(droppedFile) {
            try {
                const iframe = await ensureIframe();
                const iframeDoc = (iframe.contentWindow || iframe.contentDocument).document;
                const mainForm = iframeDoc.getElementById('main_form');
                if (!mainForm) {
                    throw { name: i18n.errUploadName, message: i18n.errUploadMsg };
                }
                const formData = new FormData(mainForm);

                if (!folder) {
                    let scriptId = null;
                    try { scriptId = typeof nlapiGetRecordId !== 'undefined' ? nlapiGetRecordId() : null; } catch (e) { }
                    if (scriptId) {
                        const cached = readFolderCache(String(scriptId));
                        if (cached) folder = cached;
                    }

                    if (!folder) {
                        let fileId = null;
                        try { fileId = typeof nlapiGetFieldValue !== 'undefined' ? nlapiGetFieldValue('scriptfile') : null; } catch (e) { }
                        if (!fileId && typeof nlapiLookupField !== 'undefined' && scriptId) {
                            try { fileId = nlapiLookupField('script', scriptId, 'scriptfile'); } catch (e) { }
                        }
                        if (fileId && typeof nlapiSearchRecord !== 'undefined') {
                            let results = null;
                            try {
                                results = nlapiSearchRecord('folder', null, [['file.internalidnumber', 'equalto', fileId]]);
                            } catch (e) { }
                            if (results && results.length && typeof results[0].getId === 'function') {
                                folder = results[0].getId();
                                if (scriptId) writeFolderCache(String(scriptId), folder);
                            }
                        }
                    }
                }

                if (!folder) {
                    throw { name: i18n.errNoFolderName, message: i18n.errNoFolderMsg };
                }

                formData.set('mediafile', droppedFile);
                formData.set('folder', folder);

                const response = await fetch('/app/common/media/mediaitem.nl?l=T', {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    if (window.console) console.error(`${i18n.errUploadName} - ${droppedFile.name}`, response);
                    throw { name: `${i18n.errUploadName} - ${droppedFile.name}`, message: i18n.errUploadMsg };
                }

                if (message) message.hide();
                let when = '';
                try { when = typeof nlapiDateToString !== 'undefined' ? nlapiDateToString(new Date(), 'datetime') : new Date().toLocaleString(); } catch (e) { when = new Date().toLocaleString(); }
                message = nMessage.create({
                    type: nMessage.Type.CONFIRMATION,
                    title: `${i18n.successTitle} - ${droppedFile.name}`,
                    message: `${i18n.successUploadedAt} ${when}`
                });
                message.show();
                const zone = document.getElementById(DROP_ZONE_ID);
                if (zone) zone.dataset.state = 'success';
            } catch (e) {
                displayErrorMessage(e);
            }
        }

        function displayErrorMessage(e) {
            if (message) message.hide();
            message = nMessage.create({
                type: nMessage.Type.ERROR,
                title: (e && e.name) || i18n.errUploadName,
                message: (e && e.message) || i18n.errUploadMsg
            });
            message.show();
            const zone = document.getElementById(DROP_ZONE_ID);
            if (zone) zone.dataset.state = 'fail';
        }

        const PREVIEW_OVERLAY_ID = 'nsft-su-diff-overlay';
        const MAX_PREVIEW_LINES = 5000;
        const MAX_LCS_CELLS = 4000000;

        function el(tag, className) {
            const n = document.createElement(tag);
            if (className) n.className = className;
            return n;
        }

        function showDiffModal(current, newContent, fileName) {
            return new Promise((resolve) => {
                const existing = document.getElementById(PREVIEW_OVERLAY_ID);
                if (existing) existing.remove();

                const isDiff = current && current.state === 'ok';
                const loadFailed = current && current.state === 'failed';

                const overlay = el('div', 'nsft-su-diff-overlay');
                overlay.id = PREVIEW_OVERLAY_ID;
                overlay.setAttribute('data-theme', resolveTheme());
                const modal = el('div', 'nsft-su-diff-modal');

                const header = el('div', 'nsft-su-diff-header');
                const titleWrap = el('div', 'nsft-su-diff-title-wrap');
                const title = el('h3', 'nsft-su-diff-title');
                title.textContent = i18n.diffTitle + ': ' + fileName;
                const subtitle = el('p', 'nsft-su-diff-subtitle');
                subtitle.textContent = i18n.diffSubtitle;
                titleWrap.appendChild(title);
                titleWrap.appendChild(subtitle);
                header.appendChild(titleWrap);
                const stats = el('div', 'nsft-su-diff-stats');
                header.appendChild(stats);
                modal.appendChild(header);

                let diffRows = null;
                let approx = false;
                let identical = false;

                if (isDiff) {
                    const curLines = String(current.content || '').split(/\r?\n/);
                    const newLines = String(newContent || '').split(/\r?\n/);
                    const result = computeLineDiff(curLines, newLines);
                    diffRows = result.rows;
                    approx = result.approx;
                    let adds = 0, removes = 0;
                    for (const r of diffRows) {
                        if (r.type === 'add') adds++;
                        else if (r.type === 'remove') removes++;
                    }
                    identical = adds === 0 && removes === 0;
                    const addBadge = el('span', 'nsft-su-diff-stat-add');
                    addBadge.textContent = '+' + adds;
                    const remBadge = el('span', 'nsft-su-diff-stat-remove');
                    remBadge.textContent = '−' + removes;
                    stats.appendChild(addBadge);
                    stats.appendChild(remBadge);
                } else {
                    const allLines = String(newContent || '').split(/\r?\n/);
                    const lineBadge = el('span', 'nsft-su-diff-stat-add');
                    lineBadge.textContent = allLines.length + ' líneas';
                    const charBadge = el('span', 'nsft-su-diff-stat-add');
                    charBadge.textContent = String(newContent || '').length + ' chars';
                    stats.appendChild(lineBadge);
                    stats.appendChild(charBadge);
                }

                if (loadFailed) {
                    const info = el('div', 'nsft-su-diff-info');
                    info.textContent = i18n.diffLoadFailed;
                    modal.appendChild(info);
                }
                if (identical) {
                    const info = el('div', 'nsft-su-diff-info');
                    info.textContent = i18n.diffNoChanges;
                    modal.appendChild(info);
                }

                const body = el('div', 'nsft-su-diff-body');

                if (isDiff) {
                    const colheader = el('div', 'nsft-su-diff-colheader');
                    const cLeft = el('div', 'nsft-su-diff-colheader-cell');
                    cLeft.textContent = i18n.diffLeft;
                    const cRight = el('div', 'nsft-su-diff-colheader-cell');
                    cRight.textContent = i18n.diffRight;
                    colheader.appendChild(cLeft);
                    colheader.appendChild(cRight);
                    body.appendChild(colheader);

                    const truncated = diffRows.length > MAX_PREVIEW_LINES;
                    const rows = truncated ? diffRows.slice(0, MAX_PREVIEW_LINES) : diffRows;
                    if (approx || truncated) {
                        const warn = el('div', 'nsft-su-diff-warn');
                        warn.textContent = i18n.diffTooLarge;
                        modal.insertBefore(warn, body);
                    }

                    const panes = el('div', 'nsft-su-diff-panes');
                    const leftPane = el('div', 'nsft-su-diff-pane');
                    const rightPane = el('div', 'nsft-su-diff-pane');
                    const lf = document.createDocumentFragment();
                    const rf = document.createDocumentFragment();
                    for (const r of rows) {
                        const leftKind = r.type === 'remove' ? 'remove' : (r.type === 'add' ? 'blank' : 'equal');
                        const rightKind = r.type === 'add' ? 'add' : (r.type === 'remove' ? 'blank' : 'equal');
                        lf.appendChild(buildPaneRow(r.l, r.lt, leftKind));
                        rf.appendChild(buildPaneRow(r.r, r.rt, rightKind));
                    }
                    leftPane.appendChild(lf);
                    rightPane.appendChild(rf);
                    panes.appendChild(leftPane);
                    panes.appendChild(rightPane);
                    body.appendChild(panes);

                    syncScroll(leftPane, rightPane);
                } else {
                    const allLines = String(newContent || '').split(/\r?\n/);
                    const truncated = allLines.length > MAX_PREVIEW_LINES;
                    const lines = truncated ? allLines.slice(0, MAX_PREVIEW_LINES) : allLines;
                    if (truncated) {
                        const warn = el('div', 'nsft-su-diff-warn');
                        warn.textContent = i18n.diffTooLarge;
                        modal.insertBefore(warn, body);
                    }
                    const table = el('div', 'nsft-su-diff-table nsft-su-preview-table');
                    const frag = document.createDocumentFragment();
                    for (let i = 0; i < lines.length; i++) frag.appendChild(buildPreviewRow(i + 1, lines[i]));
                    table.appendChild(frag);
                    body.appendChild(table);
                }
                modal.appendChild(body);

                const footer = el('div', 'nsft-su-diff-footer');
                const cancelBtn = el('button', 'nsft-su-diff-btn nsft-su-diff-btn-cancel');
                cancelBtn.type = 'button';
                cancelBtn.textContent = i18n.diffCancel;
                const confirmBtn = el('button', 'nsft-su-diff-btn nsft-su-diff-btn-confirm');
                confirmBtn.type = 'button';
                confirmBtn.textContent = i18n.diffConfirm;
                footer.appendChild(cancelBtn);
                footer.appendChild(confirmBtn);
                modal.appendChild(footer);

                overlay.appendChild(modal);
                document.body.appendChild(overlay);

                setTimeout(() => { confirmBtn.focus(); }, 50);

                const cleanup = () => {
                    overlay.remove();
                    document.removeEventListener('keydown', onKey);
                };
                const onCancel = () => { cleanup(); resolve(false); };
                const onConfirm = () => { cleanup(); resolve(true); };
                const onKey = (e) => {
                    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
                };
                cancelBtn.addEventListener('click', onCancel);
                confirmBtn.addEventListener('click', onConfirm);
                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) onCancel();
                });
                document.addEventListener('keydown', onKey);
            });
        }

        function buildPreviewRow(num, text) {
            const row = el('div', 'nsft-su-preview-row');
            const numCell = el('div', 'nsft-su-diff-linenum');
            numCell.textContent = num;
            const textCell = el('div', 'nsft-su-diff-text');
            textCell.textContent = text;
            row.appendChild(numCell);
            row.appendChild(textCell);
            return row;
        }

        function buildPaneRow(num, text, kind) {
            const row = el('div', 'nsft-su-diff-pane-row nsft-su-diff-pane-row-' + kind);
            const ln = el('div', 'nsft-su-diff-pane-linenum');
            ln.textContent = num == null ? '' : num;
            const code = el('div', 'nsft-su-diff-pane-code');
            code.textContent = text || '';
            row.appendChild(ln);
            row.appendChild(code);
            return row;
        }

        function syncScroll(a, b) {
            let lock = false;
            const mirror = (src, dst) => () => {
                if (lock) return;
                lock = true;
                dst.scrollTop = src.scrollTop;
                dst.scrollLeft = src.scrollLeft;
                lock = false;
            };
            a.addEventListener('scroll', mirror(a, b));
            b.addEventListener('scroll', mirror(b, a));
        }

        function computeLineDiff(aLines, bLines) {
            const aN = aLines.length, bN = bLines.length;
            const rows = [];

            let start = 0;
            const minLen = Math.min(aN, bN);
            while (start < minLen && aLines[start] === bLines[start]) start++;

            let aEnd = aN, bEnd = bN;
            while (aEnd > start && bEnd > start && aLines[aEnd - 1] === bLines[bEnd - 1]) { aEnd--; bEnd--; }

            for (let i = 0; i < start; i++) {
                rows.push({ type: 'equal', l: i + 1, lt: aLines[i], r: i + 1, rt: bLines[i] });
            }

            const aMid = aLines.slice(start, aEnd);
            const bMid = bLines.slice(start, bEnd);
            let approx = false;

            if (aMid.length * bMid.length > MAX_LCS_CELLS) {
                approx = true;
                for (let i = 0; i < aMid.length; i++) {
                    rows.push({ type: 'remove', l: start + i + 1, lt: aMid[i], r: null, rt: '' });
                }
                for (let j = 0; j < bMid.length; j++) {
                    rows.push({ type: 'add', l: null, lt: '', r: start + j + 1, rt: bMid[j] });
                }
            } else {
                const midRows = lcsDiff(aMid, bMid, start);
                for (const mr of midRows) rows.push(mr);
            }

            for (let k = 0; k < aN - aEnd; k++) {
                rows.push({ type: 'equal', l: aEnd + k + 1, lt: aLines[aEnd + k], r: bEnd + k + 1, rt: bLines[bEnd + k] });
            }

            return { rows, approx };
        }

        function lcsDiff(a, b, offset) {
            const n = a.length, m = b.length;
            const rows = [];
            if (n === 0 && m === 0) return rows;
            const dp = [];
            for (let i = 0; i <= n; i++) dp.push(new Uint32Array(m + 1));
            for (let i = n - 1; i >= 0; i--) {
                for (let j = m - 1; j >= 0; j--) {
                    if (a[i] === b[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
                    else dp[i][j] = dp[i + 1][j] >= dp[i][j + 1] ? dp[i + 1][j] : dp[i][j + 1];
                }
            }
            let i = 0, j = 0;
            while (i < n && j < m) {
                if (a[i] === b[j]) {
                    rows.push({ type: 'equal', l: offset + i + 1, lt: a[i], r: offset + j + 1, rt: b[j] });
                    i++; j++;
                } else if (dp[i + 1][j] >= dp[i][j + 1]) {
                    rows.push({ type: 'remove', l: offset + i + 1, lt: a[i], r: null, rt: '' });
                    i++;
                } else {
                    rows.push({ type: 'add', l: null, lt: '', r: offset + j + 1, rt: b[j] });
                    j++;
                }
            }
            while (i < n) { rows.push({ type: 'remove', l: offset + i + 1, lt: a[i], r: null, rt: '' }); i++; }
            while (j < m) { rows.push({ type: 'add', l: null, lt: '', r: offset + j + 1, rt: b[j] }); j++; }
            return rows;
        }

        function teardown() {
            const container = document.getElementById(CONTAINER_ID);
            if (container) {
                const tr = container.closest('tr.' + ROW_CLASS);
                (tr || container).remove();
            }
            const previewOverlay = document.getElementById(PREVIEW_OVERLAY_ID);
            if (previewOverlay) previewOverlay.remove();
            scriptName = '';
            folder = null;
            file = null;
            iframeLoaded = false;
            iframeLoadPromise = null;
            if (message) {
                try { message.hide(); } catch (e) { }
                message = null;
            }
        }
    });
})();
