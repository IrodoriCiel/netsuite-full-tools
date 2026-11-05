(function () {
    'use strict';

    const STORAGE_KEY = 'enableLogViewer';
    const BAR_CLASS = 'nsft-lv-bar';
    const HIDDEN = 'nsft-lv-hidden';
    const PG_EXTRA = 'nsft-pg-extra';
    const PG_DUENO = 'lv';

    let _unsub = null;
    let _q = '';
    let _table = null;
    let _bar = null;

    const ES_INTEGRACION = /^\/app\/common\/integration\/integrapp\.nl$/.test(location.pathname);
    const SUBLISTAS_INTEGRACION = ['soaplog', 'restwslog', 'restletlog', 'mcpwslog'];

    if (!ES_INTEGRACION && !/\/scripting\/(?:script|scriptrecord|scriptdeploy|scriptnote|scriptnotearchive)\.nl(?:\?|$)/
        .test(location.pathname + location.search)) return;

    chrome.storage.local.get({ [STORAGE_KEY]: true }, (items) => {
        if (items[STORAGE_KEY]) init();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (!changes[STORAGE_KEY]) return;
        if (changes[STORAGE_KEY].newValue) init();
        else teardown();
    });

    function i18n(key, fallback, subs) {
        try { return chrome.i18n.getMessage(key, subs) || fallback; } catch (e) { return fallback; }
    }

    function init() {
        scan();
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            if (!_unsub) _unsub = window.NSFT_Observer.subscribe(scan, { throttle: 400 });
        }
    }

    function teardown() {
        if (_unsub) { try { _unsub(); } catch (e) { } _unsub = null; }
        if (_exp) _exp.cerrar();
        document.querySelectorAll('.nsft-lv-cell').forEach(c => c.remove());
        document.querySelectorAll('.' + BAR_CLASS).forEach(b => b.remove());
        document.querySelectorAll('.' + HIDDEN).forEach(r => r.classList.remove(HIDDEN));
        if (window.NSFT_SublistPages) NSFT_SublistPages.limpia(document, PG_DUENO);
        unhighlight(document);
        _table = null; _bar = null;
    }

    function logRows(table, conOtras) {
        return Array.from(table.querySelectorAll('tr')).filter(tr => tr.querySelector('td.uir-list-row-cell')
            && (conOtras || !tr.classList.contains(PG_EXTRA)));
    }

    function isVisible(el) {
        return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));
    }

    function getTable() {
        if (ES_INTEGRACION) return tablaIntegracion();
        const byId = document.getElementById('tbl_refreshscriptnote');
        if (byId && logRows(byId).length) return byId;

        const tables = new Set();
        document.querySelectorAll('td.uir-list-row-cell').forEach(c => {
            const t = c.closest('table');
            if (t) tables.add(t);
        });
        let best = null, bestCount = 0;
        tables.forEach(t => {
            if (!isVisible(t)) return;
            const n = logRows(t).length;
            if (n > bestCount) { bestCount = n; best = t; }
        });
        return bestCount >= 3 ? best : null;
    }

    function tablaIntegracion() {
        for (const m of SUBLISTAS_INTEGRACION) {
            const capa = document.querySelector('[data-nsps-layer="' + m + '"]');
            if (!capa || !isVisible(capa)) continue;
            const t = document.getElementById(m + '__tab') || document.getElementById(m + '_splits')
                || capa.querySelector('table.listtable');
            if (t && logRows(t).length) return t;
        }
        return null;
    }

    function headerLabels(table) {
        const SEL = 'tr.uir-list-headerrow, tr.uir-machine-headerrow, thead tr';
        const capa = table.closest('[data-nsps-layer]');
        const headerRow = table.querySelector(SEL) || (capa && capa.querySelector(SEL));
        if (!headerRow) return [];
        return Array.from(headerRow.children).map((c, i) => {
            const label = ((c.getAttribute && c.getAttribute('data-label')) || c.textContent || '')
                .replace(/[▲▼▴▾]/g, '').replace(/\s+/g, ' ').trim();
            if (label === '#') return i18n('lv_col_linea', 'Line');
            return label || ('Col ' + (i + 1));
        });
    }

    function rowCells(tr) {
        return Array.from(tr.querySelectorAll('td.uir-list-row-cell'))
            .map((td) => {
                const original = td.querySelector('.nsft-logfmt-wrapper code');
                return ((original || td).textContent || '').replace(/\s+/g, ' ').trim();
            });
    }

    function scan() {
        const table = getTable();
        if (!table) return;
        _table = table;

        let bar = document.querySelector('.' + BAR_CLASS);
        if (bar && ES_INTEGRACION) {
            const capa = table.closest('[data-nsps-layer]');
            if (capa && !capa.contains(bar)) {
                const celda = bar.closest('.nsft-lv-cell');
                (celda || bar).remove();
                bar = null;
            }
        }
        if (!bar) {
            bar = buildBar();
            placeBar(bar, table);
        }
        _bar = bar;
        apply();
    }

    function placeBar(bar, table) {
        if (ES_INTEGRACION) {
            const capa = table.closest('[data-nsps-layer]');
            const barra = capa && (capa.querySelector('.uir-list-control-bar[data-above="true"]')
                || capa.querySelector('.uir-list-control-bar'));
            const fila = barra && barra.querySelector(':scope > table > tbody > tr > td > table > tbody > tr');
            if (fila) { fila.appendChild(cellFor(bar)); return; }
            table.parentNode.insertBefore(bar, table);
            return;
        }

        const marker = document.getElementById('tbl_refreshscriptnote');
        const execRow = marker ? marker.closest('tr') : null;

        if (execRow) {
            const fullLogsEl = execRow.querySelector('.nsft-full-logs-container');
            const anchorTd = fullLogsEl ? fullLogsEl.closest('td') : null;
            const td = cellFor(bar);
            if (anchorTd) anchorTd.insertAdjacentElement('afterend', td);
            else execRow.appendChild(td);
            return;
        }

        const archiveRow = findArchiveButtonRow();
        if (archiveRow) {
            const printEl = archiveRow.querySelector('.uir-list-print')
                || archiveRow.querySelector('#tbl_print');
            const printTd = printEl ? printEl.closest('td') : null;
            if (printTd) printTd.insertAdjacentElement('afterend', cellFor(bar));
            else archiveRow.appendChild(cellFor(bar));
            return;
        }

        table.parentNode.insertBefore(bar, table);
    }

    function cellFor(bar) {
        const td = document.createElement('td');
        td.className = 'nsft-lv-cell';
        td.appendChild(bar);
        return td;
    }

    function findArchiveButtonRow() {
        const SEL = 'table.uir-list-buttonbar-left > tbody > tr';
        const topBar = document.querySelector('table.uir-list-top-button-bar')
            || document.querySelector('table.uir-list-filter-bar');
        return (topBar && topBar.querySelector(SEL)) || document.querySelector(SEL);
    }

    const DOWNLOAD_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"'
        + ' stroke-linecap="round" aria-hidden="true"><path d="M12 4v11"></path>'
        + '<path d="M8 11l4 4 4-4"></path><path d="M5 19h14"></path></svg>';

    const CLEAR_SVG = '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.7"'
        + ' stroke-linecap="round" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7"></path></svg>';

    function buildBar() {
        const bar = document.createElement('div');
        bar.className = 'nsft-tb-group nsft-tb-search ' + BAR_CLASS;

        const icon = document.createElement('span');
        icon.className = 'nsft-lv-icon';
        icon.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.6-3.6"></path></svg>';

        const search = document.createElement('input');
        search.className = 'nsft-lv-search';
        search.placeholder = i18n('lv_search_ph', 'Search logs…');
        search.setAttribute('autocomplete', 'off');
        search.value = _q;

        const clear = document.createElement('button');
        clear.type = 'button';
        clear.className = 'nsft-tb-clear nsft-lv-clear';
        clear.innerHTML = CLEAR_SVG;
        clear.hidden = !_q;
        const clearTitle = i18n('lv_clear_search', 'Borrar la búsqueda');
        clear.title = clearTitle;
        clear.setAttribute('aria-label', clearTitle);
        clear.addEventListener('click', () => {
            search.value = ''; _q = ''; clear.hidden = true;
            apply();
            search.focus();
        });

        search.addEventListener('input', () => { _q = search.value; clear.hidden = !search.value; apply(); });
        search.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Escape') { search.value = ''; _q = ''; clear.hidden = true; apply(); }
        });

        const count = document.createElement('span');
        count.className = 'nsft-tb-count nsft-lv-count';

        const divider = document.createElement('span');
        divider.className = 'nsft-tb-divider';

        const exportBtn = (label, titleKey, titleFallback, handler) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'nsft-tb-ghost nsft-lv-btn';
            b.title = i18n(titleKey, titleFallback);
            b.innerHTML = DOWNLOAD_SVG;
            const span = document.createElement('span');
            span.textContent = label;
            b.appendChild(span);
            b.addEventListener('click', handler);
            return b;
        };
        const csvBtn = exportBtn('CSV', 'lv_export_csv_title', 'Exportar a CSV todas las filas del log', () => abreExportar('csv'));
        const jsonBtn = exportBtn('JSON', 'lv_export_json_title', 'Exportar a JSON todas las filas del log', () => abreExportar('json'));

        if (ES_INTEGRACION) {
            bar.className = 'nsft-tb-group ' + BAR_CLASS + ' nsft-lv-solo';
            bar.appendChild(csvBtn);
            bar.appendChild(jsonBtn);
            return bar;
        }

        bar.appendChild(icon);
        bar.appendChild(search);
        bar.appendChild(clear);
        bar.appendChild(count);
        bar.appendChild(divider);
        bar.appendChild(csvBtn);
        bar.appendChild(jsonBtn);
        return bar;
    }

    function setCount(text) {
        const count = _bar && _bar.querySelector('.nsft-lv-count');
        if (count && count.textContent !== text) count.textContent = text;
    }

    function apply() {
        if (!_bar || !_table) return;
        const rows = logRows(_table);
        const q = fold(_q.trim());
        let visible = 0;
        rows.forEach(tr => {
            const show = !q || fold(tr.textContent || '').indexOf(q) !== -1;
            tr.classList.toggle(HIDDEN, !show);
            if (show) visible++;
        });

        const marcasOk = !q || visible === 0
            || Array.from(_table.querySelectorAll('mark.nsft-lv-hl')).some(mk => !mk.closest('.' + PG_EXTRA));
        const igual = _bar.dataset.nsftLvQ === q
            && Number(_bar.dataset.nsftLvRows) === rows.length && marcasOk;
        if (!igual) {
            unhighlight(_table, true);
            if (q) rows.forEach(tr => { if (!tr.classList.contains(HIDDEN)) highlightTexts(tr, q); });
            _bar.dataset.nsftLvQ = q;
            _bar.dataset.nsftLvRows = String(rows.length);
        }

        const fuera = otrasPaginas(q);
        if (!q) setCount(String(totalDelLog() || rows.length));
        else if (fuera) setCount((visible + fuera.coinciden) + ' / ' + fuera.total);
        else setCount(visible + ' / ' + rows.length);
    }

    function totalDelLog() {
        const SP = window.NSFT_SublistPages;
        const capa = SP && SP.info && _table && _table.closest('[data-nsps-layer]');
        const inf = capa ? SP.info(capa) : null;
        return inf ? inf.total : 0;
    }

    function otrasPaginas(q) {
        const SP = window.NSFT_SublistPages;
        const capa = SP && _table.closest('[data-nsps-layer]');
        if (!capa) return null;
        const est = q ? SP.pide(capa, apply) : null;
        if (!est) {
            SP.limpia(_table, PG_DUENO);
            delete _bar.dataset.nsftLvPg;
            return null;
        }
        const grupos = (est.paginas || []).map(p => ({
            numero: p.numero,
            etiqueta: p.etiqueta,
            filas: p.filas.filter(tr => textoFuera(tr).indexOf(q) !== -1)
        }));
        const clave = est.clave + '|' + q;
        if (_bar.dataset.nsftLvPg !== clave || !SP.pintadas(_table, PG_DUENO)) {
            SP.pinta(_table, est, grupos, PG_DUENO).forEach(tr => highlightTexts(tr, q));
            _bar.dataset.nsftLvPg = clave;
        }
        if (!est.paginas) return null;
        return { coinciden: grupos.reduce((n, g) => n + g.filas.length, 0), total: est.total };
    }

    const _textosFuera = new WeakMap();
    function textoFuera(tr) {
        let s = _textosFuera.get(tr);
        if (s == null) { s = fold(tr.textContent || ''); _textosFuera.set(tr, s); }
        return s;
    }


    function unhighlight(root, soloPropias) {
        root.querySelectorAll('mark.nsft-lv-hl').forEach((mk) => {
            if (soloPropias && mk.closest('.' + PG_EXTRA)) return;
            const p = mk.parentNode;
            if (!p) return;
            p.replaceChild(document.createTextNode(mk.textContent), mk);
            p.normalize();
        });
    }

    function highlightTexts(root, needle) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const hits = [];
        let node;
        while ((node = walker.nextNode())) {
            if (node.nodeValue && fold(node.nodeValue).indexOf(needle) !== -1) hits.push(node);
        }
        hits.forEach((tn) => {
            const t = tn.nodeValue;
            const tramos = foldRanges(t, needle);
            if (!tramos.length) return;
            const frag = document.createDocumentFragment();
            let from = 0;
            tramos.forEach((r) => {
                if (r.start > from) frag.appendChild(document.createTextNode(t.slice(from, r.start)));
                const mk = document.createElement('mark');
                mk.className = 'nsft-lv-hl';
                mk.textContent = t.slice(r.start, r.end);
                frag.appendChild(mk);
                from = r.end;
            });
            if (from < t.length) frag.appendChild(document.createTextNode(t.slice(from)));
            tn.parentNode.replaceChild(frag, tn);
        });
    }

    const TS = window.NSFT_TextSearch || null;
    const NON_ASCII = /[^\u0000-\u007F]/;
    const COMBINING = /[\u0300-\u036f]/g;

    function fold(text) {
        if (TS) return TS.fold(text);
        const s = String(text == null ? '' : text);
        if (!NON_ASCII.test(s)) return s.toLowerCase();
        let out = '';
        for (const ch of s) {
            const f = ch.normalize('NFD').replace(COMBINING, '').toLowerCase();
            out += (f.length === ch.length ? f : ch);
        }
        return out;
    }

    function foldRanges(text, needle) {
        if (TS) return TS.ranges(text, needle);
        const hay = fold(text);
        const out = [];
        let i = hay.indexOf(needle);
        while (i !== -1) {
            out.push({ start: i, end: i + needle.length });
            i = hay.indexOf(needle, i + needle.length);
        }
        return out;
    }


    let _exp = null;

    function abreExportar(formato) {
        if (!_table || _exp) return;
        const guardar = formato === 'json' ? guardarJson : guardarCsv;
        const SP = window.NSFT_SublistPages;
        const capa = SP && _table.closest('[data-nsps-layer]');
        let inf = capa && SP.info ? SP.info(capa) : null;
        const q = fold(_q.trim());
        const casa = (tr) => !q || fold(tr.textContent || '').indexOf(q) !== -1;
        const propias = logRows(_table).filter(casa);
        if (!inf || inf.paginas <= 1) {
            const conCuerpos = headerLabels(_table).some((et) => /^(solicitud|request|respuesta|response)$/i.test(et));
            const conFechas = !!(SP && SP.horas);
            if (!conCuerpos && !conFechas) { entrega(guardar, propias.map(rowData), null, i18n('lv_fn_todo', 'all')); return; }
            inf = { total: propias.length, paginas: 1, actual: 1, porPagina: propias.length };
        }
        ventanaExportar(formato, guardar, SP, capa, inf, q, casa, propias);
    }

    function el(tag, clase, txt) {
        const n = document.createElement(tag);
        if (clase) n.className = clase;
        if (txt != null) n.textContent = txt;
        return n;
    }

    function ventanaExportar(formato, guardar, SP, capa, inf, q, casa, propias) {
        const th = document.documentElement.getAttribute('data-nsft-theme') === 'dark' ? 'dark' : 'light';
        const telon = el('div', 'nsft-modal-backdrop nsft-lv-exp-backdrop');
        telon.setAttribute('data-theme', th);
        const caja = el('div', 'nsft-modal nsft-modal--dialog nsft-dlg nsft-lv-exp');
        caja.setAttribute('data-theme', th);
        caja.setAttribute('role', 'dialog');
        caja.setAttribute('aria-modal', 'true');

        const cab = el('div', 'nsft-modal-header');
        cab.appendChild(el('span', 'nsft-modal-title', i18n('lv_exp_title', 'Export the log to ' + formato.toUpperCase(), [formato.toUpperCase()])));
        caja.appendChild(cab);
        caja.appendChild(el('div', 'nsft-modal-header-line'));

        const cuerpo = el('div', 'nsft-dlg-body nsft-lv-exp-body');
        const opcion = (valor, titulo, marcada) => {
            const l = el('label', 'nsft-lv-exp-op');
            const r = el('input');
            r.type = 'radio';
            r.name = 'nsft-lv-exp-alcance';
            r.value = valor;
            r.checked = !!marcada;
            l.appendChild(r);
            const t = el('span', 'nsft-lv-exp-t', titulo);
            l.appendChild(t);
            const ctl = el('span', 'nsft-lv-exp-ctl');
            l.appendChild(ctl);
            cuerpo.appendChild(l);
            return { label: l, radio: r, titulo: t, ctl: ctl };
        };
        const conCuenta = (o, cuenta) => {
            o.label.classList.add('is-largo');
            o.titulo.appendChild(document.createTextNode(' '));
            o.titulo.appendChild(el('span', 'nsft-lv-exp-n', cuenta));
            o.ctl.remove();
        };
        const miles = (n) => Number(n).toLocaleString();
        const unaPagina = inf.paginas <= 1;
        const actual = opcion('actual', i18n('lv_exp_actual', 'Current page'), unaPagina);
        conCuenta(actual, i18n('lv_exp_n_filas', '(' + propias.length + ' rows)', [miles(propias.length)]));
        const todas = opcion('todas', i18n('lv_exp_todas', 'All pages'), !unaPagina);
        conCuenta(todas, i18n('lv_exp_n_filas_pags', '(' + inf.total + ' rows in ' + inf.paginas + ' pages)',
            [miles(inf.total), miles(inf.paginas)]));

        const rango = opcion('rango', i18n('lv_exp_rango', 'Pages'));
        const num = (v) => {
            const n = el('input', 'nsft-dlg-input nsft-lv-exp-num');
            n.type = 'number';
            n.min = '1';
            n.max = String(inf.paginas);
            n.value = String(v);
            return n;
        };
        const desde = num(inf.actual);
        const hasta = num(inf.paginas);
        rango.ctl.appendChild(desde);
        rango.ctl.appendChild(el('span', 'nsft-lv-exp-de', i18n('lv_exp_rango_a', 'to')));
        rango.ctl.appendChild(hasta);
        rango.ctl.appendChild(el('span', 'nsft-lv-exp-de', i18n('lv_exp_rango_de', 'of ' + inf.paginas, [miles(inf.paginas)])));

        const fechas = opcion('fechas', i18n('lv_exp_fechas', 'Between'));
        fechas.label.classList.add('is-fechas');
        const dos = (x) => String(x).padStart(2, '0');
        const local = (d) => d.getFullYear() + '-' + dos(d.getMonth() + 1) + '-' + dos(d.getDate()) + 'T' + dos(d.getHours()) + ':' + dos(d.getMinutes());
        const ahora = new Date();
        const hoy0 = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
        const dt = (v) => {
            const n = el('input', 'nsft-dlg-input nsft-lv-exp-dt');
            n.type = 'datetime-local';
            n.value = v;
            return n;
        };
        const fDesde = dt(local(hoy0));
        const fHasta = dt(local(ahora));
        fechas.ctl.appendChild(el('span', 'nsft-lv-exp-de', i18n('lv_exp_desde', 'From')));
        fechas.ctl.appendChild(fDesde);
        fechas.ctl.appendChild(el('span', 'nsft-lv-exp-de', i18n('lv_exp_hasta', 'To')));
        fechas.ctl.appendChild(fHasta);
        if (unaPagina) [todas, rango].forEach((o) => { o.label.hidden = true; });
        if (unaPagina && !(SP && SP.horas)) fechas.label.hidden = true;

        if (q) cuerpo.appendChild(el('p', 'nsft-dlg-p nsft-lv-exp-nota', i18n('lv_exp_filtro', 'Only the rows that match “' + _q.trim() + '”.', [_q.trim()])));

        const idxCuerpo = headerLabels(_table)
            .map((et, i) => (/^(solicitud|request|respuesta|response)$/i.test(et) ? i : -1))
            .filter((i) => i >= 0);
        let conCuerpos = null;
        if (idxCuerpo.length) {
            const l = el('label', 'nsft-lv-exp-op nsft-lv-exp-cuerpos');
            conCuerpos = el('input');
            conCuerpos.type = 'checkbox';
            l.appendChild(conCuerpos);
            l.appendChild(el('span', null, i18n('lv_exp_cuerpos', 'Add the request and response content')));
            cuerpo.appendChild(l);
        }
        const estado = el('p', 'nsft-dlg-p nsft-lv-exp-estado');
        estado.hidden = true;
        const barra = el('div', 'nsft-lv-exp-barra');
        barra.hidden = true;
        barra.appendChild(el('span'));
        cuerpo.appendChild(estado);
        cuerpo.appendChild(barra);
        caja.appendChild(cuerpo);

        const pie = el('div', 'nsft-dlg-foot');
        const cancelar = el('button', 'nsft-dlg-btn nsft-dlg-btn-cancel', i18n('dlg_cancel', 'Cancel'));
        cancelar.type = 'button';
        const ok = el('button', 'nsft-dlg-btn nsft-dlg-btn-ok', i18n('lv_exp_ok', 'Export'));
        ok.type = 'button';
        pie.appendChild(cancelar);
        pie.appendChild(ok);
        caja.appendChild(pie);
        telon.appendChild(caja);
        document.body.appendChild(telon);
        try {
            if (window.NSFT_ModalStack && window.NSFT_ModalStack.bringToFront) window.NSFT_ModalStack.bringToFront(caja);
        } catch (e) { }

        const alcance = () => (caja.querySelector('input[name="nsft-lv-exp-alcance"]:checked') || {}).value;
        const valida = () => {
            const al = alcance();
            if (al === 'fechas') return !!fDesde.value && !!fHasta.value && fHasta.value >= fDesde.value;
            if (al !== 'rango') return true;
            const a = Number(desde.value), b = Number(hasta.value);
            return a >= 1 && b >= a && b <= inf.paginas && Number.isInteger(a) && Number.isInteger(b);
        };
        const refresca = () => { ok.disabled = !valida(); };
        caja.addEventListener('input', refresca);
        caja.addEventListener('change', refresca);
        [desde, hasta].forEach((n) => n.addEventListener('focus', () => { rango.radio.checked = true; refresca(); }));
        [fDesde, fHasta].forEach((n) => n.addEventListener('focus', () => { fechas.radio.checked = true; refresca(); }));

        let viaje = null;
        let alcanceNombre = '';
        let cerrado = false;
        const cerrar = () => {
            if (cerrado) return;
            cerrado = true;
            document.removeEventListener('keydown', teclas, true);
            telon.remove();
            _exp = null;
        };
        const detener = () => {
            if (viaje) { viaje.cancela(); return; }
            cerrar();
        };
        const teclas = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); detener(); }
            if (e.key === 'Enter' && !viaje && !ok.disabled && e.target.tagName !== 'BUTTON') { e.preventDefault(); lanzar(); }
        };
        document.addEventListener('keydown', teclas, true);
        cancelar.addEventListener('click', detener);
        telon.addEventListener('mousedown', (e) => { if (e.target === telon && !viaje) cerrar(); });
        ok.addEventListener('click', () => lanzar());
        _exp = { cerrar: () => { if (viaje) viaje.cancela(); viaje = null; cerrar(); } };
        setTimeout(() => { try { ok.focus(); } catch (e) { } }, 30);

        const reloj = (ms) => {
            const s = Math.max(0, Math.round(ms / 1000));
            return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
        };

        function enMarcha(texto) {
            caja.querySelectorAll('input').forEach((i) => { i.disabled = true; });
            ok.disabled = true;
            cancelar.textContent = i18n('lv_exp_detener', 'Stop');
            estado.hidden = false;
            barra.hidden = false;
            estado.textContent = texto;
        }

        function falla(tipo, error) {
            viaje = null;
            cerrar();
            const C = window.NSFT_Clipboard;
            if (!C || !C.showToast) return;
            if (tipo === 'cancelada') C.showToast(i18n('lv_exp_cancelada', 'Export stopped: nothing was saved.'), { type: 'info' });
            else if (error === 'orden') C.showToast(i18n('lv_exp_orden', 'The log is not sorted by time: sort it by its time column and try again.'), { type: 'error' });
            else if (error === 'cambio') C.showToast(i18n('lv_exp_cambio', 'The log changed during the export (entries came in or were removed): nothing was saved. Try again.'), { type: 'error' });
            else C.showToast(i18n('lv_exp_error', 'The export could not finish: nothing was saved.', [String(error || '')]), { type: 'error' });
        }

        function terminar(filas) {
            if (conCuerpos && conCuerpos.checked && filas.length) { bajaCuerpos(filas); return; }
            viaje = null;
            cerrar();
            entrega(guardar, filas, null, alcanceNombre);
        }

        function bajaCuerpos(filas) {
            const pendientes = [];
            filas.forEach((f) => idxCuerpo.forEach((i) => { if (f.u[i]) pendientes.push({ f, i }); }));
            if (!pendientes.length) { viaje = null; cerrar(); entrega(guardar, filas, idxCuerpo, alcanceNombre); return; }
            let cortar = false;
            viaje = { cancela() { cortar = true; } };
            enMarcha(i18n('lv_exp_cuerpos_prog', 'Content 0 of ' + pendientes.length, ['0', miles(pendientes.length), reloj(0), reloj(0)]));
            const inicio = Date.now();
            (async () => {
                let hechas = 0;
                for (const p of pendientes) {
                    if (cortar || cerrado) { if (!cerrado) falla('cancelada'); return; }
                    let texto;
                    try {
                        const r = await fetch(p.f.u[p.i], { credentials: 'include' });
                        if (!r.ok) throw new Error('http ' + r.status);
                        if (/\/app\/login\//i.test(r.url || '')) throw new Error(i18n('lv_exp_sesion', 'the session expired'));
                        texto = await r.text();
                    } catch (e) { if (!cerrado) falla('error', (e && e.message) || e); return; }
                    (p.f.b || (p.f.b = {}))[p.i] = texto;
                    hechas++;
                    const pasado = Date.now() - inicio;
                    const queda = pasado / hechas * (pendientes.length - hechas);
                    estado.textContent = i18n('lv_exp_cuerpos_prog',
                        'Content ' + hechas + ' of ' + pendientes.length,
                        [miles(hechas), miles(pendientes.length), reloj(pasado), reloj(queda)]);
                    barra.firstChild.style.width = Math.round(hechas / pendientes.length * 100) + '%';
                    await new Promise((res) => setTimeout(res, 120));
                }
                if (cerrado) return;
                viaje = null;
                cerrar();
                entrega(guardar, filas, idxCuerpo, alcanceNombre);
            })();
        }

        function fechasEnLaPagina() {
            const aMs = (s) => {
                const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(s || ''));
                return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() : NaN;
            };
            const D = aMs(fDesde.value);
            const H = aMs(fHasta.value) + 59999;
            let parado = false;
            viaje = { cancela() { parado = true; falla('cancelada'); } };
            enMarcha(i18n('lv_exp_leyendo', 'Reading the dates…'));
            SP.horas(propias.map(rowCells)).then((ms) => {
                if (parado || cerrado) return;
                if (!ms) { falla('error', 'fetcher'); return; }
                if (ms.some((t) => !isFinite(t))) { falla('error', i18n('lv_exp_fecha', 'a row date could not be read')); return; }
                terminar(propias.filter((tr, i) => ms[i] >= D && ms[i] <= H).map(rowData));
            });
        }

        function lanzar() {
            if (viaje || !valida()) return;
            const a = alcance();
            const fechaNombre = (v) => String(v || '').replace(/[-:]/g, '').replace('T', '-');
            const todo = i18n('lv_fn_todo', 'all');
            alcanceNombre = a === 'fechas' ? fechaNombre(fDesde.value) + '-' + i18n('lv_fn_a', 'to') + '-' + fechaNombre(fHasta.value)
                : a === 'rango' ? 'p' + desde.value + '-' + hasta.value
                    : (a === 'todas' || unaPagina) ? todo
                        : i18n('lv_fn_pagina', 'page') + '-' + inf.actual;
            if (a === 'fechas' && unaPagina) { fechasEnLaPagina(); return; }
            if (a === 'actual' || unaPagina || !capa) { terminar(propias.map(rowData)); return; }
            const p1 = a === 'rango' ? Number(desde.value) : 1;
            const p2 = a === 'rango' ? Number(hasta.value) : inf.paginas;
            const porFechas = a === 'fechas' ? { desde: fDesde.value, hasta: fHasta.value } : null;

            enMarcha(porFechas
                ? i18n('lv_exp_buscando', 'Finding the pages for those dates…', ['0'])
                : i18n('lv_exp_empezando', 'Fetching the pages…'));

            const inicio = Date.now();
            const porPagina = new Map();
            let filasHechas = 0;
            viaje = SP.exporta(capa, p1, p2, (ev) => {
                if (cerrado) return;
                if (ev.tipo === 'buscando') {
                    estado.textContent = i18n('lv_exp_buscando', 'Finding the pages for those dates… (' + ev.consultas + ')', [miles(ev.consultas)]);
                    return;
                }
                if (ev.tipo === 'pagina') {
                    const datos = ev.filas.filter((tr) => tr.querySelector('td.uir-list-row-cell') && casa(tr)).map(rowData);
                    porPagina.set(ev.numero, datos);
                    filasHechas += datos.length;
                    const pasado = Date.now() - inicio;
                    const queda = ev.hechas ? pasado / ev.hechas * (ev.total - ev.hechas) : 0;
                    estado.textContent = i18n('lv_exp_progreso',
                        'Page ' + ev.hechas + ' of ' + ev.total + ' · ' + filasHechas + ' rows · ' + reloj(pasado) + ' · ~' + reloj(queda) + ' left',
                        [miles(ev.hechas), miles(ev.total), miles(filasHechas), reloj(pasado), reloj(queda)]);
                    barra.firstChild.style.width = Math.round(ev.hechas / Math.max(1, ev.total) * 100) + '%';
                    return;
                }
                if (ev.tipo === 'fin') {
                    const filas = [];
                    Array.from(porPagina.keys()).sort((x, y) => x - y).forEach((n) => { porPagina.get(n).forEach((f) => filas.push(f)); });
                    terminar(filas);
                    return;
                }
                falla(ev.tipo, ev.error);
            }, porFechas);
        }
    }

    function rowData(tr) {
        const celdas = Array.from(tr.querySelectorAll('td.uir-list-row-cell'));
        return {
            t: rowCells(tr),
            u: celdas.map((td) => {
                const a = td.querySelector('a[href]');
                const h = a ? a.getAttribute('href') || '' : '';
                if (!h || /^\s*javascript:/i.test(h) || h === '#') return '';
                try { return new URL(h, location.href).href; } catch (e) { return ''; }
            })
        };
    }

    function entrega(guardar, filas, idxCuerpo, alcance) {
        if (!filas.length) {
            const C = window.NSFT_Clipboard;
            if (C && C.showToast) C.showToast(i18n('lv_exp_vacio', 'There are no rows to export.'), { type: 'info' });
            return;
        }
        const etiquetas = headerLabels(_table);
        const n = Math.max(etiquetas.length, ...filas.map((f) => f.t.length));
        const conUrl = [];
        for (let i = 0; i < n; i++) conUrl.push(filas.some((f) => !!f.u[i]));
        const conCuerpo = [];
        for (let i = 0; i < n; i++) conCuerpo.push(!!idxCuerpo && idxCuerpo.indexOf(i) !== -1 && conUrl[i]);
        const columns = [];
        for (let i = 0; i < n; i++) {
            const et = etiquetas[i] || ('Col ' + (i + 1));
            columns.push(et);
            if (conUrl[i]) columns.push(i18n('lv_url_col', et + ' (URL)', [et]));
            if (conCuerpo[i]) columns.push(i18n('lv_body_col', et + ' (content)', [et]));
        }
        const rows = filas.map((f) => {
            const r = [];
            for (let i = 0; i < n; i++) {
                r.push(f.t[i] == null ? '' : f.t[i]);
                if (conUrl[i]) r.push(f.u[i] || '');
                if (conCuerpo[i]) r.push((f.b && f.b[i]) || '');
            }
            return r;
        });
        guardar({ columns, rows, alcance });
    }

    function exportFilename(ext, alcance) {
        const LF = window.NSFT_LogFormat;
        const p2 = (n) => String(n).padStart(2, '0');
        const d = new Date();
        const ahora = '' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '-' + p2(d.getHours()) + p2(d.getMinutes());
        const dueno = LF && LF.ownerParts ? LF.ownerParts(_table) : [];
        const partes = dueno.concat([alcance || '', ahora]);
        if (LF && LF.buildFileName) return LF.buildFileName(partes, ext);
        return partes.filter(Boolean).join('_').replace(/[\\/:*?"<>|\s]+/g, '-') + '.' + ext;
    }

    function csvCelda(v) {
        let s = String(v == null ? '' : v);
        if (/^[=+@\t\r]/.test(s) || /^-(?![\d.])/.test(s)) s = "'" + s;
        return '"' + s.replace(/"/g, '""') + '"';
    }

    function guardarCsv(data) {
        const lines = [data.columns.map(csvCelda).join(',')];
        data.rows.forEach(r => lines.push(r.map(csvCelda).join(',')));
        saveBlob('\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8', exportFilename('csv', data.alcance));
    }

    function guardarJson(data) {
        const cols = data.columns;
        const objs = data.rows.map(r => {
            const o = {};
            r.forEach((v, i) => { o[cols[i] || ('col' + (i + 1))] = v; });
            return o;
        });
        saveBlob(JSON.stringify(objs, null, 2), 'application/json', exportFilename('json', data.alcance));
    }

    function saveBlob(text, mime, filename) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: mime }));
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    }
})();
