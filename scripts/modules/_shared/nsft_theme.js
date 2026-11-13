(function () {
    'use strict';

    function stamp(mode) {
        try {
            const el = document.documentElement;
            if (el) el.setAttribute('data-nsft-theme', mode === 'dark' ? 'dark' : 'light');
        } catch (e) { }
    }

    const NS_ACCENT_VARS = ['--nsft-ns-button', '--nsft-ns-accent', '--nsft-ns-accent-bd', '--nsft-ns-accent-hover',
        '--nsft-ns-accent-soft', '--nsft-ns-accent-light', '--nsft-ns-accent-light-bd',
        '--nsft-ns-accent-light-hover', '--nsft-ns-accent-darksoft'];

    const BAR_KEY = 'nsftNsBarColors';
    let _barraLeida = false;
    let _barraGuardada = null;

    function recordarBarra(rgb) {
        if (window.top !== window || _barraGuardada === rgb) return;
        _barraGuardada = rgb;
        try {
            chrome.storage.local.get({ [BAR_KEY]: {} }, (items) => {
                const mapa = items[BAR_KEY] || {};
                if (mapa[location.hostname] === rgb) return;
                mapa[location.hostname] = rgb;
                chrome.storage.local.set({ [BAR_KEY]: mapa });
            });
        } catch (e) { }
    }

    function usarBarraGuardada(clear) {
        try {
            chrome.storage.local.get({ [BAR_KEY]: {} }, (items) => {
                if (_barraLeida) return;
                const valor = (items[BAR_KEY] || {})[location.hostname];
                if (!valor) { clear(); return; }
                const p = valor.split(',').map(Number);
                pintarAcento(p[0], p[1], p[2]);
            });
        } catch (e) { clear(); }
    }

    function sampleAccent() {
        const root = document.documentElement;
        const clear = () => { _ultimoAcento = ''; NS_ACCENT_VARS.forEach(v => root.style.removeProperty(v)); };

        let doc = document;
        try { if (window.top && window.top.document) doc = window.top.document; } catch (e) { }

        const nav = doc.querySelector('[data-header-section="navigation"], [data-widget="MenuBar"]');
        if (!nav) { usarBarraGuardada(clear); return false; }

        const conTema = [doc.documentElement, document.documentElement].some((h) => h && h.classList.contains('nsft-ct-enabled'));
        const esRedwood = !!doc.querySelector('link[rel="stylesheet"][href*="/redwood/"]');
        let fuente = nav;
        if (esRedwood && !conTema) {
            const boton = doc.querySelector('button.uir-button[data-button-type="primary"], .uir-button[data-button-type="primary"]');
            if (boton && opaco(boton)) fuente = boton;
            else { usarBarraGuardada(() => pintarDe(nav, clear)); return false; }
        }
        return pintarDe(fuente, clear);
    }

    function opaco(el) {
        const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(getComputedStyle(el).backgroundColor || '');
        return !!m && !(m[4] !== undefined && parseFloat(m[4]) < 0.9);
    }

    function pintarDe(el, clear) {
        const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(getComputedStyle(el).backgroundColor || '');
        if (!m) { clear(); return false; }
        if (m[4] !== undefined && parseFloat(m[4]) < 0.9) { clear(); return false; }

        _barraLeida = true;
        pintarAcento(+m[1], +m[2], +m[3]);
        recordarBarra(m[1] + ',' + m[2] + ',' + m[3]);
        return true;
    }

    let _ultimoAcento = '';

    function pintarAcento(rojo, verde, azul) {
        const root = document.documentElement;
        const clave = rojo + ',' + verde + ',' + azul;
        if (clave === _ultimoAcento && root.style.getPropertyValue('--nsft-ns-accent')) return;
        _ultimoAcento = clave;

        const r = rojo / 255, g = verde / 255, b = azul / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
        const l = (max + min) / 2;
        const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
        let h = 0;
        if (d !== 0) {
            if (max === r) h = ((g - b) / d) % 6;
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h = (h * 60 + 360) % 360;
        }

        const H = Math.round(h);
        const S = Math.round(Math.min(s * 100, 85));
        const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
        const hsl = (ll, ss) => 'hsl(' + H + ', ' + (ss === undefined ? S : ss) + '%, ' + Math.round(ll) + '%)';
        const base = s < 0.14 ? clamp(l * 100, 12, 46) : clamp(l * 100, 30, 46);

        const set = (n, v) => root.style.setProperty(n, v);
        const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
        const contraste = (f) => 1.05 / (0.2126 * lin(rojo * f) + 0.7152 * lin(verde * f) + 0.0722 * lin(azul * f) + 0.05);
        let k = 1;
        while (k > 0.3 && contraste(k) < 4.5) k -= 0.02;
        set('--nsft-ns-button', 'rgb(' + Math.round(rojo * k) + ', ' + Math.round(verde * k) + ', ' + Math.round(azul * k) + ')');
        set('--nsft-ns-accent', hsl(base));
        set('--nsft-ns-accent-bd', hsl(clamp(base - 8, 20, 40)));
        set('--nsft-ns-accent-hover', hsl(clamp(base + 8, 34, 58)));
        set('--nsft-ns-accent-soft', hsl(95, Math.min(S, 60)));
        set('--nsft-ns-accent-light', hsl(74));
        set('--nsft-ns-accent-light-bd', hsl(62));
        set('--nsft-ns-accent-light-hover', hsl(80));
        set('--nsft-ns-accent-darksoft', hsl(16, 30));
    }

    function markRedwood() {
        let doc = document;
        try { if (window.top && window.top.document) doc = window.top.document; } catch (e) { }
        const es = !!doc.querySelector('link[rel="stylesheet"][href*="/redwood/"]');
        const root = document.documentElement;
        if (es) root.setAttribute('data-nsft-redwood', '');
        else root.removeAttribute('data-nsft-redwood');
        if (es) root.removeAttribute('data-nsft-clasico');
        else root.setAttribute('data-nsft-clasico', '');
        return es;
    }

    function trasPintar(fn) {
        let hecho = false;
        const una = () => { if (!hecho) { hecho = true; fn(); } };
        try { window.requestAnimationFrame(() => setTimeout(una, 0)); } catch (e) { }
        setTimeout(una, 1000);
    }

    function scheduleSample() {
        let tries = 0;
        const tick = () => {
            markRedwood();
            if (sampleAccent()) return;
            if (++tries >= 6) return;
            setTimeout(tick, 300 * tries);
        };
        const primera = () => {
            markRedwood();
            usarBarraGuardada(() => {});
            trasPintar(tick);
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', primera, { once: true });
        } else {
            primera();
        }
        if (document.readyState !== 'complete') {
            window.addEventListener('load', () => setTimeout(sampleAccent, 200), { once: true });
        }
    }

    try {
        chrome.storage.local.get({ nsftTheme: 'light' }, (items) => {
            stamp(items.nsftTheme);
        });
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            if (changes.nsftTheme) stamp(changes.nsftTheme.newValue);
            if (changes.colorThemeHue || changes.colorThemeSat || changes.colorThemeLig
                || changes.enableColorThemes || changes.nsftTheme) {
                setTimeout(sampleAccent, 120);
            }
            if (changes[BAR_KEY] && !_barraLeida) sampleAccent();
        });
    } catch (e) {
        stamp('light');
    }

    scheduleSample();

    try {
        let tenia = document.documentElement.classList.contains('nsft-ct-enabled');
        new MutationObserver(() => {
            const tiene = document.documentElement.classList.contains('nsft-ct-enabled');
            if (tiene === tenia) return;
            tenia = tiene;
            setTimeout(sampleAccent, 60);
        }).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    } catch (e) { }
})();
