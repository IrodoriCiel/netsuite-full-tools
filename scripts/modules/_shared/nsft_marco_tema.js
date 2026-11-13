(function () {
    'use strict';

    if (window.NSFT_MarcoTema) return;

    const TEMAS_CLAROS = ['atom-one-light', 'eclipse', 'idea', 'neo', 'solarized light', 'default'];
    const OSCURAS = ['--nsft-dk-deepest', '--nsft-dk-panel', '--nsft-dk-surface',
        '--nsft-dk-hover', '--nsft-dk-border', '--nsft-dk-border2'];
    const CLARAS = ['--nsft-w-s0', '--nsft-w-s1', '--nsft-w-s2', '--nsft-w-hov',
        '--nsft-w-bd', '--nsft-w-div', '--nsft-w-content'];

    function esOscuro(nombre) {
        return TEMAS_CLAROS.indexOf(String(nombre || '')) === -1;
    }

    function fondoDe(el) {
        if (!el) return null;
        const v = getComputedStyle(el).backgroundColor;
        const m = String(v || '').match(/^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
        if (!m || /rgba\([^)]*,\s*0(\.0+)?\)\s*$/.test(v)) return null;
        return [Number(m[1]), Number(m[2]), Number(m[3])];
    }

    function mezcla(rgb, hacia, f) {
        return 'rgb(' + rgb.map((c) => Math.round(c + (hacia - c) * f)).join(', ') + ')';
    }

    function quita(raiz) {
        if (!raiz) return;
        OSCURAS.concat(CLARAS).forEach((v) => raiz.style.removeProperty(v));
    }

    function pinta(raiz, editor, nombre) {
        if (!raiz) return;
        quita(raiz);
        if (nombre === 'atom-one-light') return;
        const fondo = fondoDe(editor);
        if (!fondo) return;
        const pon = (k, v) => raiz.style.setProperty(k, v);
        if (esOscuro(nombre)) {
            pon('--nsft-dk-surface', mezcla(fondo, 0, 0));
            pon('--nsft-dk-panel', mezcla(fondo, 0, 0.18));
            pon('--nsft-dk-deepest', mezcla(fondo, 0, 0.34));
            pon('--nsft-dk-hover', mezcla(fondo, 255, 0.08));
            pon('--nsft-dk-border', mezcla(fondo, 255, 0.17));
            pon('--nsft-dk-border2', mezcla(fondo, 255, 0.27));
            return;
        }
        pon('--nsft-w-s0', mezcla(fondo, 0, 0));
        pon('--nsft-w-content', mezcla(fondo, 0, 0));
        pon('--nsft-w-s1', mezcla(fondo, 0, 0.03));
        pon('--nsft-w-s2', mezcla(fondo, 0, 0.07));
        pon('--nsft-w-hov', mezcla(fondo, 0, 0.07));
        pon('--nsft-w-div', mezcla(fondo, 0, 0.1));
        pon('--nsft-w-bd', mezcla(fondo, 0, 0.14));
    }

    window.NSFT_MarcoTema = { esOscuro, pinta, quita };
})();
