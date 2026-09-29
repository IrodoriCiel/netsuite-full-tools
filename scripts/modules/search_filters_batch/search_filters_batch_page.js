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

    let ordenando = false;

    function fotoFiltros() {
        const panel = document.querySelector('.uir-filters');
        if (!panel) return null;
        const partes = [];
        const campos = panel.querySelectorAll('input, select, textarea');
        for (let i = 0; i < campos.length; i++) {
            const el = campos[i];
            if (!el.name) continue;
            const tipo = String(el.type || '').toLowerCase();
            if (tipo === 'button' || tipo === 'submit') continue;
            let v;
            if (tipo === 'checkbox' || tipo === 'radio') v = el.checked;
            else if (el.tagName === 'SELECT' && el.multiple) {
                v = [];
                for (let j = 0; j < el.options.length; j++) if (el.options[j].selected) v.push(el.options[j].value);
            } else v = el.value;
            partes.push([el.name, v]);
        }
        return JSON.stringify(partes);
    }

    let foto = null;
    function tomaFoto() { foto = fotoFiltros(); }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tomaFoto, { once: true });
    } else {
        tomaFoto();
    }
    window.addEventListener('load', () => {
        if (!document.documentElement.hasAttribute('data-nsft-sfb-held')) tomaFoto();
    }, { once: true });

    function laPideUnFiltro() {
        const ahora = fotoFiltros();
        if (ahora === null) return false;
        if (foto !== null && ahora === foto) return false;
        foto = ahora;
        return true;
    }

    function envuelta(url) {
        const docEl = document.documentElement;
        try {
            if (docEl.hasAttribute('data-nsft-sfb-on') && esDeResultados(url) && !ordenando) {
                if (docEl.hasAttribute('data-nsft-sfb-go')) {
                    docEl.removeAttribute('data-nsft-sfb-go');
                } else if (arguments.length > 1 && laPideUnFiltro()) {
                    docEl.setAttribute('data-nsft-sfb-held', '1');
                    return '#nsft-sfb';
                }
            }
        } catch (e) { }
        return real.apply(this, arguments);
    }

    function envuelveUrl() {
        const f = window.appendFormDataToURL;
        if (typeof f !== 'function' || f === envuelta) return false;
        real = f;
        try { window.appendFormDataToURL = envuelta; } catch (e) { return true; }
        return true;
    }

    function envuelveOrden() {
        const f = window.doServerSort;
        if (typeof f !== 'function' || f.__nsftSfb) return false;
        const w = function () {
            ordenando = true;
            try { return f.apply(this, arguments); } finally { ordenando = false; }
        };
        w.__nsftSfb = true;
        try { window.doServerSort = w; } catch (e) { return true; }
        return true;
    }

    let hechaUrl = false;
    let hechoOrden = false;
    function intenta() {
        if (!hechaUrl) hechaUrl = envuelveUrl();
        if (!hechoOrden) hechoOrden = envuelveOrden();
        return hechaUrl && hechoOrden;
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
