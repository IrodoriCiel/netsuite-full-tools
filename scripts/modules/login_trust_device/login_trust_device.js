(function () {
    'use strict';
    const STORAGE_KEY = 'enableLoginTrustDevice';
    const OBSERVE_MAX_MS = 120000;

    if (!/^\/app\/login\/secure\/loginchallenge\//.test(location.pathname)) return;

    const CONTENEDORES = [
        'div.n-loginchallenge-stackpanel--trust',
        '[n-login-id*="trust"]',
        '[class*="stackpanel--trust"]'
    ];

    let _hecho = false;
    let _diag = false;
    let mo = null;
    let moTimer = 0;
    let rafPending = false;

    chrome.storage.local.get({ [STORAGE_KEY]: false, nsftSelectorDiagnostics: false }, (items) => {
        _diag = !!items.nsftSelectorDiagnostics;
        if (items[STORAGE_KEY]) arrancar();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.nsftSelectorDiagnostics) _diag = !!changes.nsftSelectorDiagnostics.newValue;
        if (!changes[STORAGE_KEY]) return;
        if (changes[STORAGE_KEY].newValue) arrancar();
        else parar();
    });

    function arrancar() {
        if (_hecho) return;
        if (intentar()) return;
        if (mo) return;
        const raiz = document.documentElement;
        if (!raiz) return;
        mo = new MutationObserver(programar);
        mo.observe(raiz, { childList: true, subtree: true });
        moTimer = setTimeout(() => {
            if (_diag && !_hecho) console.warn('NSFT: [login_trust_device] no se encontró la casilla «Confiar en este dispositivo».');
            parar();
        }, OBSERVE_MAX_MS);
    }

    function parar() {
        if (mo) { mo.disconnect(); mo = null; }
        if (moTimer) { clearTimeout(moTimer); moTimer = 0; }
    }

    function programar() {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => {
            rafPending = false;
            if (intentar()) parar();
        });
    }

    function buscaContenedor() {
        for (const sel of CONTENEDORES) {
            const el = document.querySelector(sel);
            if (el) return el;
        }
        return null;
    }

    function estado(cont) {
        const inp = cont.querySelector('input[type="checkbox"]');
        if (inp) return !!inp.checked;
        const aria = cont.matches('[aria-checked]') ? cont : cont.querySelector('[aria-checked]');
        if (aria) return aria.getAttribute('aria-checked') === 'true';
        return null;
    }

    function intentar() {
        if (_hecho) return true;
        const cont = buscaContenedor();
        if (!cont) return false;
        _hecho = true;
        const marcada = estado(cont);
        if (marcada === true) return true;
        const inp = cont.querySelector('input[type="checkbox"]');
        const blanco = inp || cont.querySelector('[role="checkbox"]') || cont.querySelector('span') || cont;
        try { blanco.click(); } catch (e) { }
        if (_diag) console.info('NSFT: [login_trust_device] casilla marcada (' + (marcada === null ? 'estado desconocido' : 'estaba desmarcada') + ').');
        return true;
    }
})();
