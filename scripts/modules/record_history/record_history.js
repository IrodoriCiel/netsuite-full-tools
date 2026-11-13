(function () {
    'use strict';
    if (!/^\/app\//.test(window.location.pathname)) return;
    if (window.NSFT_Herramientas) window.NSFT_Herramientas.vigila('.nsft-rhist-panel', 'history');

    const STORAGE_KEY = 'enableRecordHistory';
    const NSFT_THEME_KEY = 'nsftTheme';
    const PANEL_ID = 'nsft-rhist-panel';
    const OVERLAY_ID = 'nsft-rhist-overlay';
    const FETCHER_PATH = 'scripts/modules/record_history/record_history_fetcher.js';
    const EVENTO = 'nsft-show-record-history';

    let _theme = 'light';
    let _enabled = false;

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
        window.NSFT_RecordHistoryTool = { open: open };
        window.removeEventListener(EVENTO, onOpenEvent);
        window.addEventListener(EVENTO, onOpenEvent);
    }

    function deactivate() {
        _enabled = false;
        window.removeEventListener(EVENTO, onOpenEvent);
        try { delete window.NSFT_RecordHistoryTool; } catch (e) { window.NSFT_RecordHistoryTool = undefined; }
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

    let _fetcher = 'none';
    const _cola = [];
    const _espera = {};
    let _seq = 0;

    window.addEventListener('message', (e) => {
        if (e.source !== window) return;
        const d = e.data;
        if (!d || d.dest !== 'extension_rhist' || !d.reqId) return;
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
                if (_fetcher !== 'ready') { resolve({ error: 'nofetcher' }); return; }
                const reqId = 'rhist' + (++_seq) + '_' + Date.now();
                const t = setTimeout(() => { delete _espera[reqId]; resolve({ error: 'timeout' }); }, plazo);
                _espera[reqId] = (p) => { clearTimeout(t); resolve(p || { error: 'empty' }); };
                window.postMessage({ dest: 'fetcher_rhist', type, reqId, payload: payload || {} }, '*');
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

    function run(recId, tipoId) {
        return pide('notes', { recId, tipoId }, tipoId == null ? 200000 : 60000);
    }

    function tipoDePagina() {
        return pide('ctx', {}, 4000).then((p) => (p && p.recordType) || '');
    }


    const ICO = {
        hist: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7"></path><polyline points="3 4 3 9 8 9"></polyline><polyline points="12 7 12 12 15.5 14"></polyline></svg>',
        recargar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"></path><path d="M21 3v5h-5"></path></svg>',
        ia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"></path><path d="M19 3v4"></path><path d="M17 5h4"></path></svg>',
        bajar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
        lupa: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM10.5 10.5L14 14"></path></svg>',
        x: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"></path></svg>'
    };

    let _ctx = null;
    let _term = '';

    function tool(cls, ico, color, label) {
        return '<button type="button" class="nsft-modal-tool ' + cls + '" title="' + esc(label) + '">'
            + '<span class="nsft-modal-tc ' + color + '">' + ico + '</span><span>' + esc(label) + '</span></button>';
    }

    function open() {
        if (!_enabled) return;
        if (window.NSFT_RecordButtons && window.NSFT_RecordButtons.isExcludedPage && window.NSFT_RecordButtons.isExcludedPage()) return;
        const id = recordId();
        if (!id) {
            toast(i18n('rh_not_record', 'Open a saved record to see its history.'), 'info');
            return;
        }
        close();
        _term = '';

        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.className = 'nsft-rhist-overlay nsft-modal-backdrop';
        overlay.setAttribute('data-theme', resolveTheme());
        overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });

        const panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.className = 'nsft-rhist-panel nsft-modal nsft-modal--dialog';
        panel.setAttribute('data-theme', resolveTheme());
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');

        const ia = window.NSFT_AiExplain ? tool('nsft-modal-tool--icono nsft-rhist-ia', ICO.ia, 'nsft-rhist-tc-ia', i18n('rh_ai', 'Summarise with AI')) : '';
        panel.innerHTML = '<div class="nsft-modal-header">'
            + '<span class="nsft-modal-title">' + ICO.hist + esc(i18n('enableRecordHistoryLabel', 'Record history')) + '</span>'
            + '<div class="nsft-modal-tools nsft-modal-hide-min">'
            + tool('nsft-rhist-reload', ICO.recargar, 'nsft-c2', i18n('rh_reload', 'Refresh'))
            + ia
            + tool('nsft-modal-tool--exportar nsft-rhist-csv', ICO.bajar, 'nsft-c1', i18n('rh_csv', 'Download CSV'))
            + '</div>'
            + '<div class="nsft-header-actions">'
            + '<button type="button" class="nsft-modal-btn-close nsft-rhist-x" aria-label="' + esc(i18n('rh_close', 'Close')) + '" title="' + esc(i18n('rh_close', 'Close')) + '">✕</button>'
            + '</div>'
            + '</div>'
            + '<div class="nsft-rhist-top">'
            + '<div class="nsft-rhist-search">'
            + '<span class="nsft-rhist-searchicon">' + ICO.lupa + '</span>'
            + '<input type="text" class="nsft-rhist-q" spellcheck="false" autocomplete="off" placeholder="' + esc(i18n('rh_search_ph', 'Search field, value or user')) + '">'
            + '<button type="button" class="nsft-rhist-clear" title="' + esc(i18n('sql_find_clear', 'Clear search')) + '" aria-label="' + esc(i18n('sql_find_clear', 'Clear search')) + '">' + ICO.x + '</button>'
            + '</div>'
            + '</div>'
            + '<div class="nsft-rhist-body"></div>';

        overlay.appendChild(panel);
        (document.body || document.documentElement).appendChild(overlay);
        document.addEventListener('keydown', onKey, true);

        const cuerpo = panel.querySelector('.nsft-rhist-body');
        const caja = panel.querySelector('.nsft-rhist-search');
        const q = panel.querySelector('.nsft-rhist-q');

        const pinta = () => {
            if (!panel.isConnected || !_ctx || !window.NSFT_RecordHistory) return;
            _ctx.term = _term;
            window.NSFT_RecordHistory.render(cuerpo, _ctx);
        };

        let timer = null;
        q.addEventListener('input', () => {
            caja.classList.toggle('has-query', !!q.value);
            clearTimeout(timer);
            timer = setTimeout(() => { _term = q.value; pinta(); }, 150);
        });
        panel.querySelector('.nsft-rhist-clear').addEventListener('click', () => {
            q.value = '';
            _term = '';
            caja.classList.remove('has-query');
            pinta();
            q.focus();
        });
        panel.querySelector('.nsft-rhist-x').addEventListener('click', close);
        panel.querySelector('.nsft-rhist-reload').addEventListener('click', () => {
            if (!_ctx || !window.NSFT_RecordHistory) return;
            window.NSFT_RecordHistory.olvida(_ctx.recordType, _ctx.recordId);
            pinta();
        });
        panel.querySelector('.nsft-rhist-csv').addEventListener('click', () => {
            if (!_ctx || !window.NSFT_RecordHistory || !window.NSFT_RecordHistory.exporta(_ctx)) {
                toast(i18n('rh_csv_none', 'There are no system notes to download yet.'), 'info');
            }
        });
        const bIa = panel.querySelector('.nsft-rhist-ia');
        if (bIa) bIa.addEventListener('click', () => window.dispatchEvent(new Event('nsft-ai-record-changes')));

        cuerpo.innerHTML = '<div class="nsft-rh-cargando"><span class="nsft-rh-spin" aria-hidden="true"></span>' + esc(i18n('rh_loading', 'Loading system notes…')) + '</div>';
        tipoDePagina().then((recordType) => {
            if (!panel.isConnected) return;
            _ctx = {
                recordType,
                recordId: id,
                pageHref: location.href,
                term: _term,
                run,
                onUpdate: pinta
            };
            pinta();
        });
        setTimeout(() => q.focus(), 0);
    }

    function onKey(e) {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        const q = document.querySelector('#' + PANEL_ID + ' .nsft-rhist-q');
        if (q && q.value) {
            e.preventDefault();
            q.value = '';
            _term = '';
            const caja = q.closest('.nsft-rhist-search');
            if (caja) caja.classList.remove('has-query');
            if (_ctx && window.NSFT_RecordHistory) {
                _ctx.term = '';
                window.NSFT_RecordHistory.render(document.querySelector('#' + PANEL_ID + ' .nsft-rhist-body'), _ctx);
            }
            return;
        }
        close();
    }

    function close() {
        const o = document.getElementById(OVERLAY_ID);
        if (o) o.remove();
        _ctx = null;
        document.removeEventListener('keydown', onKey, true);
    }
})();
