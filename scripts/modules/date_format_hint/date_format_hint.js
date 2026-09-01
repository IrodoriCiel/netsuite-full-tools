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

    let _on = false;
    let _fmtDate = null;
    let _fmtTime = null;
    let _unsub = null;
    let _pedido = false;

    chrome.storage.local.get({ [STORAGE_KEY]: true }, (items) => {
        _on = !!items[STORAGE_KEY];
        if (_on) arrancar();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        _on = !!changes[STORAGE_KEY].newValue;
        if (_on) arrancar(); else apagar();
    });

    function arrancar() {
        if (!_pedido) {
            _pedido = true;
            window.addEventListener('message', onMessage);
            inyectarFetcher();
        }
        if (_fmtDate || _fmtTime) observar();
    }

    function apagar() {
        if (_unsub) { try { _unsub(); } catch (e) { } _unsub = null; }
        restaurarTodo();
    }

    function inyectarFetcher() {
        try {
            const s = document.createElement('script');
            s.id = 'nsft-dfh-fetcher';
            s.src = chrome.runtime.getURL('scripts/modules/date_format_hint/date_format_hint_fetcher.js');
            s.onload = function () { this.remove(); };
            (document.head || document.documentElement).appendChild(s);
        } catch (e) { }
    }

    function onMessage(e) {
        if (e.source !== window) return;
        const d = e.data;
        if (!d || typeof d !== 'object' || d.dest !== 'extension_dfh') return;
        if (d.type !== 'formats' || !d.payload) return;
        _fmtDate = d.payload.date || null;
        _fmtTime = d.payload.time || null;
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
