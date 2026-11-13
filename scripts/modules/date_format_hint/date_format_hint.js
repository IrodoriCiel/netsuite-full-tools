(function () {
    'use strict';

    const STORAGE_KEY = 'enableDateFormatHint';
    const ORIG = 'nsftDfhOrig';

    const TIPOS = {
        date: (d) => d,
        timeofday: (d, t) => t,
        datetimetz: (d, t) => (d && t) ? d + ' ' + t : null
    };

    function isApplicablePage() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isHeaderlessPage
                && NSFT_RecordButtons.isHeaderlessPage()) return false;
        } catch (e) { }
        return true;
    }

    if (!isApplicablePage()) return;

    const CACHE_KEY = 'nsftUserDateFormats';
    const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
    const SELECTOR_FECHA = Object.keys(TIPOS).map((t) => '[data-fieldtype="' + t + '"] > input').join(',');

    let _on = false;
    let _fmtDate = null;
    let _fmtTime = null;
    let _unsub = null;
    let _pedido = false;
    let _unsubEspera = null;

    function claveUsuario() {
        const m = /(?:^|;\s*)lastUser=([^;]*)/.exec(document.cookie || '');
        return location.host + '|' + (m ? m[1] : '');
    }

    function trasCarga(fn) {
        const ya = () => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 0));
        if (document.readyState === 'complete') ya();
        else window.addEventListener('load', ya, { once: true });
    }

    chrome.storage.local.get({ [STORAGE_KEY]: true, [CACHE_KEY]: {} }, (items) => {
        _on = !!items[STORAGE_KEY];
        const c = items[CACHE_KEY] && items[CACHE_KEY][claveUsuario()];
        if (c && (Date.now() - (c.ts || 0)) < CACHE_TTL && c.date && c.time) {
            _fmtDate = c.date || null;
            _fmtTime = c.time || null;
            _pedido = true;
        }
        if (_on) arrancar();
    });

    function guardaCache(date, time) {
        try {
            chrome.storage.local.get({ [CACHE_KEY]: {} }, (st) => {
                const all = (st[CACHE_KEY] && typeof st[CACHE_KEY] === 'object') ? st[CACHE_KEY] : {};
                const k = claveUsuario();
                all[k] = Object.assign({}, all[k], date ? { date } : {}, time ? { time } : {}, { ts: Date.now() });
                chrome.storage.local.set({ [CACHE_KEY]: all });
            });
        } catch (e) { }
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        _on = !!changes[STORAGE_KEY].newValue;
        if (_on) arrancar(); else apagar();
    });

    function arrancar() {
        if (!_pedido) {
            _pedido = true;
            window.addEventListener('message', onMessage);
            trasCarga(() => {
                const pide = () => {
                    if (!document.querySelector(SELECTOR_FECHA)) return false;
                    if (_unsubEspera) { try { _unsubEspera(); } catch (e) { } _unsubEspera = null; }
                    inyectarFetcher();
                    return true;
                };
                if (!pide() && window.NSFT_Observer && NSFT_Observer.subscribe) {
                    _unsubEspera = NSFT_Observer.subscribe(pide, { throttle: 500 });
                }
            });
        }
        if (_fmtDate || _fmtTime) observar();
    }

    function apagar() {
        if (_unsub) { try { _unsub(); } catch (e) { } _unsub = null; }
        if (_unsubEspera) { try { _unsubEspera(); } catch (e) { } _unsubEspera = null; }
        restaurarTodo();
    }

    function inyectarFetcher() {
        try {
            const s = document.createElement('script');
            s.id = 'nsft-dfh-fetcher';
            s.src = chrome.runtime.getURL('scripts/modules/date_format_hint/date_format_hint_fetcher.js');
            s.onload = function () { this.remove(); };
            (window.NSFT_AfterLoad ? window.NSFT_AfterLoad.append(s) : (document.head || document.documentElement).appendChild(s));
        } catch (e) { }
    }

    function onMessage(e) {
        if (e.source !== window) return;
        const d = e.data;
        if (!d || typeof d !== 'object' || d.dest !== 'extension_dfh') return;
        if (d.type !== 'formats' || !d.payload) return;
        _fmtDate = d.payload.date || null;
        _fmtTime = d.payload.time || null;
        if (_fmtDate || _fmtTime) guardaCache(_fmtDate, _fmtTime);
        if (_on && (_fmtDate || _fmtTime)) observar();
    }

    function observar() {
        if (_unsub) return;
        if (window.NSFT_Observer && NSFT_Observer.subscribe) {
            _unsub = NSFT_Observer.subscribe(pintar, { throttle: 300, immediate: true });
        } else {
            pintar();
        }
    }

    function pintar() {
        for (const tipo in TIPOS) {
            const texto = TIPOS[tipo](_fmtDate, _fmtTime);
            if (!texto) continue;
            const campos = document.querySelectorAll(
                '[data-fieldtype="' + tipo + '"] > input');
            for (const campo of campos) {
                if (campo.dataset[ORIG] != null) continue;
                campo.dataset[ORIG] = campo.getAttribute('placeholder') || '';
                campo.setAttribute('placeholder', texto);
            }
        }
    }

    function restaurarTodo() {
        const campos = document.querySelectorAll('[data-nsft-dfh-orig]');
        for (const campo of campos) {
            const orig = campo.dataset[ORIG];
            if (orig) campo.setAttribute('placeholder', orig);
            else campo.removeAttribute('placeholder');
            delete campo.dataset[ORIG];
        }
    }
})();
