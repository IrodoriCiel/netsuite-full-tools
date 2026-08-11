(function () {
    'use strict';

    function stamp(mode) {
        try {
            const el = document.documentElement;
            if (el) el.setAttribute('data-nsft-theme', mode === 'dark' ? 'dark' : 'light');
        } catch (e) { }
    }

    const NS_ACCENT_VARS = ['--nsft-ns-accent', '--nsft-ns-accent-bd', '--nsft-ns-accent-hover',
        '--nsft-ns-accent-soft', '--nsft-ns-accent-light', '--nsft-ns-accent-light-bd',
        '--nsft-ns-accent-light-hover', '--nsft-ns-accent-darksoft'];

    function sampleAccent() {
        const root = document.documentElement;
        const clear = () => NS_ACCENT_VARS.forEach(v => root.style.removeProperty(v));

        let doc = document;
        try { if (window.top && window.top.document) doc = window.top.document; } catch (e) { }

        const nav = doc.querySelector('[data-header-section="navigation"], [data-widget="MenuBar"]');
        if (!nav) { clear(); return false; }
        const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/.exec(getComputedStyle(nav).backgroundColor || '');
        if (!m) { clear(); return true; }
        if (m[4] !== undefined && parseFloat(m[4]) < 0.9) { clear(); return true; }

        const r = m[1] / 255, g = m[2] / 255, b = m[3] / 255;
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
        if (s < 0.14) { clear(); return true; }

        const H = Math.round(h);
        const S = Math.round(Math.min(s * 100, 85));
        const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
        const hsl = (ll, ss) => 'hsl(' + H + ', ' + (ss === undefined ? S : ss) + '%, ' + Math.round(ll) + '%)';
        const base = clamp(l * 100, 30, 46);

        const set = (n, v) => root.style.setProperty(n, v);
        set('--nsft-ns-accent', hsl(base));
        set('--nsft-ns-accent-bd', hsl(clamp(base - 8, 20, 40)));
        set('--nsft-ns-accent-hover', hsl(clamp(base + 8, 34, 58)));
        set('--nsft-ns-accent-soft', hsl(95, Math.min(S, 60)));
        set('--nsft-ns-accent-light', hsl(74));
        set('--nsft-ns-accent-light-bd', hsl(62));
        set('--nsft-ns-accent-light-hover', hsl(80));
        set('--nsft-ns-accent-darksoft', hsl(16, 30));
        return true;
    }

    function scheduleSample() {
        let tries = 0;
        const tick = () => {
            if (sampleAccent()) return;
            if (++tries >= 6) return;
            setTimeout(tick, 300 * tries);
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', tick, { once: true });
        } else {
            tick();
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
        });
    } catch (e) {
        stamp('light');
    }

    scheduleSample();
})();
