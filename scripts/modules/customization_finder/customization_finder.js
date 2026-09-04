(function () {
    'use strict';

    const STORAGE_KEY = 'enableCustomizationFinder';
    const MODAL_ID = 'nsft-cfind-modal';
    const FETCHER_DEST = 'fetcher_cfind';
    const EXTENSION_DEST = 'extension_cfind';

    function isApplicablePage() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isHeaderlessPage
                && NSFT_RecordButtons.isHeaderlessPage()) return false;
        } catch (e) { }
        return true;
    }

    if (!isApplicablePage()) return;

    const TIPOS = [
        { kind: 'script', msg: 'cfind_t_script', icon: 'M8 6l-5 6 5 6M16 6l5 6-5 6' },
        { kind: 'wf', msg: 'cfind_t_wf', icon: 'M4 6h6v4H4zM14 14h6v4h-6zM7 10v4h7' },
        { kind: 'rec', msg: 'cfind_t_rec', icon: 'M4 5h16v14H4zM4 9h16M9 9v10' },
        { kind: 'field', msg: 'cfind_t_field', icon: 'M4 8h16v8H4zM8 8v8' },
        { kind: 'ss', msg: 'cfind_t_ss', icon: 'M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM15.5 15.5L20 20' },
        { kind: 'pdf', msg: 'cfind_t_pdf', icon: 'M6 3h8l4 4v14H6zM14 3v4h4' },
        { kind: 'file', msg: 'cfind_t_file', icon: 'M4 6a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z' },
        { kind: 'deploy', msg: 'cfind_t_deploy', icon: 'M12 3v12M8 11l4 4 4-4M5 19h14' },
        { kind: 'list', msg: 'cfind_t_list', icon: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01' }
    ];

    const STATUS_TONE = {
        RELEASED: 'ok',
        TESTING: 'warn',
        NOTSCHEDULED: 'off',
        NOTINITIATING: 'off',
        SUSPENDED: 'off'
    };

    let _on = true;
    let _modal = null;
    let _backdrop = null;
    let _token = 0;
    let _fetcherInjected = false;

    let _datos = {};
    let _cargando = {};
    let _filtros = {};
    let _sort = 'label';
    let _dir = 1;
    let _sel = null;
    let _lastTerm = '';
    let _toastTimer = null;
    let _liveTimer = 0;

    function i18n(key, fallback, subs) {
        let out = '';
        try { out = chrome.i18n.getMessage(key, subs) || ''; } catch (e) { out = ''; }
        if (!out) {
            out = fallback;
            (subs || []).forEach((v, idx) => { out = out.split('$' + (idx + 1)).join(String(v)); });
        }
        return out;
    }

    chrome.storage.local.get({ [STORAGE_KEY]: true }, (items) => {
        _on = !!items[STORAGE_KEY];
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.nsftTheme) {
            const modo = changes.nsftTheme.newValue === 'dark' ? 'dark' : 'light';
            const fondo = document.getElementById(MODAL_ID);
            if (fondo) {
                fondo.setAttribute('data-theme', modo);
                const dentro = fondo.querySelector('.nsft-modal');
                if (dentro) dentro.setAttribute('data-theme', modo);
            }
        }
        if (!changes[STORAGE_KEY]) return;
        _on = !!changes[STORAGE_KEY].newValue;
        if (!_on) cerrar();
    });

    window.addEventListener('nsft-show-customization-finder', () => {
        if (!_on) return;
        if (_modal) { cerrar(); return; }
        abrir();
        if (window.NSFT_ShortcutCoach) window.NSFT_ShortcutCoach.hint('customization_finder');
    });

    if (window.NSFT_Shortcuts && window.NSFT_Shortcuts.bind) {
        window.NSFT_Shortcuts.bind('customization_finder', {
            label: i18n('enableCustomizationFinderLabel', 'Customization Finder'),
            defaultCombo: { ctrlKey: false, shiftKey: true, altKey: true, code: 'KeyC' },
            storageKey: 'customizationFinderShortcut',
            event: 'nsft-show-customization-finder',
            group: i18n('cheatsheet_group_global', 'Global'),
            order: 48,
            isEnabled: () => _on
        });
    }


    function resolveTheme() {
        try {
            return document.documentElement.getAttribute('data-nsft-theme') === 'dark' ? 'dark' : 'light';
        } catch (e) { return 'light'; }
    }

    function svg(d, sw) {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 1.7) + '" '
            + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
    }

    function filaKey(it) { return it.kind + '\u0000' + (it.sid || '') + '\u0000' + it.id; }

    function abrir() {
        const T = {
            title: 'NetSuite Full Tools - ' + i18n('enableCustomizationFinderLabel', 'Customization Finder'),
            search: i18n('cfind_search', 'Search'),
            close: i18n('sql_close', 'Close'),
            clear: i18n('sql_find_clear', 'Clear search'),
            exportCsv: i18n('cfind_export_csv', 'Export CSV')
        };

        const chips = TIPOS.map((t) => `
            <button type="button" class="nsft-cfind-tab" data-kind="${t.kind}" aria-pressed="false">
                <span class="nsft-cfind-tab-label">${escapeHtml(i18n(t.msg, t.kind))}</span>
                <span class="nsft-cfind-tab-count" data-count="${t.kind}"></span>
            </button>`).join('');

        const cols = [
            ['label', i18n('cfind_col_name', 'Name')],
            ['kindDetail', i18n('cfind_col_kind', 'Type')],
            ['sid', i18n('cfind_col_sid', 'Internal ID')],
            ['status', i18n('cfind_col_status', 'Status')]
        ].map(([k, l]) => `<button type="button" class="nsft-cfind-th" data-sort="${k}">${escapeHtml(l)}<span class="nsft-cfind-arrow"></span></button>`).join('');

        const wrap = document.createElement('div');
        wrap.innerHTML = `
        <div id="${MODAL_ID}" class="nsft-modal-backdrop" data-theme="${resolveTheme()}">
        <div class="nsft-modal nsft-modal--dialog nsft-cfind" data-nsft-ui data-theme="${resolveTheme()}"
             tabindex="-1" role="dialog" aria-modal="true" aria-label="${escapeHtml(T.title)}">
            <div class="nsft-modal-header">
                <span class="nsft-modal-title">${svg('M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM15.5 15.5L20 20')}<span>${escapeHtml(T.title)}</span></span>
                <span class="nsft-header-actions">
                    <button type="button" id="nsft-cfind-close" class="nsft-modal-btn-close" title="${escapeHtml(T.close)}">✕</button>
                </span>
                <div class="nsft-modal-header-line"></div>
            </div>

            
            <div class="nsft-cfind-topbar">
                <div class="nsft-cfind-searchbar" id="nsft-cfind-searchbar">
                    <span class="nsft-cfind-searchicon">${svg('M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM15.5 15.5L20 20', 2)}</span>
                    <input type="text" id="nsft-cfind-q" spellcheck="false" autocomplete="off">
                    <button type="button" class="nsft-cfind-clearbtn" id="nsft-cfind-clear" title="${escapeHtml(T.clear)}" aria-label="${escapeHtml(T.clear)}">${svg('M6 6l12 12M18 6L6 18', 2.4)}</button>
                    <button type="button" id="nsft-cfind-go">${escapeHtml(T.search)}</button>
                </div>
                <button type="button" class="nsft-cfind-btn" id="nsft-cfind-export" title="${escapeHtml(T.exportCsv)}">
                    ${svg('M12 4v10M8 11l4 4 4-4M5 20h14', 1.9)}<span>${escapeHtml(i18n('cfind_export', 'Export'))}</span>
                </button>
            </div>

            
            <div class="nsft-cfind-tabs" role="group" aria-label="${escapeHtml(i18n('cfind_filters', 'Filters'))}">${chips}</div>

            <div class="nsft-cfind-body">
                <div class="nsft-cfind-main">
                    <div class="nsft-cfind-gridrow nsft-cfind-thead">
                        ${cols}
                        <span></span>
                    </div>
                    <div class="nsft-cfind-results" id="nsft-cfind-results" role="listbox"></div>
                </div>
            </div>

            <div class="nsft-cfind-statusbar">
                <span class="nsft-cfind-live"></span>
                <span class="nsft-cfind-statusline" id="nsft-cfind-statusline"></span>
                <span class="nsft-cfind-spacer"></span>
                <span class="nsft-cfind-toast" id="nsft-cfind-toast"></span>
                <span class="nsft-cfind-hints">${escapeHtml(i18n('cfind_hints', '↑↓ · ↵ open · Ctrl+C copy · Esc close'))}</span>
            </div>
        </div>
        </div>`;
        _backdrop = wrap.firstElementChild;
        _modal = _backdrop.firstElementChild;
        document.body.appendChild(_backdrop);

        wire();
        const q = _modal.querySelector('#nsft-cfind-q');
        if (q) q.placeholder = i18n('cfind_ph', 'Search by name or ID…');
        pintarResultados();
        if (q) q.focus();
    }

    function cerrar() {
        if (_backdrop && _backdrop.parentNode) _backdrop.parentNode.removeChild(_backdrop);
        _backdrop = null;
        _modal = null;
        _datos = {};
        _cargando = {};
        _sel = null;
        _token++;
    }

    function wire() {
        _modal.querySelector('#nsft-cfind-close').addEventListener('click', cerrar);
        _modal.querySelector('#nsft-cfind-go').addEventListener('click', () => {
            clearTimeout(_liveTimer);
            lanzarBusquedas(termino());
        });

        _backdrop.addEventListener('click', (e) => {
            if (e.target === _backdrop) cerrar();
        });

        _modal.querySelector('.nsft-cfind-tabs').addEventListener('click', (e) => {
            const b = e.target.closest('.nsft-cfind-tab');
            if (!b) return;
            const k = b.dataset.kind;
            _filtros[k] = !_filtros[k];
            b.classList.toggle('is-on', _filtros[k]);
            b.setAttribute('aria-pressed', String(!!_filtros[k]));
            pintarResultados();
        });

        _modal.querySelector('.nsft-cfind-thead').addEventListener('click', (e) => {
            const th = e.target.closest('.nsft-cfind-th');
            if (!th) return;
            const k = th.dataset.sort;
            _dir = _sort === k ? -_dir : 1;
            _sort = k;
            pintarResultados();
        });

        const q = _modal.querySelector('#nsft-cfind-q');
        q.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); clearTimeout(_liveTimer); lanzarBusquedas(termino()); }
        });

        const vivir = () => {
            clearTimeout(_liveTimer);
            _liveTimer = setTimeout(() => {
                if (!_modal) return;
                if (termino() === _lastTerm) return;
                lanzarBusquedas(termino());
            }, 350);
        };
        q.addEventListener('input', () => {
            _modal.querySelector('#nsft-cfind-searchbar').classList.toggle('has-query', !!q.value);
            vivir();
        });
        _modal.querySelector('#nsft-cfind-clear').addEventListener('click', () => {
            q.value = '';
            _modal.querySelector('#nsft-cfind-searchbar').classList.remove('has-query');
            q.focus();
            vivir();
        });

        _modal.querySelector('#nsft-cfind-export').addEventListener('click', () => exportarCsv(visibles()));

        _modal.querySelector('#nsft-cfind-results').addEventListener('click', (e) => {
            const copyBtn = e.target.closest('[data-copy]');
            if (copyBtn) {
                copiar(copyBtn.dataset.copy, i18n('cfind_copied_id', 'ID copied: $1', [copyBtn.dataset.copy]));
                return;
            }
            if (e.target.closest('a[href]')) return;
            const row = e.target.closest('.nsft-cfind-row');
            if (row && row.dataset.url) window.location.href = row.dataset.url;
        });

        _modal.addEventListener('keydown', (e) => {
            const mod = e.ctrlKey || e.metaKey;
            if (mod && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                q.focus(); q.select();
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                if (_sel) { _sel = null; pintarResultados(); return; }
                cerrar();
                return;
            }
            const list = visibles();
            if (!list.length) return;
            let idx = -1;
            for (let i = 0; i < list.length; i++) { if (filaKey(list[i]) === _sel) { idx = i; break; } }

            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                if (document.activeElement === q && !_sel && e.key === 'ArrowUp') return;
                e.preventDefault();
                const next = Math.max(0, Math.min(list.length - 1, (idx < 0 ? -1 : idx) + (e.key === 'ArrowDown' ? 1 : -1)));
                _sel = filaKey(list[next]);
                pintarResultados();
                revelarFila();
                return;
            }
            if (e.key === 'Enter' && idx > -1 && document.activeElement !== q) {
                const it = list[idx];
                if (it.url) window.location.href = it.url;
                return;
            }
            if (mod && e.key.toLowerCase() === 'c' && idx > -1 && !String(window.getSelection()).length) {
                const it = list[idx];
                copiar(it.sid || it.id, i18n('cfind_copied_id', 'ID copied: $1', [it.sid || it.id]));
            }
        });
    }

    function termino() {
        const q = _modal && _modal.querySelector('#nsft-cfind-q');
        return q ? String(q.value || '').trim() : '';
    }

    function toast(txt) {
        const t = _modal && _modal.querySelector('#nsft-cfind-toast');
        if (!t) return;
        t.textContent = txt;
        clearTimeout(_toastTimer);
        _toastTimer = setTimeout(() => { t.textContent = ''; }, 2200);
    }


    function ensureBridge() {
        if (_fetcherInjected) return;
        _fetcherInjected = true;
        try {
            if (window.NSFT_SuiteQLRest && window.NSFT_SuiteQLRest.ensureTransport) {
                window.NSFT_SuiteQLRest.ensureTransport();
            }
            if (!document.getElementById('nsft-text-search-mw')) {
                const ts = document.createElement('script');
                ts.id = 'nsft-text-search-mw';
                ts.async = false;
                ts.src = chrome.runtime.getURL('scripts/modules/_shared/nsft_text_search.js');
                ts.onload = function () { this.remove(); };
                (document.head || document.documentElement).appendChild(ts);
            }
            const s = document.createElement('script');
            s.id = 'nsft-cfind-fetcher';
            s.async = false;
            s.src = chrome.runtime.getURL('scripts/modules/customization_finder/customization_finder_fetcher.js');
            s.onload = function () { this.remove(); };
            (document.head || document.documentElement).appendChild(s);
        } catch (e) {
            const line = _modal && _modal.querySelector('#nsft-cfind-statusline');
            if (line) line.textContent = i18n('cfind_error', 'The account could not be queried.');
        }
    }

    function lanzarBusquedas(term) {
        if (!_modal) return;
        _token++;
        _lastTerm = term;
        _sel = null;
        _datos = {};
        _cargando = {};
        TIPOS.forEach((t) => {
            const count = _modal.querySelector('[data-count="' + t.kind + '"]');
            if (count) count.textContent = '';
        });
        if (term) {
            ensureBridge();
            TIPOS.forEach((t) => buscarTipo(t.kind, term));
        }
        pintarResultados();
    }

    function buscarTipo(kind, term) {
        _cargando[kind] = true;
        window.postMessage({
            dest: FETCHER_DEST,
            type: 'find',
            payload: { kind: kind, term: term, token: _token }
        }, '*');
    }

    window.addEventListener('message', (e) => {
        if (e.source !== window) return;
        const d = e.data;
        if (!d || typeof d !== 'object' || d.dest !== EXTENSION_DEST || d.type !== 'results') return;
        const p = d.payload || {};
        if (p.token !== _token) return;
        if (!_modal) return;

        _cargando[p.kind] = false;
        if (p.error) {
            _datos[p.kind] = [];
            toast(p.error.code === 'stale'
                ? i18n('cfind_stale', 'Reload the tab and try again.')
                : i18n('cfind_error', 'The account could not be queried.'));
        } else {
            _datos[p.kind] = (p.items || []).map((it) => { it.kind = p.kind; return it; });
        }
        const count = _modal.querySelector('[data-count="' + p.kind + '"]');
        if (count) count.textContent = (_datos[p.kind] || []).length ? String(_datos[p.kind].length) : '';
        pintarResultados();
    });


    function filtroActivo() {
        return TIPOS.some((t) => _filtros[t.kind]);
    }

    function tiposVisibles() {
        const hay = filtroActivo();
        return TIPOS.filter((t) => !hay || _filtros[t.kind]);
    }

    function grupoOrdenado(kind) {
        const list = (_datos[kind] || []).slice();
        const k = _sort;
        list.sort((a, b) => String(a[k] || '').localeCompare(String(b[k] || '')) * _dir);
        return list;
    }

    function visibles() {
        const out = [];
        tiposVisibles().forEach((t) => { grupoOrdenado(t.kind).forEach((it) => out.push(it)); });
        return out;
    }

    function badgeHtml(status) {
        if (!status) return '<span></span>';
        const tone = STATUS_TONE[String(status).toUpperCase().replace(/\s+/g, '')] || '';
        return '<span class="nsft-cfind-badge' + (tone ? ' is-' + tone : '') + '">' + escapeHtml(status) + '</span>';
    }

    function pintarResultados() {
        if (!_modal) return;
        const res = _modal.querySelector('#nsft-cfind-results');

        _modal.querySelectorAll('.nsft-cfind-th').forEach((th) => {
            const on = th.dataset.sort === _sort;
            th.classList.toggle('is-on', on);
            th.querySelector('.nsft-cfind-arrow').textContent = on ? (_dir === 1 ? '↑' : '↓') : '';
        });

        const TS = window.NSFT_TextSearch;
        const hl = (txt) => (TS && _lastTerm)
            ? TS.markHtml(txt, _lastTerm, 'nsft-cfind-hl')
            : escapeHtml(txt);

        res.innerHTML = '';
        const frag = document.createDocumentFragment();
        let totalFilas = 0;
        let cargandoAlgo = false;
        let zebra = 0;

        tiposVisibles().forEach((t) => {
            const filas = grupoOrdenado(t.kind);
            const cargando = !!_cargando[t.kind];
            if (cargando) cargandoAlgo = true;

            if (!filas.length && !cargando) return;

            const head = document.createElement('div');
            head.className = 'nsft-cfind-cat';
            head.innerHTML = '<span class="nsft-cfind-cat-icon">' + svg(t.icon) + '</span>'
                + '<span>' + escapeHtml(i18n(t.msg, t.kind)) + '</span>'
                + (filas.length ? '<span class="nsft-cfind-cat-n">' + filas.length + '</span>' : '')
                + (cargando ? '<span class="nsft-cfind-cat-loading">' + escapeHtml(i18n('cfind_loading', 'Searching the account…')) + '</span>' : '');
            frag.appendChild(head);

            filas.forEach((it) => {
                totalFilas++;
                const k = filaKey(it);
                const active = _sel === k;
                const row = document.createElement('div');
                row.className = 'nsft-cfind-row nsft-cfind-gridrow'
                    + (active ? ' is-active' : (zebra++ % 2 ? ' is-zebra' : ''))
                    + (it.url ? '' : ' is-nolink');
                row.dataset.key = k;
                if (it.url) row.dataset.url = it.url;
                row.setAttribute('role', 'option');
                row.setAttribute('aria-selected', String(active));

                let acciones = '<span class="nsft-cfind-rowbtns">';
                acciones += '<button type="button" class="nsft-cfind-copy" data-copy="' + escapeHtml(it.sid || it.id) + '" title="'
                    + escapeHtml(i18n('cfind_copy_id', 'Copy ID')) + '">' + svg('M9 9h10v10H9zM5 15V5h10', 1.8) + '</button>';
                if (it.url) {
                    acciones += '<a class="nsft-cfind-rowbtn" href="' + escapeHtml(it.url) + '">'
                        + escapeHtml(i18n('cfind_open', 'Open')) + '</a>';
                }
                if (it.urlList) {
                    acciones += '<a class="nsft-cfind-rowbtn" href="' + escapeHtml(it.urlList) + '">'
                        + escapeHtml(i18n('cfind_open_list', 'List')) + '</a>';
                }
                acciones += '</span>';

                const nombre = it.url
                    ? '<a class="nsft-cfind-name" href="' + escapeHtml(it.url) + '">'
                        + svg(t.icon) + '<span>' + hl(it.label) + '</span></a>'
                    : '<span class="nsft-cfind-name">' + svg(t.icon) + '<span>' + hl(it.label) + '</span></span>';

                row.innerHTML =
                    nombre
                    + '<span class="nsft-cfind-kind">' + escapeHtml(it.kindDetail || '') + '</span>'
                    + '<span class="nsft-cfind-sid">' + hl(it.sid || it.id) + '</span>'
                    + badgeHtml(it.status)
                    + acciones;
                frag.appendChild(row);
            });
        });

        if (!totalFilas && !cargandoAlgo) {
            const empty = document.createElement('div');
            empty.className = 'nsft-cfind-empty';
            empty.textContent = _lastTerm
                ? i18n('cfind_none', 'Nothing found with that name.')
                : i18n('cfind_ph', 'Search by name or ID…');
            frag.appendChild(empty);
        }

        res.appendChild(frag);
        estadoLinea(totalFilas, cargandoAlgo);
    }

    function estadoLinea(total, cargando) {
        const line = _modal && _modal.querySelector('#nsft-cfind-statusline');
        if (!line) return;
        if (cargando) {
            line.textContent = i18n('cfind_loading', 'Searching the account…');
            return;
        }
        line.textContent = total
            ? i18n('cfind_results_n', '$1 results', [String(total)]) + (_lastTerm ? ' · “' + _lastTerm + '”' : '')
            : '';
    }

    function revelarFila() {
        const res = _modal.querySelector('#nsft-cfind-results');
        const row = res.querySelector('.nsft-cfind-row.is-active');
        if (!row) return;
        const top = row.offsetTop, bottom = top + row.offsetHeight;
        if (top < res.scrollTop) res.scrollTop = top;
        else if (bottom > res.scrollTop + res.clientHeight) res.scrollTop = bottom - res.clientHeight;
    }


    function copiar(texto, aviso) {
        const done = () => toast(aviso);
        if (window.NSFT_Clipboard && window.NSFT_Clipboard.copy) {
            window.NSFT_Clipboard.copy(texto, { onSuccess: done });
        } else {
            try { navigator.clipboard.writeText(texto).then(done); } catch (e) { }
        }
    }

    function exportarCsv(lista) {
        if (!lista.length) { toast(i18n('cfind_none', 'Nothing found with that name.')); return; }
        const head = [
            i18n('cfind_col_name', 'Name'), i18n('cfind_col_sid', 'Internal ID'),
            i18n('cfind_col_kind', 'Type'), i18n('cfind_col_status', 'Status'), 'URL'
        ];
        const cell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
        const lines = [head.map(cell).join(',')];
        lista.forEach((it) => {
            lines.push([it.label, it.sid || it.id, it.kindDetail || '', it.status || '', it.url || ''].map(cell).join(','));
        });
        const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'nsft-personalizaciones-' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 100);
        toast(i18n('cfind_exported', '$1 rows exported', [String(lista.length)]));
    }


    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
})();
