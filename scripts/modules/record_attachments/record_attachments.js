(function () {
    'use strict';
    if (!/^\/app\//.test(window.location.pathname)) return;
    if (window.NSFT_Herramientas) window.NSFT_Herramientas.vigila('.nsft-rattach-panel', 'attach');

    const STORAGE_KEY = 'enableRecordAttachments';
    const NSFT_THEME_KEY = 'nsftTheme';
    const PANEL_ID = 'nsft-rattach-panel';
    const OVERLAY_ID = 'nsft-rattach-overlay';
    const FETCHER_PATH = 'scripts/modules/record_attachments/record_attachments_fetcher.js';
    const EVENTO = 'nsft-show-record-attachments';

    const MAX_PREVIA = 5 * 1024 * 1024;
    const MAX_TEXTO = 500 * 1024;
    const MAX_FILAS = 500;

    let _theme = 'light';
    let _enabled = false;

    const CODE_THEME_KEY = 'logPrettierTheme';
    let _codeTheme = 'auto';

    chrome.storage.local.get({ [STORAGE_KEY]: true, [NSFT_THEME_KEY]: 'light', [CODE_THEME_KEY]: 'auto' }, (items) => {
        _theme = items[NSFT_THEME_KEY] || 'light';
        _codeTheme = items[CODE_THEME_KEY] || 'auto';
        if (items[STORAGE_KEY]) activate();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[STORAGE_KEY]) {
            if (changes[STORAGE_KEY].newValue) activate();
            else deactivate();
        }
        if (changes[CODE_THEME_KEY]) _codeTheme = changes[CODE_THEME_KEY].newValue || 'auto';
        if (changes[NSFT_THEME_KEY]) {
            _theme = changes[NSFT_THEME_KEY].newValue || 'light';
            [OVERLAY_ID, PANEL_ID].forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.setAttribute('data-theme', resolveTheme());
            });
        }
    });

    function resolveTheme() { return _theme === 'dark' ? 'dark' : 'light'; }

    function onOpenEvent() { open(); }

    function activate() {
        _enabled = true;
        window.NSFT_RecordAttachments = { open: open };
        window.removeEventListener(EVENTO, onOpenEvent);
        window.addEventListener(EVENTO, onOpenEvent);
    }

    function deactivate() {
        _enabled = false;
        window.removeEventListener(EVENTO, onOpenEvent);
        try { delete window.NSFT_RecordAttachments; } catch (e) { window.NSFT_RecordAttachments = undefined; }
        close();
    }


    function i18n(key, fallback, subs) {
        let out = '';
        try { out = chrome.i18n.getMessage(key, subs) || ''; } catch (e) { out = ''; }
        if (!out) {
            out = fallback;
            (subs || []).forEach((v, i) => { out = out.split('$' + (i + 1)).join(String(v)); });
        }
        return out;
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    function toast(msg, type) {
        if (window.NSFT_Clipboard && window.NSFT_Clipboard.showToast) window.NSFT_Clipboard.showToast(msg, { type: type || 'info' });
    }

    function recordId() {
        let id = '';
        try { id = new URLSearchParams(location.search).get('id') || ''; } catch (e) { id = ''; }
        return /^\d+$/.test(id) ? id : '';
    }

    function lang() {
        try { return chrome.i18n.getUILanguage(); } catch (e) { return undefined; }
    }

    function tamano(kb) {
        const n = Number(kb);
        if (!isFinite(n) || n <= 0) return '';
        if (n < 1024) return Math.max(1, Math.round(n)).toLocaleString(lang()) + ' KB';
        return (n / 1024).toLocaleString(lang(), { maximumFractionDigits: 1 }) + ' MB';
    }

    function urlSegura(u) {
        if (!u) return '';
        try {
            const x = new URL(u, location.origin);
            return x.origin === location.origin ? x.href : '';
        } catch (e) { return ''; }
    }


    const IMAGEN = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico', 'avif'];
    const AUDIO = ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac'];
    const VIDEO = ['mp4', 'webm', 'mov', 'm4v', 'ogv'];
    const TEXTO = ['txt', 'json', 'xml', 'js', 'mjs', 'cjs', 'ts', 'css', 'scss', 'less', 'html', 'htm', 'xhtml', 'sql', 'log',
        'md', 'markdown', 'ftl', 'xsl', 'xslt', 'xsd', 'yml', 'yaml', 'ini', 'cfg', 'conf', 'properties', 'jsonl', 'ndjson', 'edi', 'prn'];
    const HOJA = ['xlsx', 'xlsm'];
    const TABLA = ['csv', 'tsv'];

    const POR_TIPO_NS = {
        PDF: 'pdf', PNGIMAGE: 'png', JPGIMAGE: 'jpg', GIFIMAGE: 'gif', BMPIMAGE: 'bmp', SVG: 'svg', ICON: 'ico',
        PLAINTEXT: 'txt', CSV: 'csv', XMLDOC: 'xml', JAVASCRIPT: 'js', JSON: 'json', HTMLDOC: 'html',
        STYLESHEET: 'css', MP3: 'mp3', MPEGMOVIE: 'mp4', QUICKTIME: 'mov'
    };

    function extension(f) {
        const m = /\.([a-z0-9]{1,10})$/i.exec(String(f.name || ''));
        if (m) return m[1].toLowerCase();
        return POR_TIPO_NS[String(f.filetype || '').toUpperCase()] || '';
    }

    function clase(ext) {
        if (ext === 'pdf') return 'pdf';
        if (IMAGEN.indexOf(ext) !== -1) return 'imagen';
        if (AUDIO.indexOf(ext) !== -1) return 'audio';
        if (VIDEO.indexOf(ext) !== -1) return 'video';
        if (HOJA.indexOf(ext) !== -1) return 'hoja';
        if (TABLA.indexOf(ext) !== -1) return 'tabla';
        if (TEXTO.indexOf(ext) !== -1) return 'texto';
        return '';
    }

    let _fetcher = 'none';
    const _cola = [];
    const _espera = {};
    let _seq = 0;

    window.addEventListener('message', (e) => {
        if (e.source !== window) return;
        const d = e.data;
        if (!d || d.dest !== 'extension_rattach' || !d.reqId) return;
        const cb = _espera[d.reqId];
        if (cb) { delete _espera[d.reqId]; cb(d.payload); }
    });

    function cargaFetcher() {
        if (_fetcher !== 'none') return;
        _fetcher = 'loading';
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
                if (_fetcher !== 'ready') { resolve({ error: 'nofetcher' }); return; }
                const reqId = 'rattach' + (++_seq) + '_' + Date.now();
                const t = setTimeout(() => { delete _espera[reqId]; resolve({ error: 'timeout' }); }, plazo);
                _espera[reqId] = (p) => { clearTimeout(t); resolve(p || { error: 'empty' }); };
                window.postMessage({ dest: 'fetcher_rattach', type, reqId, payload: payload || {} }, '*');
            };
            if (_fetcher === 'ready' || _fetcher === 'error') enviar();
            else {
                _cola.push(enviar);
                cargaFetcher();
                setTimeout(() => {
                    const i = _cola.indexOf(enviar);
                    if (i !== -1) { _cola.splice(i, 1); resolve({ error: 'nofetcher' }); }
                }, 10000);
            }
        });
    }


    const ICO = {
        clip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.4 11.1l-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"></path></svg>',
        abrir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>',
        bajar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>'
    };

    let _files = [];
    let _sel = -1;
    let _turno = 0;

    function tool(cls, ico, color, label) {
        return '<button type="button" class="nsft-modal-tool ' + cls + '" title="' + esc(label) + '">'
            + '<span class="nsft-modal-tc ' + color + '">' + ico + '</span><span>' + esc(label) + '</span></button>';
    }

    function vacio(icono, txt, accion) {
        const H = window.NSFT_Herramientas;
        if (H && H.vacio) return H.vacio(icono, txt, '', accion || '');
        return '<div class="nsft-rattach-estado">' + esc(txt) + (accion || '') + '</div>';
    }

    function accionAbrir() {
        return '<button type="button" class="nsft-vacio-accion nsft-rattach-abrir">' + esc(i18n('ra_open', 'Open in new tab')) + '</button>';
    }

    function cargando(txt) {
        return '<div class="nsft-rattach-cargando"><span class="nsft-rattach-spin" aria-hidden="true"></span>' + esc(txt) + '</div>';
    }

    function open() {
        if (!_enabled) return;
        if (window.NSFT_RecordButtons && window.NSFT_RecordButtons.isExcludedPage && window.NSFT_RecordButtons.isExcludedPage()) return;
        const id = recordId();
        if (!id) {
            toast(i18n('ra_not_record', 'Open a saved record to see its attachments.'), 'info');
            return;
        }
        close();
        _files = [];
        _sel = -1;

        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.className = 'nsft-rattach-overlay nsft-modal-backdrop';
        overlay.setAttribute('data-theme', resolveTheme());
        overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });

        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.className = 'nsft-rattach-panel nsft-modal nsft-modal--dialog';
        panel.setAttribute('data-theme', resolveTheme());
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');

        panel.innerHTML = '<div class="nsft-modal-header">'
            + '<span class="nsft-modal-title">' + ICO.clip + esc(i18n('enableRecordAttachmentsLabel', 'Record attachments')) + '</span>'
            + '<div class="nsft-modal-tools nsft-modal-hide-min">'
            + tool('nsft-rattach-open', ICO.abrir, 'nsft-c2', i18n('ra_open', 'Open in new tab'))
            + tool('nsft-modal-tool--exportar nsft-rattach-dl', ICO.bajar, 'nsft-c1', i18n('ra_download', 'Download'))
            + '</div>'
            + '<div class="nsft-header-actions">'
            + '<button type="button" class="nsft-modal-btn-close nsft-rattach-x" aria-label="' + esc(i18n('ra_close', 'Close')) + '" title="' + esc(i18n('ra_close', 'Close')) + '">✕</button>'
            + '</div>'
            + '</div>'
            + '<div class="nsft-rattach-body"></div>';

        overlay.appendChild(panel);
        (document.body || document.documentElement).appendChild(overlay);
        document.addEventListener('keydown', onKey, true);

        panel.querySelector('.nsft-rattach-x').addEventListener('click', close);
        panel.querySelector('.nsft-rattach-open').addEventListener('click', abrirActual);
        panel.querySelector('.nsft-rattach-dl').addEventListener('click', bajarActual);
        panel.addEventListener('click', (e) => {
            if (e.target.closest && e.target.closest('.nsft-rattach-abrir')) abrirActual();
        });
        botones(panel);

        const cuerpo = panel.querySelector('.nsft-rattach-body');
        cuerpo.innerHTML = cargando(i18n('ra_loading', 'Looking for attachments…'));
        pide('files', { recId: id }, 30000).then((r) => {
            if (!panel.isConnected) return;
            if (!r || r.error) {
                const sinUnion = r && r.error === 'nojoin';
                cuerpo.innerHTML = vacio('aviso', sinUnion
                    ? i18n('ra_unsupported', "Attachments can't be listed. NetSuite doesn't allow searching the files of this record type.")
                    : i18n('ra_error', "Couldn't load the attachments. Reload the page and try again."));
                return;
            }
            _files = (r.files || []).filter((f) => f && f.id);
            if (!_files.length) {
                cuerpo.innerHTML = vacio('carpeta', i18n('ra_none', 'No attachments. This record has no files attached.'));
                return;
            }
            pintaLista(cuerpo, !!r.tope);
            elige(0);
        });
    }

    function actual() { return _sel >= 0 ? _files[_sel] : null; }

    function botones(panel) {
        const p = panel || document.getElementById(PANEL_ID);
        if (!p) return;
        const f = actual();
        const ok = !!(f && urlSegura(f.url));
        p.querySelectorAll('.nsft-rattach-open, .nsft-rattach-dl').forEach((b) => { b.disabled = !ok; });
    }

    function abrirActual() {
        const f = actual();
        const u = f && urlSegura(f.url);
        if (u) window.open(u, '_blank', 'noopener');
    }

    function bajarActual() {
        const f = actual();
        const u = f && urlSegura(f.url);
        if (!u) return;
        const a = document.createElement('a');
        a.href = u;
        a.download = f.name || 'file';
        a.rel = 'noopener';
        a.style.display = 'none';
        (document.body || document.documentElement).appendChild(a);
        a.click();
        a.remove();
    }

    function pintaLista(cuerpo, tope) {
        const n = _files.length;
        const cuenta = n === 1 ? i18n('ra_count_1', '1 file') : i18n('ra_count_n', '$1 files', [String(n)]);
        const filas = _files.map((f, i) => {
            const ext = extension(f);
            const chip = ext || String(f.filetypeText || f.filetype || '').toLowerCase();
            const meta = [tamano(f.sizeKb), f.modified].filter(Boolean).map(esc).join(' · ');
            return '<button type="button" class="nsft-rattach-item" role="option" aria-selected="false" data-i="' + i + '" title="' + esc(f.name) + '">'
                + '<span class="nsft-rattach-nombre">' + esc(f.name || ('#' + f.id)) + '</span>'
                + '<span class="nsft-rattach-meta">'
                + (chip ? '<span class="nsft-tipo">' + esc(chip) + '</span>' : '')
                + (meta ? '<span class="nsft-rattach-dato">' + meta + '</span>' : '')
                + '</span>'
                + '</button>';
        }).join('');
        cuerpo.innerHTML = '<div class="nsft-rattach-grid">'
            + '<div class="nsft-rattach-lado">'
            + '<div class="nsft-rattach-total">' + esc(cuenta)
            + (tope ? ' · ' + esc(i18n('ra_capped', 'showing the first $1', [String(n)])) : '')
            + '</div>'
            + '<div class="nsft-rattach-lista" role="listbox" aria-label="' + esc(i18n('enableRecordAttachmentsLabel', 'Record attachments')) + '">' + filas + '</div>'
            + '</div>'
            + '<div class="nsft-rattach-vista"></div>'
            + '</div>';
        const lista = cuerpo.querySelector('.nsft-rattach-lista');
        lista.addEventListener('click', (e) => {
            const b = e.target.closest('.nsft-rattach-item');
            if (b) elige(Number(b.getAttribute('data-i')));
        });
        lista.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            e.preventDefault();
            const sig = Math.min(_files.length - 1, Math.max(0, _sel + (e.key === 'ArrowDown' ? 1 : -1)));
            elige(sig);
            const b = lista.querySelector('[data-i="' + sig + '"]');
            if (b) b.focus();
        });
    }

    function elige(i) {
        const panel = document.getElementById(PANEL_ID);
        if (!panel || !_files[i]) return;
        _sel = i;
        panel.querySelectorAll('.nsft-rattach-item').forEach((b) => {
            const si = Number(b.getAttribute('data-i')) === i;
            b.classList.toggle('is-sel', si);
            b.setAttribute('aria-selected', si ? 'true' : 'false');
        });
        botones(panel);
        const vista = panel.querySelector('.nsft-rattach-vista');
        if (vista) previa(vista, _files[i]);
    }


    function previa(vista, f) {
        const turno = ++_turno;
        const vigente = () => turno === _turno && vista.isConnected;
        const url = urlSegura(f.url);
        const ext = extension(f);
        const tipo = clase(ext);
        vista.className = 'nsft-rattach-vista';

        if (!url) {
            vista.innerHTML = vacio('aviso', i18n('ra_load_error', "Couldn't load the file. Open it in a new tab to see it."));
            return;
        }
        if (!tipo) {
            vista.innerHTML = vacio('info', i18n('ra_no_preview', "No preview. This file type can't be shown here: open or download it."), accionAbrir());
            return;
        }
        const kb = Number(f.sizeKb);
        if (isFinite(kb) && kb * 1024 > MAX_PREVIA) {
            vista.innerHTML = vacio('info', i18n('ra_too_big', "Too large to preview. It's over 5 MB: open or download it."), accionAbrir());
            return;
        }

        if (tipo === 'pdf') {
            vista.classList.add('is-embed');
            vista.innerHTML = '<iframe class="nsft-rattach-frame" src="' + esc(url) + '" title="' + esc(f.name) + '"></iframe>';
            return;
        }
        if (tipo === 'imagen') {
            vista.classList.add('is-imagen');
            vista.innerHTML = '<img class="nsft-rattach-img" src="' + esc(url) + '" alt="' + esc(f.name) + '">';
            return;
        }
        if (tipo === 'audio' || tipo === 'video') {
            vista.classList.add('is-media');
            vista.innerHTML = '<' + tipo + ' class="nsft-rattach-media" controls preload="metadata" src="' + esc(url) + '"></' + tipo + '>';
            return;
        }

        vista.innerHTML = cargando(i18n('ra_preview_loading', 'Loading preview…'));
        const falla = (clave) => {
            if (!vigente()) return;
            vista.className = 'nsft-rattach-vista';
            vista.innerHTML = clave === 'grande'
                ? vacio('info', i18n('ra_too_big', "Too large to preview. It's over 5 MB: open or download it."), accionAbrir())
                : clave === 'hoja'
                    ? vacio('aviso', i18n('ra_xlsx_error', "Couldn't read the spreadsheet. Open or download it to see it."), accionAbrir())
                    : vacio('aviso', i18n('ra_load_error', "Couldn't load the file. Open it in a new tab to see it."), accionAbrir());
        };

        fetch(url, { credentials: 'same-origin' }).then((res) => {
            if (!res.ok) throw new Error('http');
            const largo = parseInt(res.headers.get('Content-Length') || '0', 10);
            if (largo && largo > MAX_PREVIA) { falla('grande'); return null; }
            return tipo === 'hoja' ? res.arrayBuffer() : res.text();
        }).then((datos) => {
            if (datos == null || !vigente()) return;
            if (tipo === 'hoja') return pintaHoja(vista, datos, vigente).catch(() => falla('hoja'));
            if (datos.length > MAX_PREVIA) { falla('grande'); return; }
            if (tipo === 'tabla') pintaCsv(vista, datos, ext);
            else pintaTexto(vista, datos, ext);
        }).catch(() => falla(''));
    }

    function nota(txt) {
        return '<div class="nsft-rattach-nota">' + esc(txt) + '</div>';
    }

    function pintaTexto(vista, texto, ext) {
        let t = texto;
        let cortado = false;
        if (t.length > MAX_TEXTO) { t = t.slice(0, MAX_TEXTO); cortado = true; }
        const LF = window.NSFT_LogFormat;
        if (!cortado && LF && LF.renderInto) {
            try { if (LF.ensureTheme) LF.ensureTheme(_codeTheme); } catch (e) { }
            const caja = document.createElement('div');
            caja.className = 'nsft-rattach-code';
            let lang = null;
            try { lang = LF.renderInto(caja, t); } catch (e) { lang = null; }
            if (lang) {
                vista.classList.add('is-texto', 'is-code');
                vista.innerHTML = '';
                vista.appendChild(caja);
                return;
            }
        }
        if (!cortado && (ext === 'json')) {
            try { t = JSON.stringify(JSON.parse(t), null, 2); } catch (e) { }
        }
        vista.classList.add('is-texto');
        vista.innerHTML = (cortado ? nota(i18n('ra_text_cut', 'Showing the first 500 KB.')) : '')
            + '<pre class="nsft-rattach-pre"></pre>';
        vista.querySelector('.nsft-rattach-pre').textContent = t;
    }

    function separador(texto, ext) {
        if (ext === 'tsv') return '\t';
        const linea = texto.split(/\r?\n/, 1)[0] || '';
        const cuenta = { ',': 0, ';': 0, '\t': 0 };
        let dentro = false;
        for (const c of linea) {
            if (c === '"') dentro = !dentro;
            else if (!dentro && c in cuenta) cuenta[c]++;
        }
        if (cuenta[';'] > cuenta[','] && cuenta[';'] >= cuenta['\t']) return ';';
        if (cuenta['\t'] > cuenta[',']) return '\t';
        return ',';
    }

    function leeCsv(texto, sep, max) {
        const filas = [];
        let fila = [];
        let campo = '';
        let dentro = false;
        let cortado = false;
        let i = texto.charCodeAt(0) === 0xFEFF ? 1 : 0;
        for (; i < texto.length; i++) {
            const c = texto[i];
            if (dentro) {
                if (c === '"') {
                    if (texto[i + 1] === '"') { campo += '"'; i++; } else dentro = false;
                } else campo += c;
                continue;
            }
            if (c === '"') dentro = true;
            else if (c === sep) { fila.push(campo); campo = ''; }
            else if (c === '\n' || c === '\r') {
                if (c === '\r' && texto[i + 1] === '\n') i++;
                fila.push(campo); campo = '';
                filas.push(fila); fila = [];
                if (filas.length > max) { cortado = /\S/.test(texto.slice(i + 1)); break; }
            } else campo += c;
        }
        if (filas.length <= max && (campo !== '' || fila.length)) { fila.push(campo); filas.push(fila); }
        return { filas, cortado };
    }

    function pintaCsv(vista, texto, ext) {
        const r = leeCsv(texto, separador(texto, ext), MAX_FILAS);
        const filas = r.filas.filter((f) => f.some((x) => x !== ''));
        if (!filas.length) {
            vista.innerHTML = vacio('bandeja', i18n('ra_empty_file', 'Empty file. There is nothing to show.'));
            return;
        }
        const cab = filas[0];
        const cuerpo = filas.slice(1);
        const ancho = filas.reduce((m, f) => Math.max(m, f.length), 0);
        const celdas = (f, tag) => {
            let h = '';
            for (let j = 0; j < ancho; j++) h += '<' + tag + '>' + esc(f[j] == null ? '' : f[j]) + '</' + tag + '>';
            return h;
        };
        vista.classList.add('is-tabla');
        vista.innerHTML = (r.cortado ? nota(i18n('ra_rows_cut', 'Showing the first $1 rows.', [String(MAX_FILAS)])) : '')
            + '<div class="nsft-rattach-scroll"><table class="nsft-rattach-tabla">'
            + '<thead><tr>' + celdas(cab, 'th') + '</tr></thead>'
            + '<tbody>' + cuerpo.map((f) => '<tr>' + celdas(f, 'td') + '</tr>').join('') + '</tbody>'
            + '</table></div>';
    }

    function letra(n) {
        let s = '';
        n += 1;
        while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
        return s;
    }

    async function pintaHoja(vista, buf, vigente) {
        const X = window.NSFT_RAXlsx;
        if (!X) throw new Error('lector');
        const libro = await X.abre(buf);
        if (!vigente()) return;
        vista.classList.add('is-tabla');
        const selector = libro.hojas.length > 1
            ? '<label class="nsft-rattach-hoja"><span>' + esc(i18n('ra_sheet', 'Sheet')) + '</span><select class="nsft-rattach-sel">'
                + libro.hojas.map((h, i) => '<option value="' + i + '">' + esc(h) + '</option>').join('')
                + '</select></label>'
            : '';
        vista.innerHTML = (selector ? '<div class="nsft-rattach-barra">' + selector + '</div>' : '')
            + '<div class="nsft-rattach-hojacont"></div>';
        const cont = vista.querySelector('.nsft-rattach-hojacont');

        const muestra = async (i) => {
            cont.innerHTML = cargando(i18n('ra_preview_loading', 'Loading preview…'));
            const h = await libro.hoja(i, MAX_FILAS);
            if (!vigente()) return;
            if (!h.filas.length) {
                cont.innerHTML = vacio('bandeja', i18n('ra_empty_sheet', 'Empty sheet. It has no cells with data.'));
                return;
            }
            let cab = '<th class="nsft-rattach-num"></th>';
            for (let j = 0; j < h.columnas; j++) cab += '<th>' + letra(j) + '</th>';
            const filas = h.filas.map((f) => {
                let tr = '<td class="nsft-rattach-num">' + f.n + '</td>';
                for (let j = 0; j < h.columnas; j++) tr += '<td>' + esc(f.celdas[j] == null ? '' : f.celdas[j]) + '</td>';
                return '<tr>' + tr + '</tr>';
            }).join('');
            const avisos = [];
            if (h.cortado) avisos.push(i18n('ra_rows_cut', 'Showing the first $1 rows.', [String(MAX_FILAS)]));
            if (h.anchoCortado) avisos.push(i18n('ra_cols_cut', 'Showing the first 100 columns.'));
            cont.innerHTML = (avisos.length ? nota(avisos.join(' ')) : '')
                + '<div class="nsft-rattach-scroll"><table class="nsft-rattach-tabla is-hoja">'
                + '<thead><tr>' + cab + '</tr></thead><tbody>' + filas + '</tbody></table></div>';
        };

        const sel = vista.querySelector('.nsft-rattach-sel');
        if (sel) {
            sel.addEventListener('change', () => {
                muestra(Number(sel.value)).catch(() => {
                    if (vigente()) cont.innerHTML = vacio('aviso', i18n('ra_xlsx_error', "Couldn't read the spreadsheet. Open or download it to see it."), accionAbrir());
                });
            });
        }
        await muestra(0);
    }


    function onKey(e) {
        if (e.key !== 'Escape') return;
        const t = e.target;
        if (t && t.tagName === 'SELECT') {
            let abierto = false;
            try { abierto = t.matches(':open'); } catch (err) { abierto = false; }
            if (abierto) return;
        }
        e.stopPropagation();
        close();
    }

    function close() {
        const o = document.getElementById(OVERLAY_ID);
        if (o) o.remove();
        _turno++;
        _files = [];
        _sel = -1;
        document.removeEventListener('keydown', onKey, true);
    }
})();
