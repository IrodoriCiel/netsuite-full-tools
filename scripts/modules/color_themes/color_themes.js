
(function () {
    const STORAGE_KEYS = {
        ENABLED: 'enableColorThemes',
        HUE: 'colorThemeHue',
        SAT: 'colorThemeSat',
        LIG: 'colorThemeLig'
    };
    const MODE_KEY = 'colorThemeMode';
    const BY_ENV_KEY = 'colorThemeByEnv';
    const ACCOUNTS_KEY = 'colorThemeAccounts';
    const ENV_COLOR_KEYS = {
        PRD: 'colorThemeEnvPrd',
        SB: 'colorThemeEnvSb',
        RP: 'colorThemeEnvRp'
    };
    const DARK_KEY = 'enableDarkMode';
    const CACHE_KEY = 'nsftThemeCache';
    const LEGACY_CACHE_KEY = 'nsft_theme_cache';
    const COOKIE_KEY = 'nsftThemeCache';

    const BODY_CLASS = 'nsft-ct-enabled';
    const CLARA_CLASS = 'nsft-ct-base-clara';
    const CLARA_UMBRAL = 55;
    const STYLE_ID = 'nsft-color-theme-vars';

    const DEFAULT_HUE = 216;
    const DEFAULT_SAT = 23;
    const DEFAULT_LIG = 49;

    let _applied = null;
    let _darkOn = false;

    function effectiveLig(lig) {
        return _darkOn ? (100 - lig) : lig;
    }

    let _familia;
    function envFamilia() {
        if (_familia !== undefined) return _familia;
        _familia = null;
        try {
            const E = globalThis.NSFT_ENV;
            const env = E && E.envFromUrl(location.href);
            if (env && env.code) _familia = E.envFamily(env.code);
        } catch (e) { }
        return _familia;
    }

    function hexToHsl(hex) {
        const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
        if (!m) return null;
        const n = parseInt(m[1], 16);
        const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const l = (max + min) / 2;
        let h = 0, s = 0;
        if (max !== min) {
            const d = max - min;
            s = d / (l > 0.5 ? (2 - max - min) : (max + min));
            if (max === r) h = ((g - b) / d) + (g < b ? 6 : 0);
            else if (max === g) h = ((b - r) / d) + 2;
            else h = ((r - g) / d) + 4;
            h *= 60;
        }
        return { hue: Math.round(h), sat: Math.round(s * 100), lig: Math.round(l * 100) };
    }

    let _cuenta;
    function cuentaId() {
        if (_cuenta !== undefined) return _cuenta;
        _cuenta = '';
        try {
            const m = /^([a-z0-9_-]+)\.(?:app|extforms)\.netsuite\.com$/i.exec(location.hostname);
            if (m) {
                const sub = m[1].toLowerCase();
                const partes = sub.split('-');
                const sufijo = partes.length > 1 ? partes[partes.length - 1].toUpperCase() : '';
                _cuenta = /^(SB\d*|RP|TD)$/.test(sufijo) ? partes.slice(0, -1).join('-') : sub;
            }
        } catch (e) { }
        return _cuenta;
    }

    function resolverModo(items) {
        const m = items[MODE_KEY];
        if (m === 'global' || m === 'env' || m === 'accounts') return m;
        return items[BY_ENV_KEY] === true ? 'env' : 'global';
    }

    function resolverTerna(items) {
        const base = {
            hue: items[STORAGE_KEYS.HUE] !== undefined ? items[STORAGE_KEYS.HUE] : DEFAULT_HUE,
            sat: items[STORAGE_KEYS.SAT] !== undefined ? items[STORAGE_KEYS.SAT] : DEFAULT_SAT,
            lig: items[STORAGE_KEYS.LIG] !== undefined ? items[STORAGE_KEYS.LIG] : DEFAULT_LIG
        };
        const modo = resolverModo(items);

        if (modo === 'env') {
            const clave = ENV_COLOR_KEYS[envFamilia()];
            return clave ? (hexToHsl(items[clave]) || base) : base;
        }

        if (modo === 'accounts') {
            const fichas = items[ACCOUNTS_KEY];
            const ficha = fichas && cuentaId() ? fichas[cuentaId()] : null;
            if (!ficha) return base;
            if (ficha.single) return hexToHsl(ficha.color) || base;
            const fam = envFamilia();
            return fam ? (hexToHsl(ficha[fam]) || base) : base;
        }

        return base;
    }

    function injectStyle(hue, sat, rawLig) {
        const lig = effectiveLig(rawLig);
        document.documentElement.classList.toggle(CLARA_CLASS, lig >= CLARA_UMBRAL);
        let style = document.getElementById(STYLE_ID);
        if (!style) {
            style = document.createElement('style');
            style.id = STYLE_ID;
            (document.head || document.documentElement).appendChild(style);
        }
        const base = `hsl(${hue}, ${sat}%, ${lig}%)`;
        style.textContent = `
            :root { --h: ${hue}; --s-val: ${sat}; --l-val: ${lig}; }
            html.${BODY_CLASS} [data-header-section="navigation"],
            html.${BODY_CLASS} [data-widget="MenuBar"],
            html.${BODY_CLASS} [data-widget="MenuBar"] [role="menubar"],
            html.${BODY_CLASS} [data-widget="MenuBar"] [role="menuitem"][data-widget="MenuItem"] {
                background-color: ${base} !important;
            }
        `;
    }

    function sameState(a, b) {
        return !!a && !!b && a.enabled === b.enabled && a.hue === b.hue && a.sat === b.sat && a.lig === b.lig
            && a.dark === b.dark;
    }



    const SEL_CABECERA = ['[data-header-section="navigation"]', '[data-widget="MenuBar"]'];

    const ACENTO_CACHE = 'nsftNsAccent';

    function claveAcento() {
        try { return ACENTO_CACHE + ':' + location.host; } catch (e) { return ACENTO_CACHE; }
    }

    function rgbAHsl(txt) {
        const m = String(txt || '').match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (!m) return null;
        const r = +m[1] / 255;
        const g = +m[2] / 255;
        const b = +m[3] / 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const l = (max + min) / 2;
        if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) };
        const d = max - min;
        const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        let h;
        if (max === r) h = ((g - b) / d) + (g < b ? 6 : 0);
        else if (max === g) h = ((b - r) / d) + 2;
        else h = ((r - g) / d) + 4;
        return { h: Math.round(h * 60), s: Math.round(s * 100), l: Math.round(l * 100) };
    }

    function leeAcentoNativo() {
        for (let i = 0; i < SEL_CABECERA.length; i++) {
            const el = document.querySelector(SEL_CABECERA[i]);
            if (!el) continue;
            let c = '';
            try { c = window.getComputedStyle(el).backgroundColor; } catch (e) { continue; }
            if (!c || c === 'transparent' || /rgba\([^)]*,\s*0\s*\)/.test(c)) continue;
            const hsl = rgbAHsl(c);
            if (!hsl || hsl.s < 8 || hsl.l > 88) continue;
            return hsl;
        }
        return null;
    }

    function publicaAcentoNativo(hsl) {
        if (!hsl) return;
        let st = document.getElementById(ACENTO_STYLE_ID);
        if (!st) {
            st = document.createElement('style');
            st.id = ACENTO_STYLE_ID;
            (document.head || document.documentElement).appendChild(st);
        }
        const sat = Math.min(hsl.s, DEFAULT_SAT);

        const esElDeSiempre = Math.abs(hsl.h - DEFAULT_HUE) <= 8 && Math.abs(hsl.s - DEFAULT_SAT) <= 8;
        const luzBtn = Math.max(30, Math.min(45, hsl.l + 3));
        const primario = esElDeSiempre ? '' :
            ' --nsft-ns-primary: hsl(' + hsl.h + ', ' + hsl.s + '%, ' + luzBtn + '%);'
            + ' --nsft-ns-primary-hover: hsl(' + hsl.h + ', ' + hsl.s + '%, ' + (luzBtn - 7) + '%);';

        const txt = ':root { --h: ' + hsl.h + '; --s-val: ' + sat + ';' + primario + ' }';
        if (st.textContent !== txt) st.textContent = txt;
        document.documentElement.classList.add(ACENTO_CLASS);
    }

    function quitaAcentoNativo() {
        const st = document.getElementById(ACENTO_STYLE_ID);
        if (st) st.remove();
        document.documentElement.classList.remove(ACENTO_CLASS);
    }

    const ACENTO_STYLE_ID = 'nsft-ns-accent-vars';
    const ACENTO_CLASS = 'nsft-ns-accent';

    let _acentoBuscando = false;

    function arrancaAcentoNativo() {
        if (_applied && _applied.enabled) { quitaAcentoNativo(); return; }

        try {
            const guardado = JSON.parse(localStorage.getItem(claveAcento()) || 'null');
            if (guardado && guardado.h != null) publicaAcentoNativo(guardado);
        } catch (e) { }

        const mira = () => {
            const hsl = leeAcentoNativo();
            if (!hsl) return false;
            publicaAcentoNativo(hsl);
            try { localStorage.setItem(claveAcento(), JSON.stringify(hsl)); } catch (e) { }
            return true;
        };
        if (mira() || _acentoBuscando) return;

        _acentoBuscando = true;
        if (typeof MutationObserver === 'undefined') return;
        let obs = null;
        const fin = () => { if (obs) { obs.disconnect(); obs = null; } _acentoBuscando = false; };
        try {
            obs = new MutationObserver(() => { if (mira()) fin(); });
            obs.observe(document.documentElement, { childList: true, subtree: true });
            setTimeout(fin, 10000);
        } catch (e) { _acentoBuscando = false; }
    }

    function toggleTheme(enabled, hue, sat, lig) {
        const next = { enabled, hue, sat, lig, dark: _darkOn };
        if (sameState(_applied, next)) return;
        if (enabled) {
            document.documentElement.classList.add(BODY_CLASS);
            injectStyle(hue, sat, lig);
        } else {
            document.documentElement.classList.remove(BODY_CLASS);
            document.documentElement.classList.remove(CLARA_CLASS);
        }
        _applied = next;
        arrancaAcentoNativo();
    }

    function saveToCache(enabled, hue, sat, lig) {
        const payload = JSON.stringify({ enabled, hue, sat, lig, dark: _darkOn });
        try {
            localStorage.setItem(CACHE_KEY, payload);
        } catch (e) {
        }
        try {
            document.cookie = COOKIE_KEY + '=' + encodeURIComponent(payload) +
                '; path=/; max-age=31536000; SameSite=Lax; Secure';
        } catch (e) {
        }
    }

    function readCookieCache() {
        try {
            const m = document.cookie.match(/(?:^|;\s*)nsftThemeCache=([^;]+)/);
            if (!m) return null;
            return JSON.parse(decodeURIComponent(m[1]));
        } catch (e) {
            return null;
        }
    }

    function migrateLegacyCache() {
        try {
            const legacy = localStorage.getItem(LEGACY_CACHE_KEY);
            if (!legacy) return;
            if (!localStorage.getItem(CACHE_KEY)) {
                localStorage.setItem(CACHE_KEY, legacy);
            }
            localStorage.removeItem(LEGACY_CACHE_KEY);
        } catch (e) {
        }
    }

    const WATCHED_KEYS = [
        STORAGE_KEYS.ENABLED, STORAGE_KEYS.HUE, STORAGE_KEYS.SAT, STORAGE_KEYS.LIG, DARK_KEY,
        MODE_KEY, BY_ENV_KEY, ACCOUNTS_KEY,
        ENV_COLOR_KEYS.PRD, ENV_COLOR_KEYS.SB, ENV_COLOR_KEYS.RP
    ];
    let _prefs = null;

    function aplicarDesdePrefs() {
        const enabled = _prefs[STORAGE_KEYS.ENABLED] === true;
        const t = resolverTerna(_prefs);
        toggleTheme(enabled, t.hue, t.sat, t.lig);
        saveToCache(enabled, t.hue, t.sat, t.lig);
    }

    function syncWithStorage() {
        chrome.storage.local.get(WATCHED_KEYS, (items) => {
            _prefs = items;
            _darkOn = items[DARK_KEY] === true;
            aplicarDesdePrefs();
        });
    }

    migrateLegacyCache();

    try {
        let parsed = null;
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) parsed = JSON.parse(cached);
        } catch (e) { }
        if (!parsed) parsed = readCookieCache();

        if (parsed) {
            const enabled = parsed.enabled;
            const hue = parsed.hue !== undefined ? parsed.hue : DEFAULT_HUE;
            const sat = parsed.sat !== undefined ? parsed.sat : DEFAULT_SAT;
            const lig = parsed.lig !== undefined ? parsed.lig : DEFAULT_LIG;
            _darkOn = parsed.dark === true;
            toggleTheme(enabled, hue, sat, lig);
        } else {
            toggleTheme(true, DEFAULT_HUE, DEFAULT_SAT, DEFAULT_LIG);
        }
    } catch (e) {
        toggleTheme(true, DEFAULT_HUE, DEFAULT_SAT, DEFAULT_LIG);
    }

    syncWithStorage();

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (!WATCHED_KEYS.some(k => changes[k])) return;

        if (changes[DARK_KEY]) {
            _darkOn = changes[DARK_KEY].newValue === true;
        }

        if (!_prefs) {
            syncWithStorage();
            return;
        }
        WATCHED_KEYS.forEach((k) => {
            if (changes[k]) _prefs[k] = changes[k].newValue;
        });
        aplicarDesdePrefs();
    });

})();
