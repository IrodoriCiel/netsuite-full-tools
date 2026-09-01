(function () {
    'use strict';
    const STORAGE_KEY = 'enableFileCabinetDragDropBeta';
    const NSFT_THEME_KEY = 'nsftTheme';
    const OVERLAY_ID = 'nsft-fcdd-overlay';
    const PROGRESS_ID = 'nsft-fcdd-progress';
    const APPLIED_ATTR = 'data-nsft-fcdd-applied';
    const LIST_URL = '/app/common/media/mediaitemfolders.nl';

    let enabled = false;
    let _theme = 'light';

    function isApplicablePage() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isExcludedPage && NSFT_RecordButtons.isExcludedPage()) return false;
        } catch (e) { }
        return /mediaitemfolders|media|filecabinet/i.test(location.pathname);
    }

    chrome.storage.local.get({ [STORAGE_KEY]: false, [NSFT_THEME_KEY]: 'light' }, (items) => {
        enabled = !!items[STORAGE_KEY];
        _theme = items[NSFT_THEME_KEY] || 'light';
        if (enabled && isApplicablePage()) init();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[NSFT_THEME_KEY]) {
            _theme = changes[NSFT_THEME_KEY].newValue || 'light';
            const resolved = resolveTheme();
            document.querySelectorAll('.nsft-fcdd-modal, .nsft-fcdd-notify, #' + PROGRESS_ID)
                .forEach(el => el.setAttribute('data-theme', resolved));
        }
        if (!changes[STORAGE_KEY]) return;
        enabled = !!changes[STORAGE_KEY].newValue;
        if (enabled) { if (isApplicablePage()) init(); }
        else teardown();
    });

    function resolveTheme() {
        return _theme === 'dark' ? 'dark' : 'light';
    }

    function init() {
        if (document.documentElement.getAttribute(APPLIED_ATTR) === 'true') return;
        document.documentElement.setAttribute(APPLIED_ATTR, 'true');

        document.addEventListener('dragenter', onDragEnter, false);
        document.addEventListener('dragover', onDragOver, false);
        document.addEventListener('dragleave', onDragLeave, false);
        document.addEventListener('drop', onDrop, false);

        try { ensureBridge(); } catch (e) { }
    }

    function teardown() {
        document.documentElement.removeAttribute(APPLIED_ATTR);
        document.removeEventListener('dragenter', onDragEnter, false);
        document.removeEventListener('dragover', onDragOver, false);
        document.removeEventListener('dragleave', onDragLeave, false);
        document.removeEventListener('drop', onDrop, false);
        dragDepth = 0;
        removeOverlay();
        clearTreeHighlight();
        hideProgress();
    }

    function hasFiles(e) {
        if (!e.dataTransfer) return false;
        const types = e.dataTransfer.types;
        if (!types) return false;
        return Array.prototype.includes.call(types, 'Files');
    }

    let dragDepth = 0;
    let lastFolderNode = null;

    function onDragEnter(e) {
        if (!enabled || !hasFiles(e)) return;
        e.preventDefault();
        dragDepth++;
        showOverlay();
    }
    function onDragOver(e) {
        if (!enabled || !hasFiles(e)) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        const node = findFolderNode(e.target);
        if (node !== lastFolderNode) {
            if (lastFolderNode) lastFolderNode.classList.remove('nsft-fcdd-drop-target');
            lastFolderNode = node;
            if (node) {
                node.classList.add('nsft-fcdd-drop-target');
                updateOverlayTargetLabel(extractFolderName(node));
            } else {
                updateOverlayTargetLabel(null);
            }
        }
    }
    function onDragLeave(e) {
        if (!enabled || !hasFiles(e)) return;
        dragDepth = Math.max(0, dragDepth - 1);
        const outside = !e.relatedTarget || !document.contains(e.relatedTarget);
        if (dragDepth === 0 || outside) {
            dragDepth = 0;
            removeOverlay();
            clearTreeHighlight();
        }
    }
    function onDrop(e) {
        if (!enabled || !hasFiles(e)) return;
        e.preventDefault();
        dragDepth = 0;
        const files = Array.from(e.dataTransfer.files || []);
        const treeFolderId = findFolderNode(e.target) ? extractFolderId(findFolderNode(e.target)) : null;
        removeOverlay();
        clearTreeHighlight();
        if (!files.length) return;
        avisarSiPisa(files, treeFolderId);
    }


    const CHOQUE_MAX_ARCHIVOS = 200;
    const CHOQUE_TIMEOUT_MS = 4000;

    let _puenteListo = false;
    let _fetcherListo = false;
    let _choqueToken = 0;
    const _choquePendiente = new Map();
    const _colaPreguntas = [];

    function avisarSiPisa(files, treeFolderId) {
        const folderId = treeFolderId != null ? treeFolderId : getTargetFolderId();
        const seguir = (motivo) => {
            if (motivo) console.warn('NSFT: fcdd — subiendo sin comprobar repetidos (' + motivo + ')');
            uploadFiles(files, folderId);
        };

        if (folderId == null || !/^-?\d+$/.test(String(folderId))) { seguir('carpeta desconocida'); return; }
        if (files.length > CHOQUE_MAX_ARCHIVOS) { seguir('mas de ' + CHOQUE_MAX_ARCHIVOS + ' archivos'); return; }

        pedirNombresQueYaEstan(folderId, files.map(f => f.name), (err, existentes) => {
            if (err) { seguir(err.code || 'error de consulta'); return; }
            if (!existentes || !existentes.length) { seguir(); return; }
            const porNombre = new Map();
            existentes.forEach(e => { if (e && e.name) porNombre.set(e.name, e.id || null); });
            const chocan = files.filter(f => porNombre.has(f.name));
            if (!chocan.length) { seguir(); return; }
            mostrarChoques(files, chocan, folderId, porNombre);
        });
    }

    function pedirNombresQueYaEstan(folderId, names, cb) {
        try {
            ensureBridge();
        } catch (e) { cb({ code: 'bridge' }, null); return; }

        const token = ++_choqueToken;
        const timer = setTimeout(() => {
            if (!_choquePendiente.has(token)) return;
            _choquePendiente.delete(token);
            cb({ code: 'timeout' }, null);
        }, CHOQUE_TIMEOUT_MS);

        _choquePendiente.set(token, (err, nombres) => {
            clearTimeout(timer);
            cb(err, nombres);
        });

        const enviar = () => window.postMessage({
            dest: 'fetcher_fcdd',
            type: 'existingNames',
            payload: { token: token, folderId: String(folderId), names: names }
        }, '*');

        if (_fetcherListo) enviar();
        else _colaPreguntas.push(enviar);
    }

    function ensureBridge() {
        if (_puenteListo) return;
        _puenteListo = true;
        if (window.NSFT_SuiteQLRest && window.NSFT_SuiteQLRest.ensureTransport) {
            window.NSFT_SuiteQLRest.ensureTransport();
        }
        if (!document.getElementById('nsft-diff-mw')) {
            const d = document.createElement('script');
            d.id = 'nsft-diff-mw';
            d.async = false;
            d.src = chrome.runtime.getURL('scripts/modules/_shared/nsft_diff.js');
            d.onload = function () { this.remove(); };
            (document.head || document.documentElement).appendChild(d);
        }
        const s = document.createElement('script');
        s.id = 'nsft-fcdd-fetcher';
        s.async = false;
        s.src = chrome.runtime.getURL('scripts/modules/file_cabinet_drag_drop/file_cabinet_drag_drop_fetcher.js');
        s.onload = function () { this.remove(); };
        (document.head || document.documentElement).appendChild(s);
    }

    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        const d = event.data;
        if (!d || d.dest !== 'extension_fcdd') return;
        if (d.type === 'ready') {
            _fetcherListo = true;
            while (_colaPreguntas.length) _colaPreguntas.shift()();
            return;
        }
        if (d.type === 'diffClosed') {
            const b = _diffAbiertos.get((d.payload || {}).token);
            if (b) { b.disabled = false; _diffAbiertos.delete(d.payload.token); }
            return;
        }
        if (d.type !== 'existingNames') return;
        const p = d.payload || {};
        const cb = _choquePendiente.get(p.token);
        if (!cb) return;
        _choquePendiente.delete(p.token);
        if (p.error) cb({ code: p.error }, null);
        else cb(null, Array.isArray(p.names) ? p.names : []);
    });

    const EXT_TEXTO = new Set(['js', 'ts', 'json', 'xml', 'txt', 'html', 'htm', 'css',
        'sdf', 'csv', 'md', 'sql', 'ftl', 'xsl', 'xslt', 'yaml', 'yml', 'svg', 'log']);
    function esTexto(nombre) {
        const m = String(nombre || '').match(/\.([^.]+)$/);
        return !!(m && EXT_TEXTO.has(m[1].toLowerCase()));
    }

    let _diffToken = 0;
    const _diffAbiertos = new Map();

    function verDiferencias(file, fileId, boton) {
        if (!window.NSFT_Diff && !_fetcherListo) return;
        boton.disabled = true;
        const token = ++_diffToken;
        _diffAbiertos.set(token, boton);
        file.text().then((texto) => {
            window.postMessage({
                dest: 'fetcher_fcdd',
                type: 'showDiff',
                payload: {
                    token: token,
                    fileId: fileId,
                    fileName: file.name,
                    newContent: texto,
                    theme: resolveTheme(),
                    labels: {
                        Title: chrome.i18n.getMessage('fcdd_diff_title') || 'Differences',
                        Subtitle: chrome.i18n.getMessage('fcdd_diff_subtitle')
                            || 'On the left, the file already in the folder. On the right, the one you dropped.',
                        Left: chrome.i18n.getMessage('fcdd_diff_left') || 'In the folder',
                        Right: chrome.i18n.getMessage('fcdd_diff_right') || 'Dropped',
                        Confirm: chrome.i18n.getMessage('fcdd_diff_close') || 'Close',
                        NoChanges: chrome.i18n.getMessage('fcdd_diff_same') || 'They are identical: replacing it changes nothing.',
                        TooLarge: chrome.i18n.getMessage('fcdd_diff_big') || 'File too large to compare in full. Only the first 5000 lines are shown.',
                        LoadFailed: chrome.i18n.getMessage('fcdd_diff_failed') || 'Could not read the file already in the folder. Only the dropped one is shown.',
                        lines: chrome.i18n.getMessage('fcdd_diff_lines') || 'lines',
                        chars: chrome.i18n.getMessage('fcdd_diff_chars') || 'characters'
                    }
                }
            }, '*');
        }).catch(() => {
            _diffAbiertos.delete(token);
            boton.disabled = false;
        });
    }

    function mostrarChoques(files, chocan, folderId, porNombre) {
        const nuevos = files.filter(f => chocan.indexOf(f) === -1);
        const modal = document.createElement('div');
        modal.className = 'nsft-fcdd-modal is-warn';
        modal.setAttribute('data-theme', resolveTheme());

        const tpl = chrome.i18n.getMessage('fcdd_dup_title', [String(chocan.length)])
            || (chocan.length + ' file(s) already exist in this folder');
        const aviso = chrome.i18n.getMessage('fcdd_dup_warn')
            || 'Uploading them will replace the files that are already there.';
        const verTxt = chrome.i18n.getMessage('fcdd_diff_see') || 'See differences';
        const filas = chocan.map((f, i) => {
            const id = porNombre ? porNombre.get(f.name) : null;
            const puede = !!id && esTexto(f.name);
            return '<li><strong>' + escapeHtml(f.name) + '</strong>' +
                (puede
                    ? ' <button type="button" class="nsft-fcdd-diff-link" data-i="' + i + '">' + escapeHtml(verTxt) + '</button>'
                    : '') +
                '</li>';
        }).join('');
        const restantes = nuevos.length
            ? '<div class="nsft-fcdd-warn-summary">' + escapeHtml(
                chrome.i18n.getMessage('fcdd_dup_rest', [String(nuevos.length)])
                || (nuevos.length + ' more file(s) are new')) + '</div>'
            : '';

        modal.innerHTML =
            '<div class="nsft-fcdd-modal-box">' +
                '<div class="nsft-fcdd-modal-head">' +
                    '<span>\u26A0 ' + escapeHtml(tpl) + '</span>' +
                    '<button type="button" class="nsft-fcdd-modal-close" aria-label="Close">\u00D7</button>' +
                '</div>' +
                '<div class="nsft-fcdd-warn-lead">' + escapeHtml(aviso) + '</div>' +
                restantes +
                '<ul class="nsft-fcdd-err-list">' + filas + '</ul>' +
                '<div class="nsft-fcdd-modal-foot">' +
                    '<button type="button" class="nsft-fcdd-modal-btn nsft-fcdd-modal-dismiss nsft-fcdd-dup-cancel">' +
                        escapeHtml(chrome.i18n.getMessage('fcdd_dup_cancel') || 'Cancel') + '</button>' +
                    (nuevos.length
                        ? '<button type="button" class="nsft-fcdd-modal-btn nsft-fcdd-modal-dismiss nsft-fcdd-dup-skip">' +
                            escapeHtml(chrome.i18n.getMessage('fcdd_dup_skip') || 'Skip the duplicates') + '</button>'
                        : '') +
                    '<button type="button" class="nsft-fcdd-modal-btn nsft-fcdd-modal-reload nsft-fcdd-dup-go">' +
                        escapeHtml(chrome.i18n.getMessage('fcdd_dup_go') || 'Upload anyway') + '</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(modal);
        const cerrar = () => modal.remove();
        modal.querySelector('.nsft-fcdd-modal-close').onclick = cerrar;
        modal.querySelector('.nsft-fcdd-dup-cancel').onclick = cerrar;
        modal.querySelector('.nsft-fcdd-dup-go').onclick = () => { cerrar(); uploadFiles(files, folderId); };
        const skip = modal.querySelector('.nsft-fcdd-dup-skip');
        if (skip) skip.onclick = () => { cerrar(); uploadFiles(nuevos, folderId); };
        modal.querySelectorAll('.nsft-fcdd-diff-link').forEach((b) => {
            b.onclick = () => {
                const f = chocan[Number(b.getAttribute('data-i'))];
                if (f) verDiferencias(f, porNombre.get(f.name), b);
            };
        });
    }

    function findFolderNode(el) {
        if (!el || !el.closest) return null;
        return el.closest('a[href*="folder="], a[onclick*="showFolderContents"]');
    }

    function extractFolderId(node) {
        if (!node) return null;
        const href = node.getAttribute('href') || '';
        const m = href.match(/[?&]folder=(-?\d+)/) || href.match(/^(-?\d+)\?folder=/);
        if (m) return m[1];
        const onclick = node.getAttribute('onclick') || '';
        const m2 = onclick.match(/showFolderContents\s*\(\s*(-?\d+)/);
        if (m2) return m2[1];
        return null;
    }

    function extractFolderName(node) {
        if (!node) return null;
        return (node.textContent || '').trim() || null;
    }

    function clearTreeHighlight() {
        document.querySelectorAll('.nsft-fcdd-drop-target').forEach(el => el.classList.remove('nsft-fcdd-drop-target'));
        lastFolderNode = null;
    }

    function updateOverlayTargetLabel(folderName) {
        const sub = document.querySelector('#' + OVERLAY_ID + ' .nsft-fcdd-sub');
        if (!sub) return;
        if (folderName) {
            sub.textContent = (chrome.i18n.getMessage('fcdd_drop_into') || 'Uploading to') + ': ' + folderName;
            sub.classList.add('nsft-fcdd-sub-target');
        } else {
            sub.textContent = chrome.i18n.getMessage('fcdd_drop_sub') || 'Files will be uploaded to the current folder';
            sub.classList.remove('nsft-fcdd-sub-target');
        }
    }

    function showOverlay() {
        if (document.getElementById(OVERLAY_ID)) return;
        const ov = document.createElement('div');
        ov.id = OVERLAY_ID;
        ov.innerHTML = '<div class="nsft-fcdd-message">' +
            '<div class="nsft-fcdd-icon">⇩</div>' +
            '<div class="nsft-fcdd-title">' + (chrome.i18n.getMessage('fcdd_drop_title') || 'Drop to upload') + '</div>' +
            '<div class="nsft-fcdd-sub">' + (chrome.i18n.getMessage('fcdd_drop_sub') || 'Files will be uploaded to the current folder') + '</div>' +
        '</div>';
        document.body.appendChild(ov);
    }

    function removeOverlay() {
        const ov = document.getElementById(OVERLAY_ID);
        if (ov) ov.remove();
    }

    function getTargetFolderId() {
        try {
            const input = document.getElementById('folder');
            const v = input && input.value != null ? String(input.value).trim() : '';
            if (/^-?\d+$/.test(v)) return v;
        } catch (e) { }
        try {
            const q = new URLSearchParams(location.search);
            const f = q.get('folder');
            if (f && /^-?\d+$/.test(f)) return f;
        } catch (e) { }
        return null;
    }

    function reloadIntoFolder(folderId) {
        if (folderId == null || !/^-?\d+$/.test(String(folderId))) { location.reload(); return; }
        location.href = LIST_URL + '?folder=' + encodeURIComponent(folderId);
    }

    function getActionForm() {
        return document.querySelector('form[name="footer_actions_form"]');
    }

    async function preguntasZip(files) {
        const ops = new Map();
        for (const file of files) {
            if (!isZip(file)) continue;
            const extraer = await preguntar(
                file.name,
                chrome.i18n.getMessage('fcdd_zip_extract') || 'Would you like to extract this zip file here?');
            if (!extraer) continue;
            const pisar = await preguntar(
                file.name,
                chrome.i18n.getMessage('fcdd_zip_overwrite') || 'Would you like to overwrite any existing files?');
            ops.set(file, { unzip: true, overwrite: !!pisar });
        }
        return ops;
    }

    function preguntar(titulo, cuerpo) {
        if (window.NSFT_Dialog) return window.NSFT_Dialog.confirm({ title: titulo, body: cuerpo });
        return Promise.resolve(window.confirm(
            titulo + '\n\n' + cuerpo + '\n\n' +
            (chrome.i18n.getMessage('fcdd_yes_no') || 'OK = Yes\nCancel = No')));
    }

    function uploadFiles(files, overrideFolderId) {
        preguntasZip(files).then((zipOps) => enviarArchivos(files, overrideFolderId, zipOps));
    }

    function enviarArchivos(files, overrideFolderId, zipOps) {
        const folderId = overrideFolderId != null ? overrideFolderId : getTargetFolderId();
        const destino = folderId;
        const form = getActionForm();
        if (!form) {
            notify('No upload form found on this page. Open a folder view first.', true);
            return;
        }
        const actionUrl = form.getAttribute('action') || form.action;
        if (!actionUrl) {
            notify('Upload form has no action URL.', true);
            return;
        }

        showProgress(files.length);

        const loaded = new Array(files.length).fill(0);
        const totals = new Array(files.length).fill(0);
        const results = new Array(files.length).fill(null);

        const promises = files.map((file, i) => new Promise((resolve) => {
            const fd = new FormData(form);
            let fileToSend = file;
            if (file.type === 'video/vnd.dlna.mpeg-tts') {
                fileToSend = new File([file], file.name, { type: 'text/x-typescript' });
            }
            fd.set('mediafile', fileToSend);
            if (folderId != null) fd.set('folder', folderId);

            const op = zipOps && zipOps.get(file);
            if (op && op.unzip) {
                fd.set('unzip', 'T');
                fd.set('overwrite', op.overwrite ? 'T' : 'F');
            }

            const xhr = new XMLHttpRequest();
            xhr.open('POST', actionUrl);
            xhr.upload.addEventListener('progress', (ev) => {
                if (!ev.lengthComputable) return;
                loaded[i] = ev.loaded;
                totals[i] = ev.total;
                updateProgress(loaded, totals);
            });
            xhr.onload = () => {
                const body = xhr.response || xhr.responseText || '';
                const detail = extractErrorDetail(body);
                if (detail) {
                    results[i] = { name: file.name, ok: false, err: detail };
                } else {
                    results[i] = { name: file.name, ok: true };
                }
                resolve();
            };
            xhr.onerror = () => {
                results[i] = { name: file.name, ok: false, err: chrome.i18n.getMessage('fcdd_err_network') || 'Network error' };
                resolve();
            };
            xhr.send(fd);
        }));

        Promise.all(promises).then(() => {
            const okList = results.filter(r => r && r.ok);
            const errList = results.filter(r => r && !r.ok);
            hideProgress();
            if (errList.length === 0) {
                notify(
                    okList.length + ' ' + (chrome.i18n.getMessage('fcdd_ok_msg') || 'file(s) uploaded. Reloading…'),
                    false
                );
                setTimeout(() => reloadIntoFolder(destino), 600);
            } else {
                showErrorList(okList.length, errList, destino);
            }
        });
    }

    function extractErrorDetail(body) {
        if (!body) return null;
        if (/class="[^"]*uir-error-page-message/.test(body)) {
            try {
                const doc = new DOMParser().parseFromString(body, 'text/html');
                const el = doc.querySelector('.uir-error-page-message');
                const txt = (el && el.textContent || '').trim();
                if (txt) return txt;
            } catch (e) { }
            return chrome.i18n.getMessage('fcdd_err_netsuite') || 'NetSuite returned an error';
        }
        if (/<onlineError>/i.test(body)) {
            try {
                const doc = new DOMParser().parseFromString(body, 'text/xml');
                const detail = doc.querySelector('detail');
                if (detail && detail.textContent.trim()) return detail.textContent.trim();
            } catch (e) { }
        }
        return null;
    }

    function showErrorList(okCount, errList, folderId) {
        const modal = document.createElement('div');
        modal.className = 'nsft-fcdd-modal';
        modal.setAttribute('data-theme', resolveTheme());
        const okMsg = okCount > 0
            ? '<div class="nsft-fcdd-ok-summary">✔ ' + okCount + ' ' + (chrome.i18n.getMessage('fcdd_ok_partial') || 'uploaded successfully') + '</div>'
            : '';
        const errRows = errList.map(r =>
            '<li><strong>' + escapeHtml(r.name) + '</strong>: ' + escapeHtml(r.err || 'Error') + '</li>'
        ).join('');
        modal.innerHTML =
            '<div class="nsft-fcdd-modal-box">' +
                '<div class="nsft-fcdd-modal-head">' +
                    '<span>⚠ ' + errList.length + ' ' + (chrome.i18n.getMessage('fcdd_err_title') || 'file(s) failed to upload') + '</span>' +
                    '<button type="button" class="nsft-fcdd-modal-close" aria-label="Close">×</button>' +
                '</div>' +
                okMsg +
                '<ul class="nsft-fcdd-err-list">' + errRows + '</ul>' +
                '<div class="nsft-fcdd-modal-foot">' +
                    '<button type="button" class="nsft-fcdd-modal-btn nsft-fcdd-modal-reload">' + (chrome.i18n.getMessage('fcdd_reload') || 'Reload') + '</button>' +
                    '<button type="button" class="nsft-fcdd-modal-btn nsft-fcdd-modal-dismiss">' + (chrome.i18n.getMessage('fcdd_dismiss') || 'Dismiss') + '</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(modal);
        modal.querySelector('.nsft-fcdd-modal-close').onclick = () => modal.remove();
        modal.querySelector('.nsft-fcdd-modal-dismiss').onclick = () => modal.remove();
        modal.querySelector('.nsft-fcdd-modal-reload').onclick = () => reloadIntoFolder(folderId);
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function isZip(file) {
        if (!file) return false;
        if (file.type === 'application/x-zip-compressed' || file.type === 'application/zip') return true;
        return /\.zip$/i.test(file.name || '');
    }

    function showProgress(n) {
        hideProgress();
        const bar = document.createElement('div');
        bar.id = PROGRESS_ID;
        bar.setAttribute('data-theme', resolveTheme());
        bar.innerHTML =
            '<div class="nsft-fcdd-prog-head">' +
                '<span class="nsft-fcdd-prog-title">' +
                (chrome.i18n.getMessage('fcdd_uploading') || 'Uploading') +
                ' ' + n + ' file' + (n === 1 ? '' : 's') + '</span>' +
                '<span class="nsft-fcdd-prog-pct">0%</span>' +
            '</div>' +
            '<div class="nsft-fcdd-prog-track"><div class="nsft-fcdd-prog-fill"></div></div>';
        document.body.appendChild(bar);
    }

    function updateProgress(loaded, totals) {
        const sum = loaded.reduce((a, b) => a + b, 0);
        const tot = totals.reduce((a, b) => a + b, 0) || 1;
        const pct = Math.min(99, Math.floor(sum / tot * 100));
        const pctEl = document.querySelector('#' + PROGRESS_ID + ' .nsft-fcdd-prog-pct');
        const fillEl = document.querySelector('#' + PROGRESS_ID + ' .nsft-fcdd-prog-fill');
        if (pctEl) pctEl.textContent = pct + '%';
        if (fillEl) fillEl.style.width = pct + '%';
    }

    function hideProgress() {
        const b = document.getElementById(PROGRESS_ID);
        if (b) b.remove();
    }

    function notify(msg, isError) {
        const n = document.createElement('div');
        n.className = 'nsft-fcdd-notify' + (isError ? ' nsft-fcdd-err' : '');
        n.setAttribute('data-theme', resolveTheme());
        n.textContent = msg;
        document.body.appendChild(n);
        setTimeout(() => n.remove(), 4000);
    }
})();
