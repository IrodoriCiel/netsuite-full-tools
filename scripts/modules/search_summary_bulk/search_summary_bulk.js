(function () {
    'use strict';

    const STORAGE_KEY = 'enableSearchSummaryBulk';

    if (!/\/app\/common\/search\/search\.nl$/i.test(window.location.pathname)) return;

    const BAR_ID = 'nsft-ssb-bar';
    const FETCHER = 'scripts/modules/search_summary_bulk/search_summary_bulk_fetcher.js';

    const TIPOS = [
        { v: 'GROUP', k: 'ssb_group' },
        { v: 'COUNT', k: 'ssb_count' },
        { v: 'SUM', k: 'ssb_sum' },
        { v: 'AVG', k: 'ssb_avg' },
        { v: 'MIN', k: 'ssb_min' },
        { v: 'MAX', k: 'ssb_max' }
    ];

    const i18n = (k, f) => (chrome.i18n.getMessage(k) || f);
    const esc = (window.NSFT_DOM && window.NSFT_DOM.escapeHtml)
        ? window.NSFT_DOM.escapeHtml
        : (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    let _enabled = false;
    let _unsub = null;
    let _fetcherListo = false;
    let _inyectado = false;
    let _valor = TIPOS[0].v;
    let _cierraFuera = null;

    chrome.storage.local.get({ [STORAGE_KEY]: true }, (items) => {
        if (!items[STORAGE_KEY]) return;
        start();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        if (changes[STORAGE_KEY].newValue !== false) start();
        else stop();
    });

    function start() {
        if (_enabled) return;
        _enabled = true;
        window.addEventListener('message', onFetcherMessage);
        injectFetcher();
        if (window.NSFT_Observer) {
            _unsub = window.NSFT_Observer.subscribe(montar, { throttle: 400, immediate: true });
        } else {
            montar();
            setInterval(montar, 1200);
        }
    }

    function stop() {
        _enabled = false;
        if (_unsub) { _unsub(); _unsub = null; }
        window.removeEventListener('message', onFetcherMessage);
        if (_cierraFuera) { document.removeEventListener('mousedown', _cierraFuera, true); _cierraFuera = null; }
        const bar = document.getElementById(BAR_ID);
        if (bar) bar.remove();
    }

    function injectFetcher() {
        if (_inyectado) return;
        _inyectado = true;
        const s = document.createElement('script');
        s.src = chrome.runtime.getURL(FETCHER);
        s.async = false;
        (document.head || document.documentElement).appendChild(s);
        s.onload = () => s.remove();
    }

    function onFetcherMessage(e) {
        if (e.source !== window) return;
        const d = e.data;
        if (!d || d.dest !== 'extension_ssb') return;
        if (d.type === 'ready') {
            _fetcherListo = !!(d.payload && d.payload.ok);
            if (_fetcherListo) montar();
        } else if (d.type === 'done') {
            pintarResultado(d.payload || {});
        }
    }

    function contenedor() {
        const cab = document.getElementById('returnfields_headerrow');
        if (!cab) return null;
        return cab.closest('.uir-machine-table-container') || cab.closest('table')?.parentElement || null;
    }

    function montar() {
        if (!_enabled || !_fetcherListo) return;
        if (document.getElementById(BAR_ID)) return;
        const cont = contenedor();
        if (!cont || !cont.parentNode) return;

        const bar = document.createElement('div');
        bar.id = BAR_ID;
        bar.className = 'nsft-ssb-bar';
        bar.innerHTML =
            '<span class="nsft-ssb-lbl">' + esc(i18n('ssb_title', 'Tipo de resumen en todas')) + '</span>' +
            '<div class="nsft-ssb-drop">' +
            '<button type="button" class="nsft-ssb-sel" aria-haspopup="listbox" aria-expanded="false">' +
            '<span class="nsft-ssb-selval"></span><span class="nsft-ssb-caret" aria-hidden="true"></span>' +
            '</button>' +
            '<div class="nsft-ssb-menu" role="listbox" hidden>' +
            TIPOS.map((t) => '<button type="button" class="nsft-ssb-opt" role="option" data-v="' +
                esc(t.v) + '">' + esc(i18n(t.k, t.v)) + '</button>').join('') +
            '</div></div>' +
            '<button type="button" class="nsft-ssb-btn nsft-ssb-apply">' + esc(i18n('ssb_apply', 'Aplicar a todas')) + '</button>' +
            '<button type="button" class="nsft-ssb-btn nsft-ssb-clear">' + esc(i18n('ssb_clear', 'Quitar de todas')) + '</button>' +
            '<span class="nsft-ssb-msg" role="status"></span>';

        cablearDesplegable(bar);
        bar.querySelector('.nsft-ssb-apply').addEventListener('click', () => aplicar(_valor));
        bar.querySelector('.nsft-ssb-clear').addEventListener('click', () => aplicar(''));

        const prev = cont.previousElementSibling;
        const antes = (prev && prev.classList && prev.classList.contains('nsft-sf-bar')) ? prev : cont;
        cont.parentNode.insertBefore(bar, antes);
    }

    function cablearDesplegable(bar) {
        const btn = bar.querySelector('.nsft-ssb-sel');
        const menu = bar.querySelector('.nsft-ssb-menu');
        const opts = Array.from(menu.querySelectorAll('.nsft-ssb-opt'));

        const pintar = () => {
            const t = TIPOS.find((x) => x.v === _valor) || TIPOS[0];
            bar.querySelector('.nsft-ssb-selval').textContent = i18n(t.k, t.v);
            opts.forEach((o) => o.setAttribute('aria-selected', String(o.dataset.v === _valor)));
        };

        const cerrar = (devolverFoco) => {
            menu.hidden = true;
            btn.setAttribute('aria-expanded', 'false');
            if (_cierraFuera) { document.removeEventListener('mousedown', _cierraFuera, true); _cierraFuera = null; }
            if (devolverFoco) btn.focus();
        };

        const abrir = () => {
            menu.hidden = false;
            btn.setAttribute('aria-expanded', 'true');
            (opts.find((o) => o.dataset.v === _valor) || opts[0]).focus();
            _cierraFuera = (e) => { if (!bar.contains(e.target)) cerrar(false); };
            document.addEventListener('mousedown', _cierraFuera, true);
        };

        btn.addEventListener('click', () => (menu.hidden ? abrir() : cerrar(true)));

        opts.forEach((o, i) => {
            o.addEventListener('click', () => { _valor = o.dataset.v; pintar(); cerrar(true); });
            o.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    opts[(i + (e.key === 'ArrowDown' ? 1 : opts.length - 1)) % opts.length].focus();
                } else if (e.key === 'Escape') {
                    e.preventDefault(); cerrar(true);
                }
            });
        });

        pintar();
    }

    function aplicar(valor) {
        const bar = document.getElementById(BAR_ID);
        if (bar) {
            bar.classList.add('is-busy');
            const msg = bar.querySelector('.nsft-ssb-msg');
            if (msg) msg.textContent = i18n('ssb_working', 'Aplicando…');
        }
        window.postMessage({ dest: 'fetcher_ssb', type: 'apply', payload: { valor } }, '*');
    }

    function pintarResultado(p) {
        const bar = document.getElementById(BAR_ID);
        if (!bar) return;
        bar.classList.remove('is-busy');
        const msg = bar.querySelector('.nsft-ssb-msg');
        if (!msg) return;
        if (p.ok) {
            msg.className = 'nsft-ssb-msg is-ok';
            msg.textContent = i18n('ssb_done', 'Listo en $1 columnas — guarda la búsqueda')
                .replace('$1', String(p.puestas || 0));
        } else {
            msg.className = 'nsft-ssb-msg is-err';
            msg.textContent = p.motivo === 'sin_columnas'
                ? i18n('ssb_empty', 'No hay columnas a las que aplicarlo')
                : i18n('ssb_fail', 'No se pudo aplicar');
        }
        setTimeout(() => {
            if (msg.isConnected) { msg.textContent = ''; msg.className = 'nsft-ssb-msg'; }
        }, 6000);
    }
})();
