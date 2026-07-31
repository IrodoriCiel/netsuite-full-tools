
(function () {
    const STORAGE_KEYS = {
        ENABLED: 'enableColorThemes',
        HUE: 'colorThemeHue',
        SAT: 'colorThemeSat',
        LIG: 'colorThemeLig'
    };
    const DARK_KEY = 'enableDarkMode';
    const CACHE_KEY = 'nsftThemeCache';
    const LEGACY_CACHE_KEY = 'nsft_theme_cache';
    const COOKIE_KEY = 'nsftThemeCache';

    const BODY_CLASS = 'nsft-ct-enabled';
    const STYLE_ID = 'nsft-color-theme-vars';

    const DEFAULT_HUE = 216;
    const DEFAULT_SAT = 23;
    const DEFAULT_LIG = 49;

    let _applied = null;
    let _darkOn = false;

    function effectiveLig(lig) {
        return _darkOn ? (100 - lig) : lig;
    }

    function injectStyle(hue, sat, rawLig) {
        const lig = effectiveLig(rawLig);
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

    function toggleTheme(enabled, hue, sat, lig) {
        const next = { enabled, hue, sat, lig, dark: _darkOn };
        if (sameState(_applied, next)) return;
        if (enabled) {
            document.documentElement.classList.add(BODY_CLASS);
            injectStyle(hue, sat, lig);
        } else {
            document.documentElement.classList.remove(BODY_CLASS);
        }
        _applied = next;
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

    function syncWithStorage() {
        chrome.storage.local.get(
            [STORAGE_KEYS.ENABLED, STORAGE_KEYS.HUE, STORAGE_KEYS.SAT, STORAGE_KEYS.LIG, DARK_KEY],
            (items) => {
                const enabled = items[STORAGE_KEYS.ENABLED] !== false;
                const hue = items[STORAGE_KEYS.HUE] !== undefined ? items[STORAGE_KEYS.HUE] : DEFAULT_HUE;
                const sat = items[STORAGE_KEYS.SAT] !== undefined ? items[STORAGE_KEYS.SAT] : DEFAULT_SAT;
                const lig = items[STORAGE_KEYS.LIG] !== undefined ? items[STORAGE_KEYS.LIG] : DEFAULT_LIG;
                _darkOn = items[DARK_KEY] === true;

                toggleTheme(enabled, hue, sat, lig);
                saveToCache(enabled, hue, sat, lig);
            }
        );
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
        const touchedKeys = [STORAGE_KEYS.ENABLED, STORAGE_KEYS.HUE, STORAGE_KEYS.SAT, STORAGE_KEYS.LIG, DARK_KEY]
            .filter(k => changes[k]);
        if (touchedKeys.length === 0) return;

        if (changes[DARK_KEY]) {
            _darkOn = changes[DARK_KEY].newValue === true;
        }

        if (!_applied) {
            syncWithStorage();
            return;
        }

        const next = { ..._applied };
        if (changes[STORAGE_KEYS.ENABLED]) {
            next.enabled = changes[STORAGE_KEYS.ENABLED].newValue !== false;
        }
        if (changes[STORAGE_KEYS.HUE]) {
            const v = changes[STORAGE_KEYS.HUE].newValue;
            next.hue = v !== undefined ? v : DEFAULT_HUE;
        }
        if (changes[STORAGE_KEYS.SAT]) {
            const v = changes[STORAGE_KEYS.SAT].newValue;
            next.sat = v !== undefined ? v : DEFAULT_SAT;
        }
        if (changes[STORAGE_KEYS.LIG]) {
            const v = changes[STORAGE_KEYS.LIG].newValue;
            next.lig = v !== undefined ? v : DEFAULT_LIG;
        }

        toggleTheme(next.enabled, next.hue, next.sat, next.lig);
        saveToCache(next.enabled, next.hue, next.sat, next.lig);
    });

})();
