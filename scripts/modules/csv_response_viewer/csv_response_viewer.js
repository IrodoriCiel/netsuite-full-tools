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
        MINIMISE: 'nsft-csv-response-minimise',
        FULLSCREEN: 'nsft-csv-response-fullscreen',
        MAXIMISE: 'nsft-csv-response-maximise',
        CLOSE: 'nsft-csv-response-close',
        CONTENT: 'nsft-csv-response-content',
        FOOTER: 'nsft-csv-response-footer',
        REFRESH: 'nsft-csv-response-refresh',
        DL_ALL: 'nsft-csv-response-download',
        DL_ERR: 'nsft-csv-response-download-errors'
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

    const vista = {
        fileId: '',
        meta: {},
        header: [],
        records: [],
        errIdx: -1,
        boolCols: {},
        errRecs: [],
        okRecs: [],
        tab: 'all',
        q: '',
        delimiter: ',',
        prosa: '',
        fallo: false,
        cargando: false
    };

    const TS = window.NSFT_TextSearch || null;
    const HL_CLASS = 'nsft-csvrv-hl';

    const t = (k, f, sus) => {
        try { return chrome.i18n.getMessage(k, sus) || f; } catch (e) { return f; }
    };

    const ICONOS = {
        database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
        file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/>',
        user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
        calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/>',
        gauge: '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
        columns: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/>',
        ok: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
        fail: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
        warn: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
        search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
        upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
        download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
        fileWarn: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
        refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
        x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'
    };
    function icono(n) {
        return '<svg class="nsft-csvrv-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
            + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONOS[n] + '</svg>';
    }

    function restoreMaximised(modal) {
        if (!modal) return;
        modal.dataset.state = 'maximised';
        modal.style.top = state.lastMaxTop;
        modal.style.left = state.lastMaxLeft;
        modal.style.right = 'auto';
        modal.style.bottom = 'auto';
    }

    chrome.storage.local.get({ [STORAGE_KEY]: true, nsftTheme: 'light' }, (settings) => {
        state.theme = settings.nsftTheme === 'dark' ? 'dark' : 'light';
        if (settings[STORAGE_KEY]) start();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;

        if (changes.nsftTheme) {
            state.theme = changes.nsftTheme.newValue === 'dark' ? 'dark' : 'light';
            const modal = document.getElementById(IDS.MODAL);
            if (modal) modal.dataset.theme = state.theme;
        }

        if (!changes[STORAGE_KEY]) return;
        if (changes[STORAGE_KEY].newValue !== false) start();
        else stop();
    });

    function start() {
        if (state.built) return;

        if (typeof Papa === 'undefined') {
            const msg = t('csvRvUnavailable', 'CSV viewer unavailable (library not loaded).');
            if (window.NSFT_Clipboard) NSFT_Clipboard.showToast(msg, { type: 'error' });
            return;
        }

        const titleText = t('csvRvTitle', 'CSV Response');

        const TITLE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9.5h18"/><path d="M9 9.5V20"/></svg>';

        const minLabel = t('modalMinimise', 'Minimise');
        const maxLabel = t('modalMaximise', 'Maximise');
        const fsLabel = t('sql_fullscreen_enter', 'Fullscreen');
        const closeLabel = t('closeModal', 'Close');
        const clearLabel = t('sql_find_clear', 'Clear search');

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
                <div class="nsft-csv-response-content" id="${IDS.CONTENT}">
                    <div class="nsft-csvrv-top">
                        <div class="nsft-csvrv-meta"></div>
                        <div class="nsft-csvrv-banner" hidden>
                            <div class="nsft-csvrv-txt">
                                <div class="nsft-csvrv-headline"></div>
                                <div class="nsft-csvrv-groups"></div>
                            </div>
                            <div class="nsft-csvrv-stats"></div>
                        </div>
                        <div class="nsft-csvrv-bar" hidden>
                            <div class="nsft-csvrv-tabs" role="tablist"></div>
                            <div class="nsft-csvrv-tools">
                                <div class="nsft-csvrv-search">
                                    ${icono('search')}
                                    <input class="nsft-csvrv-q" autocomplete="off" spellcheck="false"
                                           placeholder="${escapeAttr(t('csvRvSearchPh', 'Search all fields'))}">
                                    <button type="button" class="nsft-csvrv-clear" aria-label="${escapeAttr(clearLabel)}" title="${escapeAttr(clearLabel)}">${icono('x')}</button>
                                </div>
                                <label class="nsft-csvrv-upload" title="${escapeAttr(t('csvRvUploadTitle', 'Open a CSV from your computer in this viewer'))}">
                                    ${icono('upload')}<span>${escapeHtml(t('csvRvUpload', 'Load CSV'))}</span>
                                    <input type="file" accept=".csv,text/csv">
                                </label>
                            </div>
                        </div>
                    </div>
                    <div class="nsft-csvrv-body">
                        <div class="nsft-csvrv-loading" hidden></div>
                        <div class="nsft-csvrv-tablewrap" hidden>
                            <table class="nsft-csvrv-table"><thead><tr></tr></thead><tbody></tbody></table>
                            <div class="nsft-csvrv-empty" hidden></div>
                        </div>
                        <div class="nsft-csvrv-note" hidden></div>
                    </div>
                </div>
                <div class="nsft-csv-response-footer" id="${IDS.FOOTER}">
                    <button type="button" id="${IDS.REFRESH}" class="nsft-csvrv-btn is-ghost">${icono('refresh')}<span>${escapeHtml(t('csvRvRefresh', 'Refresh'))}</span></button>
                    <span class="nsft-csvrv-foot-right">
                        <button type="button" id="${IDS.DL_ALL}" class="nsft-csvrv-btn is-sec">${icono('download')}<span>${escapeHtml(t('csvRvDlAll', 'Download full CSV'))}</span></button>
                        <button type="button" id="${IDS.DL_ERR}" class="nsft-csvrv-btn is-pri" hidden>${icono('fileWarn')}<span></span></button>
                    </span>
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

        cableaContenido();

        state.modalKeyHandler = handleModalKeydown;
        document.getElementById(IDS.MODAL).addEventListener('keydown', state.modalKeyHandler);

        state.built = true;

        bindCsvLinks();
        if (window.NSFT_Observer) {
            state.unsubscribe = NSFT_Observer.subscribe(bindCsvLinks, { throttle: 250 });
        }
    }

    function cableaContenido() {
        const modal = document.getElementById(IDS.MODAL);

        modal.querySelector('.nsft-csvrv-tabs').addEventListener('click', (e) => {
            const b = e.target.closest('button[data-tab]');
            if (!b) return;
            vista.tab = b.dataset.tab;
            pintaPestanas();
            pintaTabla();
        });

        const caja = modal.querySelector('.nsft-csvrv-search');
        const q = modal.querySelector('.nsft-csvrv-q');
        q.addEventListener('input', () => {
            vista.q = q.value;
            caja.classList.toggle('has-query', !!q.value);
            pintaTabla();
        });
        q.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape' || !q.value) return;
            e.preventDefault();
            e.stopPropagation();
            limpiaBusqueda();
        });
        modal.querySelector('.nsft-csvrv-clear').addEventListener('click', () => {
            limpiaBusqueda();
            q.focus();
        });

        const archivo = modal.querySelector('.nsft-csvrv-upload input');
        archivo.addEventListener('change', () => {
            const f = archivo.files && archivo.files[0];
            archivo.value = '';
            if (!f) return;
            const rd = new FileReader();
            rd.onload = () => {
                vista.meta = { archivo: f.name };
                vista.tab = 'all';
                cargaTexto(String(rd.result || ''));
            };
            rd.onerror = () => avisa(t('csvRvLoadError', 'The file could not be read.'));
            rd.readAsText(f, 'utf-8');
        });

        modal.querySelector('.nsft-csvrv-table tbody').addEventListener('dblclick', (e) => {
            const td = e.target.closest('td[data-c]');
            if (td) editaCelda(td);
        });

        document.getElementById(IDS.REFRESH).addEventListener('click', actualiza);
        document.getElementById(IDS.DL_ALL).addEventListener('click', () => descarga(false));
        document.getElementById(IDS.DL_ERR).addEventListener('click', () => descarga(true));
    }

    function limpiaBusqueda() {
        const modal = document.getElementById(IDS.MODAL);
        const q = modal.querySelector('.nsft-csvrv-q');
        q.value = '';
        vista.q = '';
        modal.querySelector('.nsft-csvrv-search').classList.remove('has-query');
        pintaTabla();
    }

    function avisa(msg) {
        if (window.NSFT_Dialog) window.NSFT_Dialog.alert({ body: msg });
        else alert(msg);
    }

    function bindCsvLinks() {
        const viewText = t('csvRvView', 'View');
        const downloadText = t('csvRvDownload', 'Download');
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
        if (vista.fileId === fileId) return;

        vista.fileId = fileId;
        vista.meta = datosDeFila(viewLink);
        vista.tab = 'all';
        if (vista.q) limpiaBusqueda();

        const prefijo = t('csvRvTitle', 'CSV Response');
        const m = vista.meta;
        const partes = [prefijo, m.tipo, m.archivo, m.usuario, m.fecha, m.progreso].filter(Boolean);
        const tituloEl = modal.querySelector(`#${IDS.TITLE} > span`) || modal.querySelector(`#${IDS.TITLE}`);
        tituloEl.textContent = partes.join(' - ');

        trae();
    }

    function datosDeFila(linkEl) {
        const tr = linkEl.closest('tr');
        const tds = tr ? Array.from(tr.cells) : [];
        const tabla = tr && tr.closest('table');
        const cab = tabla && (tabla.querySelector('tr.uir-list-headerrow') || tabla.rows[0]);
        const nombres = (cab && cab !== tr) ? Array.from(cab.cells).map((c) => limpia(c.textContent)) : [];
        const valor = (i) => (i >= 0 && tds[i]) ? limpia(tds[i].textContent) : '';
        const col = (re) => nombres.findIndex((n) => re.test(n));
        const busca = (...res) => {
            for (const re of res) {
                const i = col(re);
                if (i >= 0) return valor(i);
            }
            return '';
        };
        const conCabecera = nombres.length > 0;
        return {
            fecha: busca(/^(fecha|date)/i) || (conCabecera ? '' : valor(0)),
            archivo: busca(/(trabajo|job)/i, /(archivo|file)/i) || (conCabecera ? '' : valor(1)),
            tipo: busca(/(tipo de registro|record type)/i),
            usuario: busca(/(usuario|user|enviado por|submitted|creado por|created by)/i),
            progreso: busca(/(porcentaje|percent|progreso|progress|complet)/i) || (conCabecera ? '' : valor(3))
        };
    }

    function limpia(s) {
        return String(s || '').replace(/\s+/g, ' ').trim();
    }

    function trae() {
        vista.cargando = true;
        pinta();
        fetch(`/app/setup/upload/csv/uploadlogcsv.nl?wqid=${encodeURIComponent(vista.fileId)}`)
            .then((response) => response.text())
            .then((texto) => cargaTexto(texto))
            .catch(() => {
                vista.cargando = false;
                vista.fallo = true;
                vista.prosa = t('csvRvLoadError', 'The file could not be read.');
                vista.header = [];
                vista.records = [];
                pinta();
            });
    }

    function cargaTexto(texto) {
        vista.cargando = false;
        vista.fallo = false;
        const csv = Papa.parse(texto);
        vista.delimiter = (csv.meta && csv.meta.delimiter) || ',';
        const filas = (csv.data || []).filter((f) => Array.isArray(f) && f.some((v) => String(v).trim() !== ''));

        if (!(filas.length > 0 && filas[0].length > 1)) {
            vista.prosa = texto.trim() || t('csvRvSuccess', 'All records imported successfully.');
            vista.header = [];
            vista.records = [];
            pinta();
            return;
        }
        vista.prosa = '';

        let ancho = Math.max(...filas.map((f) => f.length));
        while (ancho > 1 && filas.every((f) => String(f[ancho - 1] == null ? '' : f[ancho - 1]).trim() === '')) ancho--;

        const header = filas[0].slice(0, ancho).map((h) => String(h == null ? '' : h));
        vista.header = header;
        vista.records = filas.slice(1).map((f, i) => ({
            i: i,
            n: i + 2,
            v: header.map((_, j) => String(f[j] == null ? '' : f[j]))
        }));
        vista.errIdx = header.findIndex((h) => /^\s*(error(es)?|mensaje de error|error message)\s*$/i.test(h));
        if (vista.errIdx < 0 && /error/i.test(header[0] || '')) vista.errIdx = 0;
        pinta();
    }

    function deriva() {
        const hayError = vista.errIdx >= 0;
        const esError = (r) => hayError && r.v[vista.errIdx].trim() !== '';
        vista.errRecs = vista.records.filter(esError);
        vista.okRecs = vista.records.filter((r) => !esError(r));
        vista.boolCols = {};
        columnas().forEach((i) => {
            const vals = vista.records.map((r) => r.v[i].trim()).filter(Boolean);
            if (vals.length && vals.every((v) => /^(t|f|true|false)$/i.test(v))) vista.boolCols[i] = true;
        });
    }

    function columnas() {
        return vista.header.map((_, i) => i).filter((i) => i !== vista.errIdx);
    }


    function pinta() {
        const modal = document.getElementById(IDS.MODAL);
        if (!modal) return;
        const hayTabla = !vista.cargando && !vista.prosa && vista.header.length > 0;
        if (hayTabla) deriva();

        pintaMeta(modal, hayTabla);

        const cargando = modal.querySelector('.nsft-csvrv-loading');
        cargando.hidden = !vista.cargando;
        cargando.textContent = vista.cargando ? t('csvRvLoading', 'Loading...') : '';

        pintaFranja(modal, hayTabla);
        modal.querySelector('.nsft-csvrv-bar').hidden = !hayTabla;
        modal.querySelector('.nsft-csvrv-tablewrap').hidden = !hayTabla;
        modal.querySelector('.nsft-csvrv-note').hidden = !hayTabla;

        document.getElementById(IDS.DL_ALL).hidden = !hayTabla;
        if (!hayTabla) {
            document.getElementById(IDS.DL_ERR).hidden = true;
            return;
        }
        pintaPestanas();
        pintaTabla();
    }

    function pintaMeta(modal, hayTabla) {
        const m = vista.meta;
        const items = [
            ['database', t('csvRvMetaRecordType', 'Record type'), m.tipo, false, false],
            ['file', t('csvRvMetaFile', 'File'), m.archivo, true, true],
            ['user', t('csvRvMetaUser', 'User'), m.usuario, false, false],
            ['calendar', t('csvRvMetaDate', 'Date'), m.fecha, false, false],
            ['gauge', t('csvRvMetaProgress', 'Progress'), m.progreso, false, false],
            ['columns', t('csvRvMetaColumns', 'Columns'), hayTabla ? String(columnas().length) : '', false, false]
        ].filter((it) => it[2]);
        const meta = modal.querySelector('.nsft-csvrv-meta');
        meta.hidden = !items.length;
        meta.innerHTML = items.map(([ico, label, val, ancho, mono]) =>
            '<div class="nsft-csvrv-mitem' + (ancho ? ' is-wide' : '') + '">'
            + '<span class="nsft-csvrv-mlabel">' + icono(ico) + escapeHtml(label) + '</span>'
            + '<span class="nsft-csvrv-mval' + (mono ? ' is-mono' : '') + '">' + escapeHtml(val) + '</span></div>'
        ).join('');
    }

    function pintaFranja(modal, hayTabla) {
        const franja = modal.querySelector('.nsft-csvrv-banner');
        const titular = modal.querySelector('.nsft-csvrv-headline');
        const grupos = modal.querySelector('.nsft-csvrv-groups');
        const stats = modal.querySelector('.nsft-csvrv-stats');

        if (vista.cargando) { franja.hidden = true; return; }
        franja.hidden = false;

        if (!hayTabla) {
            franja.dataset.estado = vista.fallo ? 'fail' : 'ok';
            titular.innerHTML = icono(vista.fallo ? 'fail' : 'ok') + '<span>' + escapeHtml(vista.prosa) + '</span>';
            grupos.innerHTML = '';
            stats.innerHTML = '';
            return;
        }

        if (vista.errIdx < 0) { franja.hidden = true; return; }

        const total = vista.records.length;
        const errores = vista.errRecs.length;
        const bien = vista.okRecs.length;
        let estado, ico, texto;
        if (errores === 0) {
            estado = 'ok'; ico = 'ok';
            texto = t('csvRvBannerOk', 'Import complete: $1 of $2 records imported', [String(bien), String(total)]);
        } else if (bien === 0) {
            estado = 'fail'; ico = 'fail';
            texto = t('csvRvBannerFail', 'The import did not complete: 0 of $1 records imported', [String(total)]);
        } else {
            estado = 'warn'; ico = 'warn';
            texto = t('csvRvBannerPartial', 'Partial import: $1 of $2 records imported', [String(bien), String(total)]);
        }
        franja.dataset.estado = estado;
        titular.innerHTML = icono(ico) + '<span>' + escapeHtml(texto) + '</span>';

        const cuenta = new Map();
        vista.errRecs.forEach((r) => {
            const msg = r.v[vista.errIdx].trim();
            cuenta.set(msg, (cuenta.get(msg) || 0) + 1);
        });
        grupos.innerHTML = Array.from(cuenta.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([msg, n]) => '<div class="nsft-csvrv-group"><strong>' + n + '×</strong><span>' + escapeHtml(msg) + '</span></div>')
            .join('');

        stats.innerHTML =
            '<div class="is-ok"><b>' + bien + '</b><span>' + escapeHtml(t('csvRvStatImported', 'Imported')) + '</span></div>'
            + '<div class="is-err"><b>' + errores + '</b><span>' + escapeHtml(t('csvRvStatErrors', 'With errors')) + '</span></div>'
            + '<div><b>' + total + '</b><span>' + escapeHtml(t('csvRvStatTotal', 'Total')) + '</span></div>';
    }

    function pintaPestanas() {
        const modal = document.getElementById(IDS.MODAL);
        const hayError = vista.errIdx >= 0;
        const pestanas = hayError
            ? [['all', t('csvRvTabAll', 'All'), vista.records.length],
                ['err', t('csvRvStatErrors', 'With errors'), vista.errRecs.length],
                ['ok', t('csvRvStatImported', 'Imported'), vista.okRecs.length]]
            : [['all', t('csvRvTabAll', 'All'), vista.records.length]];
        if (!pestanas.some((p) => p[0] === vista.tab)) vista.tab = 'all';
        modal.querySelector('.nsft-csvrv-tabs').innerHTML = pestanas.map(([id, label, n]) =>
            '<button type="button" role="tab" data-tab="' + id + '" aria-selected="' + (vista.tab === id) + '"'
            + (vista.tab === id ? ' class="is-on"' : '') + '>' + escapeHtml(label) + '<span>' + n + '</span></button>'
        ).join('');
    }

    function pintaTabla() {
        const modal = document.getElementById(IDS.MODAL);
        if (!modal || !vista.header.length || vista.prosa) return;
        deriva();
        const hayError = vista.errIdx >= 0;
        const cols = columnas();

        const th = '<th>' + escapeHtml(t('csvRvColRow', 'Row')) + '</th>'
            + (hayError ? '<th>' + escapeHtml(t('csvRvColStatus', 'Status')) + '</th>' : '')
            + cols.map((i) => '<th>' + escapeHtml(bonito(vista.header[i])) + '</th>').join('');
        modal.querySelector('.nsft-csvrv-table thead tr').innerHTML = th;

        let base = vista.tab === 'err' ? vista.errRecs : vista.tab === 'ok' ? vista.okRecs : vista.records;
        const needle = vista.q.trim();
        if (needle) base = base.filter((r) => r.v.some((v) => casa(v, needle)));

        const okLabel = t('csvRvRowOk', 'Imported');
        const okTitle = t('csvRvRowOkTitle', 'Imported successfully');
        modal.querySelector('.nsft-csvrv-table tbody').innerHTML = base.map((r) => {
            const err = hayError && r.v[vista.errIdx].trim() !== '';
            const st = hayError
                ? '<td class="is-st"><span class="nsft-csvrv-pill ' + (err ? 'is-err' : 'is-ok') + '" title="'
                    + escapeAttr(err ? r.v[vista.errIdx] : okTitle) + '"><i></i><span>'
                    + (err ? resalta(r.v[vista.errIdx], needle) : escapeHtml(okLabel)) + '</span></span></td>'
                : '';
            return '<tr data-r="' + r.i + '"><td class="is-line">' + r.n + '</td>' + st
                + cols.map((i) => celda(r, i, needle)).join('') + '</tr>';
        }).join('');

        const vacio = modal.querySelector('.nsft-csvrv-empty');
        vacio.hidden = base.length > 0;
        vacio.textContent = vista.records.length === 0
            ? t('csvRvEmptyFile', 'The file has no records.')
            : t('csvRvNoMatches', 'No records match.');

        modal.querySelector('.nsft-csvrv-note').textContent =
            t('csvRvNote', '$1 columns · Row = record number in the file (row 1 is the header) · Double-click a cell to fix it.', [String(cols.length)]);

        const btnErr = document.getElementById(IDS.DL_ERR);
        const n = vista.errRecs.length;
        btnErr.hidden = n === 0;
        btnErr.querySelector('span').textContent = n === 1
            ? t('csvRvDlErrorsOne', 'Download 1 row with errors')
            : t('csvRvDlErrorsMany', 'Download $1 rows with errors', [String(n)]);
    }

    function casa(texto, needle) {
        return TS ? TS.match(texto, needle) : String(texto).toLowerCase().indexOf(needle.toLowerCase()) !== -1;
    }

    function resalta(texto, needle) {
        if (!needle) return escapeHtml(texto);
        return TS ? TS.markHtml(texto, needle, HL_CLASS) : escapeHtml(texto);
    }

    function bonito(h) {
        h = String(h || '').trim();
        return h.charAt(0).toUpperCase() + h.slice(1);
    }

    function celda(r, i, needle) {
        const crudo = r.v[i];
        const txt = crudo.trim();
        const editada = r.editadas && r.editadas[i];
        const td = '<td data-c="' + i + '"' + (editada ? ' class="is-edited" title="' + escapeAttr(t('csvRvEditedTitle', 'Edited')) + '"' : '') + '>';
        if (!txt) return td + '<span class="nsft-csvrv-v is-nw is-empty">—</span></td>';
        if (vista.boolCols[i]) {
            const si = /^(t|true)$/i.test(txt);
            return td + '<span class="nsft-csvrv-v is-nw ' + (si ? 'is-yes' : 'is-no') + '">'
                + escapeHtml(si ? t('csvRvYes', 'Yes') : t('csvRvNo', 'No')) + '</span></td>';
        }
        const codigo = /^[<{[]/.test(txt) || /^(select|insert|update|delete|with)\b/i.test(txt);
        const corto = txt.length <= 40 && txt.indexOf('\n') < 0;
        return td + '<span class="nsft-csvrv-v ' + (corto ? 'is-nw' : 'is-pw') + (codigo ? ' is-code' : '') + '">'
            + resalta(txt, needle) + '</span></td>';
    }


    function editaCelda(td) {
        if (td.querySelector('.nsft-csvrv-edit')) return;
        const tr = td.parentNode;
        const r = vista.records[Number(tr.dataset.r)];
        const c = Number(td.dataset.c);
        if (!r || isNaN(c)) return;

        const ed = document.createElement('span');
        ed.className = 'nsft-csvrv-edit';
        ed.contentEditable = 'plaintext-only';
        if (ed.contentEditable !== 'plaintext-only') ed.contentEditable = 'true';
        ed.textContent = r.v[c];
        td.innerHTML = '';
        td.appendChild(ed);
        ed.focus();
        const sel = window.getSelection();
        const rango = document.createRange();
        rango.selectNodeContents(ed);
        sel.removeAllRanges();
        sel.addRange(rango);

        let hecho = false;
        const termina = (guardar) => {
            if (hecho) return;
            hecho = true;
            if (guardar && ed.textContent !== r.v[c]) {
                r.v[c] = ed.textContent;
                (r.editadas || (r.editadas = {}))[c] = true;
            }
            pintaPestanas();
            pintaTabla();
        };
        ed.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Escape') { e.preventDefault(); termina(false); }
            else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); termina(true); }
        });
        ed.addEventListener('blur', () => termina(true));
    }

    function hayCorrecciones() {
        return vista.records.some((r) => r.editadas && Object.keys(r.editadas).length);
    }

    function actualiza() {
        if (!vista.fileId) return;
        if (!hayCorrecciones()) { trae(); return; }
        const msg = t('csvRvConfirmRefresh', 'Your corrections will be lost. Refresh anyway?');
        if (window.NSFT_Dialog) {
            window.NSFT_Dialog.confirm({ body: msg }).then((si) => { if (si) trae(); });
        } else if (confirm(msg)) {
            trae();
        }
    }

    function descarga(soloErrores) {
        try {
            deriva();
            const cols = columnas();
            const recs = soloErrores ? vista.errRecs : vista.records;
            const filas = [cols.map((i) => vista.header[i])].concat(recs.map((r) => cols.map((i) => r.v[i])));
            const csv = Papa.unparse(filas, { delimiter: vista.delimiter });

            let titulo = (vista.meta.archivo || '').trim().replace(/\.csv$/i, '');
            if (titulo) titulo = ` - ${titulo}`;
            const base = soloErrores
                ? t('csvRvFileErrors', 'Rows with errors')
                : t('csvRvFileName', 'Updated CSV Response');

            const a = document.createElement('a');
            a.style.display = 'none';
            a.setAttribute('href', `data:text/plain;charset=utf-8,${encodeURIComponent(csv)}`);
            a.setAttribute('download', `${base}${titulo}.csv`);
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (e) {
            avisa(t('csvRvDownloadError', 'There was a problem downloading the CSV'));
            console.error('NSFT: csv_response_viewer descarga', e);
        }
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
        vista.fileId = '';
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
