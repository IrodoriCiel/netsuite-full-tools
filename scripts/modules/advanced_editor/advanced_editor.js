(function () {
    'use strict';

    const STORAGE_KEY = 'enableAdvancedEditor';
    const CACHE_KEY = 'nsftAdvTree';
    const MARCO_KEY = 'nsftAdvMarco';
    const PARAM = 'nsft-advanced-editor';
    const FETCHER_DEST = 'fetcher_adv';
    const EXTENSION_DEST = 'extension_adv';

    if (!/\/app\/common\/record\/edittextmediaitem\.nl/i.test(location.pathname)) return;
    try {
        if (new URLSearchParams(location.search).get(PARAM) !== 'T') return;
    } catch (e) { return; }

    document.documentElement.classList.add('nsft-adv-full');
    let _marcaEditor = false;

    function sinPantallaCompleta() {
        cierraVelo();
        sueltaTema();
        if (_sueltaMudo) { try { _sueltaMudo(); } catch (e) { } _sueltaMudo = null; }
        document.documentElement.classList.remove('nsft-adv-full');
        document.documentElement.classList.remove('nsft-adv-listo');
        if (_marcaEditor) {
            document.documentElement.classList.remove('nsft-editor-themed');
            _marcaEditor = false;
        }
    }

    function tapaAntesDeSalir() {
        document.documentElement.classList.remove('nsft-adv-listo');
    }


    const VELO_ID = 'nsft-adv-velo';
    const VELO_PASOS = 3;
    let _veloReloj = null;

    function abreVelo() {
        if (document.getElementById(VELO_ID)) return;
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', abreVelo, { once: true });
            return;
        }
        const raiz = document.body;
        const el = document.createElement('div');
        el.id = VELO_ID;
        el.className = 'nsft-adv-velo';
        el.setAttribute('data-nsft-ui', '');
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        el.innerHTML =
            '<div class="nsft-adv-velo-card">'
            + '<div class="nsft-adv-velo-top">'
                + '<span class="nsft-ui-spinner nsft-adv-velo-spin"></span>'
                + '<span class="nsft-adv-velo-title"></span>'
            + '</div>'
            + '<div class="nsft-adv-velo-step"></div>'
            + '<div class="nsft-adv-velo-bar"><span></span></div>'
            + '</div>';
        el.querySelector('.nsft-adv-velo-title').textContent =
            i18n('enableAdvancedEditorLabel', 'Advanced Editor');
        raiz.appendChild(el);
        pasoVelo('adv_velo_1', 'Preparing the editor…', 1);

        clearTimeout(_veloReloj);
        _veloReloj = setTimeout(cierraVelo, 8000);
    }

    function pasoVelo(clave, respaldo, n, vals) {
        const el = document.getElementById(VELO_ID);
        if (!el) return;
        const t = el.querySelector('.nsft-adv-velo-step');
        const b = el.querySelector('.nsft-adv-velo-bar span');
        if (t) t.textContent = vals ? fmt(clave, respaldo, vals) : i18n(clave, respaldo);
        if (b) b.style.width = Math.min(100, Math.round((n / VELO_PASOS) * 100)) + '%';
    }

    function cierraVelo() {
        clearTimeout(_veloReloj);
        _veloArbol = false;
        const el = document.getElementById(VELO_ID);
        if (!el) return;
        el.classList.add('is-done');
        setTimeout(() => { try { el.remove(); } catch (e) { } }, 220);
    }

    let _veloArbol = false;

    function veloTrasArbol() {
        if (!_veloArbol) return;
        const raiz = _nodos.get(raizPanel());
        if (!raiz || (!raiz.cargado && !raiz.error)) return;
        _veloArbol = false;
        pasoVelo('adv_velo_3', 'Ready', VELO_PASOS);
        cierraVelo();
    }

    const TS = window.NSFT_TextSearch || null;

    let _handle = null;
    let _cm = null;
    let _caja = null;
    let _sueltaMudo = null;
    let _prefs = { advancedEditorWrap: false, advancedEditorTree: true, advancedEditorMinimap: false };
    let _genLimpia = 0;
    let _saliendoAGuardar = false;

    chrome.storage.local.get({
        [STORAGE_KEY]: true,
        advancedEditorWrap: false,
        advancedEditorEngine: 'cm5',
        advancedEditorTree: true,
        advancedEditorMinimap: false,
        advancedEditorTheme: 'atom-one-light',
        advancedEditorThemeOverridden: false,
        advancedEditorRuler: 0,
        enableSuiteQLRunner: true,
        enableSuiteScriptConsole: true,
        [CACHE_KEY]: null,
        [MARCO_KEY]: {}
    }, (items) => {
        if (!items[STORAGE_KEY]) { sinPantallaCompleta(); return; }
        _prefs = items;
        leeCache(items);
        if (items.advancedEditorTree) document.documentElement.classList.add('nsft-adv-conarbol');
        if (esTemaOscuro(temaGuardado(items))) document.documentElement.classList.add('nsft-adv-oscuro');
        marcoRecordado(items, temaGuardado(items));
        sellaTema(temaGuardado(items));
        abreVelo();
        if (document.readyState === 'complete') arrancar();
        else window.addEventListener('load', arrancar, { once: true });

        setTimeout(() => {
            if (!document.documentElement.classList.contains('nsft-adv-listo')) {
                sinPantallaCompleta();
            }
        }, 8000);
    });

    function temaGuardado(items) {
        const t = String((items && items.advancedEditorTheme) || '').trim();
        if (items && items.advancedEditorThemeOverridden && t) return t;
        return oscuroAhora() ? 'atom-one-dark' : 'atom-one-light';
    }

    function oscuroAhora() {
        return document.documentElement.getAttribute('data-nsft-theme') === 'dark';
    }

    function cargaHojaTema(nombre) {
        if (!nombre || nombre === 'default') return;
        const archivo = nombre.indexOf('solarized') === 0 ? 'solarized' : nombre;
        const id = 'nsft-adv-codemirror-theme';
        let link = document.getElementById(id);
        if (!link) {
            link = document.createElement('link');
            link.id = id;
            link.rel = 'stylesheet';
            (document.head || document.documentElement).appendChild(link);
        }
        link.href = chrome.runtime.getURL('scripts/libs/codemirror/theme/' + archivo + '.min.css');
        link.onload = () => pintaMarco(nombre);
        requestAnimationFrame(() => pintaMarco(nombre));
    }

    function aplicaTema(nombre) {
        cargaHojaTema(nombre);
        if (_caja) _caja.setAttribute('data-theme', esTemaOscuro(nombre) ? 'dark' : 'light');
        if (_cm) { try { _cm.setOption('theme', nombre); } catch (e) { } }
        sellaTema(nombre);
        pintaMarco(nombre);
        pintaRegla();
        programaMapa();
    }


    let _temaPrevio = null;

    function sellaTema(nombre) {
        try {
            const raiz = document.documentElement;
            if (_temaPrevio === null) _temaPrevio = raiz.getAttribute('data-nsft-theme') || '';
            raiz.setAttribute('data-nsft-theme', esTemaOscuro(nombre) ? 'dark' : 'light');
            raiz.classList.add('nsft-editor-themed');
            _marcaEditor = true;
        } catch (e) { }
    }

    function sueltaTema() {
        try {
            const raiz = document.documentElement;
            if (_temaPrevio !== null) {
                if (_temaPrevio) raiz.setAttribute('data-nsft-theme', _temaPrevio);
                else raiz.removeAttribute('data-nsft-theme');
                _temaPrevio = null;
            }
        } catch (e) { }
    }


    const MARCO_OSCURO = ['--nsft-dk-deepest', '--nsft-dk-panel', '--nsft-dk-surface',
                          '--nsft-dk-hover', '--nsft-dk-border', '--nsft-dk-border2'];
    const MARCO_CLARO = ['--nsft-surface-0', '--nsft-surface-1', '--nsft-surface-2', '--nsft-border'];
    const MARCO_GUIA = '--nsft-guia';

    const GUIA_OSCURO = 'rgba(255, 255, 255, 0.09)';
    const GUIA_CLARO = 'rgba(0, 0, 0, 0.08)';

    function rgbDe(el, prop) {
        if (!el) return null;
        const v = getComputedStyle(el)[prop];
        const m = String(v || '').match(/^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
        if (!m) return null;
        if (/rgba\([^)]*,\s*0(\.0+)?\)\s*$/.test(v)) return null;
        return [Number(m[1]), Number(m[2]), Number(m[3])];
    }

    function mezcla(rgb, hacia, f) {
        return 'rgb(' + rgb.map((c) => Math.round(c + (hacia - c) * f)).join(', ') + ')';
    }
    const oscurece = (rgb, f) => mezcla(rgb, 0, f);
    const aclara = (rgb, f) => mezcla(rgb, 255, f);


    const MARCO_MAX = 4;

    function recuerdaMarco(nombre, vals) {
        try {
            chrome.storage.local.get({ [MARCO_KEY]: {} }, (it) => {
                const m = (it && it[MARCO_KEY]) || {};
                m[nombre] = { v: vals, t: Date.now() };
                const claves = [nombre].concat(
                    Object.keys(m).filter((k) => k !== nombre)
                        .sort((a, b) => (m[b].t || 0) - (m[a].t || 0)));
                const podado = {};
                claves.slice(0, MARCO_MAX).forEach((k) => { podado[k] = m[k]; });
                chrome.storage.local.set({ [MARCO_KEY]: podado });
            });
        } catch (e) { }
    }

    function marcoRecordado(items, nombre) {
        const m = (items && items[MARCO_KEY]) || null;
        const e = m && m[nombre];
        if (!e || !e.v) return;
        try {
            const raiz = document.documentElement.style;
            Object.keys(e.v).forEach((k) => raiz.setProperty(k, e.v[k]));
        } catch (err) { }
    }


    function plumaDe(editor, clase) {
        let s = null;
        try {
            s = document.createElement('span');
            s.className = 'cm-' + clase;
            s.style.display = 'none';
            editor.appendChild(s);
            const c = getComputedStyle(s).color;
            return /^rgba?\(/.test(c) ? c : '';
        } catch (e) {
            return '';
        } finally {
            try { if (s) s.remove(); } catch (e2) { }
        }
    }

    const DOC_VARS = ['--nsft-doc-tag', '--nsft-doc-type'];

    function pintaJsdoc(editor, est) {
        DOC_VARS.forEach((v) => est.removeProperty(v));
        if (!editor) return;
        const et = plumaDe(editor, 'keyword');
        const ti = plumaDe(editor, 'variable-3');
        const base = plumaDe(editor, 'nsft-doc-ninguna');
        if (et && et !== base) est.setProperty('--nsft-doc-tag', et);
        if (ti && ti !== base) est.setProperty('--nsft-doc-type', ti);
    }

    function pintaMarco(nombre) {
        if (!_caja) return;
        _mapaCols = null;
        _mapaTema = '';
        _mapaHuella = '';
        _mapaHuellaT = 0;
        _mapaClave = '';
        programaMapa();
        const est = _caja.style;
        pintaJsdoc(_caja.querySelector('.CodeMirror, .cm-editor'), est);
        MARCO_OSCURO.concat(MARCO_CLARO).concat([MARCO_GUIA]).forEach((v) => est.removeProperty(v));

        const editor = _caja.querySelector('.CodeMirror, .cm-editor');
        const fondo = rgbDe(editor, 'backgroundColor');
        if (!fondo) return;

        if (esTemaOscuro(nombre)) {
            const canaleta = rgbDe(_caja.querySelector('.CodeMirror-gutters, .cm-gutters'), 'backgroundColor');
            const propio = canaleta && canaleta.join() !== fondo.join();
            est.setProperty('--nsft-dk-surface', mezcla(fondo, 0, 0));
            est.setProperty('--nsft-dk-panel', propio ? mezcla(canaleta, 0, 0) : oscurece(fondo, 0.18));
            est.setProperty('--nsft-dk-deepest', oscurece(fondo, 0.34));
            est.setProperty('--nsft-dk-hover', aclara(fondo, 0.08));
            est.setProperty('--nsft-dk-border', aclara(fondo, 0.17));
            est.setProperty('--nsft-dk-border2', aclara(fondo, 0.27));
            est.setProperty(MARCO_GUIA, GUIA_OSCURO);
            recuerdaMarco(nombre, leeVars(est, MARCO_OSCURO.concat([MARCO_GUIA])));
            return;
        }

        est.setProperty('--nsft-surface-0', mezcla(fondo, 0, 0));
        est.setProperty('--nsft-surface-1', oscurece(fondo, 0.03));
        est.setProperty('--nsft-surface-2', oscurece(fondo, 0.07));
        est.setProperty('--nsft-border', oscurece(fondo, 0.14));
        est.setProperty(MARCO_GUIA, GUIA_CLARO);
        recuerdaMarco(nombre, leeVars(est, MARCO_CLARO.concat([MARCO_GUIA])));
    }

    function leeVars(est, nombres) {
        const out = {};
        nombres.forEach((n) => { const v = est.getPropertyValue(n); if (v) out[n] = v; });
        return out;
    }

    const TEMAS_CLAROS = ['atom-one-light', 'eclipse', 'idea', 'neo', 'solarized light', 'default'];
    function esTemaOscuro(nombre) {
        return TEMAS_CLAROS.indexOf(String(nombre || '')) === -1;
    }

    function i18n(k, f) {
        try { return chrome.i18n.getMessage(k) || f; } catch (e) { return f; }
    }

    function fmt(k, f, vals) {
        const args = (vals || []).map((v) => String(v));
        try {
            const m = chrome.i18n.getMessage(k, args);
            if (m) return m;
        } catch (e) { }
        let s = f;
        args.forEach((v, i) => { s = s.split('$' + (i + 1)).join(v); });
        return s;
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function svg(d, sw) {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 1.8) + '" '
            + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
    }

    const ICO = {
        code: 'M8 6l-5 6 5 6M16 6l5 6-5 6',
        find: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
        format: 'M4 6h10M4 12h16M4 18h7M17 15l3 3-3 3',
        ghost: 'M12 5l1.8 5.2L19 12l-5.2 1.8L12 19l-1.8-5.2L5 12l5.2-1.8z',
        tabla: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14M16 5v14',
        wrap: 'M4 6h16M4 12h11a3 3 0 1 1 0 6h-3M4 18h4M12 15l-3 3 3 3',
        externo: 'M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
        descarga: 'M12 3v11M8 10l4 4 4-4M5 19h14',
        comparar: 'M8.5 6a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0'
            + 'M20.5 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0'
            + 'M6 8.5V15a3 3 0 0 0 3 3h6M18 15.5V9a3 3 0 0 0-3-3H9',
        cerrar: 'M6 6l12 12M18 6L6 18',
        abajo: 'M8 10l4 4 4-4',
        recarga: 'M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4',
        irArchivo: 'M13 2H6a2 2 0 0 0-2 2v6M13 2l5 5M13 2v5h5M8 20H6a2 2 0 0 1-2-2M14 18h7M18 15l3 3-3 3',
        sql: 'M12 3c4.4 0 8 1.1 8 2.5S16.4 8 12 8 4 6.9 4 5.5 7.6 3 12 3zM4 5.5v13C4 19.9 7.6 21 12 21s8-1.1 8-2.5v-13M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5',
        consola: 'M3 4h18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM7 9l3 3-3 3M13 15h4',
        desplegar: 'M8 9l4-4 4 4M8 15l4 4 4-4',
        menos: 'M5 12h14',
        mas: 'M12 5v14M5 12h14',
        ajusta: 'M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5',
        ficha: 'M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5zM7 9.5h4M7 13h10M7 16h6',
        tree: 'M4 5h6l2 2h8v12H4zM4 10h16'
    };

    function toast(msg) {
        if (window.NSFT_Clipboard && window.NSFT_Clipboard.showToast) {
            window.NSFT_Clipboard.showToast(msg, {});
        }
    }


    function arrancar() {
        pasoVelo('adv_velo_2', 'Loading the file…', 2);
        try { montar(); } catch (e) {
            try { console.error('NSFT: el Editor Avanzado no pudo montarse', e); } catch (_) { }
            sinPantallaCompleta();
        }
    }

    function montar() {
        const ta = document.getElementById('mCharData');
        if (!ta || ta.dataset.nsftAdvEditor) { sinPantallaCompleta(); return; }
        if (typeof CodeMirror === 'undefined' || !window.NSFT_CodeEditor) {
            sinPantallaCompleta();
            return;
        }
        ta.dataset.nsftAdvEditor = '1';

        const tema = temaGuardado(_prefs);
        const oscuro = esTemaOscuro(tema);
        cargaHojaTema(tema);
        const nombre = nombreArchivo();

        const caja = document.createElement('div');
        _caja = caja;
        caja.className = 'nsft-adv-editor';
        caja.setAttribute('data-nsft-ui', '');
        caja.setAttribute('data-theme', oscuro ? 'dark' : 'light');
        caja.innerHTML = plantilla(nombre);

        ta.parentNode.insertBefore(caja, ta);
        caja.querySelector('#nsft-adv-host').appendChild(ta);

        const diag = caja.querySelector('#nsft-adv-diag');
        const diagMsg = caja.querySelector('.nsft-adv-diag-msg');
        let lintLinea = null;

        _handle = window.NSFT_CodeEditor.attach(ta, {
            engine: _prefs.advancedEditorEngine === 'cm6' ? 'cm6' : 'cm5',
            themeDark: oscuro,
            mode: modoDe(nombre),
            theme: tema,
            folding: true,
            activeLine: true,
            indentGuides: true,
            highlightWord: true,
            apiSegunArchivo: true,
            ghostButton: caja.querySelector('#nsft-adv-ghost'),
            ambitoIa: 'adv',
            extraKeys: {
                'Ctrl-S': () => { guardar(); },
                'Ctrl-F': () => { abreBuscar(); },
                'Ctrl-G': () => { irALinea(); },
                'Shift-Alt-F': () => { formatear(); },
                'Shift-Ctrl-F': () => { abreBuscador(); },
                'Shift-Cmd-F': () => { abreBuscador(); },
                'Alt-W': () => { cierraArchivo(); },
                'Alt-1': () => { activaTab(0); },
                'Alt-2': () => { activaTab(1); },
                'Alt-3': () => { activaTab(2); },
                'Alt-4': () => { activaTab(3); },
                'Alt-5': () => { activaTab(4); },
                'Alt-6': () => { activaTab(5); },
                'Alt-7': () => { activaTab(6); },
                'Alt-8': () => { activaTab(7); },
                'Alt-9': () => { activaTab(_tabs.length - 1); }
            },
            onLint: (r) => {
                if (!_esJs) return;
                const cm = _cm;
                if (lintLinea != null && cm) {
                    try { cm.removeLineClass(lintLinea, 'background', 'nsft-adv-line-error'); } catch (e) { }
                    lintLinea = null;
                }
                if (!r) {
                    diag.classList.remove('is-error');
                    diag.removeAttribute('title');
                    diagMsg.textContent = i18n('adv_diag_ok', 'No errors');
                    return;
                }
                const texto = (r.line != null)
                    ? fmt('ssc_lint_en_linea', 'Line $1: $2', [r.line + 1, r.msg])
                    : r.msg;
                diag.classList.add('is-error');
                diag.title = texto;
                diagMsg.textContent = texto;
                if (r.line != null && cm) {
                    try { cm.addLineClass(r.line, 'background', 'nsft-adv-line-error'); lintLinea = r.line; }
                    catch (e) { }
                }
            },
            onChange: () => {
                pintarEstado(); pintarCuentas(); repintaBusqueda();
                programaSimbolos(); programaCanaleta(); programaTabs();
            }
        });

        if (!_handle) { sinPantallaCompleta(); return; }

        const cm = _handle.cm;
        _cm = cm;
        if (cm.nsftEngine === 'cm6') {
            const chapa = caja.querySelector('#nsft-adv-engine');
            if (chapa) chapa.hidden = false;
            cm.on('nsftTemaMedido', () => {
                try { pintaMarco(temaGuardado(_prefs)); } catch (e) { }
            });
        }
        cm.setSize('100%', '100%');

        _sueltaMudo = (window.NSFT_Observer && window.NSFT_Observer.mute)
            ? window.NSFT_Observer.mute(caja)
            : null;

        cm.on('cursorActivity', pintarEstado);
        cm.on('cursorActivity', programaMigas);

        pintaMarco(tema);
        pintaRegla();

        try {
            const canaletas = (cm.getOption('gutters') || []).slice();
            if (canaletas.indexOf(GUTTER_CAMBIOS) === -1) {
                canaletas.push(GUTTER_CAMBIOS);
                cm.setOption('gutters', canaletas);
            }
        } catch (e) { }

        diag.addEventListener('click', () => {
            if (!diag.classList.contains('is-error') || lintLinea == null) return;
            cm.setCursor({ line: lintLinea, ch: 0 });
            cm.scrollIntoView({ line: lintLinea, ch: 0 }, 80);
            cm.focus();
        });

        const remide = () => { try { cm.refresh(); } catch (e) { } };
        requestAnimationFrame(() => { remide(); requestAnimationFrame(remide); });
        setTimeout(remide, 300);
        setTimeout(remide, 1200);
        if (typeof ResizeObserver !== 'undefined') {
            try { new ResizeObserver(remide).observe(caja); } catch (e) { }
        }
        window.addEventListener('resize', remide);

        const sincroniza = () => {
            const enPagina = String(ta.value || '');
            if (enPagina && !cm.getValue()) {
                cm.setValue(enPagina);
                cm.clearHistory();
                remide();
            }
            marcaLimpio();
            pintarEstado();
            pintarCuentas();
        };
        sincroniza();
        setTimeout(sincroniza, 400);

        cablearBarra(caja, cm);
        cablearBuscar(caja);
        cablearRapido(caja);
        cablearMenus(caja);
        pintaColorEntorno();
        cablearArbol(caja);
        pintaCabeceraArbol();
        cablearGuardado();
        cablearPaleta();
        pintarEstado();
        pintarLenguaje(nombre);

        pintaBotonTabla();

        actualizaBotonesArchivo();
        pintaSimbolos();
        apuntaSello();

        if (!idDelArchivo()) muestraVacio();
        else {
            apuntaReciente(idDelArchivo(), nombre, carpetaDelFormulario());
            registraTabInicial(idDelArchivo(), nombre, carpetaDelFormulario());
        }

        try { window.dispatchEvent(new CustomEvent('nsft-adv-ready')); } catch (e) { }
        ponTitulo(nombre);
        document.documentElement.classList.add('nsft-adv-listo');
        const raizArbol = _nodos.get(raizPanel());
        if (!_arbolPedido || (raizArbol && (raizArbol.cargado || raizArbol.error))) {
            pasoVelo('adv_velo_3', 'Ready', 3);
            cierraVelo();
        } else {
            _veloArbol = true;
            pasoVelo('adv_velo_arbol', 'Loading the File Cabinet…', 3);
        }

        if (window.NSFT_ShortcutCoach) {
            window.NSFT_ShortcutCoach.hint('advanced_editor', { delay: 1200, persist: true });
        }

        sellaTema(tema);

        chrome.storage.onChanged.addListener((ch, area) => {
            if (area !== 'local') return;
            if (ch.advancedEditorTheme || ch.advancedEditorThemeOverridden) {
                chrome.storage.local.get({
                    advancedEditorTheme: 'atom-one-light',
                    advancedEditorThemeOverridden: false
                }, (it) => aplicaTema(temaGuardado(it)));
                return;
            }
            if (ch.advancedEditorRuler) {
                _prefs.advancedEditorRuler = ch.advancedEditorRuler.newValue;
                pintaRegla();
                return;
            }
            if (!ch.nsftTheme) return;
            chrome.storage.local.get({ advancedEditorThemeOverridden: false }, (it) => {
                if (it.advancedEditorThemeOverridden) return;
                aplicaTema(ch.nsftTheme.newValue === 'dark' ? 'atom-one-dark' : 'atom-one-light');
            });
        });
    }

    function etiquetaBoton(id, clave, porDefecto) {
        const b = document.getElementById(id);
        const v = b && (b.value || b.getAttribute('value'));
        return (v ? String(v).trim() : '') || i18n(clave, porDefecto);
    }


    const pulsa = (sel) => { const b = _caja && _caja.querySelector(sel); if (b) b.click(); };

    const RECIENTES_EN_MENU = 6;

    function itemsRecientes() {
        const actual = String(idDelArchivo() || '');
        const lista = (_cache.recientes || [])
            .filter((r) => r && r.id && r.name && String(r.id) !== actual)
            .slice(0, RECIENTES_EN_MENU);
        if (!lista.length) return [];
        return [{ titulo: i18n('adv_vacio_recent', 'Recent') }].concat(
            lista.map((r) => ({ et: r.name, fn: () => abreArchivo(r.id, r.name) })),
            [{ sep: true }]);
    }

    function arbolAbierto() {
        const t = _caja && _caja.querySelector('#nsft-adv-tree');
        return !!(t && !t.hidden);
    }

    const encendido = (sel) => {
        const b = _caja && _caja.querySelector(sel);
        return !!(b && b.classList.contains('is-on'));
    };

    function atajoDe(modulo) {
        const S = window.NSFT_Shortcuts;
        if (!S || typeof S.list !== 'function') return '';
        try {
            const grupos = S.list() || [];
            for (let i = 0; i < grupos.length; i++) {
                const items = (grupos[i] && grupos[i].items) || [];
                for (let j = 0; j < items.length; j++) {
                    if (items[j] && items[j].moduleId === modulo) return items[j].combo || '';
                }
            }
        } catch (e) { }
        return '';
    }

    function menus() {
        return [
            { id: 'archivo', et: i18n('adv_menu_file', 'File'), items: [
                { et: i18n('adv_quick_titulo_corto', 'Open file'), tecla: 'Ctrl+P',
                  pide: true, fn: () => abreRapido() },
                { et: i18n('adv_save', 'Save'), tecla: 'Ctrl+S', fn: () => guardar() },
                { et: i18n('adv_reload', 'Reload from the server'), fn: () => pulsa('#nsft-adv-reload') },
                { et: i18n('adv_diff_title', 'Compare with the saved version'),
                  marca: () => !!_diffAbierto, fn: () => alternaDiff() },
                { sep: true },
                { et: i18n('adv_visor_record', 'Open the file record'), fn: () => pulsa('#nsft-adv-record') },
                { et: i18n('adv_raw_open', 'Open raw file'), fn: () => pulsa('#nsft-adv-raw') },
                { et: i18n('adv_download', 'Download from the server'), fn: () => descargaDelServidor() },
                { et: i18n('adv_download_edit', 'Download what you have now'),
                  si: () => !!(_cm && !_sinArchivo), fn: () => descargaEditado() },
                { sep: true }
            ].concat(itemsRecientes(), [
                { et: i18n('adv_cerrar_archivo', 'Close the file'), tecla: 'Alt+W', fn: () => cierraArchivo() },
                { et: i18n('adv_close', 'Close'), fn: () => cerrar() }
            ]) },
            { id: 'editar', et: i18n('adv_menu_edit', 'Edit'), items: [
                { et: i18n('adv_find_title_corto', 'Find and replace'), tecla: 'Ctrl+F',
                  pide: true, fn: () => abreBuscar() },
                { et: i18n('adv_bus_titulo_corto', 'Search in every file'), tecla: 'Ctrl+Shift+F',
                  pide: true, fn: () => abreBuscador() },
                { sep: true },
                { et: i18n('adv_format_title_corto', 'Format document'), tecla: 'Shift+Alt+F', fn: () => formatear() }
            ] },
            { id: 'ver', et: i18n('adv_menu_view', 'View'), items: [
                { et: i18n('adv_tree_title', 'Files in this folder'),
                  marca: () => arbolAbierto(), fn: () => alternaArbol() },
                { et: i18n('adv_wrap_title', 'Wrap long lines'),
                  marca: () => encendido('#nsft-adv-wrap'), fn: () => pulsa('#nsft-adv-wrap') },
                { et: i18n('adv_minimapa', 'Minimap'),
                  marca: () => minimapaPuesto(), fn: () => alternaMinimapa() },
                { sep: true },
                { et: i18n('adv_ghost_title', 'AI suggestions while you type'),
                  marca: () => encendido('#nsft-adv-ghost'), fn: () => pulsa('#nsft-adv-ghost') },
                { et: i18n('openSuiteQLRunnerLabel', 'Open SuiteQL Runner'),
                  si: () => !!(_caja && _caja.querySelector('#nsft-adv-sql')),
                  tecla: () => atajoDe('suiteql_runner'),
                  fn: () => pulsa('#nsft-adv-sql') },
                { et: i18n('enableSuiteScriptConsoleLabel', 'SuiteScript Console'),
                  si: () => !!(_caja && _caja.querySelector('#nsft-adv-consola')),
                  tecla: () => atajoDe('suitescript_console'),
                  fn: () => pulsa('#nsft-adv-consola') },
                { sep: true },
                { et: i18n('adv_menu_ai', 'AI assistant'),
                  si: () => !!(_caja && _caja.querySelector('#nsft-adv-ai')),
                  marca: () => encendido('#nsft-adv-ai'), fn: () => pulsa('#nsft-adv-ai') }
            ] },
            { id: 'ir', et: i18n('adv_menu_go', 'Go'), items: [
                { et: i18n('adv_goto_title_corto', 'Go to line'), tecla: 'Ctrl+G',
                  pide: true, fn: () => irALinea() }
            ] }
        ];
    }


    const PREF_COLOR_ENV = { PRD: 'envBadgeColorPrd', SB: 'envBadgeColorSb', RP: 'envBadgeColorRp' };

    function entornoActual() {
        const E = window.NSFT_ENV;
        if (!E || typeof E.envFromUrl !== 'function') return null;
        try { return E.envFromUrl(window.location.href); } catch (e) { return null; }
    }

    function chapaEntorno() {
        const env = entornoActual();
        if (!env || !env.code) return '';
        return '<span class="nsft-adv-env" id="nsft-adv-env" title="'
            + escapeHtml(env.name || env.code) + '">' + escapeHtml(env.code) + '</span>';
    }

    function pintaColorEntorno() {
        const el = _caja && _caja.querySelector('#nsft-adv-env');
        const env = entornoActual();
        if (!el || !env) return;
        el.style.setProperty('--nsft-adv-env-c', env.color || '#6b7280');
        const E = window.NSFT_ENV;
        const fam = (E && typeof E.envFamily === 'function') ? E.envFamily(env.code) : null;
        const clave = fam && PREF_COLOR_ENV[fam];
        if (!clave) return;
        try {
            chrome.storage.local.get({ [clave]: null }, (it) => {
                const c = it && it[clave];
                if (c) el.style.setProperty('--nsft-adv-env-c', c);
            });
        } catch (e) { }
    }

    function menuBarra() {
        return '<span class="nsft-adv-menus" id="nsft-adv-menus" role="menubar">'
            + menus().map((m) =>
                '<button type="button" class="nsft-adv-menu-t" role="menuitem" aria-haspopup="true"'
                + ' aria-expanded="false" data-menu="' + m.id + '">'
                + escapeHtml(m.et) + '</button>').join('')
            + '</span>';
    }

    let _menuAbierto = null;

    function cablearMenus(caja) {
        const barra = caja.querySelector('#nsft-adv-menus');

        barra.addEventListener('click', (ev) => {
            const t = ev.target.closest('.nsft-adv-menu-t');
            if (!t) return;
            ev.stopPropagation();
            if (_menuAbierto === t.dataset.menu) { cierraMenu(); return; }
            abreMenu(t, menus().filter((m) => m.id === t.dataset.menu)[0]);
        });

        barra.addEventListener('mouseover', (ev) => {
            if (!_menuAbierto) return;
            const t = ev.target.closest('.nsft-adv-menu-t');
            if (!t || t.dataset.menu === _menuAbierto) return;
            abreMenu(t, menus().filter((m) => m.id === t.dataset.menu)[0]);
        });

        document.addEventListener('click', () => cierraMenu());
        document.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape' && _menuAbierto) { ev.stopPropagation(); cierraMenu(); }
        }, true);
    }

    function cierraMenu() {
        if (!_menuAbierto || !_caja) return;
        _menuAbierto = null;
        const v = _caja.querySelector('.nsft-adv-menu-pop');
        if (v) v.remove();
        _caja.querySelectorAll('.nsft-adv-menu-t').forEach((b) => {
            b.classList.remove('is-open');
            b.setAttribute('aria-expanded', 'false');
        });
    }

    function abreMenu(boton, def) {
        cierraMenu();
        if (!def) return;
        _menuAbierto = def.id;
        boton.classList.add('is-open');
        boton.setAttribute('aria-expanded', 'true');

        const pop = document.createElement('div');
        pop.className = 'nsft-adv-menu-pop';
        pop.setAttribute('role', 'menu');
        def.items.filter((it) => typeof it.si !== 'function' || it.si()).forEach((it) => {
            if (it.titulo) {
                const h = document.createElement('div');
                h.className = 'nsft-adv-menu-h';
                h.textContent = it.titulo;
                pop.appendChild(h);
                return;
            }
            if (it.sep) {
                const s = document.createElement('div');
                s.className = 'nsft-adv-menu-sep';
                pop.appendChild(s);
                return;
            }
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'nsft-adv-menu-i';
            b.setAttribute('role', 'menuitem');

            const esInterruptor = typeof it.marca === 'function';
            const puesto = esInterruptor && !!it.marca();
            if (esInterruptor) {
                b.setAttribute('role', 'menuitemcheckbox');
                b.setAttribute('aria-checked', puesto ? 'true' : 'false');
                b.classList.toggle('is-marcado', puesto);
            }
            const tic = document.createElement('span');
            tic.className = 'nsft-adv-menu-tic';
            tic.setAttribute('aria-hidden', 'true');
            tic.textContent = puesto ? '\u2713' : '';
            b.appendChild(tic);

            const et = document.createElement('span');
            et.className = 'nsft-adv-menu-et';
            et.textContent = it.et + (it.pide ? '\u2026' : '');
            b.appendChild(et);
            const tecla = (typeof it.tecla === 'function') ? it.tecla() : it.tecla;
            if (tecla) {
                const k = document.createElement('span');
                k.className = 'nsft-adv-menu-k';
                k.textContent = tecla;
                b.appendChild(k);
            }
            b.addEventListener('click', (ev) => {
                ev.stopPropagation();
                cierraMenu();
                try { it.fn(); } catch (e) { }
            });
            pop.appendChild(b);
        });

        pop.style.left = (boton.offsetLeft) + 'px';
        pop.style.top = (boton.offsetTop + boton.offsetHeight) + 'px';
        _caja.appendChild(pop);
    }

    function plantilla(nombre) {

        const grupo = (nombre, contenido) => (!contenido ? '' :
            '<span class="nsft-adv-grupo">'
            + '<span class="nsft-adv-grupo-t">' + escapeHtml(nombre) + '</span>'
            + contenido
            + '</span>');

        const btn = (id, ico, titulo) =>
            '<button type="button" class="nsft-adv-btn" id="' + id + '" title="'
            + escapeHtml(titulo) + '">' + svg(ico) + '</button>';

        return ''
            + '<div class="nsft-adv-bar">'
                + '<img class="nsft-adv-logo" alt="" aria-hidden="true" src="'
                    + escapeHtml(chrome.runtime.getURL('assets/icons/icon48.png')) + '">'
                + chapaEntorno()
                + menuBarra()
                + '<span class="nsft-adv-spacer"></span>'
                + '<button type="button" class="nsft-adv-pastilla" id="nsft-adv-diff-btn" title="'
                    + escapeHtml(i18n('adv_diff_title', 'Compare with the saved version')) + '">'
                    + svg(ICO.comparar)
                    + '<span class="nsft-adv-pastilla-t">'
                        + escapeHtml(i18n('adv_diff_corto', 'Changes')) + '</span>'
                    + '<span class="nsft-adv-pastilla-n" id="nsft-adv-diff-n" hidden></span>'
                + '</button>'
                + '<span class="nsft-adv-sep"></span>'
                + grupo(i18n('adv_grp_archivo', 'File'),
                    btn('nsft-adv-record', ICO.ficha, i18n('adv_visor_record', 'Open the file record'))
                    + btn('nsft-adv-raw', ICO.externo, i18n('adv_raw_open', 'Open raw file'))
                    + btn('nsft-adv-descargar', ICO.descarga, i18n('adv_download', 'Download the file'))
                    + btn('nsft-adv-reload', ICO.recarga, i18n('adv_reload', 'Reload from the server')))
                + grupo(i18n('adv_grp_codigo', 'Code'),
                    btn('nsft-adv-find-btn', ICO.find, i18n('adv_find_title', 'Find and replace (Ctrl+F)'))
                    + btn('nsft-adv-format', ICO.format, i18n('adv_format_title', 'Format document (Shift+Alt+F)'))
                    + btn('nsft-adv-wrap', ICO.wrap, i18n('adv_wrap_title', 'Wrap long lines'))
                    + '<button type="button" class="nsft-adv-btn" id="nsft-adv-tabla-btn" hidden title="'
                        + escapeHtml(i18n('adv_csv_titulo', 'Table view')) + '">' + svg(ICO.tabla) + '</button>')
                + grupo(i18n('adv_grp_tools', 'Tools'),
                    (_prefs.enableSuiteQLRunner
                        ? btn('nsft-adv-sql', ICO.sql, i18n('openSuiteQLRunnerLabel', 'Open SuiteQL Runner')) : '')
                    + (_prefs.enableSuiteScriptConsole
                        ? btn('nsft-adv-consola', ICO.consola, i18n('enableSuiteScriptConsoleLabel', 'SuiteScript Console')) : ''))
                + '<span class="nsft-adv-sep"></span>'
                + '<button type="button" class="nsft-adv-btn" id="nsft-adv-ghost" title="'
                    + escapeHtml(i18n('adv_ghost_title', 'AI suggestions while you type')) + '">'
                    + svg(ICO.ghost) + '<span class="nsft-ssc-ghost-spin" aria-hidden="true"></span></button>'
                + '<span class="nsft-adv-sep"></span>'
                + '<button type="button" class="nsft-adv-action is-primary" id="nsft-adv-save" title="'
                    + escapeHtml(i18n('adv_save_title', 'Save the file (Ctrl+S)')) + '">'
                    + escapeHtml(etiquetaBoton('submitter', 'adv_save', 'Save')) + '</button>'
                + '<button type="button" class="nsft-adv-btn is-cerrar" id="nsft-adv-close" title="'
                    + escapeHtml(i18n('adv_close_title', 'Close the editor and go to the dashboard')) + '">'
                    + svg(ICO.cerrar) + '</button>'
            + '</div>'
            + '<div class="nsft-adv-body">'
                + '<aside class="nsft-adv-tree" id="nsft-adv-tree" hidden>'
                    + '<div class="nsft-adv-sec is-archivos" id="nsft-adv-sec-files">'
                        + '<button type="button" class="nsft-adv-sec-head" id="nsft-adv-files-head">'
                            + '<span class="nsft-adv-sec-chev">' + svg(ICO.abajo, 2) + '</span>'
                            + '<span class="nsft-adv-sec-t">' + escapeHtml(i18n('adv_tree_title', 'Files in this folder')) + '</span>'
                        + '</button>'
                        + '<div class="nsft-adv-tree-list" id="nsft-adv-tree-list"></div>'
                    + '</div>'
                    + '<div class="nsft-adv-tirador is-alto" id="nsft-adv-tirador-alto"'
                        + ' role="separator" aria-orientation="horizontal" tabindex="-1"'
                        + ' title="' + escapeHtml(i18n('adv_split_alto', 'Drag to resize')) + '"></div>'
                    + '<div class="nsft-adv-sec" id="nsft-adv-sec-syms">'
                        + '<button type="button" class="nsft-adv-sec-head" id="nsft-adv-sym-head">'
                            + '<span class="nsft-adv-sec-chev">' + svg(ICO.abajo, 2) + '</span>'
                            + '<span>' + escapeHtml(i18n('adv_tab_symbols', 'Symbols')) + '</span>'
                            + '<span class="nsft-adv-sec-n" id="nsft-adv-sym-n"></span>'
                            + '<span class="nsft-adv-sec-todo" id="nsft-adv-sym-todo" role="button" tabindex="0"'
                                + ' title="' + escapeHtml(i18n('adv_sym_todo', 'Expand or collapse all')) + '">'
                                + svg(ICO.desplegar, 2) + '</span>'
                        + '</button>'
                        + '<div class="nsft-adv-sym-list" id="nsft-adv-sym-list"></div>'
                    + '</div>'
                + '</aside>'
                + '<div class="nsft-adv-tirador is-ancho" id="nsft-adv-tirador-ancho"'
                    + ' role="separator" aria-orientation="vertical" tabindex="-1"'
                    + ' title="' + escapeHtml(i18n('adv_split_ancho', 'Drag to resize')) + '" hidden></div>'
                + '<div class="nsft-adv-col">'
                + '<div class="nsft-adv-tabs-row" id="nsft-adv-tabs-row" hidden>'
                    + '<button type="button" class="nsft-adv-tabs-nav" id="nsft-adv-tabs-prev" hidden'
                        + ' title="' + i18n('adv_tabs_prev', 'Previous tabs') + '"'
                        + ' aria-label="' + i18n('adv_tabs_prev', 'Previous tabs') + '">&#8249;</button>'
                    + '<div class="nsft-adv-tabs" id="nsft-adv-tabs" role="tablist"></div>'
                    + '<button type="button" class="nsft-adv-tabs-nav" id="nsft-adv-tabs-next" hidden'
                        + ' title="' + i18n('adv_tabs_next', 'Next tabs') + '"'
                        + ' aria-label="' + i18n('adv_tabs_next', 'Next tabs') + '">&#8250;</button>'
                + '</div>'
                + '<div class="nsft-adv-path" id="nsft-adv-path" hidden>'
                    + '<span class="nsft-adv-path-dir" id="nsft-adv-dir"></span>'
                    + '<span class="nsft-adv-path-file">' + escapeHtml(nombre) + '</span>'
                    + '<span class="nsft-adv-crumbs" id="nsft-adv-crumbs"></span>'
                + '</div>'
                + '<div class="nsft-adv-host" id="nsft-adv-host">'
                    + '<div class="nsft-adv-find" id="nsft-adv-find" hidden>'
                        + '<div class="nsft-adv-find-row">'
                            + '<input type="text" id="nsft-adv-find-input" spellcheck="false" placeholder="'
                                + escapeHtml(i18n('adv_find_placeholder', 'Find')) + '">'
                            + '<span class="nsft-adv-find-count" id="nsft-adv-find-count"></span>'
                            + '<button type="button" class="nsft-adv-find-btn" id="nsft-adv-find-case" title="'
                                + escapeHtml(i18n('adv_find_case', 'Match case')) + '">Aa</button>'
                            + '<button type="button" class="nsft-adv-find-btn" id="nsft-adv-find-prev" title="'
                                + escapeHtml(i18n('adv_find_prev', 'Previous match')) + '">&#8593;</button>'
                            + '<button type="button" class="nsft-adv-find-btn" id="nsft-adv-find-next" title="'
                                + escapeHtml(i18n('adv_find_next', 'Next match')) + '">&#8595;</button>'
                            + '<button type="button" class="nsft-adv-find-btn" id="nsft-adv-find-close" title="'
                                + escapeHtml(i18n('adv_find_close', 'Close')) + '">&times;</button>'
                        + '</div>'
                        + '<div class="nsft-adv-find-row">'
                            + '<input type="text" id="nsft-adv-repl-input" spellcheck="false" placeholder="'
                                + escapeHtml(i18n('adv_replace_placeholder', 'Replace with')) + '">'
                            + '<button type="button" class="nsft-adv-find-btn" id="nsft-adv-repl-one">'
                                + escapeHtml(i18n('adv_replace_one', 'Replace')) + '</button>'
                            + '<button type="button" class="nsft-adv-find-btn" id="nsft-adv-repl-all">'
                                + escapeHtml(i18n('adv_replace_all', 'All')) + '</button>'
                        + '</div>'
                    + '</div>'
                    + '<div class="nsft-adv-mapa" id="nsft-adv-mapa" aria-hidden="true" hidden>'
                        + '<canvas id="nsft-adv-mapa-cv"></canvas>'
                        + '<div class="nsft-adv-mapa-vista" id="nsft-adv-mapa-vista"></div>'
                    + '</div>'
                + '</div>'
                + '<div class="nsft-adv-visor" id="nsft-adv-visor" hidden>'
                    + '<div class="nsft-adv-visor-bar" id="nsft-adv-visor-bar" hidden>'
                        + '<span class="nsft-adv-visor-zoom" id="nsft-adv-visor-zoom">'
                            + btn('nsft-adv-visor-menos', ICO.menos, i18n('adv_visor_zoom_out', 'Zoom out'))
                            + '<span class="nsft-adv-visor-pct" id="nsft-adv-visor-pct">100%</span>'
                            + btn('nsft-adv-visor-mas', ICO.mas, i18n('adv_visor_zoom_in', 'Zoom in'))
                            + btn('nsft-adv-visor-ajusta', ICO.ajusta, i18n('adv_visor_fit', 'Fit to the window'))
                            + '<button type="button" class="nsft-adv-btn nsft-adv-visor-real" id="nsft-adv-visor-real" title="'
                                + escapeHtml(i18n('adv_visor_real', 'Actual size')) + '">1:1</button>'
                        + '</span>'
                    + '</div>'
                    + '<iframe class="nsft-adv-visor-marco" id="nsft-adv-visor-marco" title="'
                        + escapeHtml(i18n('adv_visor_title', 'File preview')) + '"></iframe>'
                    + '<div class="nsft-adv-visor-img" id="nsft-adv-visor-img" hidden>'
                        + '<img id="nsft-adv-visor-img-el" alt="">'
                    + '</div>'
                + '</div>'
                + '<div class="nsft-adv-vacio" id="nsft-adv-vacio" hidden></div>'
                + '<div class="nsft-adv-tabla" id="nsft-adv-tabla" hidden>'
                    + '<div class="nsft-adv-tabla-bar">'
                        + '<span class="nsft-adv-tabla-tit">'
                            + escapeHtml(i18n('adv_csv_titulo', 'Table view')) + '</span>'
                        + '<span class="nsft-adv-tabla-estado" id="nsft-adv-tabla-estado"></span>'
                        + '<span class="nsft-adv-spacer"></span>'
                        + '<span class="nsft-adv-tabla-pista">'
                            + escapeHtml(i18n('adv_csv_pista', 'Double-click a cell to edit it')) + '</span>'
                        + btn('nsft-adv-tabla-cerrar', ICO.cerrar, i18n('adv_csv_cerrar', 'Back to the text'))
                    + '</div>'
                    + '<div class="nsft-adv-tabla-rejilla" id="nsft-adv-tabla-rejilla">'
                        + '<div class="nsft-adv-tabla-cab"></div>'
                        + '<div class="nsft-adv-tabla-cuerpo"></div>'
                    + '</div>'
                + '</div>'
                + '<div class="nsft-adv-diff" id="nsft-adv-diff" hidden>'
                    + '<div class="nsft-adv-diff-bar">'
                        + '<span class="nsft-adv-diff-tit">'
                            + escapeHtml(i18n('adv_diff_title', 'Compare with the saved version')) + '</span>'
                        + '<span class="nsft-adv-diff-estado" id="nsft-adv-diff-estado"></span>'
                        + '<span class="nsft-adv-spacer"></span>'
                        + btn('nsft-adv-diff-cerrar', ICO.cerrar, i18n('adv_visor_close', 'Back to the editor'))
                    + '</div>'
                    + '<div class="nsft-adv-diff-lista" id="nsft-adv-diff-lista"></div>'
                + '</div>'
                + '<div class="nsft-adv-buscar" id="nsft-adv-buscar" hidden>'
                    + '<div class="nsft-adv-bus-bar">'
                        + '<input type="text" id="nsft-adv-bus-input" spellcheck="false" placeholder="'
                            + escapeHtml(i18n('adv_bus_ph', 'Search in this folder and its subfolders')) + '">'
                        + '<button type="button" class="nsft-adv-action is-primary" id="nsft-adv-bus-btn">'
                            + escapeHtml(i18n('adv_bus_ir', 'Search')) + '</button>'
                        + btn('nsft-adv-bus-cerrar', ICO.cerrar, i18n('adv_visor_close', 'Back to the editor'))
                    + '</div>'
                    + '<div class="nsft-adv-bus-estado" id="nsft-adv-bus-estado"></div>'
                    + '<div class="nsft-adv-bus-lista" id="nsft-adv-bus-lista"></div>'
                + '</div>'
                + '</div>'
                + '<div class="nsft-adv-quick" id="nsft-adv-quick" hidden>'
                    + '<div class="nsft-adv-quick-caja" role="dialog" aria-modal="true">'
                        + '<input type="text" id="nsft-adv-quick-input" spellcheck="false"'
                            + ' autocomplete="off" placeholder="'
                            + escapeHtml(i18n('adv_quick_ph', 'Type a file name')) + '">'
                        + '<div class="nsft-adv-quick-lista" id="nsft-adv-quick-lista" role="listbox"></div>'
                        + '<div class="nsft-adv-quick-pie" id="nsft-adv-quick-pie"></div>'
                    + '</div>'
                + '</div>'
                + '<div class="nsft-adv-dlg" id="nsft-adv-dlg" hidden>'
                    + '<div class="nsft-adv-dlg-caja" role="alertdialog" aria-modal="true"'
                        + ' aria-labelledby="nsft-adv-dlg-tit" aria-describedby="nsft-adv-dlg-txt">'
                        + '<div class="nsft-adv-dlg-tit" id="nsft-adv-dlg-tit"></div>'
                        + '<div class="nsft-adv-dlg-txt" id="nsft-adv-dlg-txt"></div>'
                        + '<input type="text" class="nsft-adv-dlg-inp" id="nsft-adv-dlg-inp"'
                            + ' autocomplete="off" spellcheck="false" hidden>'
                        + '<div class="nsft-adv-dlg-pie">'
                            + '<button type="button" class="nsft-adv-action" id="nsft-adv-dlg-no"></button>'
                            + '<button type="button" class="nsft-adv-action" id="nsft-adv-dlg-otro" hidden></button>'
                            + '<button type="button" class="nsft-adv-action is-primary" id="nsft-adv-dlg-si"></button>'
                        + '</div>'
                    + '</div>'
                + '</div>'
            + '</div>'
            + '<div class="nsft-adv-status">'
                + '<span class="nsft-adv-diag" id="nsft-adv-diag">'
                    + '<span class="nsft-adv-diag-dot" aria-hidden="true"></span>'
                    + '<span class="nsft-adv-diag-msg">' + escapeHtml(i18n('adv_diag_ok', 'No errors')) + '</span>'
                + '</span>'
                + '<span class="nsft-adv-status-num" id="nsft-adv-cursor"></span>'
                + '<span class="nsft-adv-status-num" id="nsft-adv-counts"></span>'
                + '<span class="nsft-adv-spacer"></span>'
                + '<span id="nsft-adv-indent"></span>'
                + '<span id="nsft-adv-lang"></span>'
                + '<span class="nsft-adv-api" id="nsft-adv-api" hidden></span>'
                + '<span class="nsft-adv-dirty" id="nsft-adv-dirty"></span>'
                + '<span class="nsft-adv-status-num" id="nsft-adv-engine" hidden>CM6</span>'
            + '</div>';
    }


    function cablearBarra(caja, cm) {
        const btnGhost = caja.querySelector('#nsft-adv-ghost');
        if (btnGhost) btnGhost.addEventListener('click', () => _handle.ghost.toggle());
        _handle.ghost.pintaBoton();

        caja.querySelector('#nsft-adv-format').addEventListener('click', formatear);
        caja.querySelector('#nsft-adv-find-btn').addEventListener('click', alternaBuscar);
        montaTiradores(caja);
        leePaneles(aplicaPaneles);
        caja.querySelector('#nsft-adv-files-head').addEventListener('click', alternaArchivos);
        caja.querySelector('#nsft-adv-sym-head').addEventListener('click', alternaSimbolos);
        caja.querySelector('#nsft-adv-sym-todo').addEventListener('click', (ev) => {
            ev.stopPropagation();
            alternaTodosLosSimbolos();
        });
        const pf = caja.querySelector('.nsft-adv-path-file');
        if (pf) pf.addEventListener('click', (ev) => abreMigaSimbolo(ev, -1));
        cablearTabla(caja);
        vigilaSeparadores(caja);
        cablearMapa(caja, cm);
        cablearVecinas(caja);
        cablearMenuModelo(caja);
        caja.querySelector('#nsft-adv-bus-cerrar').addEventListener('click', cierraBuscador);
        caja.querySelector('#nsft-adv-bus-btn').addEventListener('click', lanzaBusqueda);
        caja.querySelector('#nsft-adv-bus-input').addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') { ev.preventDefault(); lanzaBusqueda(); }
            if (ev.key === 'Escape') { ev.preventDefault(); cierraBuscador(); }
        });

        caja.querySelector('#nsft-adv-reload').addEventListener('click', () => {
            if (previaDelante()) return;
            const id = idDelArchivo();
            if (id) abreArchivo(id, nombreArchivo(), true);
        });
        caja.querySelector('#nsft-adv-diff-btn').addEventListener('click', alternaDiff);
        caja.querySelector('#nsft-adv-diff-cerrar').addEventListener('click', cierraDiff);

        caja.querySelector('#nsft-adv-record').addEventListener('click', () => {
            const id = idDelante();
            if (!id) return;
            window.open('/app/common/media/mediaitem.nl?id=' + encodeURIComponent(id),
                '_blank', 'noopener');
        });
        caja.querySelector('#nsft-adv-raw').addEventListener('click', () => {
            const u = urlDelante();
            if (u) window.open(u, '_blank', 'noopener');
        });

        caja.querySelector('#nsft-adv-descargar').addEventListener('click', descargaDelServidor);
        caja.querySelector('#nsft-adv-visor-menos').addEventListener('click', () => acerca(1 / ZOOM_PASO));
        caja.querySelector('#nsft-adv-visor-mas').addEventListener('click', () => acerca(ZOOM_PASO));
        caja.querySelector('#nsft-adv-visor-ajusta').addEventListener('click', () => { _zoom = null; aplicaZoom(); });
        caja.querySelector('#nsft-adv-visor-real').addEventListener('click', () => { _zoom = 1; aplicaZoom(); });

        caja.querySelector('#nsft-adv-visor-img-el').addEventListener('load', () => { aplicaZoom(); });

        caja.querySelector('#nsft-adv-visor-img').addEventListener('wheel', (ev) => {
            if (!ev.ctrlKey) return;
            ev.preventDefault();
            acerca(ev.deltaY < 0 ? ZOOM_PASO : 1 / ZOOM_PASO);
        }, { passive: false });

        window.addEventListener('resize', () => {
            const v = _caja && _caja.querySelector('#nsft-adv-visor');
            if (v && !v.hidden && _zoom == null) aplicaZoom();
        });
        caja.querySelector('#nsft-adv-save').addEventListener('click', guardar);
        caja.querySelector('#nsft-adv-close').addEventListener('click', cerrar);

        const btnWrap = caja.querySelector('#nsft-adv-wrap');
        aplicarWrap(!!_prefs.advancedEditorWrap);
        btnWrap.addEventListener('click', () => {
            const nuevo = !cm.getOption('lineWrapping');
            aplicarWrap(nuevo);
            try { chrome.storage.local.set({ advancedEditorWrap: nuevo }); } catch (e) { }
        });

        function aplicarWrap(on) {
            cm.setOption('lineWrapping', on);
            btnWrap.classList.toggle('is-on', on);
        }
    }


    function pintarEstado() {
        const cm = _cm;
        if (!cm || !_caja) return;
        const doc = cm.getDoc();
        const cur = doc.getCursor();
        const sel = doc.getSelection();

        const elCur = _caja.querySelector('#nsft-adv-cursor');
        if (elCur) {
            const txt = sel
                ? fmt('adv_cursor_sel', 'Ln $1, Col $2 ($3 sel.)', [cur.line + 1, cur.ch + 1, sel.length])
                : fmt('adv_cursor', 'Ln $1, Col $2', [cur.line + 1, cur.ch + 1]);
            if (elCur.textContent !== txt) elCur.textContent = txt;
        }

        const elDirty = _caja.querySelector('#nsft-adv-dirty');
        if (elDirty) {
            const limpio = cm.isClean(_genLimpia);
            elDirty.classList.toggle('is-clean', limpio);
            const txt = limpio
                ? i18n('adv_saved', 'Saved')
                : i18n('adv_dirty', 'Unsaved changes');
            if (elDirty.textContent !== txt) elDirty.textContent = txt;
        }
    }

    let _cntTimer = 0;
    function pintarCuentas() {
        clearTimeout(_cntTimer);
        _cntTimer = setTimeout(() => {
            const cm = _cm;
            const el = _caja && _caja.querySelector('#nsft-adv-counts');
            if (!cm || !el) return;
            el.textContent = fmt('adv_counts', '$1 lines · $2 chars',
                [miles(cm.lineCount()), miles(cm.getValue().length)]);
        }, 250);
    }

    function miles(n) {
        try { return Number(n).toLocaleString(); } catch (e) { return String(n); }
    }

    const MODOS = {
        js: 'nsft-javascript', mjs: 'nsft-javascript',
        ts: 'text/typescript',
        json: 'application/json',
        sql: 'text/x-sql',
        xml: 'application/xml', xsl: 'application/xml', ftl: 'application/xml',
        html: 'text/html', htm: 'text/html',
        css: 'text/css',
        md: 'text/x-markdown',
        properties: 'text/x-properties'
    };

    function extensionDe(nombre) {
        return (String(nombre).match(/\.([a-z0-9]+)$/i) || ['', ''])[1].toLowerCase();
    }

    function modoCargado(m) {
        if (m === 'nsft-javascript') return true;
        try {
            if (CodeMirror.mimeModes && CodeMirror.mimeModes[m]) return true;
            return !!(CodeMirror.modes && CodeMirror.modes[m]);
        } catch (err) { return false; }
    }

    function modoDe(nombre) {
        const m = MODOS[extensionDe(nombre)];
        if (!m) return null;
        return modoCargado(m) ? m : null;
    }

    let _esJs = true;

    function pintarLenguaje(nombre) {
        const ext = (String(nombre).match(/\.([a-z0-9]+)$/i) || ['', ''])[1].toLowerCase();
        const LENG = {
            js: 'JavaScript', mjs: 'JavaScript', ts: 'TypeScript', json: 'JSON',
            html: 'HTML', htm: 'HTML', xml: 'XML', xsl: 'XSL', css: 'CSS',
            csv: 'CSV', txt: 'TXT', md: 'Markdown', sql: 'SQL', ftl: 'FreeMarker'
        };
        const elLang = _caja.querySelector('#nsft-adv-lang');
        if (elLang) elLang.textContent = LENG[ext] || (ext ? ext.toUpperCase() : '');

        const modo = modoDe(nombre);
        _esJs = (modo === 'nsft-javascript');
        pintaApiVersion();
        if (_cm) { try { _cm.setOption('mode', modo); } catch (err) { } }

        const diag = _caja.querySelector('#nsft-adv-diag');
        if (diag) {
            diag.hidden = !_esJs;
            if (!_esJs) { diag.classList.remove('is-error'); diag.removeAttribute('title'); }
        }

        const sang = mideSangria();
        const elInd = _caja.querySelector('#nsft-adv-indent');
        if (elInd) elInd.textContent = etiquetaSangria(sang);
        aplicaSangria(sang);
    }

    function pintaApiVersion() {
        const el = _caja && _caja.querySelector('#nsft-adv-api');
        if (!el) return;
        let v = null;
        try {
            if (_cm && _esJs && window.NSFT_CodeEditor && window.NSFT_CodeEditor.versionApi) {
                v = window.NSFT_CodeEditor.versionApi(_cm);
            }
        } catch (e) { v = null; }
        el.hidden = !v;
        if (!v) { el.textContent = ''; el.removeAttribute('title'); return; }
        el.textContent = v === '1' ? 'SS 1.0' : 'SS 2.x';
        el.title = v === '1'
            ? i18n('adv_api1_title', 'SuiteScript 1.0 file: only nlapi*/nlobj* are suggested')
            : i18n('adv_api2_title', 'SuiteScript 2.x file: only the N/* modules are suggested');
    }

    function mideSangria() {
        const cm = _cm;
        if (!cm) return { tabs: false, ancho: 4 };
        const tope = Math.min(cm.lineCount(), 400);
        let tabs = 0;
        let conEspacios = 0;
        const pasos = {};
        let anterior = null;
        for (let i = 0; i < tope; i++) {
            const m = cm.getLine(i).match(/^([ \t]*)\S/);
            if (!m) continue;
            if (m[1].indexOf('\t') !== -1) { tabs++; anterior = null; continue; }
            conEspacios++;
            const n = m[1].length;
            if (anterior != null) {
                const d = n - anterior;
                if (d > 0 && d <= 8) pasos[d] = (pasos[d] || 0) + 1;
            }
            anterior = n;
        }
        if (tabs > conEspacios) return { tabs: true, ancho: 4 };
        const anchos = Object.keys(pasos).map(Number).sort((a, b) => {
            return (pasos[b] - pasos[a]) || (a - b);
        });
        return { tabs: false, ancho: anchos.length ? anchos[0] : 4 };
    }

    function etiquetaSangria(s) {
        return s.tabs ? i18n('adv_indent_tabs', 'Tabs')
                      : fmt('adv_indent_spaces', 'Spaces: $1', [s.ancho]);
    }

    function aplicaSangria(s) {
        if (!_cm) return;
        try {
            _cm.setOption('indentWithTabs', s.tabs);
            _cm.setOption('indentUnit', s.tabs ? (_cm.getOption('tabSize') || 4) : s.ancho);
        } catch (e) { }
    }


    function cablearGuardado() {
        const form = document.getElementById('main_form') || document.forms[0];
        if (form) {
            form.addEventListener('submit', (ev) => {
                if (!_saliendoAGuardar) { ev.preventDefault(); ev.stopPropagation(); return; }
                _saliendoAGuardar = true;
            }, true);
        }
        ['submitter', 'secondarysubmitter', '_cancel', 'secondary_cancel'].forEach((id) => {
            const b = document.getElementById(id);
            if (b) b.addEventListener('click', () => { _saliendoAGuardar = true; });
        });

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'F5' && !((e.ctrlKey || e.metaKey) && (e.key === 'r' || e.key === 'R'))) return;
            if (!_cm || !haySinGuardar()) return;
            e.preventDefault();
            e.stopPropagation();
            pregunta({
                titulo: i18n('adv_recargar_tit', 'You have unsaved changes'),
                texto: i18n('adv_recargar_txt',
                    'Reloading brings back what is on the server and loses what you wrote.'),
                si: i18n('adv_recargar_guardar', 'Save'),
                otro: i18n('adv_recargar_sin', 'Reload and lose them'),
                otroPeligro: true
            }, (r) => {
                if (r === 'otro') {
                    _saliendoAGuardar = true;
                    try { window.location.reload(); } catch (x) { }
                } else if (r === true) {
                    guardar();
                }
            });
        }, true);

        window.addEventListener('beforeunload', (e) => {
            if (_saliendoAGuardar || !_cm || !haySinGuardar()) return;
            e.preventDefault();
            e.returnValue = '';
        });
    }

    function guardar(reintento) {
        const id = String(idDelArchivo());
        if (id && idDelFormulario() !== id) {
            if (reintento) {
                toast(i18n('adv_save_desync',
                    'Reload the page before saving: the form no longer matches this file'));
                return;
            }
            traeFormulario(id, (bien) => {
                if (!bien) {
                    toast(i18n('adv_save_desync',
                        'Reload the page before saving: the form no longer matches this file'));
                    return;
                }
                guardar(true);
            });
            return;
        }
        const doc = docActivo();
        const btn = doc.getElementById('submitter') || doc.getElementById('secondarysubmitter');
        if (!btn) { toast(i18n('adv_save_no_button', 'Save button not found on this page')); return; }
        const ta = doc.getElementById('mCharData');
        if (ta && _cm) ta.value = _cm.getValue();

        if (!_sello) { guardaYa(btn); return; }
        cargando(true);
        pideSello(idDelArchivo(), (ahora) => {
            cargando(false);
            if (!ahora || ahora === _sello) { guardaYa(btn); return; }
            confirmaPisar((si) => { if (si) guardaYa(btn); });
        });
    }


    const CAMBIADO_ESPERA = 1200;
    let _cambiadoSeq = 0;
    const _cambiadoCb = new Map();

    function marcaCambiado(cb) {
        const token = 'm' + (++_cambiadoSeq);
        let contestado = false;
        const una = () => {
            if (contestado) return;
            contestado = true;
            _cambiadoCb.delete(token);
            cb();
        };
        _cambiadoCb.set(token, una);
        setTimeout(una, CAMBIADO_ESPERA);
        manda('cambiado', { marco: !!_marco, token: token });
    }

    function recibeCambiado(p) {
        const cb = _cambiadoCb.get(p.token);
        if (cb) cb();
    }

    function guardaYa(btn) {
        marcaCambiado(() => {
            if (!_marco) { guardaEnPagina(btn); return; }
            guardaEnMarco(btn);
        });
    }


    const MARCO_NOMBRE = 'nsft-adv-guardado';

    function guardaEnPagina(btn) {
        if (_guardando) return;
        const form = document.getElementById('main_form') || document.forms[0];
        const id = idDelArchivo();
        if (!form || !id) { _saliendoAGuardar = true; btn.click(); return; }

        const marco = document.createElement('iframe');
        marco.className = 'nsft-adv-marco';
        marco.name = MARCO_NOMBRE;
        marco.setAttribute('aria-hidden', 'true');
        marco.setAttribute('tabindex', '-1');
        document.body.appendChild(marco);

        const objetivo = form.getAttribute('target');
        form.setAttribute('target', MARCO_NOMBRE);
        cargando(true);

        const suelta = () => {
            if (objetivo == null) form.removeAttribute('target');
            else form.setAttribute('target', objetivo);
        };

        const alTerminar = () => {
            if (!_guardando) return;
            clearTimeout(_guardando);
            _guardando = null;
            marco.removeEventListener('load', alTerminar);
            suelta();
            cargando(false);
            _saliendoAGuardar = false;

            let guardado = true;
            try {
                const d = marco.contentDocument;
                guardado = !(d && d.getElementById('mCharData'));
            } catch (e) { guardado = true; }

            if (!guardado) {
                toast(i18n('adv_save_failed', 'NetSuite did not save the file'));
                try { marco.remove(); } catch (e) { }
                return;
            }

            marcaLimpio();
            pintarEstado();
            apuntaSello();
            toast(i18n('adv_saved', 'Saved'));

            _marco = marco;
            _marcoId = String(id);
            marco.src = urlEdicion(id);
        };

        _guardando = setTimeout(alTerminar, SPA_ESPERA);
        marco.addEventListener('load', alTerminar);
        _saliendoAGuardar = true;
        btn.click();
    }


    let _preguntando = false;

    function pregunta(cfg, cb) {
        const fondo = _caja && _caja.querySelector('#nsft-adv-dlg');
        if (!fondo) { cb(window.confirm(cfg.texto)); return; }
        if (_preguntando) return;
        _preguntando = true;

        const tit = fondo.querySelector('#nsft-adv-dlg-tit');
        const txt = fondo.querySelector('#nsft-adv-dlg-txt');
        const si = fondo.querySelector('#nsft-adv-dlg-si');
        const no = fondo.querySelector('#nsft-adv-dlg-no');
        const otro = fondo.querySelector('#nsft-adv-dlg-otro');
        tit.textContent = cfg.titulo;
        txt.textContent = cfg.texto;
        si.textContent = cfg.si;
        no.textContent = cfg.no || i18n('adv_dlg_cancel', 'Cancel');
        si.classList.toggle('is-danger', !!cfg.peligro);
        if (otro) {
            otro.hidden = !cfg.otro;
            otro.textContent = cfg.otro || '';
            otro.classList.toggle('is-danger', !!cfg.otroPeligro);
        }

        const antes = document.activeElement;
        let cerrado = false;
        const cierra = (r) => {
            if (cerrado) return;
            cerrado = true;
            _preguntando = false;
            fondo.hidden = true;
            si.removeEventListener('click', aSi);
            no.removeEventListener('click', aNo);
            if (otro) { otro.removeEventListener('click', aOtro); otro.hidden = true; }
            fondo.removeEventListener('mousedown', aFondo);
            document.removeEventListener('keydown', aTecla, true);
            try { if (antes && antes.focus) antes.focus(); } catch (e) { }
            cb(r);
        };
        const aSi = () => cierra(true);
        const aNo = () => cierra(false);
        const aOtro = () => cierra('otro');
        const aFondo = (ev) => { if (ev.target === fondo) cierra(false); };
        const aTecla = (ev) => {
            if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); cierra(false); }
            else if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); cierra(true); }
        };
        si.addEventListener('click', aSi);
        no.addEventListener('click', aNo);
        if (otro) otro.addEventListener('click', aOtro);
        fondo.addEventListener('mousedown', aFondo);
        document.addEventListener('keydown', aTecla, true);

        fondo.hidden = false;
        try { no.focus(); } catch (e) { }
    }

    function pide(cfg, cb) {
        const fondo = _caja && _caja.querySelector('#nsft-adv-dlg');
        const inp = fondo && fondo.querySelector('#nsft-adv-dlg-inp');
        if (!fondo || !inp) { cb(null); return; }
        if (_preguntando) return;
        _preguntando = true;

        const tit = fondo.querySelector('#nsft-adv-dlg-tit');
        const txt = fondo.querySelector('#nsft-adv-dlg-txt');
        const si = fondo.querySelector('#nsft-adv-dlg-si');
        const no = fondo.querySelector('#nsft-adv-dlg-no');
        tit.textContent = cfg.titulo;
        txt.textContent = cfg.texto;
        si.textContent = cfg.si || i18n('adv_dlg_ok', 'OK');
        no.textContent = cfg.no || i18n('adv_dlg_cancel', 'Cancel');
        si.classList.remove('is-danger');
        inp.type = cfg.tipo === 'number' ? 'number' : 'text';
        inp.value = cfg.valor == null ? '' : String(cfg.valor);
        inp.placeholder = cfg.pista || '';
        inp.hidden = false;

        const antes = document.activeElement;
        let cerrado = false;
        const cierra = (r) => {
            if (cerrado) return;
            cerrado = true;
            _preguntando = false;
            fondo.hidden = true;
            inp.hidden = true;
            si.removeEventListener('click', aSi);
            no.removeEventListener('click', aNo);
            fondo.removeEventListener('mousedown', aFondo);
            document.removeEventListener('keydown', aTecla, true);
            try { if (antes && antes.focus) antes.focus(); } catch (e) { }
            cb(r);
        };
        const aSi = () => cierra(inp.value);
        const aNo = () => cierra(null);
        const aFondo = (ev) => { if (ev.target === fondo) cierra(null); };
        const aTecla = (ev) => {
            if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); cierra(null); }
            else if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); cierra(inp.value); }
        };
        si.addEventListener('click', aSi);
        no.addEventListener('click', aNo);
        fondo.addEventListener('mousedown', aFondo);
        document.addEventListener('keydown', aTecla, true);

        fondo.hidden = false;
        try { inp.focus(); inp.select(); } catch (e) { }
    }

    function confirmaPisar(cb) {
        pregunta({
            titulo: i18n('adv_dlg_stale_tit', 'The file changed on the server'),
            texto: i18n('adv_stale_confirm',
                'This file changed on the server after you opened it. Saving overwrites that change. Save anyway?'),
            si: i18n('adv_dlg_stale_si', 'Save anyway'),
            peligro: true
        }, cb);
    }

    const INICIO = '/app/center/card.nl?sc=-29&whence=';

    const VACIO = '/app/common/record/edittextmediaitem.nl?' + PARAM + '=T';

    function cierraArchivo() {
        if (_tabs.length) { cierraTab(_tabActiva); return; }
        confirmaSalir((si) => {
            if (!si) return;
            _saliendoAGuardar = true;
            tapaAntesDeSalir();
            window.location.href = VACIO;
        });
    }

    function cerrar() {
        confirmaSalir((si) => {
            if (!si) return;
            _saliendoAGuardar = true;
            tapaAntesDeSalir();
            window.location.href = INICIO;
        });
    }

    function confirmaSalir(cb) {
        if (!_cm) { cb(true); return; }
        const sucias = cuentaSucias();
        if (!sucias && !(_tabs.length === 0 && !_cm.isClean(_genLimpia))) { cb(true); return; }
        pregunta({
            titulo: i18n('adv_dlg_leave_tit', 'Unsaved changes'),
            texto: sucias > 1
                ? fmt('adv_leave_varias', '$1 open files have unsaved changes. Leave anyway?', [sucias])
                : i18n('adv_leave_confirm', 'This file has unsaved changes. Leave anyway?'),
            si: i18n('adv_dlg_leave_si', 'Leave without saving'),
            peligro: true
        }, cb);
    }


    function unidadSangria(cm) {
        try {
            if (cm.getOption('indentWithTabs')) return '\t';
            return ' '.repeat(Math.max(1, cm.getOption('indentUnit') || 4));
        } catch (e) { return '    '; }
    }

    function formateaJson(texto, unidad) {
        try { return JSON.stringify(JSON.parse(texto), null, unidad); }
        catch (e) { return null; }
    }

    function formateaXml(texto, unidad) {
        const t = String(texto).replace(/>\s*</g, '>\n<').split('\n');
        let nivel = 0;
        const out = [];
        t.forEach((cruda) => {
            const l = cruda.trim();
            if (!l) return;
            if (/^<\//.test(l)) nivel = Math.max(0, nivel - 1);
            out.push(unidad.repeat(nivel) + l);
            if (/^<[^!?\/]/.test(l) && !/\/>$/.test(l) && !/<\/[^>]+>$/.test(l)) nivel++;
        });
        return out.join('\n');
    }

    function formatear() {
        const cm = _cm;
        if (!cm) return;
        const antes = cm.getValue();
        const cur = cm.getCursor();

        const nombre = nombreDelActual();
        if (/\.json$/i.test(nombre)) {
            const salida = formateaJson(antes, unidadSangria(cm));
            if (salida === null) {
                toast(i18n('adv_format_json_mal', 'This is not valid JSON: nothing was changed'));
                return;
            }
            aplicaFormato(cm, antes, salida, cur);
            return;
        }
        if (/\.(xml|html?|xsd|xsl)$/i.test(nombre)) {
            aplicaFormato(cm, antes, formateaXml(antes, unidadSangria(cm)), cur);
            return;
        }
        cm.operation(() => {
            for (let i = 0; i < cm.lineCount(); i++) {
                const t = cm.getLine(i);
                const s = t.replace(/[ \t]+$/, '');
                if (s !== t) cm.replaceRange(s, { line: i, ch: 0 }, { line: i, ch: t.length });
            }
            for (let i = 0; i < cm.lineCount(); i++) cm.indentLine(i, 'smart');
        });
        cm.setCursor(cur);
        toast(cm.getValue() === antes
            ? i18n('adv_format_none', 'Nothing to tidy up')
            : i18n('adv_format_done', 'Document formatted'));
        pintarEstado();
        pintarCuentas();
    }

    function aplicaFormato(cm, antes, despues, cur) {
        if (despues !== antes) {
            cm.setValue(despues);
            try { cm.setCursor(cur); } catch (e) { } 
        }
        toast(despues === antes
            ? i18n('adv_format_none', 'Nothing to tidy up')
            : i18n('adv_format_done', 'Document formatted'));
        pintarEstado();
        pintarCuentas();
    }

    function irALinea() {
        const cm = _cm;
        if (!cm) return;
        const total = cm.lineCount();
        pide({
            titulo: i18n('adv_goto_title_corto', 'Go to line'),
            texto: fmt('adv_goto_prompt', 'Go to line (1-$1):', [total]),
            si: i18n('adv_goto_ir', 'Go'),
            tipo: 'number'
        }, (v) => {
            const nn = parseInt(v, 10);
            if (!isFinite(nn)) return;
            const l = Math.max(0, Math.min(total - 1, nn - 1));
            cm.setCursor({ line: l, ch: 0 });
            cm.scrollIntoView({ line: l, ch: 0 }, 120);
            cm.focus();
        });
    }


    let _bTramos = [];
    let _bIdx = 0;
    let _bMarcas = [];
    let _bCase = false;
    let _bTimer = 0;

    function cablearBuscar(caja) {
        const inp = caja.querySelector('#nsft-adv-find-input');
        const rep = caja.querySelector('#nsft-adv-repl-input');

        inp.addEventListener('input', () => {
            clearTimeout(_bTimer);
            _bTimer = setTimeout(() => buscar(inp.value), 180);
        });
        inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); saltar(e.shiftKey ? -1 : 1); }
            else if (e.key === 'Escape') { e.preventDefault(); cierraBuscar(); }
        });
        rep.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); reemplazaUno(); }
            else if (e.key === 'Escape') { e.preventDefault(); cierraBuscar(); }
        });

        caja.querySelector('#nsft-adv-find-prev').addEventListener('click', () => saltar(-1));
        caja.querySelector('#nsft-adv-find-next').addEventListener('click', () => saltar(1));
        caja.querySelector('#nsft-adv-find-close').addEventListener('click', cierraBuscar);
        caja.querySelector('#nsft-adv-repl-one').addEventListener('click', reemplazaUno);
        caja.querySelector('#nsft-adv-repl-all').addEventListener('click', reemplazaTodo);

        const btnCase = caja.querySelector('#nsft-adv-find-case');
        btnCase.addEventListener('click', () => {
            _bCase = !_bCase;
            btnCase.classList.toggle('is-on', _bCase);
            buscar(inp.value);
        });
    }

    function alternaBuscar() {
        const f = _caja.querySelector('#nsft-adv-find');
        if (f.hidden) abreBuscar(); else cierraBuscar();
    }

    function abreBuscar() {
        const f = _caja.querySelector('#nsft-adv-find');
        const inp = _caja.querySelector('#nsft-adv-find-input');
        f.hidden = false;
        _caja.querySelector('#nsft-adv-find-btn').classList.add('is-on');
        const sel = _cm.getSelection();
        if (sel && sel.indexOf('\n') === -1) inp.value = sel;
        inp.focus();
        inp.select();
        buscar(inp.value);
    }

    function cierraBuscar() {
        _caja.querySelector('#nsft-adv-find').hidden = true;
        _caja.querySelector('#nsft-adv-find-btn').classList.remove('is-on');
        limpiaMarcas();
        _bTramos = [];
        if (_cm) _cm.focus();
    }

    function limpiaMarcas() {
        _bMarcas.forEach((m) => { try { m.clear(); } catch (e) { } });
        _bMarcas = [];
    }

    function tramos(texto, termino) {
        if (!termino) return [];
        if (_bCase || !TS) {
            const out = [];
            const hay = _bCase ? texto : texto.toLowerCase();
            const n = _bCase ? termino : termino.toLowerCase();
            let i = hay.indexOf(n);
            while (i !== -1) { out.push({ start: i, end: i + n.length }); i = hay.indexOf(n, i + n.length); }
            return out;
        }
        return TS.ranges(texto, termino);
    }

    const TOPE_MARCAS = 2000;

    function buscar(termino) {
        const cm = _cm;
        if (!cm) return;
        limpiaMarcas();
        _bTramos = tramos(cm.getValue(), String(termino || ''));
        _bIdx = 0;

        if (_bTramos.length) {
            cm.operation(() => {
                _bTramos.slice(0, TOPE_MARCAS).forEach((t, i) => {
                    _bMarcas.push(cm.markText(cm.posFromIndex(t.start), cm.posFromIndex(t.end), {
                        className: i === 0 ? 'nsft-adv-hl-on' : 'nsft-adv-hl'
                    }));
                });
            });
            enfoca(0);
        }
        pintarContador();
    }

    function repintaBusqueda() {
        const f = _caja && _caja.querySelector('#nsft-adv-find');
        if (!f || f.hidden) return;
        clearTimeout(_bTimer);
        _bTimer = setTimeout(() => buscar(_caja.querySelector('#nsft-adv-find-input').value), 220);
    }

    function pintarContador() {
        const el = _caja.querySelector('#nsft-adv-find-count');
        const term = _caja.querySelector('#nsft-adv-find-input').value;
        if (!term) { el.textContent = ''; return; }
        el.textContent = _bTramos.length
            ? fmt('adv_find_count', '$1 of $2', [_bIdx + 1, miles(_bTramos.length)])
            : i18n('adv_find_none', 'No matches');
    }

    function saltar(dir) {
        if (!_bTramos.length) return;
        const antes = _bIdx;
        _bIdx = (_bIdx + dir + _bTramos.length) % _bTramos.length;
        remarca(antes, 'nsft-adv-hl');
        remarca(_bIdx, 'nsft-adv-hl-on');
        enfoca(_bIdx);
        pintarContador();
    }

    function remarca(i, clase) {
        const m = _bMarcas[i];
        if (!m) return;
        const pos = m.find();
        if (!pos) return;
        m.clear();
        _bMarcas[i] = _cm.markText(pos.from, pos.to, { className: clase });
    }

    function enfoca(i) {
        const t = _bTramos[i];
        if (!t || !_cm) return;
        const from = _cm.posFromIndex(t.start);
        const to = _cm.posFromIndex(t.end);
        _cm.setSelection(from, to);
        _cm.scrollIntoView({ from: from, to: to }, 120);
    }

    function reemplazaUno() {
        const cm = _cm;
        const t = _bTramos[_bIdx];
        if (!cm || !t) return;
        const con = _caja.querySelector('#nsft-adv-repl-input').value;
        cm.replaceRange(con, cm.posFromIndex(t.start), cm.posFromIndex(t.end));
        buscar(_caja.querySelector('#nsft-adv-find-input').value);
        pintarEstado();
    }

    function reemplazaTodo() {
        const cm = _cm;
        if (!cm || !_bTramos.length) return;
        const con = _caja.querySelector('#nsft-adv-repl-input').value;
        const cuantos = _bTramos.length;
        cm.operation(() => {
            for (let i = _bTramos.length - 1; i >= 0; i--) {
                const t = _bTramos[i];
                cm.replaceRange(con, cm.posFromIndex(t.start), cm.posFromIndex(t.end));
            }
        });
        buscar(_caja.querySelector('#nsft-adv-find-input').value);
        toast(fmt('adv_replace_done', '$1 replacements', [miles(cuantos)]));
        pintarEstado();
    }


    const RAIZ = '';

    function acotaArbol(id, nombre) {
        _cache.raiz = (id == null || id === '') ? null : { id: String(id), name: String(nombre || '') };
        guardaCache();
        const r = raizPanel();
        getNodo(r).abierto = true;
        pideHijos(r, true);
        pintaArbol();
        pintaCabeceraArbol();
        const t = _caja && _caja.querySelector('#nsft-adv-tree');
        if (t && t.hidden) alternaArbol();
    }

    function pintaCabeceraArbol() {
        const cab = _caja && _caja.querySelector('#nsft-adv-files-head');
        if (!cab) return;
        const et = cab.querySelector('.nsft-adv-sec-t');
        const r = _cache && _cache.raiz;
        if (et) et.textContent = (r && r.name) ? r.name : i18n('adv_tree_title', 'Files in this folder');
        let x = cab.parentNode.querySelector('.nsft-adv-sec-quita');
        if (!r) { if (x) x.remove(); return; }
        if (x) return;
        x = document.createElement('span');
        x.className = 'nsft-adv-sec-quita';
        x.setAttribute('role', 'button');
        x.setAttribute('tabindex', '0');
        x.title = i18n('adv_dir_quitar', 'Show the whole File Cabinet');
        x.innerHTML = svg(ICO.cerrar, 2);
        x.addEventListener('click', (ev) => { ev.stopPropagation(); acotaArbol(null); });
        cab.appendChild(x);
    }

    function raizPanel() {
        const r = _cache && _cache.raiz;
        return (r && r.id) ? String(r.id) : RAIZ;
    }
    const _nodos = new Map();
    const _tokens = new Map();
    let _arbolPedido = false;
    let _arbolSeq = 0;
    let _reveladoActual = false;
    let _idActual = '';


    const CACHE_TTL = 5 * 60 * 1000;
    const CACHE_VER = 3;
    const CACHE_MAX_CUENTAS = 5;
    const CACHE_MAX_CARPETAS = 40;
    const CACHE_MAX_FILES = 250;

    let _cache = { recientes: [], abiertas: [], rutas: {}, carpetas: {} };
    let _cacheTodo = {};
    let _cacheTimer = null;

    function cuenta() {
        try { return String(location.hostname || ''); } catch (e) { return ''; }
    }

    function leeCache(items) {
        const todo = (items && items[CACHE_KEY]) || {};
        if (todo && typeof todo === 'object') _cacheTodo = todo;
        const mio = todo && todo[cuenta()];
        if (!mio || typeof mio !== 'object') return;
        if (mio.v !== CACHE_VER) return;
        _cache = {
            recientes: Array.isArray(mio.recientes) ? mio.recientes : [],
            abiertas: Array.isArray(mio.abiertas) ? mio.abiertas : [],
            rutas: (mio.rutas && typeof mio.rutas === 'object') ? mio.rutas : {},
            carpetas: (mio.carpetas && typeof mio.carpetas === 'object') ? mio.carpetas : {}
        };
    }

    function guardaCache() {
        if (_cacheTimer) clearTimeout(_cacheTimer);
        _cacheTimer = setTimeout(escribeCache, 300);
    }

    function escribeCache() {
        if (_cacheTimer) { clearTimeout(_cacheTimer); _cacheTimer = null; }
        podaCache();
        _cache.v = CACHE_VER;
        _cache.ts = Date.now();
        _cacheTodo[cuenta()] = _cache;
        podaCuentas();
        try { chrome.storage.local.set({ [CACHE_KEY]: _cacheTodo }); } catch (e) { }
    }

    function podaCuentas() {
        const cs = Object.keys(_cacheTodo);
        if (cs.length <= CACHE_MAX_CUENTAS) return;
        cs.sort((a, b) => ((_cacheTodo[b] && _cacheTodo[b].ts) || 0) - ((_cacheTodo[a] && _cacheTodo[a].ts) || 0));
        cs.slice(CACHE_MAX_CUENTAS).forEach((c) => { delete _cacheTodo[c]; });
    }

    window.addEventListener('pagehide', () => { if (_cacheTimer) escribeCache(); });

    function podaCache() {
        const ids = Object.keys(_cache.carpetas);
        if (ids.length > CACHE_MAX_CARPETAS) {
            ids.sort((a, b) => (_cache.carpetas[b].ts || 0) - (_cache.carpetas[a].ts || 0));
            ids.slice(CACHE_MAX_CARPETAS).forEach((id) => { delete _cache.carpetas[id]; });
        }
        Object.keys(_cache.rutas).forEach((id) => {
            if (!_cache.carpetas[id]) delete _cache.rutas[id];
        });
    }

    function apunta(id, subs, files) {
        const corto = (r) => ({ id: r.id, name: r.name, url: r.url, filetype: r.filetype });
        _cache.carpetas[String(id)] = {
            ts: Date.now(),
            subs: (subs || []).map(corto),
            files: (files || []).slice(0, CACHE_MAX_FILES).map(corto)
        };
        guardaCache();
    }

    function apuntaReciente(id, nombre, folder) {
        if (!id || !nombre) return;
        const lista = (_cache.recientes || []).filter((r) => r && String(r.id) !== String(id));
        lista.unshift({ id: String(id), name: String(nombre), folder: String(folder == null ? '' : folder) });
        _cache.recientes = lista.slice(0, 12);
        guardaCache();
    }

    function apuntaAbiertas() {
        const abiertas = [];
        _nodos.forEach((n) => { if (n.abierto) abiertas.push(n.id); });
        _cache.abiertas = abiertas;
        guardaCache();
    }

    function caducada(n) {
        const c = _cache.carpetas[n.id];
        return !c || (Date.now() - (c.ts || 0)) > CACHE_TTL;
    }

    function siembraCache() {
        Object.keys(_cache.carpetas).forEach((id) => {
            const c = _cache.carpetas[id];
            const n = getNodo(id);
            n.subs = c.subs || [];
            n.files = c.files || [];
            n.cargado = true;
        });
        (_cache.abiertas || []).forEach((id) => { getNodo(id).abierto = true; });
    }

    const EDITABLES = /\.(js|mjs|ts|json|html?|xml|xsl|css|txt|csv|md|sql|ftl|properties)$/i;

    function alternaArbol() {
        const t = _caja.querySelector('#nsft-adv-tree');
        const abrir = t.hidden;
        t.hidden = !abrir;
        const tir = _caja.querySelector('#nsft-adv-tirador-ancho');
        if (tir) tir.hidden = !abrir;
        try { chrome.storage.local.set({ advancedEditorTree: abrir }); } catch (e) { }
        document.documentElement.classList.toggle('nsft-adv-conarbol', abrir);
        if (abrir && !_arbolPedido) arrancaArbol();
        if (_cm) setTimeout(() => { try { _cm.refresh(); } catch (e) { } }, 0);
    }

    function cablearArbol(caja) {
        window.addEventListener('message', (event) => {
            if (event.source !== window) return;
            const d = event.data;
            if (!d || typeof d !== 'object' || d.dest !== EXTENSION_DEST) return;
            if (d.type === 'tree') { recibeCarpeta(d.payload || {}); return; }
            if (d.type === 'children') { recibeHijos(d.payload || {}); return; }
            if (d.type === 'sello') { recibeSello(d.payload || {}); return; }
            if (d.type === 'nombres') { recibeNombres(d.payload || {}); return; }
            if (d.type === 'carpetas') { recibeNombres(d.payload || {}); return; }
            if (d.type === 'cambiado') { recibeCambiado(d.payload || {}); return; }
        });

        if (_prefs.advancedEditorTree) {
            caja.querySelector('#nsft-adv-tree').hidden = false;
            const tir = caja.querySelector('#nsft-adv-tirador-ancho');
            if (tir) tir.hidden = false;
            arrancaArbol();
        }
    }


    function carpetaDelFormulario(fuente) {
        const el = (fuente || docActivo()).getElementById('folder');
        const v = el && (el.value || el.getAttribute('value'));
        return v ? String(v).trim() : null;
    }

    function carpetaDelArchivo() {
        const t = tabActiva();
        if (t && t.carpeta != null && t.carpeta !== '') return t.carpeta;
        return carpetaDelFormulario();
    }

    function idDelArchivo() {
        try { return new URLSearchParams(location.search).get('id') || ''; } catch (e) { return ''; }
    }

    function getNodo(id, nombre) {
        const k = String(id);
        let n = _nodos.get(k);
        if (!n) {
            n = { id: k, name: nombre || '', subs: [], files: [], cargado: false, pidiendo: false, abierto: false, error: false };
            _nodos.set(k, n);
        } else if (nombre && !n.name) n.name = nombre;
        return n;
    }

    function arrancaArbol() {
        _arbolPedido = true;
        siembraCache();

        const folder = carpetaDelArchivo();
        const ruta = (folder != null) ? _cache.rutas[String(folder)] : null;
        if (ruta) {
            ruta.forEach((c) => { getNodo(c.id, c.name).abierto = true; });
            pintaMigas(ruta);
        }

        if (!pintaArbol()) pintaMensajeArbol(i18n('adv_tree_loading', 'Loading…'));

        pideHijos(raizPanel());
        if (folder == null || folder === '') return;

        const n = getNodo(String(folder));
        if (!ruta || caducada(n)) {
            const token = 't' + (++_arbolSeq);
            _tokens.set(token, String(folder));
            manda('tree', { folder: String(folder), token: token });
            return;
        }
        ruta.slice(0, -1).forEach((c) => pideHijos(c.id));
        pideHijos(String(folder), true);
    }

    function manda(type, payload) {
        ensureBridge(() => {
            window.postMessage({ dest: FETCHER_DEST, type: type, payload: payload }, '*');
        });
    }

    function pideHijos(id, forzar) {
        const n = getNodo(id);
        if (n.pidiendo) return;
        if (n.cargado && !caducada(n) && !forzar) return;
        n.pidiendo = true;
        n.error = false;
        const token = 'c' + (++_arbolSeq);
        _tokens.set(token, n.id);
        manda('children', { folder: n.id === RAIZ ? null : n.id, token: token });
    }

    function recibeHijos(p) {
        const espera = _busCb.get(p.token);
        if (espera) { espera(p.error ? null : (p.data || null)); return; }

        const id = _tokens.get(p.token);
        if (id === undefined) return;
        _tokens.delete(p.token);
        const n = getNodo(id);
        n.pidiendo = false;
        if (p.error || !p.data) n.error = true;
        else {
            n.error = false;
            n.cargado = true;
            n.subs = p.data.subs || [];
            n.files = p.data.files || [];
            apunta(n.id, n.subs, n.files);
        }
        pintaArbol();
        veloTrasArbol();
    }

    function recibeCarpeta(p) {
        const id = _tokens.get(p.token);
        if (id === undefined) return;
        _tokens.delete(p.token);
        const n = getNodo(id);
        n.pidiendo = false;
        if (p.error || !p.data) { n.error = true; pintaArbol(); veloTrasArbol(); return; }
        n.error = false;
        n.cargado = true;
        n.subs = p.data.subs || [];
        n.files = p.data.files || [];

        const ruta = p.data.path || [];
        pintaMigas(ruta);
        ruta.forEach((c) => { getNodo(c.id, c.name).abierto = true; });
        apunta(n.id, n.subs, n.files);
        _cache.rutas[n.id] = ruta;
        apuntaAbiertas();
        ruta.slice(0, -1).forEach((c) => pideHijos(c.id));
        pintaArbol();
        veloTrasArbol();
    }

    let _bridgeListo = false;
    let _bridgeCola = [];
    function ensureBridge(cb) {
        if (_bridgeListo) { cb(); return; }
        _bridgeCola.push(cb);
        if (_bridgeCola.length > 1) return;

        const suelta = () => {
            _bridgeListo = true;
            const cola = _bridgeCola;
            _bridgeCola = [];
            cola.forEach((f) => f());
        };

        try {
            if (window.NSFT_SuiteQLRest && window.NSFT_SuiteQLRest.ensureTransport) {
                window.NSFT_SuiteQLRest.ensureTransport();
            }
            const sc = document.createElement('script');
            sc.src = chrome.runtime.getURL('scripts/modules/advanced_editor/advanced_editor_fetcher.js');
            sc.async = false;
            sc.onload = suelta;
            sc.onerror = suelta;
            (document.head || document.documentElement).appendChild(sc);
        } catch (e) { suelta(); }
    }

    function pintaMensajeArbol(msg) {
        const lista = _caja && _caja.querySelector('#nsft-adv-tree-list');
        if (!lista) return;
        lista.textContent = '';
        const d = document.createElement('div');
        d.className = 'nsft-adv-tree-msg';
        d.textContent = msg;
        lista.appendChild(d);
    }

    function pintaMigasDe(carpeta) {
        const dir = _caja && _caja.querySelector('#nsft-adv-dir');
        if (!dir) return;
        const ruta = carpeta == null ? null : _cache.rutas[String(carpeta)];
        if (ruta && ruta.length) { pintaMigas(ruta); return; }
        dir.textContent = '';
    }

    function pintaMigas(ruta) {
        const dir = _caja && _caja.querySelector('#nsft-adv-dir');
        if (!dir) return;
        dir.textContent = '';
        ruta.forEach((c, i) => {
            if (i) {
                const sep = document.createElement('span');
                sep.className = 'nsft-adv-crumb-sep';
                sep.textContent = '/';
                dir.appendChild(sep);
            }
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'nsft-adv-crumb';
            b.textContent = c.name;
            b.title = c.name;
            b.addEventListener('click', () => revela(c.id));
            dir.appendChild(b);
        });
        if (ruta.length) {
            const sep = document.createElement('span');
            sep.className = 'nsft-adv-crumb-sep';
            sep.textContent = '/';
            dir.appendChild(sep);
        }
    }

    function revela(id) {
        const n = getNodo(id);
        n.abierto = true;
        pideHijos(n.id);
        apuntaAbiertas();
        pintaArbol();
        const lista = _caja && _caja.querySelector('#nsft-adv-tree-list');
        if (!lista) return;
        const el = lista.querySelector('.nsft-adv-node[data-folder="' + String(id).replace(/[^0-9]/g, '') + '"]');
        if (el) { try { el.scrollIntoView({ block: 'center' }); } catch (e) { el.scrollIntoView(); } }
    }

    function pintaArbol() {
        const lista = _caja && _caja.querySelector('#nsft-adv-tree-list');
        if (!lista) return false;
        const raiz = _nodos.get(raizPanel());
        if (!raiz || !raiz.cargado) {
            if (raiz && raiz.error) {
                pintaMensajeArbol(i18n('adv_tree_error', 'Could not read the folder'));
            }
            return false;
        }

        _idActual = idDelArchivo();
        actualizaBotonesArchivo();
        const alto = lista.scrollTop || Number(_cache.scroll || 0);
        lista.textContent = '';
        pintaNivel(raiz, 0, lista);
        if (!lista.firstChild) {
            pintaMensajeArbol(i18n('adv_tree_empty', 'Empty folder'));
            return true;
        }
        lista.scrollTop = alto;

        if (!_reveladoActual) {
            const act = lista.querySelector('.nsft-adv-node.is-current');
            if (act) {
                _reveladoActual = true;
                if (!seVe(act, lista)) {
                    try { act.scrollIntoView({ block: 'center' }); } catch (e) { act.scrollIntoView(); }
                }
            }
        }
        apuntaScrollArbol(lista);
        return true;
    }

    function marcaActualEnArbol() {
        const lista = _caja && _caja.querySelector('#nsft-adv-tree-list');
        if (!lista) return false;
        _idActual = idDelArchivo();
        actualizaBotonesArchivo();
        const id = String(_idActual).replace(/[^0-9A-Za-z_-]/g, '');
        if (!id) return false;
        const objetivo = lista.querySelector('.nsft-adv-node[data-file="' + id + '"]');
        if (!objetivo) return false;
        lista.querySelectorAll('.nsft-adv-node.is-current').forEach((n) => n.classList.remove('is-current'));
        objetivo.classList.add('is-current');
        if (!_reveladoActual) {
            _reveladoActual = true;
            if (!seVe(objetivo, lista)) {
                try { objetivo.scrollIntoView({ block: 'center' }); } catch (e) { objetivo.scrollIntoView(); }
            }
        }
        return true;
    }

    function seVe(nodo, lista) {
        try {
            const a = nodo.getBoundingClientRect();
            const b = lista.getBoundingClientRect();
            return a.top >= b.top + 4 && a.bottom <= b.bottom - 4;
        } catch (e) { return false; }
    }

    let _scrollReloj = null;

    function apuntaScrollArbol(lista) {
        if (lista.dataset.oyendo) return;
        lista.dataset.oyendo = '1';
        lista.addEventListener('scroll', () => {
            clearTimeout(_scrollReloj);
            _scrollReloj = setTimeout(() => {
                _cache.scroll = Math.round(lista.scrollTop);
                guardaCache();
            }, 250);
        });
    }

    function pintaNivel(padre, prof, dest) {
        (padre.subs || []).forEach((s) => {
            const n = getNodo(s.id, s.name);
            dest.appendChild(nodoCarpeta(n, prof));
            if (!n.abierto) return;
            if (n.error) { dest.appendChild(mensajeNivel(i18n('adv_tree_error', 'Could not read the folder'), prof + 1)); return; }
            if (!n.cargado) { dest.appendChild(mensajeNivel(i18n('adv_tree_loading', 'Loading…'), prof + 1)); return; }
            if (!n.subs.length && !n.files.length) { dest.appendChild(mensajeNivel(i18n('adv_tree_empty', 'Empty folder'), prof + 1)); return; }
            pintaNivel(n, prof + 1, dest);
        });

        (padre.files || []).forEach((f) => dest.appendChild(nodoArchivo(f, prof, padre.id)));
    }


    function svgIco(paths, relleno) {
        const trazo = relleno
            ? 'fill="currentColor" stroke="none"'
            : 'fill="none" stroke="currentColor" stroke-width="1.8"';
        return '<svg viewBox="0 0 24 24" ' + trazo + ' '
            + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
            + paths.map((d) => '<path d="' + d + '"/>').join('') + '</svg>';
    }

    function insignia(txt, tintaOscura) {
        return '<svg viewBox="0 0 24 24" aria-hidden="true">'
            + '<rect x="2" y="2.5" width="20" height="19" rx="4.5" fill="currentColor"/>'
            + '<text x="12" y="16.6" text-anchor="middle" font-size="' + (txt.length > 2 ? 8 : 10.5) + '" '
            + 'font-weight="700" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" '
            + 'fill="' + (tintaOscura ? '#1f2430' : '#ffffff') + '">' + escapeHtml(txt) + '</text>'
            + '</svg>';
    }

    const ARB = {
        cerrado: ['M10 8l4 4-4 4'],
        abierto: ['M8 10l4 4 4-4'],
        carpeta: ['M3.2 7.3a1.7 1.7 0 0 1 1.7-1.7h3.6c.4 0 .8.2 1 .5l1.4 1.9h8.4a1.7 1.7 0 0 1 1.7 1.7v7.9a1.7 1.7 0 0 1-1.7 1.7H4.9a1.7 1.7 0 0 1-1.7-1.7z'],
        carpetaAbierta: [
            'M3.2 17.6V7.3a1.7 1.7 0 0 1 1.7-1.7h3.6c.4 0 .8.2 1 .5l1.4 1.9h7.2a1.7 1.7 0 0 1 1.7 1.7v1.4H8.4a1.7 1.7 0 0 0-1.6 1.1z',
            'M6.9 12.6a1.7 1.7 0 0 1 1.6-1.1h12.3l-2.5 6.4a1.7 1.7 0 0 1-1.6 1.1H4.4z'
        ],
        hoja: ['M13.5 3H7A1.5 1.5 0 0 0 5.5 4.5v15A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V8z', 'M13.5 3v5h5'],
        llaves: [
            'M9.6 4.6c-1.6 0-2.2.8-2.2 2.2v2.5c0 1.3-.7 2.2-2.1 2.2 1.4 0 2.1.9 2.1 2.2v2.5c0 1.4.6 2.2 2.2 2.2',
            'M14.4 4.6c1.6 0 2.2.8 2.2 2.2v2.5c0 1.3.7 2.2 2.1 2.2-1.4 0-2.1.9-2.1 2.2v2.5c0 1.4-.6 2.2-2.2 2.2'
        ],
        angulos: ['M9.6 8.4L6 12l3.6 3.6', 'M14.4 8.4L18 12l-3.6 3.6'],
        tabla: ['M4 6.5h16v11H4z', 'M4 10.5h16', 'M10 10.5v7'],
        texto: [
            'M13.5 3H7A1.5 1.5 0 0 0 5.5 4.5v15A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V8z',
            'M13.5 3v5h5', 'M8.5 12.5h7', 'M8.5 16h4.5'
        ],
        imagen: ['M4 5.5h16v13H4z', 'M4 15.2l4.6-4.6 3.4 3.4 2.6-2.6L20 16.2', 'M9.2 9.4a1.2 1.2 0 1 1-2.4 0 1.2 1.2 0 0 1 2.4 0z']
    };

    const FAMILIAS = [
        { re: /\.(js|mjs)$/i, ico: insignia('JS', true), clase: 'is-js' },
        { re: /\.ts$/i, ico: insignia('TS', false), clase: 'is-ts' },
        { re: /\.json$/i, ico: svgIco(ARB.llaves), clase: 'is-json' },
        { re: /\.html?$/i, ico: insignia('<>', false), clase: 'is-markup' },
        { re: /\.(xml|xsl|ftl)$/i, ico: svgIco(ARB.angulos), clase: 'is-markup' },
        { re: /\.css$/i, ico: insignia('#', false), clase: 'is-style' },
        { re: /\.md$/i, ico: insignia('M↓', false), clase: 'is-doc' },
        { re: /\.sql$/i, ico: insignia('SQ', false), clase: 'is-data' },
        { re: /\.csv$/i, ico: svgIco(ARB.tabla), clase: 'is-data' },
        { re: /\.(txt|properties)$/i, ico: svgIco(ARB.texto), clase: 'is-doc' },
        { re: /\.pdf$/i, ico: insignia('PD', false), clase: 'is-pdf' },
        { re: /\.(png|jpe?g|gif|svg|webp|ico|bmp|tiff?)$/i, ico: svgIco(ARB.imagen), clase: 'is-img' }
    ];

    const HOJA = { ico: svgIco(ARB.hoja), clase: 'is-otro' };
    const CARPETA = { ico: svgIco(ARB.carpeta, true), clase: 'is-carpeta' };
    const IMAGEN_SIN_NOMBRE = { ico: svgIco(ARB.imagen), clase: 'is-img' };

    function iconoArchivo(nombre, tipo) {
        for (let i = 0; i < FAMILIAS.length; i++) {
            if (FAMILIAS[i].re.test(nombre)) return FAMILIAS[i];
        }
        if (esImagen(nombre, tipo)) return IMAGEN_SIN_NOMBRE;
        return HOJA;
    }

    function nodoCarpeta(n, prof) {
        const b = nodo({
            giro: n.abierto ? ARB.abierto : ARB.cerrado,
            ico: svgIco(n.abierto ? ARB.carpetaAbierta : ARB.carpeta, true),
            clase: 'is-carpeta',
            texto: n.name,
            prof: prof,
            onClick: () => {
                n.abierto = !n.abierto;
                if (n.abierto) pideHijos(n.id);
                apuntaAbiertas();
                pintaArbol();
            }
        });
        b.classList.add('is-folder');
        if (n.abierto) b.classList.add('is-open');
        b.dataset.folder = n.id;
        return b;
    }

    function nodoArchivo(f, prof, carpetaId) {
        const editable = EDITABLES.test(f.name);
        const esActual = String(f.id) === String(_idActual);
        const esPrevia = !!_previaId && String(f.id) === String(_previaId);
        const fam = iconoArchivo(f.name, f.filetype);
        const destino = editable
            ? '/app/common/record/edittextmediaitem.nl?id=' + encodeURIComponent(f.id)
                + '&e=T&' + PARAM + '=T'
            : (enlaceSeguro(f.url)
                || '/app/common/media/mediaitem.nl?id=' + encodeURIComponent(f.id));
        const b = nodo({
            ico: fam.ico,
            clase: fam.clase,
            texto: f.name,
            actual: esActual,
            previa: esPrevia,
            otro: !editable,
            prof: prof,
            onClick: () => {
                if (String(f.id) === String(_idActual)) return;
                if (editable) { cierraVisor(); abreArchivo(f.id, f.name); return; }
                abrePrevia(f.id, f.name, f.url, f.filetype, carpetaId);
            }
        });
        b.dataset.file = String(f.id);
        return b;
    }

    function enlaceSeguro(u) {
        const s = String(u || '').trim();
        if (!s) return null;
        if (s.charAt(0) === '/' && s.charAt(1) !== '/') return s;
        try {
            const abs = new URL(s, location.origin);
            if (abs.origin === location.origin) return abs.href;
        } catch (e) { }
        return null;
    }

    function mensajeNivel(texto, prof) {
        const d = document.createElement('div');
        d.className = 'nsft-adv-tree-sub';
        d.style.setProperty('--d', String(prof));
        d.textContent = texto;
        return d;
    }

    function nodo(o) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'nsft-adv-node' + (o.actual ? ' is-current' : '')
            + (o.previa ? ' is-previa' : '') + (o.otro ? ' is-other' : '');
        b.title = o.titulo || o.texto;
        b.style.setProperty('--d', String(o.prof || 0));

        const g = document.createElement('span');
        g.className = 'nsft-adv-node-tw';
        if (o.giro) g.innerHTML = svgIco(o.giro, false);
        if (typeof o.onGiro === 'function') {
            g.classList.add('is-clickable');
            g.addEventListener('click', (ev) => { ev.stopPropagation(); o.onGiro(); });
        }
        b.appendChild(g);

        const i = document.createElement('span');
        i.className = 'nsft-adv-node-ico ' + (o.clase || '');
        i.innerHTML = o.ico;
        b.appendChild(i);

        const n = document.createElement('span');
        n.className = 'nsft-adv-node-name';
        n.textContent = o.texto;
        b.appendChild(n);

        if (o.sufijo) {
            const f = document.createElement('span');
            f.className = 'nsft-adv-node-sig';
            f.textContent = o.sufijo;
            b.appendChild(f);
        }

        b.addEventListener('click', o.onClick);
        return b;
    }


    const SPA_ESPERA = 20000;

    let _marco = null;
    let _marcoId = '';
    let _cambiando = false;
    let _guardando = null;
    let _navegado = false;

    function urlEdicion(id) {
        return '/app/common/record/edittextmediaitem.nl?id=' + encodeURIComponent(id) + '&e=T';
    }

    function docActivo() {
        if (!_marco) return document;
        try { return _marco.contentDocument || document; } catch (e) { return document; }
    }

    function idDelFormulario() {
        if (!_marco) {
            try {
                const el = document.getElementById('id');
                const v = el && (el.value || el.getAttribute('value'));
                if (v) return String(v).trim();
            } catch (e) { }
            return idDelArchivo();
        }
        try {
            return new URLSearchParams(_marco.contentWindow.location.search).get('id') || '';
        } catch (e) { return ''; }
    }

    function abreArchivo(id, nombre, forzar) {
        if (_cambiando) return;
        if (forzar) {
            confirmaSalir((si) => { if (si) abreArchivoYa(id, nombre, true); });
            return;
        }
        if (String(id) === String(idDelArchivo())) return;
        const i = indiceTab(id);
        if (i !== -1) { activaTab(i); return; }
        abreArchivoYa(id, nombre, false);
    }

    let _ultimaApertura = null;

    function apuntaApertura(bytes, red, parseo, montaje) {
        _ultimaApertura = {
            'KB de la página': Math.round(bytes / 1024),
            'red': Math.round(red) + ' ms',
            'parseo del HTML': Math.round(parseo) + ' ms',
            'montaje del editor': Math.round(montaje) + ' ms'
        };
    }

    function abreArchivoYa(id, nombre, recarga) {
        if (_cambiando) return;
        _cambiando = true;
        cargando(true, nombre);

        const corta = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        const reloj = setTimeout(() => { try { corta && corta.abort(); } catch (e) { } }, SPA_ESPERA);
        let cayo = false;
        const alMarco = () => {
            if (cayo) return;
            cayo = true;
            clearTimeout(reloj);
            _cambiando = false;
            abrePorMarco(id, nombre, recarga);
        };

        const tPide = performance.now();
        fetch(urlEdicion(id), { credentials: 'same-origin', signal: corta ? corta.signal : undefined })
            .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
            .then((html) => {
                if (cayo) return;
                const tRed = performance.now() - tPide;
                const tParse = performance.now();
                const d = new DOMParser().parseFromString(html, 'text/html');
                const ta = d.getElementById('mCharData');
                const msParse = performance.now() - tParse;
                if (!ta || !String(ta.value == null ? '' : ta.value)) { alMarco(); return; }
                clearTimeout(reloj);
                const tMonta = performance.now();
                adopta(null, id, ta, recarga, d);
                apuntaApertura(html.length, tRed, msParse, performance.now() - tMonta);
                _cambiando = false;
            })
            .catch(alMarco);
    }

    function abrePorMarco(id, nombre, recarga) {
        if (_cambiando) return;
        _cambiando = true;
        cargando(true, nombre);

        const marco = document.createElement('iframe');
        marco.className = 'nsft-adv-marco';
        marco.setAttribute('aria-hidden', 'true');
        marco.setAttribute('tabindex', '-1');

        let resuelto = false;
        const reloj = setTimeout(() => rindete(), SPA_ESPERA);

        function rindete() {
            if (resuelto) return;
            resuelto = true;
            clearTimeout(reloj);
            _cambiando = false;
            try { marco.remove(); } catch (e) { }
            _saliendoAGuardar = true;
            tapaAntesDeSalir();
            window.location.href = urlEdicion(id) + '&' + PARAM + '=T';
        }

        marco.addEventListener('error', rindete);
        marco.addEventListener('load', () => {
            if (resuelto) return;
            let d = null;
            try { d = marco.contentDocument; } catch (e) { d = null; }
            const ta = d && d.getElementById('mCharData');
            if (!ta) { rindete(); return; }
            resuelto = true;
            clearTimeout(reloj);
            adopta(marco, id, ta, recarga);
            _cambiando = false;
        });

        marco.src = urlEdicion(id);
        document.body.appendChild(marco);
    }

    function adopta(marco, id, ta, recarga, fuente) {
        cierraVisor();
        if (marco) {
            if (_marco && _marco !== marco) { try { _marco.remove(); } catch (e) { } }
            _marco = marco;
            _marcoId = String(id);
        }

        let d = fuente || null;
        if (!d && marco) { try { d = marco.contentDocument; } catch (e) { d = null; } }
        const nombre = nombreDelFormulario(d);
        const carpeta = carpetaDelFormulario(d);
        const texto = String(ta.value == null ? '' : ta.value);
        const cm = _cm;

        const ya = indiceTab(id);
        if (ya !== -1) {
            if (ya !== _tabActiva) {
                guardaEstadoEnTab();
                _tabActiva = ya;
                try { cm.swapDoc(_tabs[ya].doc); } catch (e) { }
            }
            cm.setValue(texto);
            cm.clearHistory();
            cm.setCursor({ line: 0, ch: 0 });
            const t = _tabs[ya];
            t.nombre = nombre;
            t.carpeta = carpeta;
        } else {
            const doc = CodeMirror.Doc(texto, modoDe(nombre));
            guardaEstadoEnTab();
            _tabs.push({
                id: String(id), nombre: nombre, carpeta: carpeta, doc: doc,
                genLimpia: 0, guardado: texto, sello: ''
            });
            _tabActiva = _tabs.length - 1;
            try { cm.swapDoc(doc); } catch (e) { cm.setValue(texto); }
            cm.setCursor({ line: 0, ch: 0 });
        }

        try {
            history.pushState({ nsftAdv: 1 }, '', urlEdicion(id) + '&' + PARAM + '=T');
            _navegado = true;
        } catch (e) { }

        marcaLimpio();
        trasCambioDeArchivo(nombre);
        apuntaReciente(id, nombre, carpeta);
        apuntaSello();

        if (_busIrALinea != null) {
            const ln = _busIrALinea;
            _busIrALinea = null;
            try {
                cm.setCursor({ line: ln, ch: 0 });
                cm.scrollIntoView({ line: ln, ch: 0 }, cm.getScrollInfo().clientHeight / 2);
            } catch (e) { }
        }
        cargando(false);
        try { cm.focus(); } catch (e) { }
    }

    function refrescaArbolTrasCambio() {
        if (!_arbolPedido) return;
        _reveladoActual = false;
        const f = carpetaDelArchivo();
        if (f == null || f === '') { pintaArbol(); return; }
        const ruta = _cache.rutas[String(f)];
        if (ruta) {
            ruta.forEach((c) => { getNodo(c.id, c.name).abierto = true; });
            pintaMigas(ruta);
            apuntaAbiertas();
            pideHijos(String(f));
            const n = _nodos.get(String(f));
            if (n && n.cargado && marcaActualEnArbol()) return;
            pintaArbol();
            return;
        }
        const token = 't' + (++_arbolSeq);
        _tokens.set(token, String(f));
        manda('tree', { folder: String(f), token: token });
        pintaArbol();
    }

    function urlDelActual() {
        const id = idDelArchivo();
        if (!id) return null;
        const f = carpetaDelArchivo();
        if (f == null || f === '') return null;
        const n = _nodos.get(String(f));
        const guardada = _cache.carpetas[String(f)];
        const listas = [n && n.files, guardada && guardada.files];
        for (let k = 0; k < listas.length; k++) {
            const arr = listas[k] || [];
            for (let i = 0; i < arr.length; i++) {
                if (String(arr[i].id) === String(id)) return enlaceSeguro(arr[i].url);
            }
        }
        return null;
    }

    function nombreDelActual() {
        const pf = _caja && _caja.querySelector('.nsft-adv-path-file');
        return (pf && pf.textContent.trim()) || '';
    }

    function bajaComo(href, nombre, luego) {
        const a = document.createElement('a');
        a.href = href;
        a.download = nombre || '';
        a.rel = 'noopener';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
        if (luego) setTimeout(luego, 0);
    }

    function descargaDelServidor() {
        const u = urlDelante();
        if (!u) return;
        bajaComo(u, nombreDelante());
    }

    function descargaEditado() {
        if (!_cm || _sinArchivo) return;
        let u = '';
        try {
            u = URL.createObjectURL(new Blob([_cm.getValue()], { type: 'text/plain;charset=utf-8' }));
        } catch (e) { return; }
        bajaComo(u, nombreDelActual(), () => { try { URL.revokeObjectURL(u); } catch (e) { } });
    }

    function previaDelante() {
        if (_sinArchivo) return null;
        const t = tabActiva();
        return (t && t.previa) ? t : null;
    }

    function idDelante() {
        const t = previaDelante();
        return t ? t.previa.id : idDelArchivo();
    }

    function urlDelante() {
        const t = previaDelante();
        return t ? t.previa.url : urlDelActual();
    }

    function nombreDelante() {
        const t = previaDelante();
        return t ? (t.nombre || '') : nombreDelActual();
    }

    function actualizaBotonesArchivo() {
        const mirando = !!previaDelante();
        const hay = !!urlDelante();
        ['#nsft-adv-raw', '#nsft-adv-descargar'].forEach((sel) => {
            const b = _caja && _caja.querySelector(sel);
            if (b) b.disabled = !hay;
        });
        ['#nsft-adv-reload', '#nsft-adv-tabla-btn'].forEach((sel) => {
            const b = _caja && _caja.querySelector(sel);
            if (b) b.disabled = mirando;
        });
    }



    const MAPA_LINEA = 2;
    const MAPA_CHAR = 1.1;
    const MAPA_ANCHO = 110;

    let _mapaRaf = 0;
    let _mapaOff = 0;
    let _mapaCols = null;
    let _mapaTema = '';
    let _mapaHuella = '';
    let _mapaHuellaT = 0;
    let _mapaW = 0;
    let _mapaH = 0;
    let _mapaClave = '';
    let _mapaGen = 0;

    function minimapaPuesto() {
        return !!(_prefs && _prefs.advancedEditorMinimap);
    }

    function temaMapa() {
        const ahora = Date.now();
        if (_mapaHuella && ahora - _mapaHuellaT < 500) return _mapaHuella;
        const pal = _cm && _cm.nsftPaleta;
        if (pal) {
            _mapaHuella = (pal.fondo || '') + '/' + (pal.keyword || '');
            _mapaHuellaT = ahora;
            return _mapaHuella;
        }
        const editor = _caja && _caja.querySelector('.CodeMirror');
        if (!editor) return '';
        let fondo = '';
        try { fondo = getComputedStyle(editor).backgroundColor || ''; } catch (e) { }
        _mapaHuella = fondo + '/' + plumaDe(editor, 'keyword');
        _mapaHuellaT = ahora;
        return _mapaHuella;
    }

    function coloresMapa() {
        const tema = temaMapa();
        if (_mapaCols && _mapaTema === tema) return _mapaCols;
        const cs = window.getComputedStyle(_caja);
        const v = (n, d) => (cs.getPropertyValue(n) || '').trim() || d;

        const pal = _cm && _cm.nsftPaleta;
        if (pal) {
            _mapaTema = tema;
            const dePal = (c, respaldo) => (c && !/^rgba\([^)]*,\s*0\)$/.test(c)) ? c : respaldo;
            _mapaCols = {
                fondo: dePal(pal.fondo, v('--nsft-adv-map-fondo', '#f5f6f8')),
                kw: dePal(pal.keyword, v('--nsft-adv-map-kw', '#8b5cf6')),
                num: dePal(pal.number, v('--nsft-adv-map-num', '#d97706')),
                str: dePal(pal.string, v('--nsft-adv-map-str', '#059669')),
                tipo: dePal(pal.def, v('--nsft-adv-map-tipo', '#b45309')),
                txt: dePal(pal.variable || pal.texto, v('--nsft-adv-map-txt', '#64748b')),
                com: dePal(pal.comment, v('--nsft-adv-map-com', '#a8b0bd'))
            };
            return _mapaCols;
        }

        const editor = _caja.querySelector('.CodeMirror');
        const fondo = rgbDe(editor, 'backgroundColor');
        const pluma = (clase, respaldo) => {
            const c = editor ? plumaDe(editor, clase) : '';
            return (c && !/^rgba\([^)]*,\s*0\)$/.test(c)) ? c : respaldo;
        };
        _mapaTema = tema;
        _mapaCols = {
            fondo: fondo ? 'rgb(' + fondo.join(', ') + ')' : v('--nsft-adv-map-fondo', '#f5f6f8'),
            kw: pluma('keyword', v('--nsft-adv-map-kw', '#8b5cf6')),
            num: pluma('number', v('--nsft-adv-map-num', '#d97706')),
            str: pluma('string', v('--nsft-adv-map-str', '#059669')),
            tipo: pluma('def', v('--nsft-adv-map-tipo', '#b45309')),
            txt: pluma('variable', v('--nsft-adv-map-txt', '#64748b')),
            com: pluma('comment', v('--nsft-adv-map-com', '#a8b0bd'))
        };
        return _mapaCols;
    }

    const RE_MAPA_KW = /^(const|let|var|function|class|return|if|else|for|while|new|import|export|async|await|this|extends|switch|case|break|continue|try|catch|throw|typeof|of|in|delete|default|static|get|set|define|require)$/;
    const RE_MAPA_NUM = /^\d+(\.\d+)?$/;

    function colorToken(t, c) {
        if (RE_MAPA_KW.test(t)) return c.kw;
        if (RE_MAPA_NUM.test(t)) return c.num;
        const p = t.charAt(0);
        if (p === '"' || p === "'" || p === '`') return c.str;
        if (p >= 'A' && p <= 'Z') return c.tipo;
        return c.txt;
    }

    function programaMapa() {
        if (_mapaRaf || !minimapaPuesto()) return;
        _mapaRaf = requestAnimationFrame(() => { _mapaRaf = 0; pintaMapa(); });
    }

    function pintaMapa() {
        const cv = _caja && _caja.querySelector('#nsft-adv-mapa-cv');
        const vista = _caja && _caja.querySelector('#nsft-adv-mapa-vista');
        const cm = _cm;
        if (!cv || !cm || !minimapaPuesto()) return;

        let w = _mapaW;
        let h = _mapaH;
        if (!w || !h) {
            const caja = cv.parentNode;
            w = _mapaW = caja.clientWidth;
            h = _mapaH = caja.clientHeight;
        }
        if (!w || !h) return;

        const total = cm.lineCount();
        const altoMapa = total * MAPA_LINEA;
        const info = cm.getScrollInfo();
        const margen = info.height - info.clientHeight;
        const razon = margen > 0 ? Math.min(1, Math.max(0, info.top / margen)) : 0;
        _mapaOff = altoMapa > h ? (altoMapa - h) * razon : 0;

        const desde = Math.max(0, Math.floor(_mapaOff / MAPA_LINEA));
        const hasta = Math.min(total, desde + Math.ceil(h / MAPA_LINEA) + 1);

        const tema = temaMapa();
        const clave = desde + '/' + total + '/' + w + 'x' + h + '/' + tema + '/' + _mapaGen;
        if (clave !== _mapaClave) {
            _mapaClave = clave;
            pintaLienzoMapa(cv, cm, w, h, desde, hasta);
        }
        mueveVistaMapa(vista, cm, info, h, altoMapa);
    }

    function pintaLienzoMapa(cv, cm, w, h, desde, hasta) {
        const dpr = window.devicePixelRatio || 1;
        if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
            cv.width = Math.round(w * dpr);
            cv.height = Math.round(h * dpr);
        }
        const ctx = cv.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const c = coloresMapa();
        ctx.fillStyle = c.fondo;
        ctx.fillRect(0, 0, w, h);

        for (let i = desde; i < hasta; i++) {
            let cruda = '';
            try { cruda = cm.getLine(i) || ''; } catch (e) { break; }
            let sangria = 0;
            while (sangria < cruda.length) {
                const ch = cruda.charCodeAt(sangria);
                if (ch !== 32 && ch !== 9) break;
                sangria++;
            }
            if (sangria >= cruda.length) continue;
            const y = i * MAPA_LINEA - _mapaOff;
            const texto = sangria ? cruda.slice(sangria) : cruda;
            if (texto.indexOf('//') === 0 || texto.charAt(0) === '*' || texto.indexOf('/*') === 0) {
                ctx.fillStyle = c.com;
                ctx.fillRect(4 + sangria * MAPA_CHAR, y, Math.min(texto.length * MAPA_CHAR, w - 8), 1.15);
                continue;
            }
            let x = 4 + sangria * MAPA_CHAR;
            const toks = texto.match(/[\w$]+|"[^"]*"|'[^']*'|`[^`]*`|\S/g) || [];
            let corre = null;
            let desdeX = 0;
            let hastaX = 0;
            for (let k = 0; k < toks.length; k++) {
                if (x > w - 4) break;
                const col = colorToken(toks[k], c);
                const ancho = Math.min(toks[k].length * MAPA_CHAR, w - 4 - x);
                if (corre === col && Math.abs(x - hastaX) <= MAPA_CHAR + 0.01) {
                    hastaX = x + ancho;
                } else {
                    if (corre !== null) { ctx.fillStyle = corre; ctx.fillRect(desdeX, y, hastaX - desdeX, 1.15); }
                    corre = col;
                    desdeX = x;
                    hastaX = x + ancho;
                }
                x += (toks[k].length + 1) * MAPA_CHAR;
            }
            if (corre !== null) { ctx.fillStyle = corre; ctx.fillRect(desdeX, y, hastaX - desdeX, 1.15); }
        }

    }

    function mueveVistaMapa(vista, cm, info, h, altoMapa) {
        if (!vista) return;
        let primera = 0;
        try { primera = cm.lineAtHeight(info.top, 'local'); } catch (e) { primera = 0; }
        const alto = info.height > 0
            ? Math.max(14, (info.clientHeight / info.height) * altoMapa) : h;
        const arriba = 'translateY(' + Math.round(Math.max(0, primera * MAPA_LINEA - _mapaOff)) + 'px)';
        const cuanto = Math.round(Math.min(h, alto)) + 'px';
        if (vista.style.transform !== arriba) vista.style.transform = arriba;
        if (vista.style.height !== cuanto) vista.style.height = cuanto;
    }

    function saltaMapa(ev, caja) {
        const cm = _cm;
        if (!cm) return;
        const r = caja.getBoundingClientRect();
        const linea = Math.max(0, Math.round((_mapaOff + (ev.clientY - r.top)) / MAPA_LINEA));
        try {
            const alto = cm.getScrollInfo().clientHeight;
            cm.scrollTo(null, cm.heightAtLine(Math.min(linea, cm.lineCount() - 1), 'local') - alto / 2);
        } catch (e) { }
    }

    function cablearMapa(caja, cm) {
        const mapa = caja.querySelector('#nsft-adv-mapa');
        if (!mapa) return;

        let arrastrando = false;
        mapa.addEventListener('mousedown', (ev) => {
            if (ev.button !== 0) return;
            arrastrando = true;
            saltaMapa(ev, mapa);
            const mueve = (e) => { if (arrastrando) saltaMapa(e, mapa); };
            const suelta = () => {
                arrastrando = false;
                window.removeEventListener('mousemove', mueve);
                window.removeEventListener('mouseup', suelta);
            };
            window.addEventListener('mousemove', mueve);
            window.addEventListener('mouseup', suelta);
        });

        mapa.addEventListener('wheel', (ev) => {
            try { cm.scrollTo(null, cm.getScrollInfo().top + ev.deltaY); } catch (e) { }
            ev.preventDefault();
        }, { passive: false });

        cm.on('scroll', programaMapa);
        cm.on('changes', () => { _mapaGen++; programaMapa(); });
        cm.on('refresh', programaMapa);
        cm.on('swapDoc', () => { _mapaGen++; programaMapa(); });

        if (window.ResizeObserver) {
            try {
                new ResizeObserver((ents) => {
                    const r = ents[ents.length - 1] && ents[ents.length - 1].contentRect;
                    if (r) { _mapaW = r.width; _mapaH = r.height; }
                    programaMapa();
                }).observe(mapa);
            } catch (e) { }
        } else {
            window.addEventListener('resize', () => { _mapaW = 0; _mapaH = 0; programaMapa(); });
        }
        aplicaMinimapa();
    }

    function aplicaMinimapa() {
        if (!_caja) return;
        const puesto = minimapaPuesto();
        const mapa = _caja.querySelector('#nsft-adv-mapa');
        const host = _caja.querySelector('#nsft-adv-host');
        if (mapa) mapa.hidden = !puesto;
        if (host) host.classList.toggle('con-minimapa', puesto);
        if (_cm) { try { _cm.refresh(); } catch (e) { } }
        _mapaClave = '';
        if (puesto) pintaMapa();
    }

    function alternaMinimapa() {
        _prefs.advancedEditorMinimap = !minimapaPuesto();
        try { chrome.storage.local.set({ advancedEditorMinimap: _prefs.advancedEditorMinimap }); } catch (e) { }
        if (_prefs.advancedEditorMinimap) {
            toast(i18n('adv_minimapa_lento', 'The minimap can slow down navigation in large files'));
        }
        aplicaMinimapa();
    }

    let _sinArchivo = false;

    function muestraVacio() {
        if (!_caja) return;
        _sinArchivo = true;
        cierraVisor();
        cierraDiff();
        if (_csvAbierto) cierraTabla();
        pintaVacio();
        _caja.querySelector('#nsft-adv-host').hidden = true;
        _caja.querySelector('#nsft-adv-vacio').hidden = false;
        _caja.classList.add('is-vacio');
        pintaRuta();

        const t = _caja.querySelector('#nsft-adv-tree');
        if (t && t.hidden) {
            t.hidden = false;
            document.documentElement.classList.add('nsft-adv-conarbol');
        }
        if (!_arbolPedido) arrancaArbol();
    }

    function ocultaVacio() {
        const v = _caja && _caja.querySelector('#nsft-adv-vacio');
        if (!v || v.hidden) return;
        v.hidden = true;
        _sinArchivo = false;
        _caja.querySelector('#nsft-adv-host').hidden = false;
        _caja.classList.remove('is-vacio');
        pintaRuta();

        if (!idDelArchivo()) {
            const pf = _caja.querySelector('.nsft-adv-path-file');
            if (pf) pf.textContent = i18n('adv_sin_nombre', 'Untitled file');
        }
        if (_cm) setTimeout(() => { try { _cm.refresh(); _cm.focus(); } catch (e) { } }, 0);
    }

    function pintaVacio() {
        const caja = _caja && _caja.querySelector('#nsft-adv-vacio');
        if (!caja) return;
        caja.textContent = '';

        const bloque = document.createElement('div');
        bloque.className = 'nsft-adv-vacio-caja';

        const logo = document.createElement('div');
        logo.className = 'nsft-adv-vacio-logo';
        logo.setAttribute('aria-hidden', 'true');
        try {
            logo.style.setProperty('--nsft-adv-logo',
                'url("' + chrome.runtime.getURL('assets/img/logo256.png') + '")');
        } catch (e) { }
        bloque.appendChild(logo);

        const tit = document.createElement('div');
        tit.className = 'nsft-adv-vacio-tit';
        tit.textContent = i18n('enableAdvancedEditorLabel', 'Advanced Editor');
        bloque.appendChild(tit);

        const marca = document.createElement('div');
        marca.className = 'nsft-adv-vacio-marca';
        marca.textContent = i18n('adv_vacio_marca', 'from NetSuite Full Tools');
        bloque.appendChild(marca);

        const sub = document.createElement('div');
        sub.className = 'nsft-adv-vacio-sub';
        sub.textContent = i18n('adv_vacio_title', 'No file open');
        bloque.appendChild(sub);

        bloque.appendChild(seccionVacio(
            i18n('adv_vacio_start', 'Start'),
            [
                accionVacio([ICO.irArchivo], i18n('adv_quick_titulo_corto', 'Open file') + '\u2026', () => abreRapido()),
                accionVacio([ICO.tree], i18n('adv_vacio_dir', 'Open folder') + '\u2026', () => abreRapido('carpeta'))
            ]
        ));

        const recientes = (_cache.recientes || []).filter((r) => r && r.id && r.name);
        const filas = recientes.slice(0, 8).map((r) => filaReciente(r));
        if (!filas.length) {
            const nada = document.createElement('div');
            nada.className = 'nsft-adv-vacio-nada';
            nada.textContent = i18n('adv_vacio_none', 'Nothing here yet');
            filas.push(nada);
        }
        bloque.appendChild(seccionVacio(i18n('adv_vacio_recent', 'Recent'), filas));

        caja.appendChild(bloque);
    }

    function seccionVacio(titulo, hijos) {
        const s = document.createElement('div');
        s.className = 'nsft-adv-vacio-sec';
        const h = document.createElement('div');
        h.className = 'nsft-adv-vacio-h';
        h.textContent = titulo;
        s.appendChild(h);
        hijos.forEach((c) => s.appendChild(c));
        return s;
    }

    function accionVacio(ico, texto, onClick) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'nsft-adv-vacio-acc';
        const i = document.createElement('span');
        i.className = 'nsft-adv-vacio-acc-ico';
        i.innerHTML = svgIco(ico);
        const t = document.createElement('span');
        t.textContent = texto;
        b.appendChild(i);
        b.appendChild(t);
        b.addEventListener('click', onClick);
        return b;
    }

    function filaReciente(r) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'nsft-adv-vacio-rec';
        const n = document.createElement('span');
        n.className = 'nsft-adv-vacio-rec-n';
        n.textContent = r.name;
        b.appendChild(n);
        const ruta = _cache.rutas[String(r.folder)];
        if (ruta && ruta.length) {
            const d = document.createElement('span');
            d.className = 'nsft-adv-vacio-rec-d';
            d.textContent = ruta.map((c) => c.name).join(' / ');
            b.appendChild(d);
        }
        b.title = r.name;
        b.addEventListener('click', () => abreArchivo(r.id, r.name));
        return b;
    }

    function enfocaArbol() {
        const t = _caja && _caja.querySelector('#nsft-adv-tree');
        if (!t) return;
        if (t.hidden) alternaArbol();
        const lista = _caja.querySelector('#nsft-adv-tree-list');
        if (lista) { try { lista.scrollIntoView({ block: 'nearest' }); } catch (e) { } }
    }

    function cargando(si, nombre) {
        if (!_caja) return;
        if (nombre) {
            const pf = _caja.querySelector('.nsft-adv-path-file');
            if (pf) pf.textContent = nombre;
            ponTitulo(nombre);
        }
        _caja.classList.toggle('is-cargando', !!si && !nombre);
        if (si && nombre) {
            abreVelo();
            pasoVelo('adv_velo_abriendo', 'Opening $1…', 2, [nombre]);
        } else if (!si) {
            cierraVelo();
        }
    }

    window.addEventListener('popstate', () => {
        if (!_navegado) return;
        confirmaSalir((si) => {
            if (!si) return;
            _saliendoAGuardar = true;
            tapaAntesDeSalir();
            window.location.reload();
        });
    });

    function traeFormulario(id, cb) {
        const marco = document.createElement('iframe');
        marco.className = 'nsft-adv-marco';
        marco.setAttribute('aria-hidden', 'true');
        marco.setAttribute('tabindex', '-1');

        let resuelto = false;
        const acaba = (bien) => {
            if (resuelto) return;
            resuelto = true;
            clearTimeout(reloj);
            cargando(false);
            if (!bien) { try { marco.remove(); } catch (e) { } cb(false); return; }
            if (_marco && _marco !== marco) { try { _marco.remove(); } catch (e) { } }
            _marco = marco;
            _marcoId = String(id);
            cb(true);
        };
        const reloj = setTimeout(() => acaba(false), SPA_ESPERA);

        marco.addEventListener('error', () => acaba(false));
        marco.addEventListener('load', () => {
            let d = null;
            try { d = marco.contentDocument; } catch (e) { d = null; }
            acaba(!!(d && d.getElementById('mCharData')));
        });

        cargando(true);
        marco.src = urlEdicion(id);
        document.body.appendChild(marco);
    }

    function guardaEnMarco(btn) {
        if (_guardando) return;
        const marco = _marco;
        const idEsperado = _marcoId;
        cargando(true);

        const alTerminar = () => {
            if (!_guardando) return;
            clearTimeout(_guardando);
            _guardando = null;
            marco.removeEventListener('load', alTerminar);
            cargando(false);

            let guardado = true;
            try {
                const d = marco.contentDocument;
                guardado = !(d && d.getElementById('mCharData'));
            } catch (e) { guardado = true; }

            if (!guardado) {
                toast(i18n('adv_save_failed', 'NetSuite did not save the file'));
                return;
            }
            marcaLimpio();
            pintarEstado();
            apuntaSello();
            toast(i18n('adv_saved', 'Saved'));
            marco.src = urlEdicion(idEsperado);
        };

        _guardando = setTimeout(alTerminar, SPA_ESPERA);
        marco.addEventListener('load', alTerminar);
        btn.click();
    }


    let _sello = '';
    let _selloSeq = 0;
    const _selloCb = new Map();
    const SELLO_ESPERA = 4000;

    function pideSello(id, cb) {
        if (!id) { cb(''); return; }
        const token = 's' + (++_selloSeq);
        let contestado = false;
        const una = (v) => {
            if (contestado) return;
            contestado = true;
            _selloCb.delete(token);
            cb(v);
        };
        _selloCb.set(token, una);
        setTimeout(() => una(''), SELLO_ESPERA);
        manda('sello', { id: String(id), token: token });
    }

    function recibeSello(p) {
        const cb = _selloCb.get(p.token);
        if (!cb) return;
        cb((p.data && p.data.sello) || '');
    }

    function apuntaSello() {
        const id = idDelArchivo();
        _sello = '';
        if (!id) return;
        pideSello(id, (s) => {
            if (String(idDelArchivo()) !== String(id)) {
                const i = indiceTab(id);
                if (i !== -1) _tabs[i].sello = s;
                return;
            }
            _sello = s;
            const t = tabActiva();
            if (t) t.sello = s;
        });
    }


    let _previaId = '';

    const IMAGENES = /\.(png|jpe?g|gif|svg|webp|ico|bmp|avif|tiff?)$/i;
    const TIPOS_IMAGEN = /IMAGE$|^ICON$|^SVG$/i;

    function esImagen(nombre, tipo) {
        if (IMAGENES.test(String(nombre || ''))) return true;
        return TIPOS_IMAGEN.test(String(tipo || '').trim());
    }

    const PREFIJO_PREVIA = 'previa:';

    function abrePrevia(id, nombre, url, tipo, carpeta) {
        const destino = enlaceSeguro(url);
        if (!destino) {
            window.open('/app/common/media/mediaitem.nl?id=' + encodeURIComponent(id), '_blank', 'noopener');
            return;
        }

        const clave = PREFIJO_PREVIA + id;
        const ya = indiceTab(clave);
        if (ya !== -1) { activaTab(ya); return; }

        guardaEstadoEnTab();
        _tabs.push({
            id: clave,
            nombre: nombre || String(id),
            carpeta: carpeta == null ? null : String(carpeta),
            doc: null,
            previa: { id: String(id), url: destino, esImg: esImagen(nombre, tipo) },
            genLimpia: 0, guardado: '', sello: ''
        });
        activaTab(_tabs.length - 1);
    }

    function muestraPrevia(t) {
        const p = t && t.previa;
        if (!p || !_caja) return;
        const destino = p.url;
        const nombre = t.nombre;
        _previaId = p.id;

        const marco = _caja.querySelector('#nsft-adv-visor-marco');
        const cajaImg = _caja.querySelector('#nsft-adv-visor-img');
        const img = _caja.querySelector('#nsft-adv-visor-img-el');
        const esImg = !!p.esImg;
        const barra = _caja.querySelector('#nsft-adv-visor-bar');
        if (barra) barra.hidden = !esImg;
        if (esImg) {
            if (marco) { marco.removeAttribute('src'); marco.hidden = true; }
            if (img) {
                img.alt = nombre || '';
                _zoom = null;
                img.removeAttribute('style');
                img.src = destino;
            }
            if (cajaImg) cajaImg.hidden = false;
        } else {
            if (cajaImg) cajaImg.hidden = true;
            if (img) img.removeAttribute('src');
            if (marco) { marco.hidden = false; marco.src = destino; }
        }

        cierraDiff();
        if (_csvAbierto) cierraTabla();
        _caja.querySelector('#nsft-adv-host').hidden = true;
        _caja.querySelector('#nsft-adv-vacio').hidden = true;
        _caja.querySelector('#nsft-adv-visor').hidden = false;
        _caja.classList.add('is-mirando');
        actualizaBotonesArchivo();

        if (esImg) setTimeout(aplicaZoom, 0);
        pintaArbol();
    }

    let _zoom = null;
    const ZOOM_PASO = 1.25;
    const ZOOM_MIN = 0.05;
    const ZOOM_MAX = 8;

    function escalaAjuste() {
        const box = _caja && _caja.querySelector('#nsft-adv-visor-img');
        const img = _caja && _caja.querySelector('#nsft-adv-visor-img-el');
        if (!box || !img || !img.naturalWidth || !img.naturalHeight) return 1;
        const cw = box.clientWidth - 32;
        const ch = box.clientHeight - 32;
        if (cw <= 0 || ch <= 0) return 1;
        return Math.min(1, cw / img.naturalWidth, ch / img.naturalHeight);
    }

    function aplicaZoom() {
        const img = _caja && _caja.querySelector('#nsft-adv-visor-img-el');
        if (!img) return;
        if (_zoom == null) {
            img.style.maxWidth = '100%';
            img.style.maxHeight = '100%';
            img.style.width = 'auto';
            img.style.height = 'auto';
        } else {
            img.style.maxWidth = 'none';
            img.style.maxHeight = 'none';
            img.style.width = Math.max(1, Math.round(img.naturalWidth * _zoom)) + 'px';
            img.style.height = 'auto';
        }
        const pct = _caja.querySelector('#nsft-adv-visor-pct');
        if (pct) {
            const e = (_zoom == null) ? escalaAjuste() : _zoom;
            pct.textContent = Math.round(e * 100) + '%';
        }
    }

    function acerca(factor) {
        const base = (_zoom == null) ? escalaAjuste() : _zoom;
        _zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, base * factor));
        aplicaZoom();
    }

    function cierraVisor() {
        const visor = _caja && _caja.querySelector('#nsft-adv-visor');
        if (!visor || visor.hidden) return;
        visor.hidden = true;
        _caja.querySelector('#nsft-adv-vacio').hidden = !_sinArchivo;
        _caja.querySelector('#nsft-adv-host').hidden = _sinArchivo;
        _caja.classList.remove('is-mirando');
        actualizaBotonesArchivo();
        const marco = _caja.querySelector('#nsft-adv-visor-marco');
        if (marco) marco.removeAttribute('src');
        const img = _caja.querySelector('#nsft-adv-visor-img-el');
        if (img) { img.removeAttribute('src'); img.removeAttribute('style'); }
        _zoom = null;
        _previaId = '';
        pintaArbol();
        if (_cm && !_sinArchivo) setTimeout(() => { try { _cm.refresh(); _cm.focus(); } catch (e) { } }, 0);
    }


    let _simPlegado = false;
    let _simTimer = null;
    let _simDoc = null;
    let _simGen = null;
    let _simLista = null;
    let _migTimer = null;
    let _migHuella = null;

    function simbolosAlDia() {
        const cm = _cm;
        if (!cm || !_simLista || _simGen == null) return false;
        try { return cm.getDoc() === _simDoc && cm.changeGeneration() === _simGen; }
        catch (e) { return false; }
    }

    function simbolosDelDoc() {
        const cm = _cm;
        if (!cm) return _simLista || [];
        if (simbolosAlDia()) return _simLista;
        _simDoc = cm.getDoc();
        try { _simGen = cm.changeGeneration(); } catch (e) { _simGen = null; }
        _simLista = extraeSimbolos(cm.getValue());
        return _simLista;
    }

    const SIM_REGLAS = [
        { re: /^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/, tipo: 'fn' },
        { re: /^\s*([A-Za-z_$][\w$]*)\s*:\s*(?:async\s+)?(?:function\b|\()/, tipo: 'fn' },
        { re: /^\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/, tipo: 'fn' },
        { re: /^\s{2,}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/, tipo: 'fn' },
        { re: /^\s*class\s+([A-Za-z_$][\w$]*)/, tipo: 'clase' },
        { re: /^ {0,4}(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/, tipo: 'const' },
        { re: /^\s{5,}(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/, tipo: 'var' }
    ];

    const SIM_NO = /^(if|for|while|switch|catch|return|typeof|new|do|else|try|function|class)$/;

    function extraeSimbolos(texto) {
        const out = [];
        const lineas = String(texto || '').split('\n');
        for (let i = 0; i < lineas.length; i++) {
            const l = lineas[i];
            const limpia = l.replace(/\s+$/, '');
            if (!limpia) continue;
            const t = limpia.replace(/^\s+/, '');
            if (t.indexOf('//') === 0 || t.charAt(0) === '*' || t.indexOf('/*') === 0) continue;

            for (let r = 0; r < SIM_REGLAS.length; r++) {
                const m = limpia.match(SIM_REGLAS[r].re);
                if (!m) continue;
                if (SIM_NO.test(m[1])) break;
                const sangria = (limpia.match(/^\s*/) || [''])[0].replace(/\t/g, '    ').length;
                const par = limpia.slice(limpia.indexOf(m[1]) + m[1].length)
                    .match(/^\s*(?:[:=]\s*)?(?:async\s+)?(?:function\s*)?\(([^)]*)\)/);
                out.push({
                    nombre: m[1],
                    tipo: SIM_REGLAS[r].tipo,
                    linea: i,
                    args: par ? par[1].replace(/\s+/g, ' ').trim() : null,
                    prof: Math.min(3, Math.floor(sangria / 4))
                });
                break;
            }
        }
        return out;
    }

    const SIM_ICO = {
        fn: ARB.llaves,
        clase: ['M12 3l8 4.5v9L12 21l-8-4.5v-9z'],
        const: ['M6 12h12', 'M6 7h12', 'M6 17h7'],
        var: ['M8 8h9', 'M8 12h9', 'M8 16h5']
    };

    const _simAbiertas = new Set();

    function alternaTodosLosSimbolos() {
        if (!_cm) return;
        const simbolos = extraeSimbolos(_cm.getValue());
        const conHijos = simbolos.filter((s, i) => {
            if (s.tipo !== 'fn') return false;
            const sig = simbolos[i + 1];
            return !!(sig && sig.prof > s.prof);
        });
        const cerradas = conHijos.filter((s) => !_simAbiertas.has(s.nombre));
        if (cerradas.length) conHijos.forEach((s) => _simAbiertas.add(s.nombre));
        else _simAbiertas.clear();
        pintaSimbolos();
    }

    function pintaSimbolos() {
        const lista = _caja && _caja.querySelector('#nsft-adv-sym-list');
        if (!lista) return;
        lista.textContent = '';

        if (!_cm) return;
        const simbolos = simbolosDelDoc();

        const n = _caja.querySelector('#nsft-adv-sym-n');
        if (n) n.textContent = simbolos.length ? String(simbolos.length) : '';

        if (!simbolos.length) {
            const d = document.createElement('div');
            d.className = 'nsft-adv-tree-msg';
            d.textContent = i18n('adv_sym_none', 'Nothing to list in this file');
            lista.appendChild(d);
            return;
        }

        const base = simbolos.reduce((m, s) => Math.min(m, s.prof), 99);

        const actual = _cm.getCursor().line;

        let firmas = {};
        try {
            if (window.NSFT_CodeEditor && window.NSFT_CodeEditor.firmasDelDocumento) {
                firmas = window.NSFT_CodeEditor.firmasDelDocumento(_cm) || {};
            }
        } catch (e) { }

        const hijosDe = simbolos.map((s, i) => {
            let n = 0;
            for (let j = i + 1; j < simbolos.length && simbolos[j].prof > s.prof; j++) n++;
            return n;
        });

        const tapado = new Array(simbolos.length).fill(false);
        for (let i = 0; i < simbolos.length; i++) {
            if (simbolos[i].tipo !== 'fn' || !hijosDe[i] || _simAbiertas.has(simbolos[i].nombre)) continue;
            for (let j = i + 1; j <= i + hijosDe[i]; j++) tapado[j] = true;
        }

        simbolos.forEach((s, i) => {
            if (tapado[i]) return;
            const hijos = hijosDe[i];
            const cerrada = s.tipo === 'fn' && !_simAbiertas.has(s.nombre);
            const siguiente = simbolos[i + 1];
            const dentro = s.linea <= actual && (!siguiente || siguiente.linea > actual);
            const f = firmas[s.nombre];
            const args = (f && f.p) ? f.p.map((x) => x.n + (x.t && x.t !== 'any' ? ': ' + x.t : '')).join(', ')
                : (s.args !== null && s.args !== undefined ? s.args : null);
            const sufijo = (s.tipo === 'fn' && args !== null && args !== undefined)
                ? '(' + args + ')' + (f && f.r ? ': ' + f.r : '')
                : null;

            const b = nodo({
                ico: svgIco(SIM_ICO[s.tipo] || SIM_ICO.fn),
                clase: 'is-sym-' + s.tipo,
                texto: s.nombre,
                sufijo: sufijo,
                titulo: (f && f.d) ? f.d : null,
                giro: hijos > 0 ? (cerrada ? ARB.cerrado : ARB.abierto) : null,
                actual: dentro,
                prof: Math.max(0, s.prof - base),
                onGiro: hijos > 0 ? (() => {
                    if (_simAbiertas.has(s.nombre)) _simAbiertas.delete(s.nombre);
                    else _simAbiertas.add(s.nombre);
                    pintaSimbolos();
                }) : null,
                onClick: () => {
                    _cm.setCursor({ line: s.linea, ch: 0 });
                    _cm.scrollIntoView({ line: s.linea, ch: 0 }, _cm.getScrollInfo().clientHeight / 2);
                    _cm.focus();
                }
            });
            lista.appendChild(b);
        });
    }

    function programaSimbolos() {
        clearTimeout(_simTimer);
        _simTimer = setTimeout(() => {
            if (!_cm || simbolosAlDia()) return;
            if (_simPlegado) simbolosDelDoc();
            else pintaSimbolos();
            pintaMigasSimbolo();
            pintaApiVersion();
        }, 500);
    }


    window.addEventListener('nsft-adv-perf', () => {
        try { midePulsacion(); }
        catch (e) { try { console.error('NSFT: la sonda de rendimiento falló', e); } catch (_) { } }
        try { window.dispatchEvent(new CustomEvent('nsft-adv-perf-hecho')); } catch (e) { }
    });

    window.addEventListener('nsft-adv-api-info', () => {
        try {
            const CE = window.NSFT_CodeEditor;
            const texto = _cm ? _cm.getValue() : '';
            const cabeza = texto.slice(0, 400);
            const el = _caja && _caja.querySelector('#nsft-adv-api');
            console.log('%c--- NSFT · qué SuiteScript ve el editor ---', 'font-weight:bold');
            console.table({
                'hay editor': !!_cm,
                'lo tiene por JavaScript': _esJs,
                'el motor está': !!(CE && CE.versionApi),
                'y contesta': (CE && CE.versionApi && _cm) ? String(CE.versionApi(_cm)) : '(no se le pudo preguntar)',
                'la chapa existe': !!el,
                'la chapa dice': el ? (el.hidden ? '(escondida)' : el.textContent) : '(no está)',
                'caracteres del archivo': texto.length
            });
            console.log('primeras líneas, tal cual:\n' + JSON.stringify(cabeza));
        } catch (e) { console.error('NSFT: la sonda de la API falló', e); }
        try { window.dispatchEvent(new CustomEvent('nsft-adv-perf-hecho')); } catch (e) { }
    });

    window.addEventListener('nsft-adv-mapa-info', () => {
        try {
            const mapa = _caja && _caja.querySelector('#nsft-adv-mapa');
            const host = _caja && _caja.querySelector('#nsft-adv-host');
            const cv = _caja && _caja.querySelector('#nsft-adv-mapa-cv');
            const cs = mapa ? window.getComputedStyle(mapa) : null;
            console.log('%c--- NSFT · el minimapa ---', 'font-weight:bold');
            console.log('  preferencia .......', _prefs && _prefs.advancedEditorMinimap);
            console.log('  existe en el DOM ..', !!mapa);
            console.log('  escondido .........', mapa ? mapa.hidden : '(no hay)');
            console.log('  mide ..............', mapa ? (mapa.clientWidth + 'x' + mapa.clientHeight) : '(no hay)');
            console.log('  display / visib ...', cs ? (cs.display + ' / ' + cs.visibility) : '(no hay)');
            console.log('  el hueco del editor', host ? host.className : '(no hay)');
            console.log('  relleno derecho ...', host ? window.getComputedStyle(host).paddingRight : '(no hay)');
            console.log('  lienzo ............', cv ? (cv.width + 'x' + cv.height) : '(no hay)');
            console.log('  hay editor ........', !!_cm, _cm ? _cm.lineCount() + ' lineas' : '');
            console.log('  tema del editor ...', _caja ? _caja.getAttribute('data-theme') : '(no hay)');
            const dlg = _caja && _caja.querySelector('.nsft-adv-dlg-caja');
            if (dlg && dlg.offsetParent) {
                const rd = dlg.getBoundingClientRect();
                const rc = _caja.getBoundingClientRect();
                console.log('  la pregunta mide .....', Math.round(rd.width) + 'px',
                    '(el editor: ' + Math.round(rc.width) + 'px)',
                    rd.width > 441 ? '← SE PASA' : '');
                const tx = _caja.querySelector('#nsft-adv-dlg-txt');
                if (tx) {
                    const rt = tx.getBoundingClientRect();
                    console.log('  su texto mide ........', Math.round(rt.width) + 'px',
                        'y parte lineas:', window.getComputedStyle(tx).whiteSpace,
                        rt.width > rd.width - 30 ? '← SE SALE' : '');
                }
            }
            try {
                const cc = coloresMapa();
                console.log('  colores medidos ...', JSON.stringify(cc));
                console.log('  huella del tema ...', temaMapa() || '(sin editor que medir)');
                const lk = document.getElementById('nsft-adv-codemirror-theme');
                console.log('  hoja del tema .....', lk
                    ? ((lk.sheet ? 'cargada' : 'AUN NO CARGADA') + ' · ' + String(lk.href).split('/').pop())
                    : '(sin hoja: tema default)');
            } catch (e) { console.log('  colores ...........', 'no se pudieron leer', e); }
            if (cv && cv.width) {
                const ctx = cv.getContext('2d');
                const d = ctx.getImageData(0, 0, cv.width, Math.min(cv.height, 400)).data;
                const fondo = d[0] + ',' + d[1] + ',' + d[2];
                let distintos = 0;
                const vistos = {};
                for (let k = 0; k < d.length; k += 4) {
                    const p = d[k] + ',' + d[k + 1] + ',' + d[k + 2];
                    if (p !== fondo) { distintos++; vistos[p] = (vistos[p] || 0) + 1; }
                }
                console.log('  fondo .............', fondo);
                console.log('  pixeles pintados ..', distintos,
                    distintos ? '(' + Object.keys(vistos).length + ' colores)' : '← EL LIENZO ESTA VACIO');
                console.log('  colores ...........', Object.keys(vistos).slice(0, 8).join('  '));
            }
            const cmw = _caja && _caja.querySelector('.nsft-adv-host .CodeMirror, .nsft-adv-host .cm-editor');
            if (cmw && mapa) {
                const a = cmw.getBoundingClientRect();
                const b = mapa.getBoundingClientRect();
                console.log('  editor  x:', Math.round(a.left) + '..' + Math.round(a.right));
                console.log('  mapa    x:', Math.round(b.left) + '..' + Math.round(b.right));
                console.log('  se tapan ..........', a.right > b.left + 1
                    ? 'SI, por ' + Math.round(a.right - b.left) + 'px' : 'no');
            }
        } catch (e) { console.error('NSFT: la sonda del minimapa fallo', e); }
        try { window.dispatchEvent(new CustomEvent('nsft-adv-mapa-hecho')); } catch (e) { }
    });

    window.addEventListener('nsft-adv-perf-graba', (ev) => {
        try { grabaEscritura((ev && ev.detail && ev.detail.segundos) || 12); }
        catch (e) { try { console.error('NSFT: la grabadora falló', e); } catch (_) { } }
        try { window.dispatchEvent(new CustomEvent('nsft-adv-perf-hecho')); } catch (e) { }
    });


    function grabaEscritura(segundos) {
        const cm = _cm;
        if (!cm) { console.log('NSFT: no hay editor montado'); return; }
        const H = cm._handlers || {};
        const cuenta = Object.create(null);
        const apunta = (clave, ms) => {
            const c = cuenta[clave] || (cuenta[clave] = { veces: 0, ms: 0, peor: 0 });
            c.veces++;
            c.ms += ms;
            if (ms > c.peor) c.peor = ms;
        };

        const envuelve = (clave, fn) => function () {
            const t0 = performance.now();
            try { return fn.apply(this, arguments); }
            finally { apunta(clave, performance.now() - t0); }
        };

        const originales = [];
        Object.keys(H).forEach((evento) => {
            const arr = H[evento];
            if (!arr || !arr.length) return;
            originales.push([evento, arr]);
            H[evento] = arr.map((fn, i) => envuelve(evento + ' #' + i, fn));
        });

        const habiaShowHint = Object.prototype.hasOwnProperty.call(cm, 'showHint');
        const showHintAntes = cm.showHint;
        cm.showHint = function () {
            const t0 = performance.now();
            try { return showHintAntes.apply(this, arguments); }
            finally { apunta('showHint (desplegable)', performance.now() - t0); }
        };

        const setTimeoutAntes = window.setTimeout;
        const rafAntes = window.requestAnimationFrame;
        const nombres = Object.create(null);
        const etiquetaDe = (ms) => {
            const clave = String(ms || 0);
            if (nombres[clave]) return nombres[clave];
            let donde = '';
            try {
                const pila = (new Error()).stack.split('\n');
                donde = (pila[3] || pila[2] || '').trim().replace(/^at\s+/, '');
                donde = donde.replace(/^.*\//, '').slice(0, 44);
            } catch (e) { donde = '?'; }
            nombres[clave] = 'aplazado ' + (ms || 0) + ' ms · ' + donde;
            return nombres[clave];
        };
        window.setTimeout = function (fn, ms) {
            if (typeof fn !== 'function') return setTimeoutAntes.apply(window, arguments);
            const etiqueta = etiquetaDe(ms);
            const resto = Array.prototype.slice.call(arguments, 2);
            return setTimeoutAntes.call(window, function () {
                const t0 = performance.now();
                try { return fn.apply(this, resto); }
                finally { apunta(etiqueta, performance.now() - t0); }
            }, ms);
        };
        if (rafAntes) {
            window.requestAnimationFrame = function (fn) {
                if (typeof fn !== 'function') return rafAntes.apply(window, arguments);
                return rafAntes.call(window, function (t) {
                    const t0 = performance.now();
                    try { return fn.call(this, t); }
                    finally { apunta('en el próximo cuadro', performance.now() - t0); }
                });
            };
        }

        const enviado = Object.create(null);
        const espia = (ev) => {
            const d = ev && ev.data;
            if (!d || typeof d !== 'object' || !d.dest) return;
            const dest = String(d.dest);
            if (dest.indexOf('fetcher') === 0) { enviado[d.type] = performance.now(); return; }
            if (dest.indexOf('extension') !== 0) return;
            const t = enviado[d.type];
            if (t == null) return;
            delete enviado[d.type];
            apunta('puente ida y vuelta · ' + d.type, performance.now() - t);
        };
        window.addEventListener('message', espia, true);

        let habiaGancho = false;
        try {
            if (window.NSFT_CodeEditor && window.NSFT_CodeEditor.setPerfHook) {
                window.NSFT_CodeEditor.setPerfHook((nombre, ms) => apunta('· ' + nombre, ms));
                habiaGancho = true;
            }
        } catch (e) { habiaGancho = false; }

        const largas = [];
        let observador = null;
        try {
            observador = new PerformanceObserver((lista) => {
                lista.getEntries().forEach((e) => largas.push(Math.round(e.duration)));
            });
            observador.observe({ entryTypes: ['longtask'] });
        } catch (e) { observador = null; }

        const t0 = performance.now();
        console.log('%cNSFT · grabando ' + segundos + ' s — ESCRIBE AHORA en el editor, seguido',
            'font-weight:bold;font-size:14px;color:#0a7');

        setTimeoutAntes.call(window, () => {
            const total = performance.now() - t0;
            originales.forEach(([evento, arr]) => { H[evento] = arr; });
            if (habiaShowHint) cm.showHint = showHintAntes; else { try { delete cm.showHint; } catch (e) { } }
            window.setTimeout = setTimeoutAntes;
            if (rafAntes) window.requestAnimationFrame = rafAntes;
            window.removeEventListener('message', espia, true);
            if (habiaGancho) { try { window.NSFT_CodeEditor.setPerfHook(null); } catch (e) { } }
            if (observador) { try { observador.disconnect(); } catch (e) { } }

            const filas = Object.keys(cuenta)
                .map((k) => ({
                    'quien': k,
                    'veces': cuenta[k].veces,
                    'total ms': Number(cuenta[k].ms.toFixed(1)),
                    'peor vez': Number(cuenta[k].peor.toFixed(1)),
                    '% del rato': Number(((cuenta[k].ms / total) * 100).toFixed(1))
                }))
                .filter((f) => f['total ms'] >= 1)
                .sort((a, b) => b['total ms'] - a['total ms']);

            console.log('%c--- NSFT · dónde se fue el tiempo mientras escribías ---',
                'font-weight:bold;font-size:13px');
            console.log('grabados ' + (total / 1000).toFixed(1) + ' s');
            if (!filas.length) {
                console.log('%cNo se registró nada. ¿Escribiste en el editor durante la grabación?',
                    'color:#c00');
            } else {
                console.table(filas);
            }
            largas.sort((a, b) => b - a);
            const sumaLargas = largas.reduce((a, b) => a + b, 0);
            const sumaTabla = filas.reduce((a, f) => a + f['total ms'], 0);
            console.log('tareas que bloquearon más de 50 ms: ' + largas.length
                + (largas.length ? '  (las peores: ' + largas.slice(0, 6).join(', ') + ' ms)' : ''));
            console.log('bloqueo total (tareas de más de 50 ms): ' + Math.round(sumaLargas) + ' ms');
            console.log('suma de la tabla: ' + Math.round(sumaTabla) + ' ms');
            if (sumaTabla > sumaLargas) {
                console.log('(la suma se pasa del total porque hay filas dentro de otras:');
                console.log(' las que empiezan por «·» son partes de la de encima)');
            }
            console.log('Lo de arriba del todo es el culpable. Si la tabla explica poco');
            console.log('del bloqueo total, lo que falta no es código nuestro de esta');
            console.log('ventana: o está al otro lado del puente, o es CodeMirror pintando.');
        }, segundos * 1000);
    }

    function midePulsacion() {
        const cm = _cm;
        const host = _caja && _caja.querySelector('.CodeMirror, .cm-editor');
        if (!cm || !host) { console.log('NSFT: no hay editor montado'); return; }

        let masLarga = 0;
        let dondeLarga = 0;
        for (let i = 0; i < cm.lineCount(); i++) {
            const l = cm.getLine(i).length;
            if (l > masLarga) { masLarga = l; dondeLarga = i + 1; }
        }
        const modo = cm.getOption('mode');
        const ficha = {
            'lineas': cm.lineCount(),
            'KB': Math.round(cm.getValue().length / 1024),
            'linea mas larga': masLarga + ' car. (linea ' + dondeLarga + ')',
            'modo': (modo && modo.name) || String(modo),
            'ajuste de linea': cm.getOption('lineWrapping') ? 'si' : 'no',
            'canaletas': (cm.getOption('gutters') || []).join(' · '),
            'capas': (cm.state.overlays || []).length,
            'marcas en el texto': cm.getAllMarks ? cm.getAllMarks().length : '?',
            'pestañas abiertas': _tabs.length
        };

        try {
            const OB = window.NSFT_Observer;
            const st = OB && OB.getStats ? OB.getStats() : null;
            if (st) {
                ficha['suscriptores del observador'] = st.subscribers;
                ficha['zonas mudas'] = st.mutedRoots;
                ficha['mutaciones entregadas'] = st.delivered;
                ficha['mutaciones calladas'] = st.dropped;
            }
        } catch (e) { }

        const H = cm._handlers || {};
        const enganches = {};
        Object.keys(H).forEach((k) => { if (H[k] && H[k].length) enganches[k] = H[k].length; });

        const VECES = 15;
        const unaTecla = () => {
            const t0 = performance.now();
            cm.replaceSelection('x');
            void host.offsetHeight;
            const ms = performance.now() - t0;
            cm.undo();
            void host.offsetHeight;
            return ms;
        };
        const mide = () => {
            const v = [];
            for (let i = 0; i < VECES; i++) v.push(unaTecla());
            v.sort((a, b) => a - b);
            return v[Math.floor(v.length / 2)];
        };
        const rafaga = () => {
            const t0 = performance.now();
            for (let i = 0; i < 10; i++) cm.replaceSelection('x');
            void host.offsetHeight;
            const ms = performance.now() - t0;
            for (let i = 0; i < 10; i++) cm.undo();
            void host.offsetHeight;
            return ms;
        };

        const sinEvento = (ev, fn) => {
            const antes = H[ev];
            H[ev] = [];
            try { return fn(); } finally { H[ev] = antes; }
        };
        const sinCapas = (fn) => {
            const antes = cm.state.overlays;
            cm.state.overlays = [];
            cm.state.modeGen++;
            try { return fn(); } finally { cm.state.overlays = antes; cm.state.modeGen++; cm.refresh(); }
        };
        const sinCanaletas = (fn) => {
            const antes = cm.getOption('gutters');
            cm.setOption('gutters', (antes || []).filter((g) => g.indexOf('nsft') === -1));
            try { return fn(); } finally { cm.setOption('gutters', antes); }
        };
        const sinModo = (fn) => {
            const antes = cm.getOption('mode');
            cm.setOption('mode', null);
            try { return fn(); } finally { cm.setOption('mode', antes); }
        };

        mide();
        const base = mide();
        const baseRaf = rafaga();
        const filas = [];
        const prueba = (que, envoltorio) => {
            let ms;
            try { ms = envoltorio(mide); }
            catch (e) { filas.push({ apagando: que, error: String(e) }); return; }
            filas.push({
                'apagando': que,
                'ms por tecla': Number(ms.toFixed(1)),
                'se ahorra': Number((base - ms).toFixed(1)),
                '% del total': Math.round(((base - ms) / base) * 100)
            });
        };

        prueba('el coloreado (el modo)', sinModo);
        prueba('el resaltado de apariciones', sinCapas);
        prueba('las guias de sangria (renderLine)', (f) => sinEvento('renderLine', f));
        prueba('lo enganchado a "change"', (f) => sinEvento('change', f));
        prueba('lo enganchado a "changes"', (f) => sinEvento('changes', f));
        prueba('lo enganchado a "cursorActivity"', (f) => sinEvento('cursorActivity', f));
        prueba('nuestras canaletas', sinCanaletas);
        prueba('TODO LO NUESTRO junto', (f) => sinCapas(() => sinCanaletas(() =>
            sinEvento('renderLine', () => sinEvento('change', () => sinEvento('changes', () =>
                sinEvento('cursorActivity', f)))))));
        prueba('TODO, incluido el coloreado', (f) => sinModo(() => sinCapas(() => sinCanaletas(() =>
            sinEvento('renderLine', () => sinEvento('change', () => sinEvento('changes', () =>
                sinEvento('cursorActivity', f))))))));

        const baseFinal = mide();

        console.log('%c--- NSFT · que cuesta una tecla en el Editor Avanzado ---',
            'font-weight:bold;font-size:13px');
        console.table(ficha);
        console.log('manejadores enganchados:', JSON.stringify(enganches));
        if (_ultimaApertura) {
            console.log('%cel último archivo que abriste:', 'font-weight:bold');
            console.table(_ultimaApertura);
        } else {
            console.log('(abre un archivo desde el árbol y repite: así se mide lo que cuesta abrirlo)');
        }
        console.log('%cTAL CUAL: ' + base.toFixed(1) + ' ms por tecla · '
            + baseRaf.toFixed(0) + ' ms una rafaga de 10', 'font-weight:bold;font-size:13px');
        console.table(filas);
        const deriva = Math.abs(baseFinal - base) / base;
        if (deriva > 0.25) {
            console.log('%cCUIDADO: la base al final es ' + baseFinal.toFixed(1)
                + ' ms y al principio era ' + base.toFixed(1) + ' ms. La máquina se movió'
                + ' por debajo, así que la tabla NO vale. Repítelo.', 'color:#c00;font-weight:bold');
        } else {
            console.log('base al final: ' + baseFinal.toFixed(1) + ' ms (coherente con el principio)');
            console.log('Lo que mas «se ahorra» de es lo que hay que arreglar.');
            console.log('Si «TODO, incluido el coloreado» sigue alto, no es nada nuestro.');
        }
        console.log('%cOJO: esto escribe con replaceSelection, que NO pasa por el teclado,'
            + ' así que no incluye el desplegable ni la sugerencia fantasma.'
            + ' Para eso está la grabadora: nsft-adv-perf-graba.', 'color:#a60');
    }


    let _tabs = [];
    let _tabActiva = -1;

    function tabActiva() { return _tabs[_tabActiva] || null; }

    function indiceTab(id) {
        const k = String(id);
        for (let i = 0; i < _tabs.length; i++) if (String(_tabs[i].id) === k) return i;
        return -1;
    }

    function guardaEstadoEnTab() {
        const t = tabActiva();
        if (!t) return;
        if (t.previa) return;
        t.genLimpia = _genLimpia;
        t.guardado = _guardado;
        t.sello = _sello;
    }

    function tabSucia(t) {
        if (!t || !t.doc) return false;
        try { return !t.doc.isClean(t.genLimpia); } catch (e) { return false; }
    }

    function haySinGuardar() {
        guardaEstadoEnTab();
        if (_tabs.length) return _tabs.some(tabSucia);
        return !!(_cm && !_cm.isClean(_genLimpia));
    }

    function cuentaSucias() {
        guardaEstadoEnTab();
        return _tabs.filter(tabSucia).length;
    }

    function registraTabInicial(id, nombre, carpeta) {
        if (!_cm || !id) return;
        _tabs = [{
            id: String(id),
            nombre: nombre || '',
            carpeta: carpeta == null ? null : String(carpeta),
            doc: _cm.getDoc(),
            genLimpia: _genLimpia,
            guardado: _guardado,
            sello: _sello
        }];
        _tabActiva = 0;
        pintaTabs();
    }

    function activaTab(i) {
        const t = _tabs[i];
        if (!t || !_cm) return;
        if (i !== _tabActiva) guardaEstadoEnTab();
        _tabActiva = i;

        if (t.previa) {
            muestraPrevia(t);
            const pf = _caja.querySelector('.nsft-adv-path-file');
            if (pf) pf.textContent = t.nombre || '';
            ponTitulo(t.nombre || '');
            pintaMigasDe(t.carpeta);
            pintaTabs();
            return;
        }
        if (_previaId) cierraVisor();

        try { if (_cm.getDoc() !== t.doc) _cm.swapDoc(t.doc); } catch (e) { }
        _genLimpia = t.genLimpia;
        _guardado = t.guardado;
        _sello = t.sello;

        try {
            history.pushState({ nsftAdv: 1 }, '', urlEdicion(t.id) + '&' + PARAM + '=T');
            _navegado = true;
        } catch (e) { }

        trasCambioDeArchivo(t.nombre);
    }

    let _trasReloj = 0;

    function trasCambioDeArchivo(nombre) {
        cierraDiff();
        ocultaVacio();
        const pf = _caja.querySelector('.nsft-adv-path-file');
        if (pf) pf.textContent = nombre;
        ponTitulo(nombre);
        pintarLenguaje(nombre);
        pintarEstado();
        actualizaBotonesArchivo();
        _simLista = null;
        _simDoc = null;
        _simGen = null;
        _migHuella = null;
        if (_csvAbierto) cierraTabla();
        pintaTabs();
        try { _cm.focus(); } catch (e) { }

        clearTimeout(_trasReloj);
        requestAnimationFrame(() => {
            clearTimeout(_trasReloj);
            _trasReloj = setTimeout(() => {
                if (!_simPlegado) pintaSimbolos();
                pintaMigasSimbolo();
                pintaCanaleta();
                pintaRegla();
                pintaBotonTabla();
                refrescaArbolTrasCambio();
            }, 0);
        });
    }


    function cierraTab(i) {
        const t = _tabs[i];
        if (!t) return;
        if (i === _tabActiva) guardaEstadoEnTab();
        if (!tabSucia(t)) { cierraTabYa(i); return; }
        pregunta({
            titulo: i18n('adv_dlg_leave_tit', 'Unsaved changes'),
            texto: fmt('adv_tab_cerrar_sucia', '$1 has unsaved changes. Close it anyway?', [t.nombre || t.id]),
            si: i18n('adv_dlg_leave_si', 'Leave without saving'),
            peligro: true
        }, (si) => { if (si) cierraTabYa(i); });
    }

    function cierraTabYa(i) {
        const eraActiva = (i === _tabActiva);
        const eraPrevia = !!(_tabs[i] && _tabs[i].previa);
        _tabs.splice(i, 1);
        if (eraActiva && eraPrevia) cierraVisor();

        if (!_tabs.length) {
            _tabActiva = -1;
            _saliendoAGuardar = true;
            tapaAntesDeSalir();
            window.location.href = VACIO;
            return;
        }
        if (!eraActiva) {
            if (i < _tabActiva) _tabActiva--;
            pintaTabs();
            return;
        }
        _tabActiva = -1;
        activaTab(Math.min(i, _tabs.length - 1));
    }


    function cierraTabsEnBloque(i, modo) {
        const ref = _tabs[i];
        if (!ref) return;
        guardaEstadoEnTab();

        const victimas = _tabs.filter((t, k) => {
            if (t === ref) return false;
            if (modo === 'derecha') return k > i;
            if (modo === 'izquierda') return k < i;
            return true;
        });
        if (!victimas.length) return;

        const sigue = () => {
            const fuera = new Set(victimas);
            const eraActiva = _tabs[_tabActiva];
            _tabs = _tabs.filter((t) => !fuera.has(t));

            const siguiendo = _tabs.indexOf(eraActiva);
            if (siguiendo !== -1) { _tabActiva = siguiendo; pintaTabs(); return; }

            _tabActiva = -1;
            activaTab(_tabs.indexOf(ref));
        };

        const sucias = victimas.filter(tabSucia).length;
        if (!sucias) { sigue(); return; }
        pregunta({
            titulo: i18n('adv_dlg_leave_tit', 'Unsaved changes'),
            texto: fmt('adv_tab_cerrar_bloque',
                '$1 of the files you are closing have unsaved changes. Close them anyway?',
                [sucias]),
            si: i18n('adv_dlg_leave_si', 'Leave without saving'),
            peligro: true
        }, (si) => { if (si) sigue(); });
    }


    let _sueltaMenuTab = null;

    function quitaMenuTab() {
        const m = document.getElementById('nsft-adv-tab-ctx');
        if (m) m.remove();
        if (_sueltaMenuTab) { _sueltaMenuTab(); _sueltaMenuTab = null; }
    }


    function menuFlotante(ev, opciones) {
        quitaMenuTab();

        const ctx = document.createElement('div');
        ctx.className = 'nsft-adv-ctx';
        ctx.id = 'nsft-adv-tab-ctx';
        ctx.setAttribute('data-nsft-ui', '');

        opciones.forEach((o) => {
            if (o.sep) {
                const s = document.createElement('div');
                s.className = 'nsft-adv-ctx-sep';
                ctx.appendChild(s);
                return;
            }
            const d = document.createElement('div');
            d.className = 'nsft-adv-ctx-item'
                + (o.peligro ? ' is-danger' : '')
                + (o.apagado ? ' is-disabled' : '')
                + (o.marcado ? ' is-marcado' : '');
            d.textContent = o.texto;
            if (o.apagado) { d.setAttribute('aria-disabled', 'true'); ctx.appendChild(d); return; }
            d.addEventListener('click', (e) => {
                e.stopPropagation();
                quitaMenuTab();
                o.fn();
            });
            ctx.appendChild(d);
        });

        document.body.appendChild(ctx);


        const r = ctx.getBoundingClientRect();
        const x = Math.min(ev.clientX, window.innerWidth - r.width - 6);
        const y = Math.min(ev.clientY, window.innerHeight - r.height - 6);
        ctx.style.left = Math.max(6, x) + 'px';
        ctx.style.top = Math.max(6, y) + 'px';

        const fuera = (e) => {
            const t = e && e.target;
            if (t && t.closest && t.closest('#nsft-adv-tab-ctx')) return;
            quitaMenuTab();
        };
        const tecla = (e) => { if (e.key === 'Escape') quitaMenuTab(); };
        _sueltaMenuTab = () => {
            document.removeEventListener('mousedown', fuera, true);
            document.removeEventListener('keydown', tecla, true);
            window.removeEventListener('blur', fuera);
        };
        setTimeout(() => {
            document.addEventListener('mousedown', fuera, true);
            document.addEventListener('keydown', tecla, true);
            window.addEventListener('blur', fuera);
        }, 0);
    }

    function abreMenuTab(ev, i) {
        if (!_tabs[i]) return;
        menuFlotante(ev, [
            { texto: i18n('adv_tab_cerrar', 'Close this tab'), fn: () => cierraTab(i) },
            { sep: true },
            { texto: i18n('adv_tab_cerrar_derecha', 'Close tabs to the right'),
              fn: () => cierraTabsEnBloque(i, 'derecha'), apagado: i >= _tabs.length - 1 },
            { texto: i18n('adv_tab_cerrar_izquierda', 'Close tabs to the left'),
              fn: () => cierraTabsEnBloque(i, 'izquierda'), apagado: i <= 0 },
            { texto: i18n('adv_tab_cerrar_otras', 'Close other tabs'),
              fn: () => cierraTabsEnBloque(i, 'otras'), apagado: _tabs.length < 2 }
        ]);
    }




    const TIRA_UMBRAL = 4;
    let _arrTab = null;
    let _arrActiva = null;
    let _arrX = 0;
    let _arrOffset = 0;
    let _arrMovido = false;

    function tiraAbajo(ev) {
        if (ev.button !== 0) return;
        if (ev.target.closest('.nsft-adv-tab-x')) return;
        const el = ev.target.closest('.nsft-adv-tab');
        if (!el) return;
        const i = Number(el.getAttribute('data-i'));
        if (!(i >= 0) || !_tabs[i]) return;
        _arrTab = _tabs[i];
        _arrActiva = _tabs[_tabActiva] || null;
        _arrX = ev.clientX;
        _arrOffset = ev.clientX - el.getBoundingClientRect().left;
        _arrMovido = false;
    }

    function tiraMueve(ev) {
        if (!_arrTab) return;
        const tira = ev.currentTarget;
        if (!_arrMovido) {
            if (Math.abs(ev.clientX - _arrX) < TIRA_UMBRAL) return;
            _arrMovido = true;
            tira.classList.add('is-reordenando');
            try { tira.setPointerCapture(ev.pointerId); } catch (e) { }
            pintaTabs();
        }
        ev.preventDefault();

        let actual = _tabs.indexOf(_arrTab);
        if (actual === -1) return;
        let el = tira.querySelector('.nsft-adv-tab[data-i="' + actual + '"]');
        if (!el) return;

        el.style.transform = '';

        const els = Array.prototype.slice.call(tira.querySelectorAll('.nsft-adv-tab'));
        let destino = actual;
        const dcha = els[actual + 1];
        const izda = els[actual - 1];
        if (dcha) {
            const r = dcha.getBoundingClientRect();
            if (ev.clientX > r.left + r.width / 2) destino = actual + 1;
        }
        if (destino === actual && izda) {
            const r = izda.getBoundingClientRect();
            if (ev.clientX < r.left + r.width / 2) destino = actual - 1;
        }

        if (destino !== actual) {
            _tabs.splice(actual, 1);
            _tabs.splice(destino, 0, _arrTab);
            if (_arrActiva) _tabActiva = _tabs.indexOf(_arrActiva);
            pintaTabs();
            actual = destino;
            el = tira.querySelector('.nsft-adv-tab[data-i="' + actual + '"]');
            if (!el) return;
        }

        const r = el.getBoundingClientRect();
        el.style.transform = 'translateX(' + (ev.clientX - (r.left + _arrOffset)) + 'px)';
    }

    let _arrRecien = false;

    function tiraArriba(ev) {
        const tira = ev.currentTarget;
        if (_arrMovido) {
            tira.classList.remove('is-reordenando');
            try { tira.releasePointerCapture(ev.pointerId); } catch (e) { }
            _arrRecien = true;
            setTimeout(() => { _arrRecien = false; }, 0);
            pintaTabs();
        }
        _arrTab = null;
        _arrActiva = null;
        _arrMovido = false;
    }


    function pintaTabs() {
        const tira = _caja && _caja.querySelector('#nsft-adv-tabs');
        if (!tira) return;
        const fila = _caja.querySelector('#nsft-adv-tabs-row');
        tira.textContent = '';
        pintaRuta();
        if (!_tabs.length) { if (fila) fila.hidden = true; return; }
        if (fila) fila.hidden = false;

        if (!tira.dataset.nsftGestos) {
            tira.dataset.nsftGestos = '1';
            tira.addEventListener('contextmenu', (ev) => {
                const el = ev.target.closest('.nsft-adv-tab');
                if (!el) return;
                ev.preventDefault();
                abreMenuTab(ev, Number(el.getAttribute('data-i')));
            });
            tira.addEventListener('pointerdown', tiraAbajo);
            tira.addEventListener('pointermove', tiraMueve);
            tira.addEventListener('pointerup', tiraArriba);
            tira.addEventListener('pointercancel', tiraArriba);

            const prev = _caja.querySelector('#nsft-adv-tabs-prev');
            const next = _caja.querySelector('#nsft-adv-tabs-next');
            if (prev) prev.addEventListener('click', () => ruedaTabs(-1));
            if (next) next.addEventListener('click', () => ruedaTabs(1));
            tira.addEventListener('scroll', programaFlechasTabs, { passive: true });
            if (window.ResizeObserver) {
                try { new ResizeObserver(programaFlechasTabs).observe(tira); } catch (e) { }
            }
        }

        guardaEstadoEnTab();
        _tabs.forEach((t, i) => {
            const el = document.createElement('div');
            el.className = 'nsft-adv-tab'
                + (i === _tabActiva && !_sinArchivo ? ' is-activa' : '')
                + (t.previa ? ' is-previa' : '')
                + (_arrMovido && t === _arrTab ? ' is-arrastrando' : '');
            el.setAttribute('data-i', String(i));

            const fam = iconoArchivo(t.nombre || '', null);
            const ico = document.createElement('span');
            ico.className = 'nsft-adv-tab-ico ' + (fam.clase || '');
            ico.setAttribute('aria-hidden', 'true');
            ico.innerHTML = fam.ico;
            el.appendChild(ico);

            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'nsft-adv-tab-n';
            b.textContent = t.nombre || String(t.id);
            b.title = t.nombre || String(t.id);
            b.addEventListener('click', () => { if (!_arrRecien) activaTab(i); });
            el.appendChild(b);

            const punto = document.createElement('span');
            punto.className = 'nsft-adv-tab-punto';
            punto.hidden = !tabSucia(t);
            punto.title = i18n('adv_dirty', 'Unsaved changes');
            el.appendChild(punto);

            const x = document.createElement('button');
            x.type = 'button';
            x.className = 'nsft-adv-tab-x';
            x.title = i18n('adv_tab_cerrar', 'Close this tab');
            x.setAttribute('aria-label', x.title);
            x.addEventListener('click', (ev) => { ev.stopPropagation(); cierraTab(i); });
            el.appendChild(x);

            tira.appendChild(el);
        });

        const mas = document.createElement('button');
        mas.type = 'button';
        mas.className = 'nsft-adv-tab-mas';
        mas.title = i18n('adv_tab_nueva', 'New tab');
        mas.setAttribute('aria-label', mas.title);
        mas.textContent = '+';
        mas.addEventListener('click', nuevaTab);
        tira.appendChild(mas);
        programaFlechasTabs();
    }

    let _flechasRaf = 0;
    let _tabRevelada = '';

    function programaFlechasTabs() {
        if (_flechasRaf) return;
        _flechasRaf = requestAnimationFrame(() => { _flechasRaf = 0; sincronizaFlechasTabs(); });
    }

    function sincronizaFlechasTabs() {
        const tira = _caja && _caja.querySelector('#nsft-adv-tabs');
        const prev = _caja && _caja.querySelector('#nsft-adv-tabs-prev');
        const next = _caja && _caja.querySelector('#nsft-adv-tabs-next');
        if (!tira || !prev || !next) return;

        const desborda = tira.scrollWidth > tira.clientWidth + 1;
        prev.hidden = !desborda;
        next.hidden = !desborda;

        const t = tabActiva();
        const id = t ? String(t.id) : '';
        if (id && id !== _tabRevelada) {
            _tabRevelada = id;
            if (desborda) {
                const el = tira.querySelector('.nsft-adv-tab.is-activa');
                if (el && el.scrollIntoView) {
                    try { el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }); } catch (e) { }
                }
            }
        }
        if (!desborda) return;

        const max = tira.scrollWidth - tira.clientWidth;
        prev.disabled = tira.scrollLeft <= 1;
        next.disabled = tira.scrollLeft >= max - 1;
    }

    function ruedaTabs(dir) {
        const tira = _caja && _caja.querySelector('#nsft-adv-tabs');
        if (!tira) return;
        const paso = Math.max(120, Math.round(tira.clientWidth * 0.5));
        try { tira.scrollBy({ left: dir * paso, behavior: 'smooth' }); }
        catch (e) { tira.scrollLeft += dir * paso; }
    }

    function nuevaTab() {
        if (_sinArchivo) return;
        guardaEstadoEnTab();
        muestraVacio();
        pintaTabs();
    }

    function pintaRuta() {
        const ruta = _caja && _caja.querySelector('#nsft-adv-path');
        if (ruta) ruta.hidden = !!_sinArchivo;
    }

    let _tabsTimer = null;
    function programaTabs() {
        if (!_tabs.length) return;
        clearTimeout(_tabsTimer);
        _tabsTimer = setTimeout(pintaTabs, 300);
    }



    const CSV_MARGEN = 8;
    const CSV_ALTO = 28;
    const CSV_TOPE = 50000;

    let _csvAbierto = false;
    let _csvModelo = null;
    let _csvEditando = null;

    function esCsv(nombre) {
        return /\.(csv|tsv)$/i.test(String(nombre || ''));
    }


    function separadorDe(texto) {
        const linea = String(texto || '').split('\n')[0] || '';
        let mejor = ',';
        let masVeces = 0;
        [',', ';', '\t', '|'].forEach((s) => {
            let n = 0;
            let dentro = false;
            for (let i = 0; i < linea.length; i++) {
                const ch = linea[i];
                if (ch === '"') dentro = !dentro;
                else if (ch === s && !dentro) n++;
            }
            if (n > masVeces) { masVeces = n; mejor = s; }
        });
        return mejor;
    }

    function leeCsv(texto) {
        const t = String(texto || '');
        const sep = separadorDe(t);
        const finLinea = t.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
        const filas = [];
        let fila = [];
        let campo = '';
        let dentro = false;
        for (let i = 0; i < t.length; i++) {
            const ch = t[i];
            if (dentro) {
                if (ch === '"') {
                    if (t[i + 1] === '"') { campo += '"'; i++; }
                    else dentro = false;
                } else campo += ch;
                continue;
            }
            if (ch === '"') { dentro = true; continue; }
            if (ch === sep) { fila.push(campo); campo = ''; continue; }
            if (ch === '\r') continue;
            if (ch === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; continue; }
            campo += ch;
        }
        if (campo !== '' || fila.length) { fila.push(campo); filas.push(fila); }
        return { filas: filas, sep: sep, finLinea: finLinea };
    }

    function escapaCelda(v, sep) {
        const s = String(v == null ? '' : v);
        if (s.indexOf(sep) === -1 && s.indexOf('"') === -1
            && s.indexOf('\n') === -1 && s.indexOf('\r') === -1) return s;
        return '"' + s.split('"').join('""') + '"';
    }

    function escribeCsv(m) {
        return m.filas
            .map((f) => f.map((c) => escapaCelda(c, m.sep)).join(m.sep))
            .join(m.finLinea);
    }


    function alternaTabla() {
        if (_csvAbierto) cierraTabla(); else abreTabla();
    }

    function abreTabla() {
        if (!_caja || !_cm || _sinArchivo) return;
        const texto = _cm.getValue();
        _csvModelo = leeCsv(texto);
        if (_csvModelo.filas.length > CSV_TOPE) {
            toast(fmt('adv_csv_enorme', 'Too many rows to show as a table ($1)',
                [miles(_csvModelo.filas.length)]));
            _csvModelo = null;
            return;
        }
        _csvAbierto = true;
        cierraDiff();
        _caja.querySelector('#nsft-adv-host').hidden = true;
        _caja.querySelector('#nsft-adv-vacio').hidden = true;
        _caja.querySelector('#nsft-adv-visor').hidden = true;
        _caja.querySelector('#nsft-adv-buscar').hidden = true;
        _caja.querySelector('#nsft-adv-tabla').hidden = false;
        pintaBotonTabla();
        pintaTabla();
    }

    function cierraTabla() {
        if (!_caja || !_csvAbierto) return;
        _csvAbierto = false;
        _csvEditando = null;
        pintaBotonTabla();
        _caja.querySelector('#nsft-adv-tabla').hidden = true;
        _caja.querySelector('#nsft-adv-host').hidden = _sinArchivo;
        _caja.querySelector('#nsft-adv-vacio').hidden = !_sinArchivo;
        if (_cm && !_sinArchivo) {
            setTimeout(() => { try { _cm.refresh(); _cm.focus(); } catch (e) { } }, 0);
        }
    }

    let _ordenando = false;

    function seVe(el) {
        if (!el || el.hidden) return false;
        try { return window.getComputedStyle(el).display !== 'none'; } catch (e) { return true; }
    }

    function ordenaSeparadores() {
        const bar = _caja && _caja.querySelector('.nsft-adv-bar');
        if (!bar || _ordenando) return;
        _ordenando = true;
        try {
            const hijos = [].slice.call(bar.children);
            hijos.forEach((h) => {
                if (h.classList.contains('nsft-adv-sep')) h.hidden = false;
            });
            const utiles = hijos.filter((h) => seVe(h) && !h.classList.contains('nsft-adv-spacer'));
            let ultimoConTinta = -1;
            utiles.forEach((h, i) => {
                if (!h.classList.contains('nsft-adv-sep')) { ultimoConTinta = i; return; }
                if (ultimoConTinta === -1 || ultimoConTinta !== i - 1) { h.hidden = true; return; }
                let hayDespues = false;
                for (let k = i + 1; k < utiles.length; k++) {
                    if (!utiles[k].classList.contains('nsft-adv-sep')) { hayDespues = true; break; }
                }
                if (!hayDespues) h.hidden = true;
            });
        } finally { _ordenando = false; }
    }

    function vigilaSeparadores(caja) {
        const bar = caja.querySelector('.nsft-adv-bar');
        if (!bar || typeof MutationObserver === 'undefined') return;
        ordenaSeparadores();
        try {
            new MutationObserver(() => {
                if (_ordenando) return;
                ordenaSeparadores();
            }).observe(bar, { childList: true, attributes: true, attributeFilter: ['hidden'] });
        } catch (e) { }
    }

    function pintaBotonTabla() {
        const b = _caja && _caja.querySelector('#nsft-adv-tabla-btn');
        if (!b) return;
        b.hidden = !esCsv(nombreDelActual());
        b.classList.toggle('is-on', !!_csvAbierto);
    }

    function pintaTabla() {
        const caja = _caja && _caja.querySelector('#nsft-adv-tabla-rejilla');
        const est = _caja && _caja.querySelector('#nsft-adv-tabla-estado');
        if (!caja || !_csvModelo) return;
        const m = _csvModelo;
        const cols = m.filas.reduce((n, f) => Math.max(n, f.length), 0);

        if (est) {
            est.textContent = fmt('adv_csv_cuenta', '$1 rows · $2 columns',
                [miles(Math.max(0, m.filas.length - 1)), miles(cols)]);
        }

        const cuerpo = caja.querySelector('.nsft-adv-tabla-cuerpo');
        cuerpo.style.height = (m.filas.length - 1) * CSV_ALTO + 'px';

        pintaCabeceraTabla(caja, m, cols);
        pintaFilasTabla();
    }

    function pintaCabeceraTabla(caja, m, cols) {
        const cab = caja.querySelector('.nsft-adv-tabla-cab');
        cab.textContent = '';
        const esquina = document.createElement('div');
        esquina.className = 'nsft-adv-tabla-c is-num';
        cab.appendChild(esquina);
        for (let c = 0; c < cols; c++) {
            const d = document.createElement('div');
            d.className = 'nsft-adv-tabla-c';
            d.textContent = (m.filas[0] && m.filas[0][c]) || '';
            d.title = d.textContent;
            cab.appendChild(d);
        }
    }

    function pintaFilasTabla() {
        const caja = _caja && _caja.querySelector('#nsft-adv-tabla-rejilla');
        if (!caja || !_csvModelo) return;
        const m = _csvModelo;
        const cuerpo = caja.querySelector('.nsft-adv-tabla-cuerpo');
        const cols = m.filas.reduce((n, f) => Math.max(n, f.length), 0);
        const alto = caja.clientHeight || 400;
        const desde = Math.max(0, Math.floor(caja.scrollTop / CSV_ALTO) - CSV_MARGEN);
        const hasta = Math.min(m.filas.length - 1, desde + Math.ceil(alto / CSV_ALTO) + CSV_MARGEN * 2);

        cuerpo.textContent = '';
        for (let i = desde; i < hasta; i++) {
            const datos = m.filas[i + 1] || [];
            const fila = document.createElement('div');
            fila.className = 'nsft-adv-tabla-f';
            fila.style.top = (i * CSV_ALTO) + 'px';

            const num = document.createElement('div');
            num.className = 'nsft-adv-tabla-c is-num';
            num.textContent = String(i + 2);
            fila.appendChild(num);

            for (let c = 0; c < cols; c++) {
                const d = document.createElement('div');
                d.className = 'nsft-adv-tabla-c';
                d.textContent = datos[c] == null ? '' : datos[c];
                d.dataset.f = String(i + 1);
                d.dataset.c = String(c);
                d.title = d.textContent;
                fila.appendChild(d);
            }
            cuerpo.appendChild(fila);
        }
    }


    function editaCelda(celda) {
        if (!_csvModelo || _csvEditando) return;
        const f = Number(celda.dataset.f);
        const c = Number(celda.dataset.c);
        if (!(f >= 0) || !(c >= 0)) return;
        _csvEditando = { f: f, c: c };

        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'nsft-adv-tabla-inp';
        inp.value = celda.textContent;
        celda.textContent = '';
        celda.appendChild(inp);
        inp.focus();
        inp.select();

        let cerrado = false;
        const cierra = (guardar) => {
            if (cerrado) return;
            cerrado = true;
            _csvEditando = null;
            const v = inp.value;
            if (guardar) ponCelda(f, c, v);
            pintaFilasTabla();
        };
        inp.addEventListener('blur', () => cierra(true));
        inp.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') { ev.preventDefault(); cierra(true); }
            else if (ev.key === 'Escape') { ev.preventDefault(); cierra(false); }
            else if (ev.key === 'Tab') {
                ev.preventDefault();
                cierra(true);
                const sig = _caja.querySelector('[data-f="' + f + '"][data-c="' + (c + (ev.shiftKey ? -1 : 1)) + '"]');
                if (sig) editaCelda(sig);
            }
        });
    }

    function ponCelda(f, c, valor) {
        if (!_csvModelo || !_cm) return;
        const fila = _csvModelo.filas[f];
        if (!fila) return;
        while (fila.length <= c) fila.push('');
        if (fila[c] === valor) return;
        fila[c] = valor;
        const texto = escribeCsv(_csvModelo);
        try {
            const cur = _cm.getCursor();
            _cm.setValue(texto);
            _cm.setCursor(cur);
        } catch (e) { }
    }

    function cablearTabla(caja) {
        const btn = caja.querySelector('#nsft-adv-tabla-btn');
        if (btn) btn.addEventListener('click', alternaTabla);

        const rej = caja.querySelector('#nsft-adv-tabla-rejilla');
        if (!rej) return;
        rej.addEventListener('dblclick', (ev) => {
            const c = ev.target.closest ? ev.target.closest('.nsft-adv-tabla-c') : null;
            if (!c || c.classList.contains('is-num') || !c.dataset.f) return;
            editaCelda(c);
        });
        rej.addEventListener('scroll', () => {
            if (_csvRaf) return;
            _csvRaf = requestAnimationFrame(() => { _csvRaf = 0; pintaFilasTabla(); });
        });
        const cerrar = caja.querySelector('#nsft-adv-tabla-cerrar');
        if (cerrar) cerrar.addEventListener('click', cierraTabla);
    }

    let _csvRaf = 0;


    let _guardado = '';
    let _diffAbierto = false;
    let _canaletaTimer = null;
    let _canaletaMarcadas = [];

    function marcaLimpio() {
        if (!_cm) return;
        _genLimpia = _cm.changeGeneration(true);
        _guardado = _cm.getValue();
        const t = tabActiva();
        if (t) { t.genLimpia = _genLimpia; t.guardado = _guardado; }
        pintaCanaleta();
        pintaTabs();
    }


    const DIFF_TOPE = 2000;

    const bordes = (l) => String(l).trim();

    function diffLineas(viejo, nuevo) {
        const A = String(viejo).split('\n');
        const B = String(nuevo).split('\n');
        const a = A.map(bordes);
        const b = B.map(bordes);

        let ini = 0;
        while (ini < A.length && ini < B.length && a[ini] === b[ini]) ini++;
        let finA = A.length;
        let finB = B.length;
        while (finA > ini && finB > ini && a[finA - 1] === b[finB - 1]) { finA--; finB--; }

        const medA = A.slice(ini, finA);
        const medB = B.slice(ini, finB);
        if (!medA.length && !medB.length) {
            return { igual: true, soloEspacios: String(viejo) !== String(nuevo),
                ops: [], A: A, B: B, ini: ini };
        }

        const ops = alinea(medA, medB, a.slice(ini, finA), b.slice(ini, finB));
        if (!ops) return { excede: true, A: A, B: B, ini: ini };
        return { ops: ops, A: A, B: B, ini: ini, finA: finA, finB: finB };
    }

    function alinea(A, B, ca, cb) {
        const n = A.length;
        const m = B.length;
        const x = ca || A;
        const y = cb || B;
        if (n > DIFF_TOPE || m > DIFF_TOPE) return null;
        const anchoF = m + 1;
        const dp = new Int32Array((n + 1) * anchoF);
        for (let i = n - 1; i >= 0; i--) {
            for (let j = m - 1; j >= 0; j--) {
                dp[i * anchoF + j] = (x[i] === y[j])
                    ? dp[(i + 1) * anchoF + j + 1] + 1
                    : Math.max(dp[(i + 1) * anchoF + j], dp[i * anchoF + j + 1]);
            }
        }
        const ops = [];
        let i = 0;
        let j = 0;
        while (i < n && j < m) {
            if (x[i] === y[j]) {
                ops.push({ t: ' ', txt: B[j] }); i++; j++;
            }
            else if (dp[(i + 1) * anchoF + j] >= dp[i * anchoF + j + 1]) { ops.push({ t: '-', txt: A[i] }); i++; }
            else { ops.push({ t: '+', txt: B[j] }); j++; }
        }
        while (i < n) { ops.push({ t: '-', txt: A[i] }); i++; }
        while (j < m) { ops.push({ t: '+', txt: B[j] }); j++; }
        return ops;
    }


    function limpiaCanaleta() {
        const cm = _cm;
        if (!cm) return;
        _canaletaMarcadas.forEach((l) => {
            try { cm.setGutterMarker(l, GUTTER_CAMBIOS, null); } catch (e) { }
        });
        _canaletaMarcadas = [];
    }

    const GUTTER_CAMBIOS = 'nsft-adv-gutter-cambios';

    function pintaCanaleta() {
        const cm = _cm;
        if (!cm) return;
        cm.operation(() => pintaCanaletaYa(cm));
    }

    function pintaCanaletaYa(cm) {
        limpiaCanaleta();
        if (!_guardado) { pintaCuentaDiff(0); return; }

        const r = diffLineas(_guardado, cm.getValue());
        if (r.igual) { pintaCuentaDiff(0); return; }
        if (r.excede) { pintaCuentaDiff(null); return; }

        let linea = r.ini;
        const marca = (l, clase) => {
            if (l < 0 || l >= cm.lineCount()) return;
            const el = document.createElement('div');
            el.className = 'nsft-adv-gm ' + clase;
            try { cm.setGutterMarker(l, GUTTER_CAMBIOS, el); _canaletaMarcadas.push(l); } catch (e) { }
        };
        let tocadas = 0;
        let k = 0;
        while (k < r.ops.length) {
            if (r.ops[k].t === ' ') { linea++; k++; continue; }
            let quitadas = 0;
            while (k < r.ops.length && r.ops[k].t === '-') { quitadas++; k++; }
            let puestas = 0;
            const desde = linea;
            while (k < r.ops.length && r.ops[k].t === '+') { puestas++; k++; }
            if (puestas) {
                const clase = quitadas ? 'is-cambiada' : 'is-nueva';
                for (let j = 0; j < puestas; j++) marca(desde + j, clase);
                linea += puestas;
                tocadas += puestas;
            } else {
                marca(linea, 'is-quitada');
                tocadas++;
            }
        }
        pintaCuentaDiff(tocadas);
    }

    function programaCanaleta() {
        clearTimeout(_canaletaTimer);
        _canaletaTimer = setTimeout(pintaCanaleta, 900);
    }


    const DIFF_CONTEXTO = 3;

    function alternaDiff() {
        if (_diffAbierto) cierraDiff();
        else abreDiff();
    }

    function pintaBotonDiff() {
        const b = _caja && _caja.querySelector('#nsft-adv-diff-btn');
        if (b) b.classList.toggle('is-on', !!_diffAbierto);
    }

    function pintaCuentaDiff(n) {
        const el = _caja && _caja.querySelector('#nsft-adv-diff-n');
        if (!el) return;
        const hay = (n === null) || n > 0;
        el.hidden = !hay;
        el.textContent = (n === null) ? '·' : (n ? String(n) : '');
        const b = _caja.querySelector('#nsft-adv-diff-btn');
        if (b) b.classList.toggle('is-cambiado', hay);
    }


    function abreDiff() {
        if (!_caja || !_cm || _sinArchivo) return;
        _diffAbierto = true;
        _caja.querySelector('#nsft-adv-host').hidden = true;
        _caja.querySelector('#nsft-adv-vacio').hidden = true;
        _caja.querySelector('#nsft-adv-visor').hidden = true;
        _caja.querySelector('#nsft-adv-buscar').hidden = true;
        _caja.querySelector('#nsft-adv-diff').hidden = false;
        pintaBotonDiff();
        pintaDiff();
    }

    function cierraDiff() {
        if (!_caja || !_diffAbierto) return;
        _diffAbierto = false;
        pintaBotonDiff();
        _caja.querySelector('#nsft-adv-diff').hidden = true;
        _caja.querySelector('#nsft-adv-host').hidden = _sinArchivo;
        _caja.querySelector('#nsft-adv-vacio').hidden = !_sinArchivo;
        if (_cm && !_sinArchivo) {
            setTimeout(() => { try { _cm.refresh(); _cm.focus(); } catch (e) { } }, 0);
        }
    }

    function pintaDiff() {
        const lista = _caja && _caja.querySelector('#nsft-adv-diff-lista');
        const estado = _caja && _caja.querySelector('#nsft-adv-diff-estado');
        if (!lista || !_cm) return;
        lista.textContent = '';

        const r = diffLineas(_guardado, _cm.getValue());

        if (r.excede) {
            estado.textContent = i18n('adv_diff_excede',
                'The file changed too much to compare line by line');
            return;
        }
        if (r.igual) {
            estado.textContent = r.soloEspacios
                ? i18n('adv_diff_solo_espacios',
                    'Only the spacing changed: not a single line says anything different')
                : i18n('adv_diff_igual', 'No changes: this is what is saved');
            return;
        }

        let mas = 0;
        let menos = 0;
        r.ops.forEach((o) => { if (o.t === '+') mas++; else if (o.t === '-') menos++; });
        estado.textContent = fmt('adv_diff_cuenta', '$1 added, $2 removed', [mas, menos]);

        const antes = r.A.slice(Math.max(0, r.ini - DIFF_CONTEXTO), r.ini);
        const despues = r.A.slice(r.finA, r.finA + DIFF_CONTEXTO);

        let nA = Math.max(0, r.ini - DIFF_CONTEXTO);
        let nB = Math.max(0, r.ini - DIFF_CONTEXTO);
        antes.forEach((t) => { lista.appendChild(filaDiff(' ', t, ++nA, ++nB)); });
        r.ops.forEach((o) => {
            if (o.t === ' ') lista.appendChild(filaDiff(' ', o.txt, ++nA, ++nB));
            else if (o.t === '-') lista.appendChild(filaDiff('-', o.txt, ++nA, null));
            else lista.appendChild(filaDiff('+', o.txt, null, ++nB));
        });
        despues.forEach((t) => { lista.appendChild(filaDiff(' ', t, ++nA, ++nB)); });
    }

    function filaDiff(tipo, texto, nA, nB) {
        const f = document.createElement('div');
        f.className = 'nsft-adv-diff-fila'
            + (tipo === '+' ? ' is-nueva' : (tipo === '-' ? ' is-quitada' : ''));

        const a = document.createElement('span');
        a.className = 'nsft-adv-diff-n';
        a.textContent = nA == null ? '' : String(nA);
        const b = document.createElement('span');
        b.className = 'nsft-adv-diff-n';
        b.textContent = nB == null ? '' : String(nB);

        const s = document.createElement('span');
        s.className = 'nsft-adv-diff-signo';
        s.setAttribute('aria-hidden', 'true');
        s.textContent = tipo === ' ' ? '' : tipo;

        const t = document.createElement('span');
        t.className = 'nsft-adv-diff-txt';
        t.textContent = texto;

        f.appendChild(a);
        f.appendChild(b);
        f.appendChild(s);
        f.appendChild(t);
        return f;
    }


    function pintaRegla() {
        const host = _caja && _caja.querySelector('.CodeMirror, .cm-editor');
        if (!host || !_cm) return;
        const cols = Number(_prefs.advancedEditorRuler) || 0;
        if (!cols) { host.style.removeProperty('--nsft-regla-x'); return; }

        let ancho = 0;
        try { ancho = _cm.defaultCharWidth(); } catch (e) { ancho = 0; }
        if (!(ancho > 0)) { host.style.removeProperty('--nsft-regla-x'); return; }

        host.style.setProperty('--nsft-regla-x', (4 + ancho * cols).toFixed(1) + 'px');
    }


    function cadenaSimbolo(simbolos, linea) {
        const pila = [];
        for (let i = 0; i < simbolos.length; i++) {
            const s = simbolos[i];
            if (s.linea > linea) break;
            while (pila.length && pila[pila.length - 1].prof >= s.prof) pila.pop();
            pila.push(s);
        }
        return pila;
    }

    function hermanosDeMiga(simbolos, cadena, i) {
        if (!simbolos.length) return [];
        const padre = i > 0 ? cadena[i - 1] : null;
        let desde = 0;
        let hasta = simbolos.length;
        if (padre) {
            const k = simbolos.indexOf(padre);
            if (k === -1) return [];
            desde = k + 1;
            hasta = desde;
            while (hasta < simbolos.length && simbolos[hasta].prof > padre.prof) hasta++;
        }
        let prof = i >= 0 && cadena[i] ? cadena[i].prof : null;
        if (prof == null) {
            prof = 99;
            for (let k = desde; k < hasta; k++) prof = Math.min(prof, simbolos[k].prof);
        }
        const out = [];
        for (let k = desde; k < hasta; k++) if (simbolos[k].prof === prof) out.push(simbolos[k]);
        return out;
    }

    function vaALinea(linea) {
        const cm = _cm;
        if (!cm) return;
        cm.setCursor({ line: linea, ch: 0 });
        try {
            cm.scrollIntoView({ line: linea, ch: 0 }, cm.getScrollInfo().clientHeight / 2);
        } catch (e) { }
        cm.focus();
    }

    function abreMigaSimbolo(ev, i) {
        if (!_cm || !_esJs) return;
        const simbolos = simbolosDelDoc();
        const cadena = cadenaSimbolo(simbolos, _cm.getCursor().line);
        const hermanos = hermanosDeMiga(simbolos, cadena, i);
        if (!hermanos.length) return;
        ev.preventDefault();
        ev.stopPropagation();
        const aqui = i >= 0 ? cadena[i] : null;
        menuFlotante(ev, hermanos.map((x) => ({
            texto: x.nombre + (x.args ? '(' + (x.args.length > 28 ? x.args.slice(0, 27) + '\u2026' : x.args) + ')' : ''),
            marcado: x === aqui,
            fn: () => vaALinea(x.linea)
        })));
    }

    function vaciaMigas(cont) {
        _migHuella = null;
        if (cont && cont.firstChild) cont.textContent = '';
    }

    function pintaMigasSimbolo() {
        const cont = _caja && _caja.querySelector('#nsft-adv-crumbs');
        if (!cont) return;
        if (!_cm || !_esJs) { vaciaMigas(cont); return; }

        const cadena = cadenaSimbolo(simbolosDelDoc(), _cm.getCursor().line);

        const huella = cadena.map((s) => s.nombre + '@' + s.linea).join('>');
        if (huella === _migHuella) return;

        vaciaMigas(cont);
        _migHuella = huella;
        if (!cadena.length) return;

        cadena.forEach((s, idx) => {
            const sep = document.createElement('span');
            sep.className = 'nsft-adv-crumb-sep';
            sep.setAttribute('aria-hidden', 'true');
            sep.textContent = '›';
            cont.appendChild(sep);

            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'nsft-adv-crumb';
            b.textContent = s.nombre;
            b.title = fmt('adv_crumb_lista', 'Other items at the level of $1', [s.nombre]);
            const iEste = idx;
            b.addEventListener('click', (ev) => abreMigaSimbolo(ev, iEste));
            cont.appendChild(b);
        });
    }

    function programaMigas() {
        clearTimeout(_migTimer);
        _migTimer = setTimeout(pintaMigasSimbolo, 150);
    }

    const PANEL_KEY = 'nsftAdvPaneles';
    const ANCHO_MIN = 180;
    const ALTO_MIN = 64;
    let _paneles = null;

    function leePaneles(cb) {
        try {
            chrome.storage.local.get([PANEL_KEY], (it) => {
                const v = (it && it[PANEL_KEY]) || {};
                _paneles = { ancho: Number(v.ancho) || 0, alto: Number(v.alto) || 0 };
                cb();
            });
        } catch (e) { _paneles = { ancho: 0, alto: 0 }; cb(); }
    }

    function guardaPaneles() {
        try { chrome.storage.local.set({ [PANEL_KEY]: _paneles }); } catch (e) { }
    }

    function aplicaPaneles() {
        if (!_caja || !_paneles) return;
        const aside = _caja.querySelector('#nsft-adv-tree');
        const syms = _caja.querySelector('#nsft-adv-sec-syms');
        if (aside && _paneles.ancho) aside.style.width = _paneles.ancho + 'px';
        if (syms && _paneles.alto) {
            syms.style.height = _paneles.alto + 'px';
            syms.style.maxHeight = 'none';
        }
    }

    function montaTirador(el, alMover, alSoltar) {
        if (!el) return;
        el.addEventListener('pointerdown', (ev) => {
            if (ev.button !== 0) return;
            ev.preventDefault();
            try { el.setPointerCapture(ev.pointerId); } catch (e) { }
            el.classList.add('is-arrastrando');
            _caja.classList.add('is-ajustando');

            const mueve = (e2) => alMover(e2);
            const suelta = (e2) => {
                el.removeEventListener('pointermove', mueve);
                el.removeEventListener('pointerup', suelta);
                el.removeEventListener('pointercancel', suelta);
                el.classList.remove('is-arrastrando');
                _caja.classList.remove('is-ajustando');
                try { el.releasePointerCapture(e2.pointerId); } catch (e) { }
                alSoltar();
            };
            el.addEventListener('pointermove', mueve);
            el.addEventListener('pointerup', suelta);
            el.addEventListener('pointercancel', suelta);
        });
    }

    function montaTiradores(caja) {
        const aside = caja.querySelector('#nsft-adv-tree');
        const syms = caja.querySelector('#nsft-adv-sec-syms');
        const cuerpo = caja.querySelector('.nsft-adv-body');

        montaTirador(caja.querySelector('#nsft-adv-tirador-ancho'), (ev) => {
            if (!aside || !cuerpo) return;
            const caben = cuerpo.getBoundingClientRect();
            const tope = Math.max(ANCHO_MIN, caben.width - 320);
            const ancho = Math.min(tope, Math.max(ANCHO_MIN, ev.clientX - caben.left));
            aside.style.width = ancho + 'px';
            _paneles.ancho = Math.round(ancho);
        }, () => { guardaPaneles(); refrescaEditor(); });

        montaTirador(caja.querySelector('#nsft-adv-tirador-alto'), (ev) => {
            if (!syms || !aside) return;
            const marco = aside.getBoundingClientRect();
            const tope = Math.max(ALTO_MIN, marco.height - ALTO_MIN - 40);
            const alto = Math.min(tope, Math.max(ALTO_MIN, marco.bottom - ev.clientY));
            syms.style.height = alto + 'px';
            syms.style.maxHeight = 'none';
            _paneles.alto = Math.round(alto);
        }, guardaPaneles);
    }

    function refrescaEditor() {
        if (_cm) { try { _cm.refresh(); } catch (e) { } }
    }

    let _arbPlegado = false;

    function alternaArchivos() {
        if (!_caja) return;
        _arbPlegado = !_arbPlegado;
        const sec = _caja.querySelector('#nsft-adv-sec-files');
        if (sec) sec.classList.toggle('is-plegada', _arbPlegado);
    }

    function alternaSimbolos() {
        if (!_caja) return;
        _simPlegado = !_simPlegado;
        const sec = _caja.querySelector('#nsft-adv-sec-syms');
        if (sec) sec.classList.toggle('is-plegada', _simPlegado);
        if (!_simPlegado) pintaSimbolos();
    }


    const BUS_TOPE_CARPETAS = 60;
    const BUS_TOPE_ARCHIVOS = 300;
    const BUS_A_LA_VEZ = 6;
    const BUS_POR_ARCHIVO = 20;
    const BUS_TEXTO = /\.(js|mjs|ts|json|html?|xml|xsl|css|txt|csv|md|sql|ftl|properties|log)$/i;

    let _busSeq = 0;
    const _busCb = new Map();
    let _busCorriendo = false;
    let _busCortar = false;
    let _busIrALinea = null;

    function pideHijosDirecto(id) {
        return new Promise((resolver) => {
            const token = 'b' + (++_busSeq);
            let hecho = false;
            const una = (v) => {
                if (hecho) return;
                hecho = true;
                _busCb.delete(token);
                resolver(v);
            };
            _busCb.set(token, una);
            setTimeout(() => una(null), 15000);
            manda('children', { folder: (id === RAIZ ? null : String(id)), token: token });
        });
    }

    async function reuneArchivos(raiz, alPaso) {
        const vistas = new Set();
        const cola = [String(raiz)];
        const archivos = [];

        while (cola.length && vistas.size < BUS_TOPE_CARPETAS && archivos.length < BUS_TOPE_ARCHIVOS) {
            if (_busCortar) break;
            const id = cola.shift();
            if (vistas.has(id)) continue;
            vistas.add(id);

            const n = _nodos.get(id);
            let datos = (n && n.cargado) ? { subs: n.subs, files: n.files } : null;
            if (!datos) datos = await pideHijosDirecto(id);
            if (!datos) continue;

            (datos.files || []).forEach((f) => {
                if (archivos.length >= BUS_TOPE_ARCHIVOS) return;
                if (!BUS_TEXTO.test(f.name || '')) return;
                const u = enlaceSeguro(f.url);
                if (u) archivos.push({ id: f.id, name: f.name, url: u, folder: id });
            });
            (datos.subs || []).forEach((s) => cola.push(String(s.id)));
            if (alPaso) alPaso(vistas.size, archivos.length);
        }
        return archivos;
    }

    function coincidencias(texto, termino) {
        const out = [];
        const lineas = String(texto).split('\n');
        const fold = (s) => (TS && TS.fold ? TS.fold(s) : String(s).toLowerCase());
        const t = fold(termino);
        if (!t) return out;
        for (let i = 0; i < lineas.length && out.length < BUS_POR_ARCHIVO; i++) {
            if (fold(lineas[i]).indexOf(t) < 0) continue;
            out.push({ linea: i, texto: lineas[i].replace(/^\s+/, '').slice(0, 200) });
        }
        return out;
    }

    async function bajaYBusca(archivos, termino, alPaso) {
        const hallazgos = [];
        let siguiente = 0;
        let hechos = 0;

        async function obrero() {
            while (siguiente < archivos.length && !_busCortar) {
                const f = archivos[siguiente++];
                try {
                    const res = await fetch(f.url, { credentials: 'same-origin' });
                    if (res.ok) {
                        const cs = coincidencias(await res.text(), termino);
                        if (cs.length) hallazgos.push({ archivo: f, lineas: cs });
                    }
                } catch (e) { }
                hechos++;
                if (alPaso) alPaso(hechos, archivos.length, hallazgos.length);
            }
        }

        const obreros = [];
        for (let i = 0; i < Math.min(BUS_A_LA_VEZ, archivos.length); i++) obreros.push(obrero());
        await Promise.all(obreros);
        hallazgos.sort((a, b) => String(a.archivo.name).localeCompare(String(b.archivo.name)));
        return hallazgos;
    }


    let _busAbierto = false;

    function abreBuscador() {
        if (!_caja) return;
        _busAbierto = true;
        _diffAbierto = false;
        pintaBotonDiff();
        _caja.querySelector('#nsft-adv-diff').hidden = true;
        _caja.querySelector('#nsft-adv-host').hidden = true;
        _caja.querySelector('#nsft-adv-vacio').hidden = true;
        _caja.querySelector('#nsft-adv-visor').hidden = true;
        _caja.querySelector('#nsft-adv-buscar').hidden = false;
        _caja.classList.add('is-buscando');
        const caja = _caja.querySelector('#nsft-adv-bus-input');
        if (caja) { caja.focus(); caja.select(); }
    }

    function cierraBuscador() {
        if (!_caja || !_busAbierto) return;
        _busAbierto = false;
        _busCortar = true;
        _caja.querySelector('#nsft-adv-buscar').hidden = true;
        _caja.classList.remove('is-buscando');
        _caja.querySelector('#nsft-adv-vacio').hidden = !_sinArchivo;
        _caja.querySelector('#nsft-adv-host').hidden = _sinArchivo;
        if (_cm && !_sinArchivo) setTimeout(() => { try { _cm.refresh(); _cm.focus(); } catch (e) { } }, 0);
    }

    function busEstado(msg) {
        const el = _caja && _caja.querySelector('#nsft-adv-bus-estado');
        if (el) el.textContent = msg || '';
    }

    async function lanzaBusqueda() {
        if (_busCorriendo) { _busCortar = true; return; }
        const caja = _caja.querySelector('#nsft-adv-bus-input');
        const termino = caja ? caja.value.trim() : '';
        const lista = _caja.querySelector('#nsft-adv-bus-lista');
        lista.textContent = '';
        if (termino.length < 2) {
            busEstado(i18n('adv_bus_corto', 'Type at least two characters'));
            return;
        }
        const carpeta = carpetaDelArchivo();
        if (carpeta == null || carpeta === '') {
            busEstado(i18n('adv_bus_sin_carpeta', 'No folder to search in'));
            return;
        }

        _busCorriendo = true;
        _busCortar = false;
        const boton = _caja.querySelector('#nsft-adv-bus-btn');
        if (boton) boton.textContent = i18n('adv_bus_parar', 'Stop');

        try {
            busEstado(i18n('adv_bus_listando', 'Listing files…'));
            const archivos = await reuneArchivos(carpeta, (carpetas, n) => {
                busEstado(fmt('adv_bus_listando_n', '$1 folders · $2 files', [miles(carpetas), miles(n)]));
            });

            if (!archivos.length) {
                busEstado(i18n('adv_bus_nada_que_mirar', 'No text files in this folder'));
                return;
            }

            let ultimo = 0;
            const hallazgos = await bajaYBusca(archivos, termino, (hechos, total, cuantos) => {
                const ahora = Date.now();
                if (ahora - ultimo < 100 && hechos < total) return;
                ultimo = ahora;
                busEstado(fmt('adv_bus_yendo', '$1 of $2 · $3 with matches',
                    [miles(hechos), miles(total), miles(cuantos)]));
            });

            pintaHallazgos(hallazgos, termino, archivos.length);
        } finally {
            _busCorriendo = false;
            if (boton) boton.textContent = i18n('adv_bus_ir', 'Search');
        }
    }

    function pintaHallazgos(hallazgos, termino, mirados) {
        const lista = _caja.querySelector('#nsft-adv-bus-lista');
        lista.textContent = '';

        const total = hallazgos.reduce((n, h) => n + h.lineas.length, 0);
        busEstado(_busCortar
            ? fmt('adv_bus_parado', 'Stopped · $1 matches in $2 files', [miles(total), miles(hallazgos.length)])
            : fmt('adv_bus_hecho', '$1 matches in $2 files · $3 searched',
                [miles(total), miles(hallazgos.length), miles(mirados)]));

        if (!hallazgos.length) return;

        hallazgos.forEach((h) => {
            const grupo = document.createElement('div');
            grupo.className = 'nsft-adv-bus-grupo';

            const cab = document.createElement('div');
            cab.className = 'nsft-adv-bus-arch';
            const fam = iconoArchivo(h.archivo.name);
            const ico = document.createElement('span');
            ico.className = 'nsft-adv-node-ico ' + (fam.clase || '');
            ico.innerHTML = fam.ico;
            cab.appendChild(ico);
            const nom = document.createElement('span');
            nom.className = 'nsft-adv-bus-arch-n';
            nom.textContent = h.archivo.name;
            cab.appendChild(nom);
            const n = document.createElement('span');
            n.className = 'nsft-adv-bus-arch-c';
            n.textContent = String(h.lineas.length);
            cab.appendChild(n);
            grupo.appendChild(cab);

            h.lineas.forEach((l) => {
                const fila = document.createElement('button');
                fila.type = 'button';
                fila.className = 'nsft-adv-bus-linea';
                const ln = document.createElement('span');
                ln.className = 'nsft-adv-bus-ln';
                ln.textContent = String(l.linea + 1);
                fila.appendChild(ln);

                const txt = document.createElement('span');
                txt.className = 'nsft-adv-bus-txt';
                if (TS && TS.markHtml) txt.innerHTML = TS.markHtml(l.texto, termino, 'nsft-adv-bus-hl');
                else txt.textContent = l.texto;
                fila.appendChild(txt);

                fila.title = h.archivo.name + ':' + (l.linea + 1);
                fila.addEventListener('click', () => {
                    const irA = () => {
                        if (!_cm) return;
                        _cm.setCursor({ line: l.linea, ch: 0 });
                        _cm.scrollIntoView({ line: l.linea, ch: 0 }, _cm.getScrollInfo().clientHeight / 2);
                        _cm.focus();
                    };
                    if (String(h.archivo.id) === String(idDelArchivo())) {
                        cierraBuscador();
                        irA();
                        return;
                    }
                    _busIrALinea = l.linea;
                    cierraBuscador();
                    abreArchivo(h.archivo.id, h.archivo.name);
                });
                grupo.appendChild(fila);
            });

            lista.appendChild(grupo);
        });
    }



    const QK_MIN = 2;
    const QK_ESPERA = 220;
    const QK_TOPE = 40;
    const QK_HISTORIA = 12;

    let _qkModo = 'archivo';
    let _qkAbierto = false;
    let _qkSeq = 0;
    let _qkToken = '';
    let _qkReloj = null;
    let _qkTermino = '';
    let _qkRemoto = [];
    let _qkFilas = [];
    let _qkSel = 0;

    function cablearRapido(caja) {
        const input = caja.querySelector('#nsft-adv-quick-input');
        const fondo = caja.querySelector('#nsft-adv-quick');

        input.addEventListener('input', () => {
            _qkTermino = input.value.trim();
            pintaRapido();
            programaRemoto();
        });

        input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape') { ev.preventDefault(); cierraRapido(); return; }
            if (ev.key === 'ArrowDown') { ev.preventDefault(); mueveRapido(1); return; }
            if (ev.key === 'ArrowUp') { ev.preventDefault(); mueveRapido(-1); return; }
            if (ev.key === 'Home' && !ev.shiftKey) { ev.preventDefault(); mueveRapido(-1e9); return; }
            if (ev.key === 'End' && !ev.shiftKey) { ev.preventDefault(); mueveRapido(1e9); return; }
            if (ev.key === 'Enter') { ev.preventDefault(); abreSeleccion(); return; }
        });

        fondo.addEventListener('mousedown', (ev) => {
            if (ev.target === fondo) cierraRapido();
        });

        caja.addEventListener('keydown', (ev) => {
            if (ev.key !== 'p' && ev.key !== 'P') return;
            if (!(ev.ctrlKey || ev.metaKey) || ev.altKey || ev.shiftKey) return;
            ev.preventDefault();
            ev.stopPropagation();
            alternaRapido();
        }, true);
    }

    function alternaRapido() {
        if (_qkAbierto) cierraRapido(); else abreRapido();
    }

    function abreRapido(modo) {
        if (!_caja) return;
        _qkModo = (modo === 'carpeta') ? 'carpeta' : 'archivo';
        _qkAbierto = true;
        _qkRemoto = [];
        _qkTermino = '';
        _caja.querySelector('#nsft-adv-quick').hidden = false;
        const input = _caja.querySelector('#nsft-adv-quick-input');
        input.value = '';
        input.placeholder = (_qkModo === 'carpeta')
            ? i18n('adv_quick_ph_dir', 'Type a folder name')
            : i18n('adv_quick_ph', 'Type a file name');
        input.focus();
        pintaRapido();
    }

    function cierraRapido() {
        if (!_caja || !_qkAbierto) return;
        _qkAbierto = false;
        _qkToken = '';
        if (_qkReloj) { clearTimeout(_qkReloj); _qkReloj = null; }
        _caja.querySelector('#nsft-adv-quick').hidden = true;
        if (_cm && !_sinArchivo) { try { _cm.focus(); } catch (e) { } }
    }

    function programaRemoto() {
        if (_qkReloj) clearTimeout(_qkReloj);
        const t = _qkTermino;
        if (t.length < QK_MIN) { _qkRemoto = []; return; }
        _qkReloj = setTimeout(() => {
            _qkReloj = null;
            const token = 'q' + (++_qkSeq);
            _qkToken = token;
            manda(_qkModo === 'carpeta' ? 'carpetas' : 'nombres', { term: t, token: token });
        }, QK_ESPERA);
    }

    function recibeNombres(p) {
        if (!p || p.token !== _qkToken || !_qkAbierto) return;
        _qkRemoto = (p.data && (p.data.files || p.data.folders)) || [];
        pintaRapido();
    }

    function archivosEnMemoria() {
        const vistos = new Set();
        const out = [];
        (_cache.recientes || []).forEach((r) => {
            if (!r || vistos.has(String(r.id))) return;
            vistos.add(String(r.id));
            out.push({ id: String(r.id), name: String(r.name || ''), folder: String(r.folder == null ? '' : r.folder), reciente: true });
        });
        _nodos.forEach((n) => {
            (n.files || []).forEach((f) => {
                if (!f || vistos.has(String(f.id))) return;
                vistos.add(String(f.id));
                out.push({ id: String(f.id), name: String(f.name || ''), folder: String(n.id || ''), url: f.url, filetype: f.filetype });
            });
        });
        return out;
    }

    function ordenaRapido(a, b) {
        if (a.rango !== b.rango) return a.rango - b.rango;
        if (!!b.reciente !== !!a.reciente) return b.reciente ? 1 : -1;
        if (a.name.length !== b.name.length) return a.name.length - b.name.length;
        return a.name.localeCompare(b.name);
    }

    function carpetasEnMemoria() {
        const vistas = new Set();
        const out = [];
        _nodos.forEach((n) => {
            (n.subs || []).forEach((c) => {
                if (!c || vistas.has(String(c.id))) return;
                vistas.add(String(c.id));
                out.push({ id: String(c.id), name: String(c.name || ''), parent: String(n.id || ''), dir: true });
            });
        });
        return out;
    }

    function filtraRapido(termino) {
        const carpeta = (_qkModo === 'carpeta');
        const locales = carpeta ? carpetasEnMemoria() : archivosEnMemoria();
        if (!termino) {
            return carpeta
                ? locales.slice(0, QK_HISTORIA)
                : locales.filter((f) => f.reciente).slice(0, QK_HISTORIA);
        }
        const fold = (s) => (TS ? TS.fold(s) : String(s).toLowerCase());
        const t = fold(termino);

        const vistos = new Set(locales.map((f) => String(f.id)));
        const todos = locales.concat(_qkRemoto.filter((f) => f && !vistos.has(String(f.id))));

        const out = [];
        todos.forEach((f) => {
            const n = fold(f.name);
            const i = n.indexOf(t);
            if (i < 0) return;
            f.rango = (i === 0) ? 0 : 1;
            out.push(f);
        });
        return out.sort(ordenaRapido).slice(0, QK_TOPE);
    }

    function pintaRapido() {
        if (!_caja) return;
        const lista = _caja.querySelector('#nsft-adv-quick-lista');
        const pie = _caja.querySelector('#nsft-adv-quick-pie');
        _qkFilas = filtraRapido(_qkTermino);
        _qkSel = 0;
        lista.textContent = '';

        if (!_qkFilas.length) {
            const v = document.createElement('div');
            v.className = 'nsft-adv-quick-vacio';
            const dirVacio = (_qkModo === 'carpeta');
            v.textContent = _qkTermino
                ? i18n(dirVacio ? 'adv_quick_nada_dir' : 'adv_quick_nada',
                    dirVacio ? 'No folder with that name' : 'No file with that name')
                : i18n('adv_quick_vacio', 'Type to search the File Cabinet');
            lista.appendChild(v);
            pie.textContent = '';
            return;
        }

        _qkFilas.forEach((f, i) => lista.appendChild(filaRapida(f, i)));
        marcaRapido();
        const dir = (_qkModo === 'carpeta');
        pie.textContent = _qkTermino
            ? fmt(dir ? 'adv_quick_pie_dir' : 'adv_quick_pie',
                dir ? '$1 folders · ↑↓ to move · Enter to open'
                    : '$1 files · ↑↓ to move · Enter to open', [miles(_qkFilas.length)])
            : i18n(dir ? 'adv_quick_pie_dir_vacio' : 'adv_quick_pie_rec',
                dir ? 'Folders already loaded' : 'Recent files');
    }

    function filaRapida(f, i) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'nsft-adv-quick-fila';
        b.setAttribute('role', 'option');
        b.dataset.i = String(i);

        const fam = (_qkModo === 'carpeta') ? CARPETA : iconoArchivo(f.name, f.filetype || '');
        const ico = document.createElement('span');
        ico.className = 'nsft-adv-quick-ico ' + fam.clase;
        ico.innerHTML = fam.ico;
        b.appendChild(ico);

        const txt = document.createElement('span');
        txt.className = 'nsft-adv-quick-txt';

        const n = document.createElement('span');
        n.className = 'nsft-adv-quick-n';
        n.innerHTML = (TS && _qkTermino)
            ? TS.markHtml(f.name, _qkTermino, 'nsft-adv-quick-hl')
            : escapeHtml(f.name);
        txt.appendChild(n);

        const ruta = _cache.rutas[String(f.folder)];
        if (ruta && ruta.length) {
            const d = document.createElement('span');
            d.className = 'nsft-adv-quick-d';
            d.textContent = ruta.map((c) => c.name).join(' / ');
            txt.appendChild(d);
        }
        b.appendChild(txt);

        if (f.reciente) {
            const chip = document.createElement('span');
            chip.className = 'nsft-adv-quick-chip';
            chip.textContent = i18n('adv_quick_reciente', 'recent');
            b.appendChild(chip);
        }

        b.title = f.name;
        b.addEventListener('click', () => { _qkSel = i; abreSeleccion(); });
        b.addEventListener('mousemove', () => { if (_qkSel !== i) { _qkSel = i; marcaRapido(); } });
        return b;
    }

    function mueveRapido(d) {
        if (!_qkFilas.length) return;
        _qkSel = Math.max(0, Math.min(_qkFilas.length - 1, _qkSel + d));
        marcaRapido();
    }

    function marcaRapido() {
        const lista = _caja.querySelector('#nsft-adv-quick-lista');
        const filas = lista.querySelectorAll('.nsft-adv-quick-fila');
        for (let i = 0; i < filas.length; i++) {
            const es = (i === _qkSel);
            filas[i].classList.toggle('is-sel', es);
            if (es) { try { filas[i].scrollIntoView({ block: 'nearest' }); } catch (e) { } }
        }
    }

    function abreSeleccion() {
        const f = _qkFilas[_qkSel];
        if (!f) return;
        cierraRapido();
        if (_qkModo === 'carpeta') { acotaArbol(f.id, f.name); return; }
        if (esImagen(f.name, f.filetype || '') && f.url) {
            abrePrevia(f.id, f.name, f.url, f.filetype || '', f.folder);
            return;
        }
        abreArchivo(f.id, f.name);
    }

    function abreVecina(evento) {
        try { window.dispatchEvent(new CustomEvent(evento)); } catch (e) { }
    }

    function cablearVecinas(caja) {
        const q = caja.querySelector('#nsft-adv-sql');
        if (q) q.addEventListener('click', () => abreVecina('nsft-show-suiteql-runner'));
        const c = caja.querySelector('#nsft-adv-consola');
        if (c) c.addEventListener('click', () => abreVecina('nsft-show-suitescript-console'));
    }

    function cablearMenuModelo(caja) {
        const g = caja.querySelector('#nsft-adv-ghost');
        if (!g) return;
        g.addEventListener('contextmenu', (ev) => {
            const m = window.NSFT_GhostMenu;
            if (!m || typeof m.abre !== 'function') return;
            ev.preventDefault();
            ev.stopPropagation();
            m.abre(g);
        });
    }

    function cablearPaleta() {
        const mapa = {
            'nsft-adv-save': guardar,
            'nsft-adv-find': abreBuscar,
            'nsft-adv-goto': irALinea,
            'nsft-adv-format': formatear,
            'nsft-adv-tree': alternaArbol,
            'nsft-adv-wrap': () => _caja.querySelector('#nsft-adv-wrap').click()
        };
        Object.keys(mapa).forEach((ev) => {
            window.addEventListener(ev, () => { try { mapa[ev](); } catch (e) { } });
        });
    }

    function ponTitulo(nombre) {
        try {
            const marca = i18n('adv_titulo_marca', 'Advanced Editor · NSFT');
            document.title = nombre ? (nombre + ' — ' + marca) : marca;
        } catch (e) { }
    }

    function nombreDelFormulario(fuente) {
        try {
            const d = fuente || docActivo();
            const el = d.getElementById('sname');
            const v = el && (el.value || el.getAttribute('value'));
            if (v) return String(v).trim();
            const t = d.querySelector('.uir-record-name');
            return t ? String(t.textContent || '').trim() : '';
        } catch (e) { return ''; }
    }

    function nombreArchivo() {
        const t = tabActiva();
        if (t && t.nombre) return t.nombre;
        return nombreDelFormulario();
    }
})();
