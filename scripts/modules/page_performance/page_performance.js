(function () {
    'use strict';
    if (window.NSFT_Herramientas) window.NSFT_Herramientas.vigila('.nsft-pp-panel', 'perf');

    const STORAGE_KEY = 'enablePagePerformance';
    const PANEL_ID = 'nsft-pp-panel';
    const OVERLAY_ID = 'nsft-pp-overlay';
    const NSFT_THEME_KEY = 'nsftTheme';
    const FETCHER_PATH = 'scripts/modules/page_performance/page_performance_fetcher.js';

    let _theme = 'light';

    chrome.storage.local.get({ [STORAGE_KEY]: true, [NSFT_THEME_KEY]: 'light' }, (items) => {
        _theme = items[NSFT_THEME_KEY] || 'light';
        if (items[STORAGE_KEY]) activate();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[STORAGE_KEY]) {
            if (changes[STORAGE_KEY].newValue) activate();
            else deactivate();
        }
        if (changes[NSFT_THEME_KEY]) {
            _theme = changes[NSFT_THEME_KEY].newValue || 'light';
            const o = document.getElementById(OVERLAY_ID);
            if (o) o.setAttribute('data-theme', resolveTheme());
            const p = document.getElementById(PANEL_ID);
            if (p) p.setAttribute('data-theme', resolveTheme());
        }
    });

    function resolveTheme() {
        return _theme === 'dark' ? 'dark' : 'light';
    }

    function onOpenEvent() {
        open();
        if (window.NSFT_ShortcutCoach) window.NSFT_ShortcutCoach.hint('page_performance');
    }

    function activate() {
        if (window.NSFT_Shortcuts && window.NSFT_Shortcuts.bind) {
            window.NSFT_Shortcuts.bind('page_performance', {
                label: chrome.i18n.getMessage('pp_title') || 'Page performance',
                defaultCombo: { ctrlKey: false, shiftKey: true, altKey: true, code: 'KeyP' },
                storageKey: 'pagePerformanceShortcut',
                event: 'nsft-show-page-performance',
                group: chrome.i18n.getMessage('cheatsheet_group_global') || 'Global',
                order: 43
            });
        }

        window.NSFT_PagePerf = { open: open };
        window.removeEventListener('nsft-show-page-performance', onOpenEvent);
        window.addEventListener('nsft-show-page-performance', onOpenEvent);
    }

    function deactivate() {
        window.removeEventListener('nsft-show-page-performance', onOpenEvent);
        try { delete window.NSFT_PagePerf; } catch (e) { window.NSFT_PagePerf = undefined; }
        close();
    }


    function i18n(key, fallback, subs) {
        let out = '';
        try { out = chrome.i18n.getMessage(key, subs) || ''; } catch (e) { out = ''; }
        if (!out) {
            out = fallback;
            (subs || []).forEach((v, idx) => { out = out.split('$' + (idx + 1)).join(String(v)); });
        }
        return out;
    }

    function fmtMs(v) {
        return v >= 1000 ? (v / 1000).toFixed(2) + ' s' : Math.round(v) + ' ms';
    }

    function fmtBytes(b) {
        if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
        if (b >= 1024) return Math.round(b / 1024) + ' KB';
        return b + ' B';
    }

    function esc(s) {
        return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }


    function getNav() {
        try {
            const e = performance.getEntriesByType && performance.getEntriesByType('navigation');
            if (e && e[0]) return e[0];
        } catch (err) { }
        const t = performance.timing;
        if (!t || !t.navigationStart) return null;
        const s = t.navigationStart;
        const rel = (v) => (v ? v - s : 0);
        return {
            startTime: 0,
            redirectStart: rel(t.redirectStart), redirectEnd: rel(t.redirectEnd),
            domainLookupStart: rel(t.domainLookupStart), domainLookupEnd: rel(t.domainLookupEnd),
            connectStart: rel(t.connectStart), connectEnd: rel(t.connectEnd),
            requestStart: rel(t.requestStart), responseStart: rel(t.responseStart),
            responseEnd: rel(t.responseEnd), domInteractive: rel(t.domInteractive),
            domContentLoadedEventEnd: rel(t.domContentLoadedEventEnd),
            domComplete: rel(t.domComplete),
            loadEventStart: rel(t.loadEventStart), loadEventEnd: rel(t.loadEventEnd)
        };
    }

    function computeMetrics() {
        const n = getNav();
        if (!n) return null;
        const ms = (v) => Math.max(0, Math.round(v || 0));

        const phases = [
            { key: 'dns', label: i18n('pp_dns', 'DNS lookup'), value: ms(n.domainLookupEnd - n.domainLookupStart) },
            { key: 'tcp', label: i18n('pp_tcp', 'Connect'), value: ms(n.connectEnd - n.connectStart) },
            { key: 'ttfb', label: i18n('pp_ttfb', 'Server response (TTFB)'), value: ms(n.responseStart - n.requestStart) },
            { key: 'download', label: i18n('pp_download', 'Content download'), value: ms(n.responseEnd - n.responseStart) },
            { key: 'dom', label: i18n('pp_dom', 'DOM processing'), value: ms(n.domComplete - n.responseEnd) }
        ];

        const loaded = n.loadEventEnd > 0 ? n.loadEventEnd : performance.now();
        const total = ms(loaded - n.startTime);
        const dcl = ms(n.domContentLoadedEventEnd - n.startTime);

        return { phases: phases, total: total, dcl: dcl, stillLoading: n.loadEventEnd === 0 };
    }

    const GRUPOS = ['custom', 'data', 'core', 'ext', 'other'];

    function idArchivo(url) {
        try {
            const u = new URL(url, location.href);
            if (!/\/core\/media\/media\.nl$/i.test(u.pathname)) return null;
            const id = u.searchParams.get('id');
            return id && /^\d+$/.test(id) ? id : null;
        } catch (e) { return null; }
    }

    function grupoDe(r) {
        let u = null;
        try { u = new URL(r.name, location.href); } catch (e) { return 'other'; }
        if (u.protocol === 'chrome-extension:' || u.protocol === 'moz-extension:') return 'ext';
        if (idArchivo(r.name) && r.initiatorType !== 'img') return 'custom';
        const datos = /xmlhttprequest|fetch|beacon/.test(r.initiatorType);
        if (datos && /(\.nl$|\/api\/|\/services\/|\/rest\/)/i.test(u.pathname)) return 'data';
        if (/(^|\.)netsuite\.com$/i.test(u.hostname)) return 'core';
        return 'other';
    }

    function nombreCorto(url) {
        try {
            const u = new URL(url, location.href);
            const id = idArchivo(url);
            if (id) return '#' + id;
            const seg = u.pathname.split('/').filter(Boolean);
            return seg.length ? seg[seg.length - 1] : u.hostname;
        } catch (e) { return String(url).slice(0, 40); }
    }

    function recursos() {
        let res = [];
        try { res = performance.getEntriesByType('resource') || []; } catch (e) { res = []; }
        const g = {};
        GRUPOS.forEach((k) => { g[k] = { count: 0, bytes: 0, items: [] }; });
        res.forEach((r) => {
            const k = grupoDe(r);
            const gr = g[k];
            gr.count++;
            gr.bytes += r.transferSize || 0;
            gr.items.push({ url: r.name, name: nombreCorto(r.name), ms: Math.round(r.duration || 0), bytes: r.transferSize || 0, fileId: idArchivo(r.name) });
        });
        GRUPOS.forEach((k) => { g[k].items.sort((a, b) => b.ms - a.ms); });
        const bytes = res.reduce((s, r) => s + (r.transferSize || 0), 0);
        return { total: res.length, bytes: bytes, grupos: g };
    }

    function bloqueos() {
        return new Promise((resolve) => {
            const fin = (lista) => resolve(resumeBloqueos(lista));
            let tipo = null;
            try {
                const tipos = (window.PerformanceObserver && PerformanceObserver.supportedEntryTypes) || [];
                tipo = tipos.indexOf('long-animation-frame') !== -1 ? 'long-animation-frame'
                    : (tipos.indexOf('longtask') !== -1 ? 'longtask' : null);
            } catch (e) { tipo = null; }
            if (!tipo) { resolve(null); return; }
            const acc = [];
            let po = null;
            try {
                po = new PerformanceObserver((l) => { acc.push.apply(acc, l.getEntries()); });
                po.observe({ type: tipo, buffered: true });
            } catch (e) { resolve(null); return; }
            setTimeout(() => { try { po.disconnect(); } catch (e) { } fin(acc); }, 250);
        });
    }

    function origenScript(src, invoker) {
        const propio = chrome.runtime && chrome.runtime.id;
        if (!src) return { label: invoker ? '(' + invoker + ')' : i18n('pp_inline', '(inline)'), clase: 'core', nsft: false };
        try {
            const u = new URL(src, location.href);
            if (u.protocol === 'chrome-extension:' || u.protocol === 'moz-extension:') {
                const nuestro = u.host === propio;
                return {
                    label: (nuestro ? 'NSFT · ' : i18n('pp_other_ext', 'Other extension') + ' · ') + nombreCorto(src),
                    clase: 'ext', nsft: nuestro
                };
            }
            const id = idArchivo(src);
            if (id) return { label: '#' + id, clase: 'custom', nsft: false, fileId: id };
            return { label: nombreCorto(src), clase: 'core', nsft: false };
        } catch (e) { return { label: String(src).slice(0, 40), clase: 'core', nsft: false }; }
    }

    function resumeBloqueos(lista) {
        let bloqueado = 0, largos = 0, nsftMs = 0, nsftN = 0;
        const porOrigen = {};
        (lista || []).forEach((e) => {
            const b = e.blockingDuration != null ? e.blockingDuration : Math.max(0, (e.duration || 0) - 50);
            if (b <= 0 && (!e.scripts || !e.scripts.length)) return;
            bloqueado += b;
            if (b > 0) largos++;
            (e.scripts || []).forEach((s) => {
                const o = origenScript(s.sourceURL, s.invokerType);
                const k = o.label;
                if (!porOrigen[k]) porOrigen[k] = { label: k, clase: o.clase, ms: 0, fileId: o.fileId || null };
                porOrigen[k].ms += s.duration || 0;
                if (o.nsft) { nsftMs += s.duration || 0; nsftN++; }
            });
        });
        const top = Object.keys(porOrigen).map((k) => porOrigen[k]).filter((x) => x.ms >= 5)
            .sort((a, b) => b.ms - a.ms).slice(0, 6);
        return { bloqueado: Math.round(bloqueado), largos: largos, top: top, nsftMs: Math.round(nsftMs), nsftN: nsftN };
    }

    let _fetcher = 'none';
    const _cola = [];
    const _espera = {};
    let _seq = 0;

    window.addEventListener('message', (e) => {
        if (e.source !== window) return;
        const d = e.data;
        if (!d || d.dest !== 'extension_pp' || !d.reqId) return;
        const cb = _espera[d.reqId];
        if (cb) { delete _espera[d.reqId]; cb(d.payload); }
    });

    function cargaFetcher() {
        if (_fetcher !== 'none') return;
        _fetcher = 'loading';
        if (window.NSFT_SuiteQLRest && window.NSFT_SuiteQLRest.ensureTransport) {
            window.NSFT_SuiteQLRest.ensureTransport();
        }
        const s = document.createElement('script');
        s.async = false;
        s.src = chrome.runtime.getURL(FETCHER_PATH);
        s.onload = function () {
            this.remove();
            _fetcher = 'ready';
            _cola.splice(0).forEach((fn) => fn());
        };
        s.onerror = function () {
            this.remove();
            _fetcher = 'error';
            _cola.splice(0).forEach((fn) => fn());
        };
        if (window.NSFT_AfterLoad && window.NSFT_AfterLoad.flush) window.NSFT_AfterLoad.flush();
        (window.NSFT_AfterLoad ? window.NSFT_AfterLoad.append(s) : (document.head || document.documentElement).appendChild(s));
    }

    function pide(type, payload, plazo) {
        return new Promise((resolve) => {
            const enviar = () => {
                if (_fetcher !== 'ready') { resolve(null); return; }
                const reqId = 'pp' + (++_seq) + '_' + Date.now();
                const t = setTimeout(() => { delete _espera[reqId]; resolve(null); }, plazo || 20000);
                _espera[reqId] = (p) => { clearTimeout(t); resolve(p); };
                window.postMessage({ dest: 'fetcher_pp', type, reqId, payload: payload || {} }, '*');
            };
            if (_fetcher === 'ready' || _fetcher === 'error') enviar();
            else { _cola.push(enviar); cargaFetcher(); }
        });
    }

    function tipoDeRegistro() {
        const i = document.querySelector('input[name="baserecordtype"]');
        const tipo = i && i.value ? String(i.value).trim() : '';
        let etiqueta = '';
        const rt = document.querySelector('.uir-record-type');
        if (rt) etiqueta = String(rt.textContent || '').trim();
        if (!etiqueta) {
            const m = /\(([^()]+)\)\s*(?:-\s*NetSuite.*)?$/.exec(document.title || '');
            if (m) etiqueta = m[1].trim();
        }
        return { tipo, etiqueta };
    }

    function notaSql() {
        try {
            const w = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT);
            let c;
            let n = 0;
            while ((c = w.nextNode()) && n < 400) {
                n++;
                const t = String(c.nodeValue || '').trim();
                if (t.length < 300 && /\bSQL\b/.test(t) && /\bms\b|faster|slower|took/i.test(t)) return t;
            }
        } catch (e) { }
        return '';
    }


    function seccion(id, titulo, cuerpoHtml, cls) {
        return '<section class="nsft-pp-sec' + (cls ? ' ' + cls : '') + '" data-sec="' + id + '">'
            + '<div class="nsft-pp-sechead"><span class="nsft-pp-sectitle">' + esc(titulo) + '</span>'
            + '<span class="nsft-pp-secaside"></span></div>'
            + '<div class="nsft-pp-secbody">' + cuerpoHtml + '</div></section>';
    }

    function cargando() {
        return '<div class="nsft-pp-muted">' + esc(i18n('pp_loading', 'Loading…')) + '</div>';
    }

    function vacioSeccion(icono, txt) {
        if (window.NSFT_Herramientas) return window.NSFT_Herramientas.vacio(icono, txt, '', '', { linea: true });
        return '<div class="nsft-pp-muted">' + esc(txt) + '</div>';
    }

    function fila4(label, pct, valor, pctTxt, cls) {
        const w = Math.max(0, Math.min(100, Math.round(pct || 0)));
        return '<span class="nsft-pp-l ' + (cls || '') + '" title="' + esc(label) + '">' + esc(label) + '</span>'
            + '<span class="nsft-pp-track ' + (cls || '') + '">' + (w ? '<i style="width:' + w + '%"></i>' : '') + '</span>'
            + '<span class="nsft-pp-v ' + (cls || '') + '">' + esc(valor) + '</span>'
            + '<span class="nsft-pp-p ' + (cls || '') + '">' + esc(pctTxt || '') + '</span>';
    }

    let _ultimo = null;

    function open() {
        close();
        const m = computeMetrics();

        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.className = 'nsft-pp-overlay nsft-modal-backdrop';
        overlay.setAttribute('data-theme', resolveTheme());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.className = 'nsft-pp-panel nsft-modal nsft-modal--dialog';
        panel.setAttribute('data-theme', resolveTheme());

        const headHtml = '<div class="nsft-modal-header">'
            + '<span class="nsft-modal-title">'
            + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>'
            + '' + esc(i18n('pp_title', 'Page performance')) + '</span>'
            + '<div class="nsft-header-actions">'
            + '<button type="button" class="nsft-pp-x nsft-modal-btn-close" aria-label="Close">✕</button>'
            + '</div>'
            + '</div>';

        if (!m) {
            const sinDatos = i18n('pp_unavailable', 'Timing data is not available on this page.');
            panel.innerHTML = headHtml
                + '<div class="nsft-pp-empty">' + (window.NSFT_Herramientas ? window.NSFT_Herramientas.vacio('grafica', sinDatos) : esc(sinDatos)) + '</div>';
            const x = panel.querySelector('.nsft-pp-x');
            if (x) x.addEventListener('click', close);
            overlay.appendChild(panel);
            mount(overlay);
            return;
        }

        const reg = tipoDeRegistro();
        const res = recursos();
        _ultimo = { m, res, reg, ns: null, scripts: null, bloq: null, nota: notaSql() };

        panel.innerHTML =
            headHtml
            + '<div class="nsft-pp-body">'
            + '<div class="nsft-pp-hero">'
            + '<div class="nsft-pp-hero-item"><span class="nsft-pp-big">' + esc(fmtMs(m.total)) + (m.stillLoading ? ' <span class="nsft-pp-loading">…</span>' : '') + '</span><span class="nsft-pp-cap">' + esc(i18n('pp_total', 'Fully loaded')) + '</span></div>'
            + '<div class="nsft-pp-hero-item"><span class="nsft-pp-big2">' + esc(fmtMs(m.dcl)) + '</span><span class="nsft-pp-cap">' + esc(i18n('pp_dcl', 'DOMContentLoaded')) + '</span></div>'
            + '</div>'
            + '<div class="nsft-pp-cols">'
            + seccion('ns', i18n('pp_grp_core', 'NetSuite'), cargando())
            + seccion('nav', i18n('pp_sec_browser', 'Browser'), htmlNavegador(m))
            + '</div>'
            + seccion('scripts', i18n('pp_sec_scripts', 'Scripts and workflows on this record'), reg.tipo ? cargando()
                : '<div class="nsft-pp-muted">' + esc(i18n('pp_scripts_na', 'This page is not a record.')) + '</div>', 'is-wide')
            + '<div class="nsft-pp-cols is-bottom">'
            + seccion('res', i18n('pp_sec_res', 'What was downloaded'), htmlRecursos(res, {}))
            + '<div class="nsft-pp-stack">'
            + seccion('block', i18n('pp_sec_block', 'Browser blocking'), cargando())
            + seccion('nsft', i18n('pp_sec_nsft', 'NetSuite Full Tools impact'), cargando())
            + '</div></div>'
            + '</div>'
            + '<div class="nsft-pp-foot"><button type="button" class="nsft-pp-copy">' + esc(i18n('pp_copy', 'Copy summary')) + '</button></div>';

        panel.querySelector('.nsft-pp-x').addEventListener('click', close);
        panel.querySelector('.nsft-pp-copy').addEventListener('click', () => copySummary());

        overlay.appendChild(panel);
        mount(overlay);

        const pon = (id, html, aside) => {
            if (!panel.isConnected) return;
            const s = panel.querySelector('.nsft-pp-sec[data-sec="' + id + '"]');
            if (!s) return;
            s.querySelector('.nsft-pp-secbody').innerHTML = html;
            if (aside != null) s.querySelector('.nsft-pp-secaside').innerHTML = aside;
        };

        pon('nav', htmlNavegador(m), asideTotal(fmtMs(m.phases.reduce((s, p) => s + p.value, 0))));
        pon('res', htmlRecursos(res, {}), asideRecursos(res));

        bloqueos().then((b) => {
            _ultimo.bloq = b;
            pon('block', htmlBloqueos(b, _ultimo.nombres || {}));
            pon('nsft', htmlNsft(b));
        });

        pide('ns_timing', {}, 8000).then((p) => {
            _ultimo.ns = p;
            const rows = (p && p.rows) || [];
            const total = rows.length && rows[0].pct == null ? rows[0].seconds : null;
            pon('ns', htmlNs(p, _ultimo.nota), total != null ? asideTotal(total.toFixed(3) + ' s') : '');
        });
        if (reg.tipo) {
            const fileIds = Array.from(new Set(res.grupos.custom.items.map((x) => x.fileId).filter(Boolean)));
            pide('scripts', { recordType: reg.tipo, fileIds }, 25000).then((p) => {
                _ultimo.scripts = p;
                const nombres = {};
                ((p && p.files && p.files.rows) || []).forEach((r) => { nombres[String(r.id)] = r.name; });
                _ultimo.nombres = nombres;
                const t = htmlScripts(p, reg);
                pon('scripts', t.html, esc(t.resumen));
                pon('res', htmlRecursos(res, nombres));
                if (_ultimo.bloq) pon('block', htmlBloqueos(_ultimo.bloq, nombres));
            });
        }
    }

    function asideTotal(txt) {
        return esc(i18n('pp_total_short', 'Total')) + ' <strong>' + esc(txt) + '</strong>';
    }

    function htmlNavegador(m) {
        const suma = Math.max(1, m.phases.reduce((s, p) => s + p.value, 0));
        const max = Math.max(...m.phases.map((p) => p.value));
        return '<div class="nsft-pp-grid4">' + m.phases.map((p) => {
            const pct = (p.value / suma) * 100;
            const cls = p.value === 0 ? 'is-zero' : (p.value === max ? 'is-max' : '');
            return fila4(p.label, pct, fmtMs(p.value), p.value ? Math.round(pct) + '%' : '', cls);
        }).join('') + '</div>';
    }

    const RX_SUB = /suitescript|workflow|flujo/i;

    function htmlNs(p, nota) {
        const todas = (p && p.rows) || [];
        const rows = todas.length && todas[0].pct == null && todas.length > 1 ? todas.slice(1) : todas;
        let html = '';
        if (!rows.length) {
            html = vacioSeccion('grafica', i18n('pp_ns_none', 'NetSuite did not report its breakdown on this page.'));
        } else {
            const principales = rows.filter((r) => !RX_SUB.test(r.name) && r.pct != null);
            const maxPct = principales.length ? Math.max(...principales.map((r) => r.pct)) : null;
            html = '<div class="nsft-pp-grid4">' + rows.map((r) => {
                const sub = RX_SUB.test(r.name);
                const cls = (sub ? 'is-sub ' : '') + (r.seconds === 0 ? 'is-zero' : (!sub && r.pct === maxPct ? 'is-max' : ''));
                return fila4(r.name, r.pct != null ? r.pct : 100, r.seconds.toFixed(3) + ' s',
                    r.pct != null ? Math.round(r.pct) + '%' : '', cls);
            }).join('') + '</div>';
            if (todas.length === 1) {
                html += '<div class="nsft-pp-hint">' + esc(i18n('pp_ns_hint',
                    'Open this page from another NetSuite page to see the server breakdown (server, SuiteScript, workflows, network).')) + '</div>';
            }
        }
        if (nota) html += '<div class="nsft-pp-note"><strong>' + esc(i18n('pp_ns_sql', 'Server note')) + ':</strong> ' + esc(nota) + '</div>';
        return html;
    }

    function chipTipo(t) {
        const k = String(t || '').toUpperCase();
        return k === 'USEREVENT' ? 'is-ue' : k === 'CLIENT' ? 'is-cs' : k === 'ACTION' ? 'is-act'
            : k === 'MASSUPDATE' ? 'is-act' : k === 'WORKFLOW' ? 'is-wf' : '';
    }

    const COMPUESTOS = { NOTSCHEDULED: 'not scheduled', INQUEUE: 'in queue', INPROGRESS: 'in progress' };
    function capital(s) {
        const k = String(s || '').toUpperCase();
        const t = COMPUESTOS[k] || k.toLowerCase();
        return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
    }

    function htmlScripts(p, reg) {
        const nada = (txt) => ({ html: '<div class="nsft-pp-muted">' + esc(txt) + '</div>', resumen: '' });
        if (!p) return nada(i18n('pp_scripts_err', 'The scripts could not be queried on this page.'));
        const desp = (p.deployments && p.deployments.rows) || [];
        const etq = String(reg.etiqueta || '').toLowerCase();
        const wfs = ((p.workflows && p.workflows.rows) || []).filter((w) => {
            if (!etq) return false;
            const lista = String(w.tipos || '').toLowerCase().split(/\s*,\s*/);
            return lista.indexOf(etq) !== -1 || String(w.base || '').toLowerCase() === etq;
        });
        if (!desp.length && !wfs.length) {
            const err = (p.deployments && p.deployments.error) || (p.workflows && p.workflows.error);
            if (err) return nada(i18n('pp_scripts_err', 'The scripts could not be queried on this page.'));
            return { html: vacioSeccion('bandeja', i18n('pp_scripts_none', 'No scripts or workflows are deployed on this record type.')), resumen: '' };
        }
        const cuenta = {};
        desp.forEach((d) => { const k = d.tipo || d.scripttype; cuenta[k] = (cuenta[k] || 0) + 1; });
        const resumen = Object.keys(cuenta).map((k) => cuenta[k] + ' ' + k)
            .concat(wfs.length ? [wfs.length + ' ' + i18n('pp_wf', 'Workflow')] : []).join(' · ');

        const fila = (chipCls, chip, nombre, href, api, estado) =>
            '<div class="nsft-pp-trow">'
            + '<span><span class="nsft-pp-chip nsft-tipo ' + chipCls + '">' + esc(chip) + '</span></span>'
            + '<span class="nsft-pp-name">' + (href ? '<a href="' + esc(href) + '" target="_blank" rel="noopener" title="' + esc(nombre) + '">' + esc(nombre) + '</a>' : '<span title="' + esc(nombre) + '">' + esc(nombre) + '</span>') + '</span>'
            + '<span>' + esc(api || '—') + '</span>'
            + (window.NSFT_Herramientas && estado
                ? (() => { const e = window.NSFT_Herramientas.estadoNS(estado); return '<span class="nsft-pp-status"><span class="' + e.clase + '">' + esc(e.texto) + '</span></span>'; })()
                : '<span class="nsft-pp-status">' + esc(capital(estado) || '—') + '</span>')
            + '</div>';

        const filas = desp.map((d) => fila(chipTipo(d.scripttype), d.tipo || d.scripttype, d.name,
            '/app/common/scripting/script.nl?id=' + encodeURIComponent(d.id), d.apiversion, d.status))
            .concat(wfs.map((w) => fila('is-wf', i18n('pp_wf', 'Workflow'), w.name, null, '', w.releasestatus)));

        return {
            resumen,
            html: '<div class="nsft-pp-table">'
                + '<div class="nsft-pp-thead">'
                + '<span>' + esc(i18n('pp_col_type', 'Type')) + '</span><span>' + esc(i18n('pp_col_name', 'Name')) + '</span>'
                + '<span>' + esc(i18n('pp_col_api', 'API')) + '</span><span>' + esc(i18n('pp_col_status', 'Status')) + '</span>'
                + '</div><div class="nsft-pp-tbody">' + filas.join('') + '</div></div>'
        };
    }

    function etiquetaArchivo(it, nombres) {
        if (it.fileId && nombres && nombres[it.fileId]) return nombres[it.fileId];
        return it.name;
    }

    function asideRecursos(res) {
        return '<strong>' + esc(String(res.total)) + '</strong> ' + esc(i18n('pp_requests_short', 'requests'))
            + ' · ' + esc(fmtBytes(res.bytes));
    }

    function htmlRecursos(res, nombres) {
        const nombreGrupo = {
            custom: i18n('pp_grp_custom', 'Custom scripts'),
            data: i18n('pp_grp_data', 'Server calls'),
            core: i18n('pp_grp_core', 'NetSuite'),
            ext: i18n('pp_grp_ext', 'Extensions'),
            other: i18n('pp_grp_other', 'Other')
        };
        const bloques = GRUPOS.filter((k) => res.grupos[k].count).map((k) => {
            const g = res.grupos[k];
            const candidatos = k === 'core'
                ? g.items.filter((it) => !/\.(svg|png|gif|jpe?g|ico|woff2?|ttf)$/i.test(it.name))
                : g.items;
            const top = candidatos.slice(0, k === 'core' ? 3 : 4);
            const max = Math.max(1, ...top.map((it) => it.ms));
            const peso = g.bytes ? fmtBytes(g.bytes) : i18n('pp_cached', 'from cache');
            return '<span class="nsft-pp-gname is-' + k + '">' + esc(nombreGrupo[k]) + ' <span>· ' + g.count + '</span></span>'
                + '<span></span><span></span><span class="nsft-pp-gsize">' + esc(peso) + '</span>'
                + top.map((it) => '<span class="nsft-pp-iname" title="' + esc(etiquetaArchivo(it, nombres)) + '">' + esc(etiquetaArchivo(it, nombres)) + '</span>'
                    + '<span class="nsft-pp-track is-thin is-' + k + '"><i style="width:' + Math.round((it.ms / max) * 100) + '%"></i></span>'
                    + '<span class="nsft-pp-v">' + esc(fmtMs(it.ms)) + '</span>'
                    + '<span class="nsft-pp-p">' + (it.bytes ? esc(fmtBytes(it.bytes)) : '—') + '</span>').join('');
        }).join('');
        return '<div class="nsft-pp-grid4 is-res">' + bloques + '</div>';
    }

    function htmlBloqueos(b, nombres) {
        if (!b) return '<div class="nsft-pp-muted">' + esc(i18n('pp_block_na', 'This browser does not report blocking.')) + '</div>';
        if (!b.bloqueado && !b.top.length) return '<div class="nsft-pp-ok">✓ ' + esc(i18n('pp_block_none', 'No long tasks blocked the page.')) + '</div>';
        const lab = (x) => (x.fileId && nombres && nombres[x.fileId]) ? nombres[x.fileId] : x.label;
        const max = Math.max(1, ...b.top.map((x) => x.ms));
        return '<div class="nsft-pp-sum">' + esc(i18n('pp_block_total', '$1 blocked · $2 long tasks', [fmtMs(b.bloqueado), String(b.largos)])) + '</div>'
            + (b.top.length ? '<div class="nsft-pp-grid3">' + b.top.map((x) =>
                '<span class="nsft-pp-iname" title="' + esc(lab(x)) + '">' + esc(lab(x)) + '</span>'
                + '<span class="nsft-pp-track is-' + x.clase + '"><i style="width:' + Math.round((x.ms / max) * 100) + '%"></i></span>'
                + '<span class="nsft-pp-v is-max">' + esc(fmtMs(x.ms)) + '</span>').join('') + '</div>' : '');
    }

    function htmlNsft(b) {
        if (!b) return '<div class="nsft-pp-muted">' + esc(i18n('pp_block_na', 'This browser does not report blocking.')) + '</div>';
        if (!b.nsftN) return '<div class="nsft-pp-ok">✓ ' + esc(i18n('pp_nsft_none', 'The extension caused no long tasks on this page.')) + '</div>';
        return '<div class="nsft-pp-sum">' + esc(i18n('pp_nsft_line', '$1 of work in long tasks ($2 scripts)', [fmtMs(b.nsftMs), String(b.nsftN)])) + '</div>';
    }

    function mount(overlay) {
        (document.body || document.documentElement).appendChild(overlay);
        document.addEventListener('keydown', onKey, true);
    }

    function onKey(e) {
        if (e.key === 'Escape') { e.stopPropagation(); close(); }
    }

    function close() {
        const o = document.getElementById(OVERLAY_ID);
        if (o) o.remove();
        document.removeEventListener('keydown', onKey, true);
    }

    function copySummary() {
        const u = _ultimo;
        if (!u) return;
        const m = u.m;
        const L = [
            i18n('pp_title', 'Page performance') + ' — ' + location.pathname,
            i18n('pp_total', 'Fully loaded') + ': ' + fmtMs(m.total),
            i18n('pp_dcl', 'DOMContentLoaded') + ': ' + fmtMs(m.dcl)
        ];
        const ns = (u.ns && u.ns.rows) || [];
        if (ns.length) {
            L.push('', i18n('pp_sec_ns', 'According to NetSuite') + ':');
            ns.forEach((r) => L.push('  - ' + r.name + ': ' + r.seconds.toFixed(3) + ' s' + (r.pct != null ? ' (' + r.pct.toFixed(0) + '%)' : '')));
        }
        if (u.nota) L.push('  ' + i18n('pp_ns_sql', 'Server note') + ': ' + u.nota);
        L.push('', i18n('pp_sec_browser', 'Browser') + ':');
        m.phases.forEach(p => L.push('  - ' + p.label + ': ' + fmtMs(p.value)));
        const desp = (u.scripts && u.scripts.deployments && u.scripts.deployments.rows) || [];
        if (desp.length) {
            L.push('', i18n('pp_sec_scripts', 'Scripts and workflows on this record') + ':');
            desp.forEach((d) => L.push('  - [' + (d.tipo || d.scripttype) + '] ' + d.name + ' · ' + (d.apiversion || '') + ' · ' + (d.status || '')));
        }
        L.push('', i18n('pp_requests', 'Requests') + ': ' + u.res.total + ' (' + fmtBytes(u.res.bytes) + ')');
        GRUPOS.forEach((k) => {
            const g = u.res.grupos[k];
            if (!g.count) return;
            L.push('  - ' + k + ': ' + g.count + ' · ' + fmtBytes(g.bytes) + ' · ' + g.items.slice(0, 3).map((it) => etiquetaArchivo(it, u.nombres) + ' ' + fmtMs(it.ms)).join(', '));
        });
        if (u.bloq) {
            L.push('', i18n('pp_block_total', 'Blocked time: $1 in $2 long tasks', [fmtMs(u.bloq.bloqueado), String(u.bloq.largos)]));
            u.bloq.top.forEach((x) => L.push('  - ' + ((x.fileId && u.nombres && u.nombres[x.fileId]) || x.label) + ': ' + fmtMs(x.ms)));
            L.push(i18n('pp_sec_nsft', 'NetSuite Full Tools impact') + ': ' + fmtMs(u.bloq.nsftMs));
        }
        const text = L.join('\n');

        if (window.NSFT_Clipboard && typeof window.NSFT_Clipboard.copy === 'function') {
            window.NSFT_Clipboard.copy(text, { toast: i18n('pp_copied', 'Performance summary copied') });
        } else {
            try { navigator.clipboard.writeText(text); } catch (e) { }
        }
    }
})();
