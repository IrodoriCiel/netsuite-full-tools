(function () {
    'use strict';
    if (window.NSFT_PageLocation) return;

    const SEP = ' → ';
    const TRANSITORIOS = ['cl', 'whence', 'twhence', 'compid'];
    const CLAVES = ['sc', 'rectype', 'folder', 'cr', 'Customer_STAGE'];

    function genericUrl() {
        try {
            const url = new URL(window.location.href);
            TRANSITORIOS.forEach((p) => url.searchParams.delete(p));
            url.host = 'system.netsuite.com';
            return url.toString();
        } catch (e) {
            return window.location.href.replace(window.location.host, 'system.netsuite.com');
        }
    }

    let _arbol = null;

    function cargaArbol() {
        if (!_arbol) {
            _arbol = fetch('/app/center/NLNavMenuData.nl?_=' + Date.now(), { credentials: 'same-origin' })
                .then((r) => (r.ok ? r.json() : null))
                .then((d) => {
                    if (Array.isArray(d)) return d;
                    if (d && typeof d === 'object') return d.menu || d.items || d.data || [];
                    return [];
                })
                .catch(() => { _arbol = null; return []; });
        }
        return _arbol;
    }

    const _dec = document.createElement('textarea');
    function texto(s) {
        _dec.innerHTML = String(s == null ? '' : s);
        return _dec.value.trim();
    }

    function criterio() {
        const path = window.location.pathname;
        const p = new URLSearchParams(window.location.search);
        let pares = [];
        if (/\/scriptlet\.nl$/.test(path)) {
            pares = [['script', p.get('script')], ['deploy', p.get('deploy')]];
        } else {
            const k = CLAVES.find((c) => p.get(c));
            if (k) pares = [[k, p.get(k)]];
        }
        return (url) => {
            let u;
            try { u = new URL(url, window.location.origin); } catch (e) { return false; }
            return u.pathname === path && pares.every(([k, v]) => u.searchParams.get(k) === v);
        };
    }

    function busca(nodo, casa, ruta) {
        if (!nodo || typeof nodo !== 'object') return null;
        const aqui = ruta.concat(texto(nodo.label));
        if (nodo.url && casa(nodo.url)) return aqui;
        const hijos = Array.isArray(nodo.submenu) ? nodo.submenu : [];
        for (const h of hijos) {
            const r = busca(h, casa, aqui);
            if (r) return r;
        }
        return null;
    }

    async function menuPath() {
        const arbol = await cargaArbol();
        if (!arbol.length) return null;
        const casa = criterio();
        const resaltado = document.querySelector('[data-header-section=navigation] [data-widget=MenuItem][data-highlighted=true][data-automation-id]');
        const idTop = resaltado && resaltado.dataset.automationId;
        const orden = idTop
            ? arbol.filter((n) => n && n.id === idTop).concat(arbol.filter((n) => !n || n.id !== idTop))
            : arbol;
        for (const top of orden) {
            const r = busca(top, casa, []);
            if (r) return r.filter(Boolean).join(SEP);
        }
        return null;
    }

    window.NSFT_PageLocation = { genericUrl, menuPath };
})();
