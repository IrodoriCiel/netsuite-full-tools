(function () {
    'use strict';

    if (window.__nsftSfbEnvuelta) return;
    window.__nsftSfbEnvuelta = true;

    const PAGINAS = ['savedsearchresults.nl', 'adhocsearchresults.nl'];
    const esDeResultados = (url) => {
        const s = String(url);
        for (let i = 0; i < PAGINAS.length; i++) if (s.indexOf(PAGINAS[i]) >= 0) return true;
        return false;
    };

    let real = null;

    function envuelta(url) {
        const docEl = document.documentElement;
        try {
            if (docEl.hasAttribute('data-nsft-sfb-on') && esDeResultados(url)) {
                if (docEl.hasAttribute('data-nsft-sfb-go')) {
                    docEl.removeAttribute('data-nsft-sfb-go');
                } else {
                    docEl.setAttribute('data-nsft-sfb-held', '1');
                    return '#nsft-sfb';
                }
            }
        } catch (e) { }
        return real.apply(this, arguments);
    }

    function intenta() {
        const f = window.appendFormDataToURL;
        if (typeof f !== 'function' || f === envuelta) return false;
        real = f;
        try { window.appendFormDataToURL = envuelta; } catch (e) { return true; }
        return true;
    }

    if (intenta()) return;

    let obs = null;
    const fin = () => { if (obs) { try { obs.disconnect(); } catch (e) { } obs = null; } };
    try {
        obs = new MutationObserver(() => { if (intenta()) fin(); });
        obs.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) { }
    let vueltas = 0;
    const reloj = setInterval(() => {
        if (intenta() || ++vueltas > 100) { clearInterval(reloj); fin(); }
    }, 100);
})();
