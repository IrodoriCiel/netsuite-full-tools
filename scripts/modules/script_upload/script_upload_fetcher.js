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
        diffLoadFailed: 'No se pudo obtener el archivo actual. Se mostrará solo el nuevo contenido.',
        diffLines: 'líneas',
        diffChars: 'caracteres'
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
            const overlay = document.getElementById('nsft-diff-overlay');
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

                let confirmed = true;
                if (window.NSFT_Diff) {
                    confirmed = await window.NSFT_Diff.show({
                        current: current,
                        newContent: newContent,
                        fileName: picked.name,
                        theme: resolveTheme(),
                        labels: {
                            Title: i18n.diffTitle,
                            Subtitle: i18n.diffSubtitle,
                            Left: i18n.diffLeft,
                            Right: i18n.diffRight,
                            Cancel: i18n.diffCancel,
                            Confirm: i18n.diffConfirm,
                            NoChanges: i18n.diffNoChanges,
                            TooLarge: i18n.diffTooLarge,
                            LoadFailed: i18n.diffLoadFailed,
                            lines: i18n.diffLines,
                            chars: i18n.diffChars
                        }
                    });
                }
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


        function teardown() {
            const container = document.getElementById(CONTAINER_ID);
            if (container) {
                const tr = container.closest('tr.' + ROW_CLASS);
                (tr || container).remove();
            }
            const previewOverlay = document.getElementById('nsft-diff-overlay');
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
