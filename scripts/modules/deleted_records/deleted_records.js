(function () {
    'use strict';

    const STORAGE_KEY = 'enableDeletedRecords';
    const MODAL_ID = 'nsft-delrec-modal';
    const FETCHER_DEST = 'fetcher_delrec';
    const EXTENSION_DEST = 'extension_delrec';

    function isApplicablePage() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isHeaderlessPage
                && NSFT_RecordButtons.isHeaderlessPage()) return false;
        } catch (e) { }
        return true;
    }

    if (!isApplicablePage()) return;

    const PERIODOS = [
        ['', 'delrec_period_all', 'All time'],
        ['today', 'delrec_period_today', 'Today'],
        ['d7', 'delrec_period_d7', 'Last 7 days'],
        ['d30', 'delrec_period_d30', 'Last 30 days'],
        ['d90', 'delrec_period_d90', 'Last 90 days'],
        ['y1', 'delrec_period_y1', 'Last year']
    ];

    let _on = true;
    let _modal = null;
    let _backdrop = null;
    let _token = 0;
    let _fetcherInjected = false;

    let _filas = [];
    let _cargando = false;
    let _error = null;
    let _capped = false;
    let _cap = 500;
    let _lastTerm = '';
    let _periodo = 'd7';
    let _user = null;
    let _sort = 'when';
    let _dir = -1;
    let _sel = null;
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

    window.addEventListener('nsft-show-deleted-records', () => {
        if (!_on) return;
        if (_modal) { cerrar(); return; }
        abrir();
    });


    function resolveTheme() {
        try {
            return document.documentElement.getAttribute('data-nsft-theme') === 'dark' ? 'dark' : 'light';
        } catch (e) { return 'light'; }
    }

    function svg(d, sw) {
        return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 1.7) + '" '
            + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
    }

    const ICON_TRASH = 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3';
    const ICON_SEARCH = 'M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM15.5 15.5L20 20';

    function filaKey(it) { return it.type + '\u0000' + it.id + '\u0000' + it.when; }

    function abrir() {
        const T = {
            title: 'NetSuite Full Tools - ' + i18n('enableDeletedRecordsLabel', 'Deleted Records'),
            search: i18n('delrec_search', 'Search'),
            close: i18n('sql_close', 'Close'),
            clear: i18n('sql_find_clear', 'Clear search'),
            exportCsv: i18n('delrec_export_csv', 'Export CSV'),
            period: i18n('delrec_period_label', 'Period')
        };

        const opciones = PERIODOS.map(([v, k, f]) =>
            '<option value="' + v + '"' + (v === _periodo ? ' selected' : '') + '>' + escapeHtml(i18n(k, f)) + '</option>').join('');

        const cols = [
            ['when', i18n('delrec_col_when', 'When')],
            ['name', i18n('delrec_col_name', 'Document')],
            ['type', i18n('delrec_col_type', 'Type')],
            ['id', i18n('delrec_col_id', 'ID')],
            ['user', i18n('delrec_col_user', 'Deleted by')],
            ['from', i18n('delrec_col_from', 'From')]
        ].map(([k, l]) => `<button type="button" class="nsft-delrec-th" data-sort="${k}">${escapeHtml(l)}<span class="nsft-delrec-arrow"></span></button>`).join('');

        const wrap = document.createElement('div');
        wrap.innerHTML = `
        <div id="${MODAL_ID}" class="nsft-modal-backdrop" data-theme="${resolveTheme()}">
        <div class="nsft-modal nsft-modal--dialog nsft-delrec" data-nsft-ui data-theme="${resolveTheme()}"
             tabindex="-1" role="dialog" aria-modal="true" aria-label="${escapeHtml(T.title)}">
            <div class="nsft-modal-header">
                <span class="nsft-modal-title">${svg(ICON_TRASH)}<span>${escapeHtml(T.title)}</span></span>
                <span class="nsft-header-actions">
                    <button type="button" id="nsft-delrec-close" class="nsft-modal-btn-close" title="${escapeHtml(T.close)}">✕</button>
                </span>
                <div class="nsft-modal-header-line"></div>
            </div>

            <div class="nsft-delrec-topbar">
                <div class="nsft-delrec-searchbar" id="nsft-delrec-searchbar">
                    <span class="nsft-delrec-searchicon">${svg(ICON_SEARCH, 2)}</span>
                    <input type="text" id="nsft-delrec-q" spellcheck="false" autocomplete="off">
                    <button type="button" class="nsft-delrec-clearbtn" id="nsft-delrec-clear" title="${escapeHtml(T.clear)}" aria-label="${escapeHtml(T.clear)}">${svg('M6 6l12 12M18 6L6 18', 2.4)}</button>
                    <button type="button" id="nsft-delrec-go">${escapeHtml(T.search)}</button>
                </div>
                <select id="nsft-delrec-period" class="nsft-delrec-select" title="${escapeHtml(T.period)}" aria-label="${escapeHtml(T.period)}">${opciones}</select>
                <button type="button" class="nsft-delrec-btn" id="nsft-delrec-export" title="${escapeHtml(T.exportCsv)}">
                    ${svg('M12 4v10M8 11l4 4 4-4M5 20h14', 1.9)}<span>${escapeHtml(i18n('delrec_export', 'Export'))}</span>
                </button>
            </div>

            <div class="nsft-delrec-filters" id="nsft-delrec-filters"></div>

            <div class="nsft-delrec-body">
                <div class="nsft-delrec-gridrow nsft-delrec-thead">
                    ${cols}
                    <span></span>
                </div>
                <div class="nsft-delrec-results" id="nsft-delrec-results" role="listbox"></div>
            </div>

            <div class="nsft-delrec-statusbar">
                <span class="nsft-delrec-live"></span>
                <span class="nsft-delrec-statusline" id="nsft-delrec-statusline"></span>
                <span class="nsft-delrec-spacer"></span>
                <span class="nsft-delrec-toast" id="nsft-delrec-toast"></span>
                <span class="nsft-delrec-hints">${escapeHtml(i18n('delrec_hints', '↑↓ · Ctrl+C copy ID · Esc close'))}</span>
            </div>
        </div>
        </div>`;
        _backdrop = wrap.firstElementChild;
        _modal = _backdrop.firstElementChild;
        document.body.appendChild(_backdrop);

        wire();
        const q = _modal.querySelector('#nsft-delrec-q');
        if (q) {
            q.placeholder = i18n('delrec_ph', 'Document, type or ID…');
            q.value = _lastTerm;
            _modal.querySelector('#nsft-delrec-searchbar').classList.toggle('has-query', !!_lastTerm);
        }
        pintarFiltros();
        lanzar();
        if (q) q.focus();
    }

    function cerrar() {
        if (_backdrop && _backdrop.parentNode) _backdrop.parentNode.removeChild(_backdrop);
        _backdrop = null;
        _modal = null;
        _sel = null;
        _token++;
    }

    function wire() {
        const q = _modal.querySelector('#nsft-delrec-q');
        const bar = _modal.querySelector('#nsft-delrec-searchbar');

        _modal.querySelector('#nsft-delrec-close').addEventListener('click', cerrar);
        _modal.querySelector('#nsft-delrec-go').addEventListener('click', () => {
            clearTimeout(_liveTimer);
            lanzar();
        });
        _backdrop.addEventListener('click', (e) => { if (e.target === _backdrop) cerrar(); });

        _modal.querySelector('#nsft-delrec-period').addEventListener('change', (e) => {
            _periodo = e.target.value;
            lanzar();
        });

        _modal.querySelector('.nsft-delrec-thead').addEventListener('click', (e) => {
            const th = e.target.closest('.nsft-delrec-th');
            if (!th) return;
            const k = th.dataset.sort;
            _dir = _sort === k ? -_dir : (k === 'when' ? -1 : 1);
            _sort = k;
            pintar();
        });

        q.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); clearTimeout(_liveTimer); lanzar(); }
        });

        const vivir = () => {
            clearTimeout(_liveTimer);
            _liveTimer = setTimeout(() => {
                if (!_modal) return;
                if (termino() === _lastTerm) return;
                lanzar();
            }, 400);
        };
        q.addEventListener('input', () => {
            bar.classList.toggle('has-query', !!q.value);
            vivir();
        });
        _modal.querySelector('#nsft-delrec-clear').addEventListener('click', () => {
            limpiarTermino();
            q.focus();
        });

        _modal.querySelector('#nsft-delrec-filters').addEventListener('click', (e) => {
            if (e.target.closest('[data-unfilter]')) { _user = null; pintarFiltros(); lanzar(); }
        });

        _modal.querySelector('#nsft-delrec-export').addEventListener('click', () => exportarCsv(ordenadas()));

        _modal.querySelector('#nsft-delrec-results').addEventListener('click', (e) => {
            const copyBtn = e.target.closest('[data-copy]');
            if (copyBtn) {
                copiar(copyBtn.dataset.copy, i18n('delrec_copied_id', 'ID copied: $1', [copyBtn.dataset.copy]));
                return;
            }
            const userBtn = e.target.closest('[data-user]');
            if (userBtn) {
                _user = { id: userBtn.dataset.user, name: userBtn.dataset.username || userBtn.dataset.user };
                pintarFiltros();
                lanzar();
                return;
            }
            const row = e.target.closest('.nsft-delrec-row');
            if (row) { _sel = row.dataset.key; pintar(); }
        });

        _modal.addEventListener('keydown', (e) => {
            const mod = e.ctrlKey || e.metaKey;
            if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); q.focus(); q.select(); return; }
            if (e.key === 'Escape') {
                e.preventDefault();
                if (_sel) { _sel = null; pintar(); return; }
                if (q.value) { limpiarTermino(); return; }
                if (_user) { _user = null; pintarFiltros(); lanzar(); return; }
                cerrar();
                return;
            }
            const list = ordenadas();
            if (!list.length) return;
            let idx = -1;
            for (let i = 0; i < list.length; i++) { if (filaKey(list[i]) === _sel) { idx = i; break; } }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                if (document.activeElement === q && !_sel && e.key === 'ArrowUp') return;
                e.preventDefault();
                const next = Math.max(0, Math.min(list.length - 1, (idx < 0 ? -1 : idx) + (e.key === 'ArrowDown' ? 1 : -1)));
                _sel = filaKey(list[next]);
                pintar();
                revelarFila();
                return;
            }
            if (mod && e.key.toLowerCase() === 'c' && idx > -1 && !String(window.getSelection()).length) {
                copiar(list[idx].id, i18n('delrec_copied_id', 'ID copied: $1', [list[idx].id]));
            }
        });
    }

    function limpiarTermino() {
        const q = _modal && _modal.querySelector('#nsft-delrec-q');
        if (!q) return;
        q.value = '';
        _modal.querySelector('#nsft-delrec-searchbar').classList.remove('has-query');
        clearTimeout(_liveTimer);
        lanzar();
    }

    function termino() {
        const q = _modal && _modal.querySelector('#nsft-delrec-q');
        return q ? String(q.value || '').trim() : '';
    }

    function toast(txt) {
        const t = _modal && _modal.querySelector('#nsft-delrec-toast');
        if (!t) return;
        t.textContent = txt;
        clearTimeout(_toastTimer);
        _toastTimer = setTimeout(() => { t.textContent = ''; }, 2200);
    }

    function pintarFiltros() {
        const box = _modal && _modal.querySelector('#nsft-delrec-filters');
        if (!box) return;
        if (!_user) { box.innerHTML = ''; box.hidden = true; return; }
        box.hidden = false;
        box.innerHTML = '<span class="nsft-delrec-chip">'
            + escapeHtml(i18n('delrec_user_filter', 'Deleted by: $1', [_user.name]))
            + '<button type="button" data-unfilter title="' + escapeHtml(i18n('delrec_user_filter_clear', 'Remove this filter')) + '">'
            + svg('M6 6l12 12M18 6L6 18', 2.4) + '</button></span>';
    }


    let _bridgeListo = false;
    let _bridgeCola = [];

    function ensureBridge(cb) {
        if (_bridgeListo) { cb(); return; }
        _bridgeCola.push(cb);
        if (_fetcherInjected) return;
        _fetcherInjected = true;
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
            if (!document.getElementById('nsft-text-search-mw')) {
                const ts = document.createElement('script');
                ts.id = 'nsft-text-search-mw';
                ts.async = false;
                ts.src = chrome.runtime.getURL('scripts/modules/_shared/nsft_text_search.js');
                ts.onload = function () { this.remove(); };
                (document.head || document.documentElement).appendChild(ts);
            }
            const s = document.createElement('script');
            s.id = 'nsft-delrec-fetcher';
            s.async = false;
            s.src = chrome.runtime.getURL('scripts/modules/deleted_records/deleted_records_fetcher.js');
            s.onload = function () { this.remove(); suelta(); };
            s.onerror = suelta;
            (document.head || document.documentElement).appendChild(s);
        } catch (e) {
            suelta();
        }
    }

    const PLAZO_MS = 45000;
    let _plazoTimer = 0;

    function lanzar() {
        if (!_modal) return;
        _token++;
        _lastTerm = termino();
        _sel = null;
        _cargando = true;
        _error = null;
        const payload = { term: _lastTerm, period: _periodo, user: _user ? _user.id : '', token: _token };
        clearTimeout(_plazoTimer);
        _plazoTimer = setTimeout(() => {
            if (!_cargando || payload.token !== _token || !_modal) return;
            _cargando = false;
            _error = 'stale';
            _filas = [];
            pintar();
        }, PLAZO_MS);
        ensureBridge(() => {
            window.postMessage({ dest: FETCHER_DEST, type: 'find', payload: payload }, '*');
        });
        pintar();
    }

    function clasificaError(err) {
        if (!err) return null;
        if (err.code === 'stale') return 'stale';
        const msg = String(err.message || err.error || err.code || '');
        if (/permis|insufficient|not\s*allowed|no\s*autoriz|deletedrecord|not\s*found|no\s*se\s*encontr|no\s*existe|invalid\s*search|no\s*compatible/i.test(msg)) return 'perm';
        return 'generic';
    }

    window.addEventListener('message', (e) => {
        if (e.source !== window) return;
        const d = e.data;
        if (!d || typeof d !== 'object' || d.dest !== EXTENSION_DEST || d.type !== 'results') return;
        const p = d.payload || {};
        if (p.token !== _token || !_modal) return;
        clearTimeout(_plazoTimer);
        _cargando = false;
        _error = clasificaError(p.error);
        _filas = _error ? [] : (p.items || []);
        _capped = !!p.capped;
        _cap = p.cap || _cap;
        pintar();
    });


    function ordenadas() {
        const k = _sort;
        const list = _filas.slice();
        list.sort((a, b) => {
            if (k === 'id') return ((Number(a.id) || 0) - (Number(b.id) || 0)) * _dir;
            return String(a[k] || '').localeCompare(String(b[k] || '')) * _dir;
        });
        return list;
    }

    function pintar() {
        if (!_modal) return;
        const res = _modal.querySelector('#nsft-delrec-results');

        _modal.querySelectorAll('.nsft-delrec-th').forEach((th) => {
            const on = th.dataset.sort === _sort;
            th.classList.toggle('is-on', on);
            th.querySelector('.nsft-delrec-arrow').textContent = on ? (_dir === 1 ? '↑' : '↓') : '';
        });

        const TS = window.NSFT_TextSearch;
        const hl = (txt) => (TS && _lastTerm) ? TS.markHtml(txt, _lastTerm, 'nsft-delrec-hl') : escapeHtml(txt);

        res.innerHTML = '';
        const lista = ordenadas();

        if (_cargando && !lista.length) {
            res.appendChild(vacio(i18n('delrec_loading', 'Reading the deleted records log…')));
        } else if (_error) {
            const msg = _error === 'perm'
                ? i18n('delrec_error_perm', 'The deleted records could not be read. It is usually the permission: your role needs Deleted Records (Lists).')
                : _error === 'stale'
                    ? i18n('delrec_stale', 'Reload the tab and try again.')
                    : i18n('delrec_error', 'The deleted records could not be read.');
            res.appendChild(vacio(msg, true));
        } else if (!lista.length) {
            res.appendChild(vacio(i18n('delrec_none', 'No deleted records match these filters.')));
        } else {
            const frag = document.createDocumentFragment();
            lista.forEach((it, n) => {
                const k = filaKey(it);
                const active = _sel === k;
                const row = document.createElement('div');
                row.className = 'nsft-delrec-row nsft-delrec-gridrow' + (active ? ' is-active' : (n % 2 ? ' is-zebra' : ''));
                row.dataset.key = k;
                row.setAttribute('role', 'option');
                row.setAttribute('aria-selected', String(active));
                const user = it.user || it.userId;
                row.innerHTML =
                    '<span class="nsft-delrec-when">' + escapeHtml(it.when) + '</span>'
                    + '<span class="nsft-delrec-name" title="' + escapeHtml(it.name) + '">' + hl(it.name) + '</span>'
                    + '<span class="nsft-delrec-type">' + hl(it.type) + '</span>'
                    + '<span class="nsft-delrec-id">' + hl(it.id) + '</span>'
                    + (it.userId
                        ? '<button type="button" class="nsft-delrec-user" data-user="' + escapeHtml(it.userId) + '" data-username="' + escapeHtml(user) + '" title="'
                            + escapeHtml(i18n('delrec_user_title', 'Show only what $1 deleted', [user])) + '">' + escapeHtml(user) + '</button>'
                        : '<span class="nsft-delrec-user">' + escapeHtml(user) + '</span>')
                    + '<span class="nsft-delrec-from">' + escapeHtml(it.from) + '</span>'
                    + '<button type="button" class="nsft-delrec-copy" data-copy="' + escapeHtml(it.id) + '" title="'
                        + escapeHtml(i18n('delrec_copy_id', 'Copy ID')) + '">' + svg('M9 9h10v10H9zM5 15V5h10', 1.8) + '</button>';
                frag.appendChild(row);
            });
            res.appendChild(frag);
        }
        estadoLinea(lista.length);
    }

    function vacio(texto, esError) {
        const el = document.createElement('div');
        el.className = 'nsft-delrec-empty' + (esError ? ' is-error' : '');
        el.textContent = texto;
        return el;
    }

    function estadoLinea(total) {
        const line = _modal && _modal.querySelector('#nsft-delrec-statusline');
        if (!line) return;
        if (_cargando) { line.textContent = i18n('delrec_loading', 'Reading the deleted records log…'); return; }
        if (_error || !total) { line.textContent = ''; return; }
        line.textContent = i18n('delrec_results_n', '$1 deleted records', [String(total)])
            + (_capped ? ' · ' + i18n('delrec_capped', 'showing the $1 most recent: narrow the search to see the rest', [String(_cap)]) : '');
    }

    function revelarFila() {
        const res = _modal.querySelector('#nsft-delrec-results');
        const row = res.querySelector('.nsft-delrec-row.is-active');
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
        if (!lista.length) { toast(i18n('delrec_none', 'No deleted records match these filters.')); return; }
        const head = [
            i18n('delrec_col_when', 'When'), i18n('delrec_col_name', 'Document'), i18n('delrec_col_type', 'Type'),
            i18n('delrec_col_id', 'ID'), i18n('delrec_col_user', 'Deleted by'), i18n('delrec_col_from', 'From')
        ];
        const cell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
        const lines = [head.map(cell).join(',')];
        lista.forEach((it) => {
            lines.push([it.when, it.name, it.type, it.id, it.user || it.userId, it.from].map(cell).join(','));
        });
        const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'nsft-registros-eliminados-' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 100);
        toast(i18n('delrec_exported', '$1 rows exported', [String(lista.length)]));
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
})();
