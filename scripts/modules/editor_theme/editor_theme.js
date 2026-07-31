
(function () {
    'use strict';

    const ENABLE_THEME_KEY = 'enableEditorTheme';
    const ENABLE_CLOSE_AFTER_SAVE_KEY = 'enableEditorCloseAfterSave';

    const DEFAULT_THEME = 'github-dark';

    const CURTAIN_ID = 'nsft-editor-theme-loading-curtain';
    const CURTAIN_TEXT_ID = 'nsft-editor-theme-curtain-text';
    const THEME_STYLE_ID = 'nsft-editor-theme-style-link';
    const SPINNER_CLASS = 'nsft-editor-theme-spinner';
    const CLOSE_AFTER_SAVE_KEY = 'nsftEditorCloseAfterSavePending';
    const SAVE_INTENT_KEY = 'nsftEditorCloseAfterSaveIntent';
    const THEME_CACHE_KEY = 'nsftEditorThemeCache';
    const THEME_CACHE_VERSION = 6;
    const CURTAIN_MAX_MS = 7000;

    const CURTAIN_FLAG_KEY = 'nsftEditorThemeEnabled';

    let _themeApplied = false;
    let _editorMounted = false;
    let _dynamicHideScheduled = false;
    let _fontsInjected = false;

    const _urlParams = new URLSearchParams(window.location.search);
    const IS_EDITOR_PAGE = _urlParams.has('id') && _urlParams.get('syntaxHighlighting') === 'T';

    function findCmEditor() {
        if (window.NSFT_DOM && typeof window.NSFT_DOM.q === 'function') {
            return window.NSFT_DOM.q(
                ['div.cm-editor', 'div[data-widget="Code"] div.cm-editor', '[role="textbox"][contenteditable]'],
                { module: 'editor_theme', purpose: 'cm6-mount-detection' }
            );
        }
        return document.querySelector('div.cm-editor');
    }

    const THEME_PAIRS = {
        'github': 'github-dark',
        'github-dark': 'github',
        'atom-one-light': 'atom-one-dark',
        'atom-one-dark': 'atom-one-light',
        'stackoverflow-light': 'stackoverflow-dark',
        'stackoverflow-dark': 'stackoverflow-light',
        'vs': 'vs2015',
        'vs2015': 'vs'
    };
    const LIGHT_THEMES = new Set([
        'github', 'atom-one-light', 'stackoverflow-light', 'vs', 'default'
    ]);

    let _unifiedDark = false;
    function unifiedPrefersDark() {
        return _unifiedDark;
    }

    function resolveThemeForCurrentScheme(themeName, autoSwitch) {
        if (!autoSwitch) return themeName;
        const pair = THEME_PAIRS[themeName];
        if (!pair) return themeName;
        const wantDark = unifiedPrefersDark();
        const isLight = LIGHT_THEMES.has(themeName);
        if (wantDark && !isLight) return themeName;
        if (!wantDark && isLight) return themeName;
        return pair;
    }

    (function installCurtainASAP() {
        if (!IS_EDITOR_PAGE) return;
        injectEditorFonts();
        if (sessionStorage.getItem(CURTAIN_FLAG_KEY) === '0') return;
        showCurtainNow();
        watchForEditor();
        setTimeout(hideCurtain, CURTAIN_MAX_MS);
    })();

    function injectEditorFonts() {
        if (_fontsInjected) return;
        _fontsInjected = true;
        if (typeof FontFace === 'undefined' || !document.fonts) return;
        const FONTS = [
            { family: 'JetBrains Mono', weight: '400', file: 'jetbrains-mono-400.woff2' },
            { family: 'JetBrains Mono', weight: '700', file: 'jetbrains-mono-700.woff2' },
            { family: 'Fira Code', weight: '400', file: 'fira-code-400.woff2' },
            { family: 'Fira Code', weight: '700', file: 'fira-code-700.woff2' },
            { family: 'Cascadia Code', weight: '400', file: 'cascadia-code-400.woff2' },
            { family: 'Cascadia Code', weight: '700', file: 'cascadia-code-700.woff2' },
            { family: 'Source Code Pro', weight: '400', file: 'source-code-pro-400.woff2' },
            { family: 'Source Code Pro', weight: '700', file: 'source-code-pro-700.woff2' }
        ];
        const loads = FONTS.map((f) => {
            const url = chrome.runtime.getURL('scripts/libs/fonts/' + f.file);
            return fetch(url)
                .then((r) => r.arrayBuffer())
                .then((buf) => {
                    const face = new FontFace(f.family, buf, { weight: f.weight, style: 'normal', display: 'swap' });
                    return face.load();
                })
                .then((face) => { document.fonts.add(face); })
                .catch(() => { });
        });
        Promise.all(loads).then(() => nudgeEditorReflow()).catch(() => { });
    }

    chrome.storage.local.get({ [ENABLE_CLOSE_AFTER_SAVE_KEY]: true }, (items) => {
        if (items[ENABLE_CLOSE_AFTER_SAVE_KEY]) enableCloseAfterSave();
    });

    if (!IS_EDITOR_PAGE) return;

    chrome.storage.local.get({
        [ENABLE_THEME_KEY]: true,
        editorTheme: DEFAULT_THEME,
        editorThemeAutoSwitch: false,
        editorFontFamily: 'JetBrains Mono',
        editorFontSize: 14,
        nsftTheme: 'light',
        [THEME_CACHE_KEY]: null
    }, (items) => {
        _unifiedDark = items.nsftTheme === 'dark';
        const enabled = !!items[ENABLE_THEME_KEY];
        try { sessionStorage.setItem(CURTAIN_FLAG_KEY, enabled ? '1' : '0'); } catch (_) { }

        if (!enabled) {
            hideCurtain();
            return;
        }

        registerThemeChangeListener();

        registerUnifiedThemeListener();

        const resolvedTheme = resolveThemeForCurrentScheme(items.editorTheme, items.editorThemeAutoSwitch);

        const cache = items[THEME_CACHE_KEY];
        const cacheVersionMatches = cache && cache.version === THEME_CACHE_VERSION;
        if (cacheVersionMatches
            && cache.themeName === resolvedTheme
            && cache.fontFamily === items.editorFontFamily
            && cache.fontSize === items.editorFontSize
            && cache.css) {
            injectThemeStyle(cache.css);
            markThemeApplied();
            return;
        }
        if (cache && !cacheVersionMatches) {
            try { chrome.storage.local.remove(THEME_CACHE_KEY); } catch (_) { }
        }


        const startInit = () => {
            if (findCmEditor()) {
                init({ editorTheme: resolvedTheme });
                return true;
            }
            return false;
        };

        if (!startInit()) {
            let unsubscribe;
            const onReady = () => {
                if (startInit() && unsubscribe) unsubscribe();
            };

            if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
                unsubscribe = window.NSFT_Observer.subscribe(onReady);
            } else {
                const observer = new MutationObserver(onReady);
                observer.observe(document.documentElement, { childList: true, subtree: true });
                unsubscribe = () => observer.disconnect();
            }

            setTimeout(() => {
                if (unsubscribe) unsubscribe();
                if (!findCmEditor()) {
                    hideCurtain();
                }
            }, 7000);
        }
    });

    function injectThemeStyle(css) {
        let style = document.getElementById(THEME_STYLE_ID);
        if (!style) {
            style = document.createElement('style');
            style.id = THEME_STYLE_ID;
            (document.head || document.documentElement).appendChild(style);
        }
        style.textContent = css;
        try { document.documentElement.classList.add('nsft-editor-themed'); } catch (_) { }
    }

    let _themeListenerRegistered = false;
    function registerThemeChangeListener() {
        if (_themeListenerRegistered) return;
        _themeListenerRegistered = true;
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            if (changes.editorTheme) {
                const next = changes.editorTheme.newValue || DEFAULT_THEME;
                resetCurtainState();
                showCurtain();
                chrome.storage.local.get({ editorThemeAutoSwitch: false }, (sub) => {
                    updateTheme(resolveThemeForCurrentScheme(next, sub.editorThemeAutoSwitch));
                });
            }
            if (changes.editorThemeAutoSwitch) {
                chrome.storage.local.get({ editorTheme: DEFAULT_THEME }, (current) => {
                    resetCurtainState();
                    showCurtain();
                    updateTheme(resolveThemeForCurrentScheme(current.editorTheme, !!changes.editorThemeAutoSwitch.newValue));
                });
            }
            if (changes.editorFontFamily || changes.editorFontSize) {
                chrome.storage.local.get({
                    editorTheme: DEFAULT_THEME,
                    editorThemeAutoSwitch: false
                }, (current) => {
                    resetCurtainState();
                    showCurtain();
                    updateTheme(resolveThemeForCurrentScheme(current.editorTheme, current.editorThemeAutoSwitch));
                });
            }
            const isCustomFieldChange = Object.keys(changes).some(k => k.indexOf('editorCustom') === 0);
            if (isCustomFieldChange) {
                chrome.storage.local.get({ editorTheme: DEFAULT_THEME }, (current) => {
                    if (current.editorTheme !== 'custom') return;
                    resetCurtainState();
                    updateTheme('custom');
                });
            }
        });
    }

    let _unifiedThemeListenerRegistered = false;
    function registerUnifiedThemeListener() {
        if (_unifiedThemeListenerRegistered) return;
        _unifiedThemeListenerRegistered = true;
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || !changes.nsftTheme) return;
            _unifiedDark = changes.nsftTheme.newValue === 'dark';
            chrome.storage.local.get({ editorTheme: DEFAULT_THEME, editorThemeAutoSwitch: false }, (items) => {
                if (!items.editorThemeAutoSwitch) return;
                const resolved = resolveThemeForCurrentScheme(items.editorTheme, true);
                resetCurtainState();
                showCurtain();
                updateTheme(resolved);
            });
        });
    }

    function init(items) {
        updateTheme(items.editorTheme);
    }

    function enableCloseAfterSave() {
        try {
            const pendingClose = sessionStorage.getItem(CLOSE_AFTER_SAVE_KEY) === '1';
            if (pendingClose) {
                sessionStorage.removeItem(CLOSE_AFTER_SAVE_KEY);
                setTimeout(() => {
                    requestCloseEditorWindow();
                }, 120);
            }

            let _submitCloseFallback = null;

            const markSaveIntent = () => {
                sessionStorage.setItem(SAVE_INTENT_KEY, '1');
            };

            const isSaveButton = (el) => {
                if (!el || !el.id) return false;
                return [
                    'submitter',
                    'secondarysubmitter',
                    'btn_multibutton_submitter',
                    'secondary_btn_multibutton_submitter'
                ].includes(el.id);
            };

            if (document.documentElement && document.documentElement.dataset.nsftSaveClickBound !== '1') {
                document.documentElement.dataset.nsftSaveClickBound = '1';
                document.addEventListener('click', (event) => {
                    const target = event.target;
                    if (!(target instanceof Element)) return;

                    const buttonLike = target.closest('input,button,a');
                    if (buttonLike && isSaveButton(buttonLike)) {
                        markSaveIntent();
                    }
                }, true);
            }

            if (document.documentElement && document.documentElement.dataset.nsftBeforeUnloadBound !== '1') {
                document.documentElement.dataset.nsftBeforeUnloadBound = '1';
                window.addEventListener('beforeunload', () => {
                    if (sessionStorage.getItem(SAVE_INTENT_KEY) === '1') {
                        sessionStorage.setItem(CLOSE_AFTER_SAVE_KEY, '1');
                    }
                    if (_submitCloseFallback) {
                        clearTimeout(_submitCloseFallback);
                        _submitCloseFallback = null;
                    }
                });
            }

            const form = document.getElementById('main_form');
            if (!form || form.dataset.nsftCloseAfterSaveBound === '1') return;

            form.dataset.nsftCloseAfterSaveBound = '1';
            form.addEventListener('submit', () => {
                sessionStorage.setItem(SAVE_INTENT_KEY, '1');
                sessionStorage.setItem(CLOSE_AFTER_SAVE_KEY, '1');
                _submitCloseFallback = setTimeout(requestCloseEditorWindow, 10000);
            }, true);
        } catch (e) {
            console.warn('[NSFT] Close-after-save hook warning', e);
        }
    }

    function requestCloseEditorWindow() {
        try {
            chrome.runtime.sendMessage({ action: 'nsftCloseSenderTab' }, (response) => {
                if (chrome.runtime.lastError || !response || !response.ok) {
                    window.close();
                }
            });
        } catch (e) {
            window.close();
        }
    }

    function showCurtainNow() {
        if (document.getElementById(CURTAIN_ID)) return;

        const curtain = document.createElement('div');
        curtain.id = CURTAIN_ID;
        curtain.style.cssText = [
            'position:fixed',
            'top:0', 'left:0', 'right:0', 'bottom:0',
            'background:#1a1a1a',
            'color:#ffffff',
            'display:flex', 'flex-direction:column',
            'justify-content:center', 'align-items:center',
            'z-index:2147483647',
            'font-family:sans-serif',
            'font-size:20px',
            'opacity:1',
            'transition:opacity 0.25s ease-out'
        ].join(';') + ';';

        const text = chrome.i18n.getMessage('openingFile') || 'Opening file…';

        curtain.innerHTML = `
            <div>
                <svg class="${SPINNER_CLASS}" width="50" height="50" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" stroke-opacity="0.3"></circle>
                    <path d="M12 2C6.48 2 2 6.48 2 12" stroke="currentColor" stroke-width="4" stroke-linecap="round"></path>
                </svg>
            </div>
            <div id="${CURTAIN_TEXT_ID}">${text}</div>
        `;

        const target = document.documentElement || document.body;
        if (target) target.appendChild(curtain);
    }

    function showCurtain() { showCurtainNow(); }

    function hideCurtain() {
        const curtain = document.getElementById(CURTAIN_ID);
        if (!curtain) return;
        curtain.style.opacity = '0';
        setTimeout(() => {
            if (curtain.parentNode) curtain.parentNode.removeChild(curtain);
        }, 300);
    }

    function markThemeApplied() {
        _themeApplied = true;
        tryDynamicHide();
    }

    function markEditorMounted() {
        _editorMounted = true;
        tryDynamicHide();
    }

    function tryDynamicHide() {
        if (_dynamicHideScheduled) return;
        if (!_themeApplied || !_editorMounted) return;
        _dynamicHideScheduled = true;
        requestAnimationFrame(() => requestAnimationFrame(() => {
            hideCurtain();
            nudgeEditorReflow();
        }));
    }

    function nudgeEditorReflow() {
        const fire = () => {
            try { window.dispatchEvent(new Event('resize')); } catch (_) { }
        };
        fire();
        requestAnimationFrame(fire);
        setTimeout(fire, 120);
    }

    function resetCurtainState() {
        _themeApplied = false;
        _dynamicHideScheduled = false;
    }

    function watchForEditor() {
        if (findCmEditor()) {
            markEditorMounted();
            return;
        }
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            const unsub = window.NSFT_Observer.subscribe(() => {
                if (findCmEditor()) {
                    if (unsub) unsub();
                    markEditorMounted();
                }
            });
            setTimeout(() => { if (unsub) unsub(); }, CURTAIN_MAX_MS);
            return;
        }
        const obs = new MutationObserver(() => {
            if (findCmEditor()) {
                obs.disconnect();
                markEditorMounted();
            }
        });
        obs.observe(document.documentElement, { childList: true, subtree: true });
        setTimeout(() => obs.disconnect(), CURTAIN_MAX_MS);
    }

    async function updateTheme(themeName) {
        try {
            const isLight = /light|github(?!-dark)/i.test(themeName);
            const curtain = document.getElementById(CURTAIN_ID);
            if (curtain) {
                if (isLight) {
                    curtain.style.backgroundColor = '#f5f5f5';
                    curtain.style.color = '#333';
                } else {
                    curtain.style.backgroundColor = '#1a1a1a';
                    curtain.style.color = '#ffffff';
                }
            }

            const subPrefs = await getEditorSubPrefs();

            if (themeName === 'custom') {
                const customTheme = await getEditorCustomTheme();
                const tx = window.NSFT_EditorThemeTransform;
                const finalCss = tx && tx.buildCustomThemeCss
                    ? tx.buildCustomThemeCss(customTheme, subPrefs)
                    : '';
                if (finalCss) {
                    injectThemeStyle(finalCss);
                    cacheThemeCss(themeName, finalCss, subPrefs);
                }
                markThemeApplied();
                return;
            }

            const usingDefaults = subPrefs.fontFamily === 'JetBrains Mono' && subPrefs.fontSize === 14;

            if (usingDefaults) {
                const precompiledUrl = chrome.runtime.getURL(`scripts/libs/highlight/themes-cm/${themeName}.css`);
                const precompiled = await tryFetchText(precompiledUrl);
                if (precompiled) {
                    injectThemeStyle(precompiled);
                    cacheThemeCss(themeName, precompiled, subPrefs);
                    markThemeApplied();
                    return;
                }
            }

            const themeUrl = chrome.runtime.getURL(`scripts/libs/highlight/themes/${themeName}.css`);
            const response = await fetch(themeUrl);
            const originalCss = await response.text();

            const transform = window.NSFT_EditorThemeTransform && window.NSFT_EditorThemeTransform.transform;
            const finalCss = transform
                ? transform(themeName, originalCss, subPrefs)
                : originalCss;

            injectThemeStyle(finalCss);
            cacheThemeCss(themeName, finalCss, subPrefs);
            markThemeApplied();
        } catch (e) {
            console.error("[NSFT] Error loading editor theme", e);
            hideCurtain();
        }
    }

    async function tryFetchText(url) {
        try {
            const r = await fetch(url);
            if (!r.ok) return null;
            const text = await r.text();
            return text && text.length > 0 ? text : null;
        } catch (_) { return null; }
    }

    function getEditorSubPrefs() {
        return new Promise((resolve) => {
            chrome.storage.local.get({
                editorFontFamily: 'JetBrains Mono',
                editorFontSize: 14
            }, (items) => resolve({
                fontFamily: items.editorFontFamily,
                fontSize: items.editorFontSize
            }));
        });
    }

    function getEditorCustomTheme() {
        return new Promise((resolve) => {
            chrome.storage.local.get({
                editorCustomBg: '#1e1e1e',
                editorCustomFg: '#d4d4d4',
                editorCustomKeyword: '#569cd6',
                editorCustomLiteral: '#569cd6',
                editorCustomNumber: '#b5cea8',
                editorCustomString: '#ce9178',
                editorCustomVariable: '#9cdcfe',
                editorCustomProperty: '#9cdcfe',
                editorCustomComment: '#6a9955'
            }, (items) => resolve({
                bg: items.editorCustomBg,
                fg: items.editorCustomFg,
                keyword: items.editorCustomKeyword,
                literal: items.editorCustomLiteral,
                number: items.editorCustomNumber,
                string: items.editorCustomString,
                variable: items.editorCustomVariable,
                property: items.editorCustomProperty,
                comment: items.editorCustomComment
            }));
        });
    }

    function cacheThemeCss(themeName, css, subPrefs) {
        try {
            chrome.storage.local.set({
                [THEME_CACHE_KEY]: {
                    version: THEME_CACHE_VERSION,
                    themeName: themeName,
                    fontFamily: subPrefs.fontFamily,
                    fontSize: subPrefs.fontSize,
                    css: css
                }
            });
        } catch (_) { }
    }

})();
