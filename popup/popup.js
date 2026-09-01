(function applyStoredTheme() {
    try {
        chrome.storage.local.get({ nsftTheme: 'light', enableDarkMode: false }, (items) => {
            const isDark = items.enableDarkMode === true || items.nsftTheme === 'dark';
            applyTheme(isDark ? 'dark' : 'light');
            cacheThemeMode(isDark ? 'dark' : 'light');
            initializeThemeToggle(isDark ? 'dark' : 'light');
            const want = { nsftTheme: isDark ? 'dark' : 'light', enableDarkMode: isDark };
            if (items.nsftTheme !== want.nsftTheme || items.enableDarkMode !== want.enableDarkMode) {
                chrome.storage.local.set(want);
            }
        });
    } catch (e) {
        applyTheme('light');
    }
})();

function cacheThemeMode(mode) {
    try { localStorage.setItem('nsftThemeCache', mode); } catch (e) { }
}

function applyTheme(mode) {
    document.documentElement.setAttribute('data-theme', mode === 'dark' ? 'dark' : 'light');
}

function paintThemeToggle(mode) {
    const btn = document.getElementById('nsftThemeToggle');
    if (!btn) return;
    btn.setAttribute('data-mode', mode);
    const key = mode === 'dark' ? 'themeToggleToLight' : 'themeToggleToDark';
    const label = chrome.i18n.getMessage(key)
        || (mode === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
    btn.title = label;
    btn.setAttribute('aria-label', label);
}

function setUnifiedTheme(isDark) {
    const mode = isDark ? 'dark' : 'light';
    applyTheme(mode);
    cacheThemeMode(mode);
    paintThemeToggle(mode);
    const cb = document.getElementById('enableDarkMode');
    if (cb && cb.checked !== isDark) cb.checked = isDark;
    chrome.storage.local.set({ nsftTheme: mode, enableDarkMode: isDark }, () => {
        applyCodeThemesForNsftTheme(mode);
    });
}

chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.enableDarkMode) return;
    const isDark = changes.enableDarkMode.newValue === true;
    const mode = isDark ? 'dark' : 'light';
    applyTheme(mode);
    cacheThemeMode(mode);
    paintThemeToggle(mode);
    const cb = document.getElementById('enableDarkMode');
    if (cb && cb.checked !== isDark) cb.checked = isDark;
});

function initializeThemeToggle(initialMode) {
    const btn = document.getElementById('nsftThemeToggle');
    if (!btn) return;
    paintThemeToggle(initialMode);

    btn.addEventListener('click', () => {
        const current = btn.getAttribute('data-mode') || 'light';
        setUnifiedTheme(current !== 'dark');
    });

    const cb = document.getElementById('enableDarkMode');
    if (cb) cb.addEventListener('change', () => setUnifiedTheme(cb.checked));

    applyCodeThemesForNsftTheme(resolveEffectiveTheme(initialMode));
}

function resolveEffectiveTheme(mode) {
    return mode === 'dark' ? 'dark' : 'light';
}

const AUTO_THEME = 'auto';

const CODE_THEME_OVERRIDE = {
    viewRecordObjectTheme: 'viewRecordObjectThemeOverridden',
    suiteqlTheme: 'suiteqlThemeOverridden',
    suitescriptConsoleTheme: 'suitescriptConsoleThemeOverridden',
    advancedEditorTheme: 'advancedEditorThemeOverridden'
};

const CODE_THEME_PAIR = {
    viewRecordObjectTheme: { light: 'atom-one-light', dark: 'atom-one-dark' },
    suiteqlTheme: { light: 'atom-one-light', dark: 'atom-one-dark' },
    suitescriptConsoleTheme: { light: 'atom-one-light', dark: 'atom-one-dark' },
    advancedEditorTheme: { light: 'atom-one-light', dark: 'atom-one-dark' }
};

function themeForMode(key, isDark) {
    const par = CODE_THEME_PAIR[key];
    if (!par) return null;
    return isDark ? par.dark : par.light;
}

function isDarkNow() {
    return document.documentElement.getAttribute('data-nsft-theme') === 'dark';
}

function applyCodeThemesForNsftTheme(resolvedTheme) {
    const isDark = resolvedTheme === 'dark';
    chrome.storage.local.get({
        viewRecordObjectThemeOverridden: false,
        suiteqlThemeOverridden: false,
        suitescriptConsoleThemeOverridden: false,
        advancedEditorThemeOverridden: false,
        viewRecordObjectTheme: null,
        suiteqlTheme: null,
        suitescriptConsoleTheme: null,
        advancedEditorTheme: null
    }, (items) => {
        const updates = {};
        if (!items.viewRecordObjectThemeOverridden) {
            const target = isDark ? 'atom-one-dark' : 'atom-one-light';
            if (items.viewRecordObjectTheme !== target) {
                updates.viewRecordObjectTheme = target;
            }
        }
        if (!items.suiteqlThemeOverridden) {
            const target = isDark ? 'atom-one-dark' : 'atom-one-light';
            if (items.suiteqlTheme !== target) {
                updates.suiteqlTheme = target;
            }
        }
        if (!items.suitescriptConsoleThemeOverridden) {
            const target = isDark ? 'atom-one-dark' : 'atom-one-light';
            if (items.suitescriptConsoleTheme !== target) {
                updates.suitescriptConsoleTheme = target;
            }
        }
        if (!items.advancedEditorThemeOverridden) {
            const target = isDark ? 'atom-one-dark' : 'atom-one-light';
            if (items.advancedEditorTheme !== target) {
                updates.advancedEditorTheme = target;
            }
        }
        if (Object.keys(updates).length === 0) return;

        chrome.storage.local.set(updates, () => {
            if (updates.viewRecordObjectTheme) {
                const sel = document.getElementById('viewRecordObjectTheme');
                if (sel) sel.value = updates.viewRecordObjectTheme;
            }
            if (updates.suiteqlTheme) {
                const sel = document.getElementById('suiteqlTheme');
                if (sel) sel.value = updates.suiteqlTheme;
            }
            if (updates.suitescriptConsoleTheme) {
                const sel = document.getElementById('suitescriptConsoleTheme');
                if (sel) sel.value = updates.suitescriptConsoleTheme;
            }
            if (updates.advancedEditorTheme) {
                const sel = document.getElementById('advancedEditorTheme');
                if (sel) sel.value = updates.advancedEditorTheme;
            }
        });
    });
}

document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    if (key) {
        const msg = chrome.i18n.getMessage(key);
        if (msg) el.textContent = msg;
    }
});
document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key) {
        const msg = chrome.i18n.getMessage(key);
        if (msg) el.setAttribute('placeholder', msg);
    }
});
document.querySelectorAll("[data-i18n-title]").forEach(el => {
    const key = el.getAttribute("data-i18n-title");
    if (key) {
        const msg = chrome.i18n.getMessage(key);
        if (msg) el.setAttribute('title', msg);
    }
});

(function renderPopupVersion() {
    let version = '';
    try { version = chrome.runtime.getManifest().version || ''; } catch (e) { }
    if (!version) return;

    ['popupVersion', 'nsftDevTap'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.textContent = 'v' + version;
    });
})();

const NSFT_DEV_KEY = 'nsftDevMode';
const NSFT_DEV_TAPS_NEEDED = 10;
const NSFT_DEV_HINT_FROM_LEFT = 3;
const NSFT_DEV_TAP_WINDOW_MS = 3000;

(function setupDevMode() {
    const tap = document.getElementById('nsftDevTap');
    const group = document.getElementById('nsftDevGroup');
    if (!tap || !group) return;

    const show = (on) => { group.hidden = !on; };

    const hintEl = document.getElementById('nsftDevTapHint');
    let hintTimer = null;
    const hint = (text) => {
        if (!hintEl) return;
        clearTimeout(hintTimer);
        if (!text) { hintEl.hidden = true; hintEl.textContent = ''; return; }
        hintEl.textContent = text;
        hintEl.hidden = false;
        hintTimer = setTimeout(() => { hintEl.hidden = true; hintEl.textContent = ''; }, 2000);
    };

    chrome.storage.local.get({ [NSFT_DEV_KEY]: false }, (items) => {
        show(!!items[NSFT_DEV_KEY]);
    });

    let taps = 0;
    let lastTap = 0;

    tap.addEventListener('click', () => {
        if (!group.hidden) {
            showToast(chrome.i18n.getMessage('devModeAlready') || 'Modo desarrollador ya activado');
            group.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }

        const now = Date.now();
        taps = (now - lastTap > NSFT_DEV_TAP_WINDOW_MS) ? 1 : taps + 1;
        lastTap = now;

        const left = NSFT_DEV_TAPS_NEEDED - taps;

        if (left > 0) {
            if (left <= NSFT_DEV_HINT_FROM_LEFT) {
                hint(left === 1
                    ? (chrome.i18n.getMessage('devTapHintOne') || '1 toque más…')
                    : (chrome.i18n.getMessage('devTapHint', [String(left)]) || `${left} toques más…`));
            }
            return;
        }

        taps = 0;
        hint('');
        chrome.storage.local.set({ [NSFT_DEV_KEY]: true }, () => {
            show(true);
            showToast(chrome.i18n.getMessage('devModeOn') || 'Modo desarrollador activado');
            group.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
    });

    const resetNotice = document.getElementById('nsftDevResetNotice');
    if (resetNotice) {
        resetNotice.addEventListener('click', () => {
            chrome.storage.local.remove('nsftUpdateSeenVersion', () => {
                showToast(
                    chrome.i18n.getMessage('devResetNoticeDone') ||
                    'Aviso de novedades reiniciado. Ya aparece en tus pestañas de NetSuite abiertas.',
                    { duration: 4000 }
                );
            });
        });
    }

    const freshInstall = document.getElementById('nsftDevFreshInstall');
    if (freshInstall) {
        freshInstall.addEventListener('click', () => {
            chrome.storage.local.remove('nsftOnboardingDone', () => {
                chrome.tabs.create({ url: chrome.runtime.getURL('welcome/welcome.html') });
            });
        });
    }

    const resetRate = document.getElementById('nsftDevResetRate');
    if (resetRate) {
        resetRate.addEventListener('click', () => {
            chrome.storage.local.set({
                nsftInstalledAt: Date.now() - (8 * 86400000),
                nsftRatePages: 25,
                nsftRatePrompt: { off: false, snoozeUntil: 0 }
            }, () => {
                chrome.storage.local.remove('nsftPromptGate', () => {
                    showToast(
                        chrome.i18n.getMessage('devResetRateDone') ||
                        'Aviso de calificación reiniciado. Ya aparece en tus pestañas de NetSuite abiertas.',
                        { duration: 4000 }
                    );
                });
            });
        });
    }

    const enElManifest = (ruta) => {
        try {
            const m = chrome.runtime.getManifest();
            return (m.content_scripts || []).some((c) => (c.js || []).some((f) => f.indexOf(ruta) !== -1));
        } catch (e) { return true; }
    };

    const resetShare = document.getElementById('nsftDevResetShare');
    if (resetShare) {
        resetShare.addEventListener('click', () => {
            if (!enElManifest('share_prompt/share_prompt.js')) {
                showToast(
                    chrome.i18n.getMessage('devModuleNotLoaded') ||
                    'Ese módulo aún no está en la extensión cargada. Recárgala en chrome://extensions y refresca la pestaña de NetSuite.',
                    { duration: 7000 }
                );
                return;
            }
            chrome.storage.local.set({
                nsftInstalledAt: Date.now() - (22 * 86400000),
                nsftRatePages: 120,
                nsftSharePrompt: { off: false, snoozeUntil: 0 },
                nsftRatePrompt: { off: false, snoozeUntil: 130 }
            }, () => {
                chrome.storage.local.remove('nsftPromptGate', () => {
                    setTimeout(() => {
                        chrome.storage.local.get({ nsftPromptDebug: null }, (d) => {
                            const r = d && d.nsftPromptDebug;
                            const fresco = r && r.id === 'share' && (Date.now() - r.at) < 6000;
                            if (fresco && r.que === 'pintado') {
                                showToast(
                                    chrome.i18n.getMessage('devResetShareDone') ||
                                    'Aviso de compartir reiniciado. Ya aparece en tus pestañas de NetSuite abiertas.',
                                    { duration: 4000 }
                                );
                                return;
                            }
                            const porQue = fresco ? r.que
                                : (chrome.i18n.getMessage('devPromptNoAnswer') || 'ninguna pestaña respondió — refréscala');
                            showToast(
                                (chrome.i18n.getMessage('devPromptFailed') || 'El aviso no llegó a verse') + ': ' + porQue,
                                { duration: 8000 }
                            );
                        });
                    }, 900);
                });
            });
        });
    }

    const disable = document.getElementById('nsftDevDisable');
    if (disable) {
        disable.addEventListener('click', () => {
            chrome.storage.local.set({ [NSFT_DEV_KEY]: false }, () => {
                show(false);
                taps = 0;
                hint('');
                showToast(chrome.i18n.getMessage('devModeOff') || 'Modo desarrollador desactivado');
            });
        });
    }
})();

(function setupShortcutKeyStyle() {
    const sel = document.getElementById('shortcutKeyStyle');
    if (!sel) return;

    chrome.storage.local.get({ shortcutKeyStyle: 'auto' }, (items) => {
        const v = items && items.shortcutKeyStyle;
        sel.value = (v === 'mac' || v === 'win') ? v : 'auto';
    });

    sel.addEventListener('change', () => {
        chrome.storage.local.set({ shortcutKeyStyle: sel.value }, () => {
            showToast(
                chrome.i18n.getMessage('shortcutKeyStyleDone') ||
                'Recarga la pestaña de NetSuite y reabre este panel para verlo.',
                { duration: 4000 }
            );
        });
    });
})();

const DEFAULTS = globalThis.NSFT_DEFAULTS || {};

function nsftHslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = n => Math.round(255 * f(n)).toString(16).padStart(2, '0');
    return '#' + toHex(0) + toHex(8) + toHex(4);
}

function nsftMatchColorThemePreset(h, s, l) {
    const sel = document.getElementById('colorThemePreset');
    if (!sel) return;
    let matched = 'custom';
    for (const opt of sel.options) {
        if (opt.value === 'custom') continue;
        if (+opt.dataset.h === h && +opt.dataset.s === s && +opt.dataset.l === l) {
            matched = opt.value;
            break;
        }
    }
    if (sel.value !== matched) sel.value = matched;
}

function nsftHexToHsl(raw) {
    let hex = String(raw || '').trim().replace(/^#/, '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (!/^[0-9a-f]{6}$/i.test(hex)) return null;
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0;
    let s = 0;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            default: h = (r - g) / d + 4;
        }
        h *= 60;
    }
    return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}


function wireRecordActionModes(items) {
    const modeKeys = ['saveAndEditButtonMode', 'editAndSaveButtonMode', 'deleteRecordButtonMode'];
    modeKeys.forEach((key) => {
        const radios = document.querySelectorAll(`input[type="radio"][name="${key}"]`);
        if (!radios.length) return;
        const stored = items[key] || DEFAULTS[key] || 'button';
        radios.forEach((radio) => {
            radio.checked = (radio.value === stored);
            radio.addEventListener('change', () => {
                if (!radio.checked) return;
                chrome.storage.local.set({ [key]: radio.value }, () => {
                    chrome.storage.sync.set({ [key]: radio.value });
                });
            });
        });
    });
}

function wireValueRadioGroups(items) {
    const grupos = {
        copyIdsMode: (it) => {
            const m = it.copyIdsMode;
            if (m === 'icons' || m === 'shift' || m === 'always') return m;
            return it.copyIdsNoButton === false ? 'icons' : 'shift';
        }
    };
    Object.entries(grupos).forEach(([key, deduce]) => {
        const radios = document.querySelectorAll(`input[type="radio"][name="${key}"]`);
        if (!radios.length) return;
        const actual = deduce(items);
        radios.forEach((radio) => {
            radio.checked = (radio.value === actual);
            radio.addEventListener('change', () => {
                if (!radio.checked) return;
                const val = radio.value;
                chrome.storage.local.set({ [key]: val }, () => {
                    chrome.storage.sync.set({ [key]: val });
                });
            });
        });
    });
}

function wireBooleanRadioGroups(items) {
    const keys = ['setFieldValuesNoIcon'];
    keys.forEach((key) => {
        const radios = document.querySelectorAll(`input[type="radio"][name="${key}"]`);
        if (!radios.length) return;
        const stored = items[key] != null ? !!items[key] : !!DEFAULTS[key];
        radios.forEach((radio) => {
            radio.checked = ((radio.value === 'true') === stored);
            radio.addEventListener('change', () => {
                if (!radio.checked) return;
                const val = radio.value === 'true';
                chrome.storage.local.set({ [key]: val }, () => {
                    chrome.storage.sync.set({ [key]: val });
                });
            });
        });
    });
}

function populateEditorFontSelect() {
    const sel = document.getElementById('editorFontFamily');
    if (!sel || sel.dataset.nsftPopulated === '1') return;
    sel.dataset.nsftPopulated = '1';
    const stacks = (globalThis.NSFT_EditorThemeTransform && globalThis.NSFT_EditorThemeTransform.FONT_STACKS)
        || { 'JetBrains Mono': '', 'Consolas': '' };
    Object.keys(stacks).forEach((name) => {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        sel.appendChild(opt);
    });
}

function applyEditorFontToPreview(fontFamily) {
    const pre = document.getElementById('editor-theme-preview');
    if (!pre) return;
    const stacks = (globalThis.NSFT_EditorThemeTransform && globalThis.NSFT_EditorThemeTransform.FONT_STACKS) || {};
    const stack = stacks[fontFamily] || stacks['JetBrains Mono'] || 'monospace';
    pre.style.setProperty('font-family', stack, 'important');
    pre.querySelectorAll('code, span').forEach((el) => {
        el.style.setProperty('font-family', stack, 'important');
    });
}

function applyEditorFontSizeToPreview(fontSize) {
    const pre = document.getElementById('editor-theme-preview');
    if (!pre) return;
    const n = Math.max(11, Math.min(22, parseInt(fontSize, 10) || 14));
    const px = `${n}px`;
    pre.style.setProperty('font-size', px, 'important');
    pre.querySelectorAll('code, span').forEach((el) => {
        el.style.setProperty('font-size', px, 'important');
    });
}

let _popupFontsLoaded = false;
function ensurePopupEditorFonts() {
    if (_popupFontsLoaded) return;
    _popupFontsLoaded = true;
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
    const base = (chrome.runtime && chrome.runtime.getURL)
        ? chrome.runtime.getURL('scripts/libs/fonts/')
        : '../scripts/libs/fonts/';
    const loads = FONTS.map((f) => fetch(base + f.file)
        .then((r) => r.arrayBuffer())
        .then((buf) => new FontFace(f.family, buf, { weight: f.weight, style: 'normal', display: 'swap' }).load())
        .then((face) => { document.fonts.add(face); })
        .catch(() => { }));
    Promise.all(loads).then(() => {
        const sel = document.getElementById('editorFontFamily');
        if (sel) applyEditorFontToPreview(sel.value);
    }).catch(() => { });
}

function populateGhostModelSelect(items) {
    const selects = [
        { sel: document.getElementById('suitescriptConsoleAiModel'), key: 'suitescriptConsoleAiModel' },
        { sel: document.getElementById('suiteqlAiModel'), key: 'suiteqlAiModel' }
    ].filter((s) => s.sel);
    if (!selects.length) return;
    const FAST = globalThis.NSFT_AI_FAST || { nombres: {}, rapidos: {} };
    const NOMBRES = FAST.nombres;
    const RAPIDOS = {};
    Object.keys(FAST.rapidos).forEach((k) => { RAPIDOS[k] = new RegExp(FAST.rapidos[k], 'i'); });
    chrome.storage.local.get({ nsft_ai_configs: {} }, (st) => {
        const configs = st.nsft_ai_configs || {};
        selects.forEach(({ sel, key }) => {
            sel.innerHTML = '';
            const opt0 = document.createElement('option');
            opt0.value = '';
            opt0.textContent = chrome.i18n.getMessage('sscAiModelSameChat') || 'El mismo del chat';
            sel.appendChild(opt0);
            Object.keys(configs).forEach((pk) => {
                const c = configs[pk];
                if (!c || c.disabled) return;
                const visibles = (c.models || []).filter((m) => (c.hidden || []).indexOf(m) === -1);
                if (!visibles.length) return;
                const re = RAPIDOS[pk] || new RegExp(FAST.generico || 'haiku|flash|nano|mini|lite|fast', 'i');
                const lista = visibles.filter((m) => re.test(String(m)));
                if (!lista.length) return;
                const grupo = document.createElement('optgroup');
                grupo.label = NOMBRES[pk] || pk;
                lista.forEach((m) => {
                    const o = document.createElement('option');
                    o.value = pk + '::' + m;
                    o.textContent = m;
                    grupo.appendChild(o);
                });
                sel.appendChild(grupo);
            });
            const guardado = (items && items[key]) || '';
            sel.value = guardado;
            if (sel.value !== guardado) sel.value = '';
        });
    });
}

function applyStoredSettings(items) {
    populateEditorFontSelect();
    populateGhostModelSelect(items);
    Object.keys(DEFAULTS).forEach(key => {
        const element = document.getElementById(key);
        if (element) {
            const val = items[key];

            if (element.type === 'checkbox') {
                element.checked = val;
            } else if (CODE_THEME_OVERRIDE[key] && !items[CODE_THEME_OVERRIDE[key]]) {
                element.value = AUTO_THEME;
            } else {
                element.value = val;
            }

            const toggleVisibility = () => {
                if (key === 'enableAiAssistant') {
                    const container = document.getElementById('aiAssistantScope');
                    if (container) container.classList.toggle('is-off', !element.checked);
                }
                if (key === 'enableLogPrettier') {
                    const container = document.getElementById('theme-container-log');
                    if (container) container.style.display = element.checked ? 'block' : 'none';
                }
                if (key === 'enableViewRecordObject') {
                    const container = document.getElementById('theme-container-record');
                    if (container) container.style.display = element.checked ? 'block' : 'none';
                }
                if (key === 'enableRecordLogsViewer') {
                    const container = document.getElementById('rlv-openmode-container');
                    if (container) container.style.display = element.checked ? 'block' : 'none';
                }
                if (key === 'enableCodeFieldPrettier') {
                    const container = document.getElementById('theme-container-code');
                    if (container) container.style.display = element.checked ? 'block' : 'none';
                }
                if (key === 'enableFileRecordPreviewBeta') {
                    const container = document.getElementById('theme-container-frp');
                    if (container) container.style.display = element.checked ? 'block' : 'none';
                }
                if (key === 'enableLiveMode') {
                    const container = document.getElementById('live-mode-container');
                    if (container) container.style.display = element.checked ? 'flex' : 'none';
                }
                if (key === 'enableFullLogsButton') {
                    const container = document.getElementById('full-logs-button-container');
                    if (container) container.style.display = element.checked ? 'flex' : 'none';
                }
                if (key === 'enableEditorTheme') {
                    const container = document.getElementById('theme-container-editor');
                    if (container) container.style.display = element.checked ? 'block' : 'none';
                }
                if (key === 'enableSuiteQLRunner') {
                    const container = document.getElementById('theme-container-suiteql');
                    if (container) container.style.display = element.checked ? 'block' : 'none';
                }
                if (key === 'enableSuiteScriptConsole') {
                    const container = document.getElementById('theme-container-ssc');
                    if (container) container.style.display = element.checked ? 'block' : 'none';
                }
                if (key === 'enableAdvancedEditor') {
                    const container = document.getElementById('theme-container-adv');
                    if (container) container.style.display = element.checked ? 'block' : 'none';
                    const regla = document.getElementById('ruler-container-adv');
                    if (regla) regla.style.display = element.checked ? 'block' : 'none';
                }
                if (key === 'enableExportSearch') {
                    const container = document.getElementById('theme-container-es');
                    if (container) container.style.display = element.checked ? 'block' : 'none';
                }
                if (key === 'enableSmallerDropdownOptions') {
                    const container = document.getElementById('dropdown-height-container');
                    if (container) container.style.display = element.checked ? 'flex' : 'none';
                }
                if (key === 'enableSmallerNavigationOptions') {
                    const container = document.getElementById('navigation-height-container');
                    if (container) container.style.display = element.checked ? 'flex' : 'none';
                }
                if (key === 'enableSmallerMainMenu') {
                    const container = document.getElementById('mainmenu-size-container');
                    if (container) container.style.display = element.checked ? 'flex' : 'none';
                }
                if (key === 'enableSublistPagingBeta') {
                    const container = document.getElementById('sublist-paging-container');
                    if (container) container.style.display = element.checked ? 'flex' : 'none';
                }
                if (key === 'enableFormatCodeFields') {
                    const container = document.getElementById('format-code-fields-container');
                    if (container) container.style.display = element.checked ? 'flex' : 'none';
                }
                if (key === 'enableAutoRefresh') {
                    const container = document.getElementById('auto-refresh-container');
                    if (container) container.style.display = element.checked ? 'flex' : 'none';
                }
                if (key === 'enableColorThemes') {
                    const container = document.getElementById('color-themes-controls');
                    if (container) container.style.display = element.checked ? 'block' : 'none';
                }
                if (key === 'enableGroupedTabs') {
                    const container = document.getElementById('container_enableGroupedTabsAutomatic');
                    if (container) container.style.display = element.checked ? 'flex' : 'none';
                }
                if (key === 'enableCommandPalette') {
                    const container = document.getElementById('container_enableCommandPalette');
                    if (container) container.style.display = element.checked ? 'flex' : 'none';
                }
                if (key === 'enableGroupedTabsAutomatic') {
                    const link = document.getElementById('groupedTabsConfigLinkTag');
                    if (link) link.style.display = element.checked ? 'none' : 'inline-block';
                    const companyContainer = document.getElementById('container_groupedTabsAutoUseCompanyName');
                    if (companyContainer) companyContainer.style.display = element.checked ? 'flex' : 'none';
                }
                if (key === 'enablePortletRefresher') {
                    const container = document.getElementById('portlet-refresher-container');
                    if (container) container.style.display = element.checked ? 'flex' : 'none';
                }
                if (key === 'enableJsonFormatter') {
                    const container = document.getElementById('theme-container-jf');
                    if (container) container.style.display = element.checked ? 'block' : 'none';
                }
                if (key === 'enableWfColoredTransitions') {
                    const container = document.getElementById('wf-colored-transitions-controls');
                    if (container) container.style.display = element.checked ? 'grid' : 'none';
                }
                if (key === 'enableAutogenerateIds') {
                    const container = document.getElementById('container_autogenerateIdsPrefix');
                    if (container) container.style.display = element.checked ? 'flex' : 'none';
                }
                if (key === 'enableOpenInOtherEnv') {
                    const container = document.getElementById('open-in-other-env-controls');
                    if (container) container.style.display = element.checked ? 'flex' : 'none';
                }
                if (key === 'enableCopyFieldAndSublistIds') {
                    const container = document.getElementById('copy-ids-controls');
                    if (container) container.style.display = element.checked ? 'flex' : 'none';
                }
                if (key === 'enableSetFieldValues') {
                    const container = document.getElementById('set-field-values-controls');
                    if (container) container.style.display = element.checked ? 'flex' : 'none';
                }
                if (key === 'enableFindFieldById') {
                    const container = document.getElementById('find-field-controls');
                    if (container) container.style.display = element.checked ? 'flex' : 'none';
                }
                if (key === 'enableEnvBadge') {
                    const container = document.getElementById('env-badge-colors-controls');
                    if (container) container.style.display = element.checked ? 'block' : 'none';
                }
                if (key === 'enableCopyAccountId') {
                    const container = document.getElementById('container_enableCopyAccountId');
                    if (container) container.style.display = element.checked ? 'flex' : 'none';
                }
                if (key === 'enableFieldInlinePreview') {
                    const container = document.getElementById('field-inline-preview-container');
                    if (container) container.style.display = element.checked ? 'flex' : 'none';
                }
                if (key === 'enableSaveAndEditButton') {
                    const container = document.getElementById('save-and-edit-mode-controls');
                    if (container) container.style.display = element.checked ? 'flex' : 'none';
                }
                if (key === 'enableEditAndSaveButton') {
                    const container = document.getElementById('edit-and-save-mode-controls');
                    if (container) container.style.display = element.checked ? 'flex' : 'none';
                }
                if (key === 'enableDeleteRecordButton') {
                    const container = document.getElementById('delete-record-mode-controls');
                    if (container) container.style.display = element.checked ? 'flex' : 'none';
                }
                if (key === 'suiteqlFetchMethod') {
                    const hint = document.getElementById('suiteqlFetchMethodHint');
                    if (hint) {
                        const msg = chrome.i18n.getMessage('suiteqlFetchMethodHint_' + element.value) || '';
                        hint.textContent = '';
                        const ul = document.createElement('ul');
                        ul.className = 'nsft-hint-list';
                        msg.split('\n').map(s => s.trim()).filter(Boolean).forEach((line) => {
                            const li = document.createElement('li');
                            li.textContent = line;
                            ul.appendChild(li);
                        });
                        hint.appendChild(ul);
                    }
                    const conc = document.getElementById('suiteqlRestConcurrencyRow');
                    if (conc) conc.style.display = element.value === 'nquery' ? 'none' : '';
                    const fill = document.getElementById('suiteqlRestFillColumnsRow');
                    if (fill) fill.style.display = element.value === 'nquery' ? 'none' : '';
                }
                if (key === 'suiteqlFetchAllRows') {
                    const fila = document.getElementById('suiteqlMaxRecordsRow');
                    if (fila) fila.style.display = element.checked ? 'none' : '';
                }
            };

            if (element.type === 'checkbox' || element.tagName === 'SELECT') {
                toggleVisibility();
            }

            element.addEventListener('change', () => {
                if (CT_SLIDER_KEYS.indexOf(key) !== -1) {
                    ctGuardar(true);
                    return;
                }
                const newValue = element.type === 'checkbox' ? element.checked : element.value;

                if (key === 'editorTheme') updateEditorThemePreview(newValue);
                if (key === 'editorFontFamily') applyEditorFontToPreview(newValue);
                if (key === 'editorFontSize') applyEditorFontSizeToPreview(newValue);
                if (key.indexOf('editorCustom') === 0) updateEditorThemePreview('custom');

                const overrideKey = CODE_THEME_OVERRIDE[key];
                let extraPayload = {};
                let valorAGuardar = newValue;
                if (overrideKey) {
                    if (newValue === AUTO_THEME) {
                        extraPayload = { [overrideKey]: false };
                        valorAGuardar = themeForMode(key, isDarkNow());
                    } else {
                        extraPayload = { [overrideKey]: true };
                    }
                }

                chrome.storage.local.set({ [key]: valorAGuardar, ...extraPayload }, () => {
                    chrome.storage.sync.set({ [key]: valorAGuardar });
                });

                if (element.type === 'checkbox' || element.tagName === 'SELECT') {
                    toggleVisibility();
                }
            });
            if (key === 'wfColoredTransitionsLineWidth') {
                const updateLabel = () => {
                    const out = document.getElementById('wfColoredTransitionsLineWidthVal');
                    if (out) out.textContent = `${element.value} px`;
                };
                element.addEventListener('input', updateLabel);
                updateLabel();
            }

            if (key === 'editorFontSize') {
                const updateLabel = () => {
                    const out = document.getElementById('editorFontSizeVal');
                    if (out) out.textContent = `${element.value} px`;
                    applyEditorFontSizeToPreview(element.value);
                };
                element.addEventListener('input', updateLabel);
                updateLabel();
            }

            if (key === 'editorTheme') {
                const updateCustomGrid = () => {
                    const grid = document.getElementById('custom-theme-editor');
                    if (grid) grid.style.display = element.value === 'custom' ? 'block' : 'none';
                };
                element.addEventListener('change', updateCustomGrid);
                updateCustomGrid();
            }

            if (key === 'colorThemeHue' || key === 'colorThemeSat' || key === 'colorThemeLig') {
                const updateUI = () => {
                    const h = document.getElementById('colorThemeHue').value;
                    const s = document.getElementById('colorThemeSat').value;
                    const l = document.getElementById('colorThemeLig').value;
                    if (document.getElementById('colorThemeHueVal')) document.getElementById('colorThemeHueVal').textContent = h;
                    if (document.getElementById('colorThemeSatVal')) document.getElementById('colorThemeSatVal').textContent = s + '%';
                    if (document.getElementById('colorThemeLigVal')) document.getElementById('colorThemeLigVal').textContent = l + '%';
                    const satSlider = document.getElementById('colorThemeSat');
                    if (satSlider) satSlider.style.background = `linear-gradient(to right, hsl(${h}, 0%, ${l}%), hsl(${h}, 100%, ${l}%))`;
                    const ligSlider = document.getElementById('colorThemeLig');
                    if (ligSlider) ligSlider.style.background = `linear-gradient(to right, hsl(${h}, ${s}%, 0%), hsl(${h}, ${s}%, 50%), hsl(${h}, ${s}%, 100%))`;
                    const hexEl = document.getElementById('colorThemeHex');
                    if (hexEl && document.activeElement !== hexEl) {
                        hexEl.value = nsftHslToHex(+h, +s, +l);
                        hexEl.style.borderColor = '';
                    }
                    nsftMatchColorThemePreset(+h, +s, +l);
                };

                element.addEventListener('input', () => {
                    updateUI();
                    ctGuardar(false);
                });

                updateUI();
            }

            if (key === 'autogenerateIdsPrefix') {
                const previewEl = document.getElementById('autogenerateIdsPreview');
                const sanitize = (raw) => String(raw || '')
                    .toLowerCase()
                    .replace(/[^a-z0-9_]/g, '')
                    .replace(/^_+|_+$/g, '');
                const renderPreview = () => {
                    if (!previewEl) return;
                    const p = sanitize(element.value);
                    previewEl.textContent = p ? `_${p}_nombre` : '_nombre';
                };
                element.addEventListener('input', () => {
                    renderPreview();
                    chrome.storage.local.set({ [key]: sanitize(element.value) });
                });
                element.addEventListener('blur', () => {
                    element.value = sanitize(element.value);
                    renderPreview();
                });
                renderPreview();
            }

            if (key === 'openInOtherEnvSandboxes') {
                const validate = () => {
                    const tokens = String(element.value || '').split(',').map((s) => s.trim()).filter((s) => s.length);
                    const hasInvalid = tokens.some((t) => !/^\d+$/.test(t));
                    element.style.borderColor = hasInvalid ? '#ef4444' : '';
                    element.title = hasInvalid
                        ? (chrome.i18n.getMessage('openInEnvSandboxesInvalid') || 'Solo números separados por coma (ej. 1,2).')
                        : '';
                };
                element.addEventListener('input', validate);
                validate();
            }
        }
    });

    initCommandPaletteShortcut(items);
    initCommandPaletteCustomUrls(items);

    initNavigationPresets();

    initMainMenuPresets();

    wireRecordActionModes(items);
    wireBooleanRadioGroups(items);
    wireValueRadioGroups(items);

    const btnRepairGroups = document.getElementById('repairDuplicateGroupsBtn');
    const repairStatus = document.getElementById('repairDuplicateGroupsStatus');
    if (btnRepairGroups) {
        btnRepairGroups.addEventListener('click', () => {
            const t = (key) => chrome.i18n.getMessage(key) || '';
            btnRepairGroups.disabled = true;
            if (repairStatus) {
                repairStatus.style.display = 'inline';
                repairStatus.style.color = 'var(--text-tertiary)';
                repairStatus.textContent = t('repairDuplicateGroupsRunning') || 'Repairing…';
            }

            chrome.runtime.sendMessage(
                { action: 'nsftRepairDuplicateGroups', includeSaved: false },
                (resp) => {
                    btnRepairGroups.disabled = false;
                    if (!repairStatus) return;

                    if (chrome.runtime.lastError || !resp || !resp.ok) {
                        repairStatus.style.color = '#c0392b';
                        repairStatus.textContent = t('repairDuplicateGroupsError') || 'Could not repair';
                    } else {
                        const merged = typeof resp.mergedGroups === 'number' ? resp.mergedGroups : 0;
                        repairStatus.style.color = 'var(--accent)';
                        if (merged > 0) {
                            const msg = t('repairDuplicateGroupsDone') || 'Merged {N} duplicate group(s)';
                            repairStatus.textContent = msg.replace('{N}', String(merged));
                        } else {
                            repairStatus.textContent = t('repairDuplicateGroupsClean') || 'No duplicates found';
                        }
                    }

                    setTimeout(() => {
                        if (repairStatus) {
                            repairStatus.style.display = 'none';
                            repairStatus.textContent = '';
                        }
                    }, 6000);
                }
            );
        });
    }

    const CT_ENV_KEYS = { PRD: 'colorThemeEnvPrd', SB: 'colorThemeEnvSb', RP: 'colorThemeEnvRp' };
    const CT_SLIDER_KEYS = ['colorThemeHue', 'colorThemeSat', 'colorThemeLig'];
    const CT_DEFAULT_HSL = [216, 23, 49];
    const CT_ENV_FALLBACK = { PRD: '#9a606a', SB: '#609a73', RP: '#60779a' };

    let ctDestino = 'default';
    let ctCargando = false;

    function ctSliders() {
        return CT_SLIDER_KEYS.map((k) => document.getElementById(k));
    }

    function ctLeerSliders() {
        const [h, s, l] = ctSliders();
        return [+h.value, +s.value, +l.value];
    }

    function ctGuardar(commit) {
        if (ctCargando) return;
        const [h, s, l] = ctLeerSliders();
        let payload;
        if (ctDestino === 'default') {
            payload = { colorThemeHue: String(h), colorThemeSat: String(s), colorThemeLig: String(l) };
        } else {
            payload = { [CT_ENV_KEYS[ctDestino]]: nsftHslToHex(h, s, l) };
        }
        chrome.storage.local.set(payload);
        if (commit) chrome.storage.sync.set(payload);
        const punto = document.querySelector('.nsft-ct-target[data-ct-target="' + ctDestino + '"] .nsft-ct-dot');
        if (punto) punto.style.background = `hsl(${h}, ${s}%, ${l}%)`;
    }

    function ctCargarDestino() {
        const claves = ['colorThemeHue', 'colorThemeSat', 'colorThemeLig', ...Object.values(CT_ENV_KEYS)];
        chrome.storage.local.get(claves, (items) => {
            let hsl;
            if (ctDestino === 'default') {
                hsl = [
                    items.colorThemeHue !== undefined ? +items.colorThemeHue : CT_DEFAULT_HSL[0],
                    items.colorThemeSat !== undefined ? +items.colorThemeSat : CT_DEFAULT_HSL[1],
                    items.colorThemeLig !== undefined ? +items.colorThemeLig : CT_DEFAULT_HSL[2]
                ];
            } else {
                const hex = items[CT_ENV_KEYS[ctDestino]] || CT_ENV_FALLBACK[ctDestino];
                hsl = nsftHexToHsl(hex) || CT_DEFAULT_HSL;
            }
            const [hEl, sEl, lEl] = ctSliders();
            if (!hEl || !sEl || !lEl) return;
            ctCargando = true;
            hEl.value = hsl[0];
            sEl.value = hsl[1];
            lEl.value = Math.max(10, Math.min(90, hsl[2]));
            hEl.dispatchEvent(new Event('input'));
            sEl.dispatchEvent(new Event('input'));
            lEl.dispatchEvent(new Event('input'));
            ctCargando = false;
        });
    }

    function ctPintarMuestras() {
        const botones = document.querySelectorAll('.nsft-ct-target');
        if (!botones.length) return;
        const claves = ['colorThemeHue', 'colorThemeSat', 'colorThemeLig', ...Object.values(CT_ENV_KEYS)];
        chrome.storage.local.get(claves, (items) => {
            botones.forEach((b) => {
                const dest = b.dataset.ctTarget;
                const punto = b.querySelector('.nsft-ct-dot');
                if (!punto) return;
                if (dest === 'default') {
                    const h = items.colorThemeHue !== undefined ? +items.colorThemeHue : CT_DEFAULT_HSL[0];
                    const s = items.colorThemeSat !== undefined ? +items.colorThemeSat : CT_DEFAULT_HSL[1];
                    const l = items.colorThemeLig !== undefined ? +items.colorThemeLig : CT_DEFAULT_HSL[2];
                    punto.style.background = `hsl(${h}, ${s}%, ${l}%)`;
                } else {
                    punto.style.background = items[CT_ENV_KEYS[dest]] || CT_ENV_FALLBACK[dest];
                }
            });
        });
    }

    document.querySelectorAll('.nsft-ct-target').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nsft-ct-target').forEach((b) => b.classList.toggle('is-active', b === btn));
            ctDestino = btn.dataset.ctTarget || 'default';
            ctCargarDestino();
        });
    });

    const ctModo = document.getElementById('colorThemeMode');
    function ctModoActual() {
        const v = ctModo && ctModo.value;
        return (v === 'env' || v === 'accounts') ? v : 'global';
    }
    function ctSincronizar(recargar) {
        const modo = ctModoActual();
        const contEnv = document.getElementById('color-theme-env-controls');
        const contAcc = document.getElementById('color-theme-accounts-controls');
        if (contEnv) contEnv.style.display = modo === 'env' ? 'block' : 'none';
        if (contAcc) contAcc.style.display = modo === 'accounts' ? 'block' : 'none';

        const activa = document.querySelector('.nsft-ct-target.is-active');
        const destinoNuevo = modo === 'env' ? ((activa && activa.dataset.ctTarget) || 'PRD') : 'default';
        if (destinoNuevo === ctDestino) { if (modo === 'env') ctPintarMuestras(); return; }
        ctDestino = destinoNuevo;
        if (modo === 'env') ctPintarMuestras();
        if (recargar) ctCargarDestino();
    }
    if (ctModo) ctModo.addEventListener('change', () => ctSincronizar(true));

    if (ctModo) {
        const m = items[ctModo.id];
        ctModo.value = (m === 'global' || m === 'accounts' || m === 'env')
            ? m
            : (items.colorThemeByEnv === true ? 'env' : 'global');
    }
    ctSincronizar(false);
    if (ctModoActual() === 'env') ctCargarDestino();

    const presetSelect = document.getElementById('colorThemePreset');
    if (presetSelect) {
        presetSelect.addEventListener('change', () => {
            const opt = presetSelect.options[presetSelect.selectedIndex];
            if (!opt || opt.value === 'custom') return;
            const h = parseInt(opt.dataset.h, 10);
            const s = parseInt(opt.dataset.s, 10);
            const l = parseInt(opt.dataset.l, 10);
            if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(l)) return;
            const hueEl = document.getElementById('colorThemeHue');
            const satEl = document.getElementById('colorThemeSat');
            const ligEl = document.getElementById('colorThemeLig');
            if (!hueEl || !satEl || !ligEl) return;
            hueEl.value = h;
            satEl.value = s;
            ligEl.value = l;
            hueEl.dispatchEvent(new Event('input'));
            satEl.dispatchEvent(new Event('input'));
            ligEl.dispatchEvent(new Event('input'));
            hueEl.dispatchEvent(new Event('change'));
            satEl.dispatchEvent(new Event('change'));
            ligEl.dispatchEvent(new Event('change'));
        });
    }

    const hexInput = document.getElementById('colorThemeHex');
    if (hexInput) {
        const applyHex = (commit) => {
            const parsed = nsftHexToHsl(hexInput.value);
            if (!parsed) {
                hexInput.style.borderColor = 'var(--accent-danger, #c0392b)';
                return false;
            }
            hexInput.style.borderColor = '';
            const [h, s, l] = parsed;
            const ligClamped = Math.max(10, Math.min(90, l));
            const hueEl = document.getElementById('colorThemeHue');
            const satEl = document.getElementById('colorThemeSat');
            const ligEl = document.getElementById('colorThemeLig');
            if (hueEl && satEl && ligEl) {
                hueEl.value = h;
                satEl.value = s;
                ligEl.value = ligClamped;
                hueEl.dispatchEvent(new Event('input'));
                satEl.dispatchEvent(new Event('input'));
                ligEl.dispatchEvent(new Event('input'));
                if (commit) {
                    hueEl.dispatchEvent(new Event('change'));
                    satEl.dispatchEvent(new Event('change'));
                    ligEl.dispatchEvent(new Event('change'));
                }
            }
            return true;
        };
        hexInput.addEventListener('input', () => applyHex(false));
        hexInput.addEventListener('blur', () => {
            if (!applyHex(true)) {
                const h = document.getElementById('colorThemeHue').value;
                const s = document.getElementById('colorThemeSat').value;
                const l = document.getElementById('colorThemeLig').value;
                hexInput.value = nsftHslToHex(+h, +s, +l);
                hexInput.style.borderColor = '';
            }
        });
    }

    const btnResetColor = document.getElementById('colorThemeReset');
    if (btnResetColor) {
        btnResetColor.addEventListener('click', () => {
            const base = ctDestino === 'default'
                ? CT_DEFAULT_HSL
                : (nsftHexToHsl(CT_ENV_FALLBACK[ctDestino]) || CT_DEFAULT_HSL);
            const [hEl, sEl, lEl] = ctSliders();
            if (!hEl || !sEl || !lEl) return;
            ctCargando = true;
            hEl.value = base[0];
            sEl.value = base[1];
            lEl.value = Math.max(10, Math.min(90, base[2]));
            hEl.dispatchEvent(new Event('input'));
            sEl.dispatchEvent(new Event('input'));
            lEl.dispatchEvent(new Event('input'));
            ctCargando = false;
            ctGuardar(true);
        });
    }

    const btnResetWfct = document.getElementById('wfColoredTransitionsReset');
    if (btnResetWfct) {
        btnResetWfct.addEventListener('click', () => {
            const defaults = {
                wfColoredTransitionsPalette: 'vivid',
                wfColoredTransitionsLineStyle: 'solid',
                wfColoredTransitionsLineWidth: 2
            };
            const paletteSel = document.getElementById('wfColoredTransitionsPalette');
            const styleSel = document.getElementById('wfColoredTransitionsLineStyle');
            const widthInput = document.getElementById('wfColoredTransitionsLineWidth');
            if (paletteSel) paletteSel.value = defaults.wfColoredTransitionsPalette;
            if (styleSel) styleSel.value = defaults.wfColoredTransitionsLineStyle;
            if (widthInput) {
                widthInput.value = defaults.wfColoredTransitionsLineWidth;
                widthInput.dispatchEvent(new Event('input'));
            }
            chrome.storage.local.set(defaults, () => {
                chrome.storage.sync.set(defaults);
            });
        });
    }

    if (typeof updateTileCounts === 'function') updateTileCounts();
    if (typeof refreshDetailCount === 'function') refreshDetailCount();

    if (items && items.editorTheme) updateEditorThemePreview(items.editorTheme);

    ensurePopupEditorFonts();
    if (items && items.editorFontFamily) applyEditorFontToPreview(items.editorFontFamily);
    const fsOut = document.getElementById('editorFontSizeVal');
    const fsInput = document.getElementById('editorFontSize');
    if (fsOut && fsInput) fsOut.textContent = (fsInput.value || 14) + ' px';
    if (items && items.editorFontSize) applyEditorFontSizeToPreview(items.editorFontSize);

    wireEditorThemeExportImport();
}

const NSFT_THEME_EXPORT_KEYS = [
    'editorTheme', 'editorFontFamily', 'editorFontSize',
    'editorCustomBg', 'editorCustomFg',
    'editorCustomKeyword', 'editorCustomLiteral',
    'editorCustomNumber', 'editorCustomString',
    'editorCustomVariable', 'editorCustomProperty',
    'editorCustomComment'
];

function wireEditorThemeExportImport() {
    const btnExport = document.getElementById('editorThemeExport');
    const btnImport = document.getElementById('editorThemeImport');
    const fileInput = document.getElementById('editorThemeImportFile');
    if (!btnExport || !btnImport || !fileInput) return;
    if (btnExport.dataset.nsftWired === '1') return;
    btnExport.dataset.nsftWired = '1';

    btnExport.addEventListener('click', () => {
        chrome.storage.local.get(NSFT_THEME_EXPORT_KEYS, (items) => {
            const payload = { schema: 'nsft-editor-theme/1' };
            NSFT_THEME_EXPORT_KEYS.forEach(k => { if (items[k] !== undefined) payload[k] = items[k]; });
            const json = JSON.stringify(payload, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const themeId = (items.editorTheme || 'editor').replace(/[^a-z0-9-]/gi, '');
            a.download = `nsft-theme-${themeId}.nsft-theme.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    });

    btnImport.addEventListener('click', () => fileInput.click());

    const btnReset = document.getElementById('editorThemeReset');
    if (btnReset && btnReset.dataset.nsftWired !== '1') {
        btnReset.dataset.nsftWired = '1';
        btnReset.addEventListener('click', () => resetEditorThemeToDefaults());
    }

    fileInput.addEventListener('change', () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const parsed = JSON.parse(reader.result || '{}');
                if (!parsed || parsed.schema !== 'nsft-editor-theme/1') {
                    showAlertDialog(chrome.i18n.getMessage('editorThemeImportInvalid') || 'Invalid theme file');
                    return;
                }
                applyImportedTheme(parsed);
            } catch (e) {
                showAlertDialog(chrome.i18n.getMessage('editorThemeImportInvalid') || 'Invalid theme file');
            } finally {
                fileInput.value = '';
            }
        };
        reader.readAsText(file);
    });
}

function applyImportedTheme(parsed) {
    NSFT_THEME_EXPORT_KEYS.forEach((key) => {
        const val = parsed[key];
        if (val === undefined) return;
        if (!isValidThemeValue(key, val)) return;
        const el = document.getElementById(key);
        if (!el) return;
        el.value = String(val);
        el.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

function resetEditorThemeToDefaults() {
    const D = (typeof DEFAULTS !== 'undefined' && DEFAULTS) || globalThis.NSFT_DEFAULTS || {};
    const obj = {};
    NSFT_THEME_EXPORT_KEYS.forEach((k) => { if (D[k] !== undefined) obj[k] = D[k]; });
    applyImportedTheme(obj);

    const fs = document.getElementById('editorFontSize');
    if (fs) {
        const out = document.getElementById('editorFontSizeVal');
        if (out) out.textContent = `${fs.value} px`;
        applyEditorFontSizeToPreview(fs.value);
    }
    const ff = document.getElementById('editorFontFamily');
    if (ff) applyEditorFontToPreview(ff.value);
}

function isValidThemeValue(key, val) {
    if (key === 'editorFontSize') return Number.isFinite(+val) && +val >= 11 && +val <= 22;
    if (key === 'editorTheme' || key === 'editorFontFamily') return typeof val === 'string' && val.length < 64;
    if (key.indexOf('editorCustom') === 0) return typeof val === 'string' && /^#[0-9a-f]{3,8}$/i.test(val);
    return false;
}

const NSFT_EDITOR_THEME_PREVIEW_CACHE = new Map();
const NSFT_PREVIEW_STYLE_ID = 'nsft-popup-theme-preview-style';
const NSFT_PREVIEW_FALLBACK_BG = '#1e1e1e';

function scopePreviewCss(mappedCss) {
    return mappedCss.replace(/(^|[},])(\s*)(\.cm-content)/g, '$1$2#editor-theme-preview $3');
}

function injectPreviewStyle(scopedCss) {
    let el = document.getElementById(NSFT_PREVIEW_STYLE_ID);
    if (!el) {
        el = document.createElement('style');
        el.id = NSFT_PREVIEW_STYLE_ID;
        document.head.appendChild(el);
    }
    el.textContent = scopedCss;
}

function updateEditorThemePreview(themeName) {
    if (!themeName) return;
    const root = document.getElementById('editor-theme-preview');
    if (!root) return;

    if (themeName === 'custom') {
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
        }, (items) => {
            const tx = globalThis.NSFT_EditorThemeTransform;
            if (!tx || !tx.buildCustomThemeCss) {
                root.style.backgroundColor = items.editorCustomBg;
                return;
            }
            const customTheme = {
                bg: items.editorCustomBg, fg: items.editorCustomFg,
                keyword: items.editorCustomKeyword, literal: items.editorCustomLiteral,
                number: items.editorCustomNumber, string: items.editorCustomString,
                variable: items.editorCustomVariable, property: items.editorCustomProperty,
                comment: items.editorCustomComment
            };
            const mapped = tx.buildCustomThemeCss(customTheme, { tokensOnly: true });
            const scoped = scopePreviewCss(mapped);
            injectPreviewStyle(scoped);
            root.style.backgroundColor = customTheme.bg;
        });
        return;
    }

    const cached = NSFT_EDITOR_THEME_PREVIEW_CACHE.get(themeName);
    if (cached) {
        injectPreviewStyle(cached.css);
        root.style.backgroundColor = cached.bg;
        return;
    }

    const url = chrome.runtime.getURL('scripts/libs/highlight/themes/' + themeName + '.css');
    fetch(url).then((r) => r.ok ? r.text() : '').then((cssText) => {
        if (!cssText) { root.style.backgroundColor = NSFT_PREVIEW_FALLBACK_BG; return; }
        const transform = globalThis.NSFT_EditorThemeTransform;
        let mapped = cssText;
        let bg = NSFT_PREVIEW_FALLBACK_BG;
        if (transform && typeof transform.applyClassMapping === 'function') {
            mapped = transform.applyImportance(transform.applyClassMapping(cssText));
            const palette = transform.extractColors(cssText, transform.isLightTheme(themeName));
            bg = palette.sbBg || bg;
        }
        const scoped = scopePreviewCss(mapped);
        const entry = { css: scoped, bg: bg };
        NSFT_EDITOR_THEME_PREVIEW_CACHE.set(themeName, entry);
        injectPreviewStyle(scoped);
        root.style.backgroundColor = bg;
    }).catch(() => {
        root.style.backgroundColor = NSFT_PREVIEW_FALLBACK_BG;
    });
}

const CMDP_DEFAULT_SHORTCUT = { ctrlKey: true, shiftKey: true, altKey: false, code: 'Space' };
const CMDP_MAX_CUSTOM_URLS = 30;
const MAC_KEYS_POPUP = globalThis.NSFT_MacKeys
    || { isMac: false, mod: 'Ctrl', alt: 'Alt', shift: 'Shift' };
const IS_MAC_POPUP = MAC_KEYS_POPUP.isMac;

function formatShortcut(combo) {
    if (!combo || typeof combo !== 'object') return '';
    const parts = [];
    if (combo.ctrlKey) parts.push(MAC_KEYS_POPUP.mod);
    if (combo.shiftKey) parts.push(MAC_KEYS_POPUP.shift);
    if (combo.altKey) parts.push(MAC_KEYS_POPUP.alt);
    const code = String(combo.code || '');
    let keyDisplay = code
        .replace(/^Key([A-Z])$/, '$1')
        .replace(/^Digit(\d)$/, '$1')
        .replace(/^Arrow/, '');
    if (keyDisplay) parts.push(keyDisplay);
    return parts.join('+');
}

function initCommandPaletteShortcut(items) {
    const input = document.getElementById('commandPaletteShortcutInput');
    const resetBtn = document.getElementById('commandPaletteShortcutReset');
    if (!input) return;

    const current = items.commandPaletteShortcut && typeof items.commandPaletteShortcut === 'object'
        ? items.commandPaletteShortcut
        : CMDP_DEFAULT_SHORTCUT;
    input.value = formatShortcut(current);

    const setCombo = (combo) => {
        input.value = formatShortcut(combo);
        chrome.storage.local.set({ commandPaletteShortcut: combo });
    };

    input.addEventListener('focus', () => {
        input.dataset.previousValue = input.value;
        input.value = '';
        input.placeholder = chrome.i18n.getMessage('commandPaletteShortcutCapture')
            || 'Press a key combination…';
    });

    input.addEventListener('blur', () => {
        if (!input.value && input.dataset.previousValue) {
            input.value = input.dataset.previousValue;
        }
        input.placeholder = chrome.i18n.getMessage('commandPaletteShortcutPlaceholder')
            || 'Click to set shortcut';
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta') return;
        e.preventDefault();
        e.stopPropagation();

        if (e.key === 'Escape') {
            input.blur();
            return;
        }

        if (!e.ctrlKey && !e.metaKey && !e.altKey) {
            input.placeholder = chrome.i18n.getMessage('commandPaletteShortcutNeedsModifier')
                || 'Use Ctrl/Cmd/Alt + key';
            return;
        }

        const combo = {
            ctrlKey: !!(e.ctrlKey || e.metaKey),
            shiftKey: !!e.shiftKey,
            altKey: !!e.altKey,
            code: e.code
        };
        setCombo(combo);
        input.blur();
    });

    if (resetBtn) {
        resetBtn.addEventListener('click', () => setCombo(CMDP_DEFAULT_SHORTCUT));
    }
}

function initCommandPaletteCustomUrls(items) {
    const listEl = document.getElementById('commandPaletteCustomUrlsList');
    const labelInput = document.getElementById('commandPaletteCustomUrlLabel');
    const pathInput = document.getElementById('commandPaletteCustomUrlPath');
    const addBtn = document.getElementById('commandPaletteCustomUrlAdd');
    if (!listEl || !labelInput || !pathInput || !addBtn) return;

    let urls = Array.isArray(items.commandPaletteCustomUrls) ? items.commandPaletteCustomUrls.slice() : [];

    const persist = () => {
        chrome.storage.local.set({ commandPaletteCustomUrls: urls });
        chrome.storage.sync.set({ commandPaletteCustomUrls: urls });
    };

    const render = () => {
        listEl.innerHTML = '';
        if (urls.length === 0) {
            const empty = document.createElement('div');
            empty.style.fontSize = '10px';
            empty.style.color = 'var(--text-muted)';
            empty.style.fontStyle = 'italic';
            empty.textContent = chrome.i18n.getMessage('commandPaletteCustomUrlsEmpty')
                || 'No custom URLs yet.';
            listEl.appendChild(empty);
            return;
        }
        urls.forEach((entry, idx) => {
            const row = document.createElement('div');
            row.style.cssText = 'display: flex; align-items: center; gap: 4px; font-size: 11px;';
            const labelSpan = document.createElement('span');
            labelSpan.textContent = entry.label;
            labelSpan.style.cssText = 'flex: 0 0 auto; font-weight: 500; color: var(--text);';
            const pathSpan = document.createElement('span');
            pathSpan.textContent = entry.path;
            pathSpan.title = entry.path;
            pathSpan.style.cssText = 'flex: 1; min-width: 0; font-family: monospace; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.textContent = '×';
            removeBtn.title = chrome.i18n.getMessage('commandPaletteCustomUrlsRemove') || 'Remove';
            removeBtn.style.cssText = 'border: none; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 14px; line-height: 1; padding: 0 4px;';
            removeBtn.addEventListener('click', () => {
                urls.splice(idx, 1);
                persist();
                render();
            });
            row.appendChild(labelSpan);
            row.appendChild(pathSpan);
            row.appendChild(removeBtn);
            listEl.appendChild(row);
        });
    };

    const tryAdd = () => {
        const label = labelInput.value.trim();
        let path = pathInput.value.trim();
        if (!label || !path) return;
        if (!path.startsWith('/')) path = '/' + path;
        if (urls.length >= CMDP_MAX_CUSTOM_URLS) {
            addBtn.disabled = true;
            addBtn.title = chrome.i18n.getMessage('commandPaletteCustomUrlsLimit')
                || `Limit reached (${CMDP_MAX_CUSTOM_URLS})`;
            return;
        }
        urls.push({ label, path, keywords: '' });
        labelInput.value = '';
        pathInput.value = '';
        persist();
        render();
        labelInput.focus();
    };

    addBtn.addEventListener('click', tryAdd);
    labelInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); tryAdd(); } });
    pathInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); tryAdd(); } });

    render();
}

const NSFT_CATEGORIES = [
    { key: 'all',          i18n: 'tabAll',          icon: '<line x1="4" y1="6" x2="20" y2="6"></line><line x1="4" y1="12" x2="20" y2="12"></line><line x1="4" y1="18" x2="20" y2="18"></line>', virtual: true },
    { key: 'essentials',   i18n: 'tabEssentials',   icon: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>' },
    { key: 'records',      i18n: 'tabRecords',      icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline>' },
    { key: 'dev',          i18n: 'tabDev',          icon: '<polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline>' },
    { key: 'search',       i18n: 'tabSearch',       icon: '<circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>' },
    { key: 'layout',       i18n: 'tabLayout',       icon: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line>' },
    { key: 'productivity', i18n: 'tabProductivity', icon: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>' },
    { key: 'fileCabinet',  i18n: 'tabFileCabinet',  icon: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="16" y2="17"></line>' },
    { key: 'pdf',          i18n: 'tabPdf',          icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="9" y1="15" x2="15" y2="15"></line><line x1="9" y1="18" x2="15" y2="18"></line>' },
    { key: 'workflow',     i18n: 'tabWorkflow',     icon: '<line x1="3" y1="7" x2="18" y2="7"></line><polyline points="15 4 18 7 15 10"></polyline><line x1="21" y1="17" x2="6" y2="17"></line><polyline points="9 14 6 17 9 20"></polyline>' }
];

const NSFTRouter = (() => {
    let appEl = null;
    const stack = ['home'];

    const current = () => stack[stack.length - 1];

    const go = (to, payload) => {
        if (!appEl) return;
        if (current() === to && to === 'home') return;

        if (to === 'detail' && payload) {
            showCategoryInDetail(payload);
        }
        if (to !== 'detail') {
            appEl.removeAttribute('data-detail-mode');
        }
        appEl.dataset.screen = to;
        if (current() !== to) stack.push(to);
    };

    const back = () => {
        if (stack.length <= 1) return;
        stack.pop();
        appEl.dataset.screen = current();
    };

    return {
        init() {
            appEl = document.querySelector('.nsft-app');
        },
        go,
        back,
        current
    };
})();

function initNavigationPresets() {
    const input = document.getElementById('navigationPixelHeight');
    if (!input) return;
    const presetWrap = document.getElementById('navigation-presets');
    const preview = document.getElementById('navigation-preview');

    function syncActivePreset(h) {
        if (!presetWrap) return;
        presetWrap.querySelectorAll('.nsft-nav-preset').forEach((btn) => {
            btn.classList.toggle('active', Number(btn.dataset.h) === h);
        });
    }

    function refresh() {
        const h = Number(input.value) || 30;
        if (preview) preview.style.setProperty('--h', `${h}px`);
        syncActivePreset(h);
    }

    if (presetWrap) {
        presetWrap.querySelectorAll('.nsft-nav-preset').forEach((btn) => {
            btn.addEventListener('click', () => {
                input.value = btn.dataset.h;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                refresh();
            });
        });
    }

    input.addEventListener('input', refresh);
    refresh();
}

function initMainMenuPresets() {
    const input = document.getElementById('mainMenuFontSize');
    if (!input) return;
    const presetWrap = document.getElementById('mainmenu-presets');

    function syncActivePreset(fs) {
        if (!presetWrap) return;
        presetWrap.querySelectorAll('.nsft-nav-preset').forEach((btn) => {
            btn.classList.toggle('active', Number(btn.dataset.fs) === fs);
        });
    }

    function refresh() {
        const fs = Number(input.value) || 14;
        syncActivePreset(fs);
    }

    if (presetWrap) {
        presetWrap.querySelectorAll('.nsft-nav-preset').forEach((btn) => {
            btn.addEventListener('click', () => {
                input.value = btn.dataset.fs;
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                refresh();
            });
        });
    }

    input.addEventListener('input', refresh);
    refresh();
}

function initializeRouter() {
    NSFTRouter.init();

    const backBtn = document.getElementById('nsftBackBtn');
    if (backBtn) backBtn.addEventListener('click', () => NSFTRouter.back());

    document.addEventListener('keydown', (e) => {
        if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
            const input = document.getElementById('nsftPopupSearch');
            if (!input) return;
            e.preventDefault();
            if (NSFTRouter.current() !== 'home') NSFTRouter.go('home');
            setTimeout(() => input.focus(), 80);
        }
    });

    const feedbackBtn = document.getElementById('nsftFeedbackBtn');
    const feedbackMenu = document.getElementById('nsftFeedbackMenu');
    if (feedbackBtn && feedbackMenu) {
        const closeFeedbackMenu = () => {
            feedbackMenu.hidden = true;
            feedbackBtn.setAttribute('aria-expanded', 'false');
        };
        feedbackBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const willOpen = feedbackMenu.hidden;
            feedbackMenu.hidden = !willOpen;
            feedbackBtn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        });
        document.addEventListener('click', (e) => {
            if (feedbackMenu.hidden) return;
            if (!feedbackMenu.contains(e.target)) closeFeedbackMenu();
        });
        feedbackMenu.addEventListener('click', closeFeedbackMenu);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !feedbackMenu.hidden) closeFeedbackMenu();
        });
    }

    const settingsBtn = document.getElementById('nsftSettingsBtn');
    if (settingsBtn) settingsBtn.addEventListener('click', () => NSFTRouter.go('settings'));

    const openInTabBtn = document.getElementById('nsftOpenInTabBtn');
    if (openInTabBtn) {
        openInTabBtn.addEventListener('click', () => {
            const app = document.querySelector('.nsft-app');
            const screen = (app && app.dataset.screen) || 'home';
            const cat = (app && app.dataset.detailCat) || '';
            const url = chrome.runtime.getURL('popup/popup.html') + '?view=tab'
                + (screen !== 'home' ? '&screen=' + encodeURIComponent(screen) : '')
                + (screen === 'detail' && cat ? '&cat=' + encodeURIComponent(cat) : '');

            const openNew = () => { chrome.tabs.create({ url }); window.close(); };

            try {
                if (typeof chrome.runtime.getContexts === 'function') {
                    chrome.runtime.getContexts({ contextTypes: ['TAB'] }, (ctxs) => {
                        const mine = (ctxs || []).find((c) => (c.documentUrl || '').includes('popup/popup.html'));
                        if (mine && typeof mine.tabId === 'number' && mine.tabId >= 0) {
                            chrome.tabs.update(mine.tabId, { url, active: true });
                            if (typeof mine.windowId === 'number' && chrome.windows) {
                                try { chrome.windows.update(mine.windowId, { focused: true }); } catch (e) { }
                            }
                            window.close();
                        } else {
                            openNew();
                        }
                    });
                } else {
                    openNew();
                }
            } catch (e) {
                openNew();
            }
        });
    }

    try {
        const params = new URLSearchParams(location.search);
        if (params.get('view') === 'tab') {
            applyTabLayout();
            const screen = params.get('screen');
            if (screen === 'settings') NSFTRouter.go('settings');
            else NSFTRouter.go('detail', params.get('cat') || 'all');
        }
    } catch (e) { }

    const highlightSetting = (target) => {
        const input = target && document.getElementById(target);
        const row = input && input.closest('.nsft-settings-row, .option-row');
        if (!row) return;
        NSFTRouter.go('settings');
        setTimeout(() => {
            row.scrollIntoView({ block: 'center', behavior: 'smooth' });
            row.classList.add('is-highlight');
            setTimeout(() => row.classList.remove('is-highlight'), 2600);
        }, 220);
    };

    try {
        const fromUrl = new URLSearchParams(location.search).get('highlight');
        if (fromUrl) {
            highlightSetting(fromUrl);
        } else {
            chrome.storage.local.get({ nsftSettingsHighlight: null }, (it) => {
                const mark = it && it.nsftSettingsHighlight;
                chrome.storage.local.remove('nsftSettingsHighlight');
                if (!mark || !mark.id || (Date.now() - (mark.ts || 0)) > 60000) return;
                highlightSetting(mark.id);
            });
        }
    } catch (e) { }
    const settingsBack = document.getElementById('nsftSettingsBackBtn');
    if (settingsBack) settingsBack.addEventListener('click', () => NSFTRouter.back());

    const enableAll = document.getElementById('nsftDetailEnableAll');
    const disableAll = document.getElementById('nsftDetailDisableAll');
    const detailActionScope = () => {
        const visible = Array.from(document.querySelectorAll('.nsft-panel'))
            .filter((p) => !p.classList.contains('nsft-panel-hidden'));
        if (visible.length === 1) return visible[0];
        return document.getElementById('nsftDetailBody');
    };
    const isGlobalScope = (scope) => !!scope && scope.id === 'nsftDetailBody';
    if (enableAll) enableAll.addEventListener('click', () => {
        const scope = detailActionScope();
        if (!scope) return;
        if (isGlobalScope(scope)) applySmartEnableAll({ mode: 'enableAll' });
        else applyMasterSwitch(scope, true);
    });
    if (disableAll) disableAll.addEventListener('click', () => {
        const scope = detailActionScope();
        if (!scope) return;
        if (isGlobalScope(scope)) applySmartDisableAll();
        else applyMasterSwitch(scope, false);
    });
}

function applyTabLayout() {
    const app = document.querySelector('.nsft-app');
    if (!app || app.dataset.tabLayout === '1') return;
    app.dataset.tabLayout = '1';

    const side = document.createElement('aside');
    side.className = 'nsft-tabside';

    const head = document.createElement('div');
    head.className = 'nsft-tabside-head';
    const brand = document.querySelector('.nsft-brand');
    const themeBtn = document.getElementById('nsftThemeToggle');
    if (brand) head.appendChild(brand);
    if (themeBtn) head.appendChild(themeBtn);
    side.appendChild(head);

    const home = document.querySelector('.nsft-screen[data-screen-el="home"]');
    if (home) side.appendChild(home);

    const acts = document.createElement('div');
    acts.className = 'nsft-tabside-actions';
    document.querySelectorAll('#nsftFeedbackMenu .nsft-overflow-item').forEach((item) => {
        const label = item.querySelector('span');
        if (label && !item.title) item.title = label.textContent.trim();
        const key = label && label.getAttribute('data-i18n');
        if (key === 'reportBugLink') item.classList.add('nsft-tabside-bug');
        else if (key === 'featureRequestLink') item.classList.add('nsft-tabside-idea');
        else if (key === 'trackBoardLink') item.classList.add('nsft-tabside-board');
        acts.appendChild(item);
    });
    const gear = document.getElementById('nsftSettingsBtn');
    if (gear) acts.appendChild(gear);
    side.appendChild(acts);

    app.insertBefore(side, app.firstChild);

    const header = document.createElement('header');
    header.className = 'nsft-tabhead';

    const rowTop = document.createElement('div');
    rowTop.className = 'nsft-tabhead-top';

    const catIcon = document.getElementById('nsftDetailIcon');
    const breadcrumb = document.querySelector('.nsft-tb-mode[data-tb-mode="detail"] .nsft-tb-breadcrumb');
    if (catIcon) rowTop.appendChild(catIcon);
    if (breadcrumb) rowTop.appendChild(breadcrumb);

    const support = document.querySelector('.nsft-topbar-actions');
    if (support) rowTop.appendChild(support);
    header.appendChild(rowTop);

    const rowBar = document.createElement('div');
    rowBar.className = 'nsft-tabhead-bar';
    const stats = document.getElementById('nsftStats');
    if (stats) rowBar.appendChild(stats);
    const masters = document.querySelector('.nsft-tb-mode[data-tb-mode="detail"] .nsft-tb-detail-actions');
    if (masters) rowBar.appendChild(masters);
    header.appendChild(rowBar);

    const screens = document.querySelector('.nsft-screens');
    if (screens) app.insertBefore(header, screens);

    const pv = document.createElement('aside');
    pv.className = 'nsft-tabpreview';
    pv.id = 'nsftTabPreview';

    const pvHead = document.createElement('header');
    pvHead.className = 'nsft-tabpreview-head';
    const pvKicker = document.createElement('span');
    pvKicker.className = 'nsft-tabpreview-kicker';
    pvKicker.textContent = chrome.i18n.getMessage('previewPanelTitle') || 'Preview';
    const pvName = document.createElement('strong');
    pvName.className = 'nsft-tabpreview-name';

    const pvTexts = document.createElement('div');
    pvTexts.className = 'nsft-tabpreview-titles';
    pvTexts.append(pvKicker, pvName);

    const pvReplay = document.createElement('button');
    pvReplay.type = 'button';
    pvReplay.className = 'nsft-tabpreview-replay';
    pvReplay.title = chrome.i18n.getMessage('previewReplay') || 'Replay';
    pvReplay.setAttribute('aria-label', pvReplay.title);
    pvReplay.textContent = '\u21BB';

    pvHead.append(pvTexts, pvReplay);

    const pvBody = document.createElement('div');
    pvBody.className = 'nsft-tabpreview-body';

    pv.append(pvHead, pvBody);
    if (screens) screens.appendChild(pv);
    wireTabPreview(pv, pvBody, pvName, pvReplay);

    if (screens) {
        const results = document.getElementById('nsftSearchResults');
        const empty = document.getElementById('nsftEmptyState');
        if (results) screens.appendChild(results);
        if (empty) screens.appendChild(empty);
    }

    const label = (el, key, fallback) => {
        if (!el || el.querySelector('.nsft-tab-btn-label')) return;
        const span = document.createElement('span');
        span.className = 'nsft-tab-btn-label';
        span.textContent = chrome.i18n.getMessage(key) || fallback;
        el.appendChild(span);
    };
    label(document.getElementById('bmcLink'), 'bmcText', 'Invítame un café');
    label(document.getElementById('rateLink'), 'rateShort', 'Valorar');

    const master = (id, key, fallback) => {
        const btn = document.getElementById(id);
        const span = btn && btn.querySelector('.nsft-tb-btn-label');
        if (span) span.textContent = chrome.i18n.getMessage(key) || fallback;
    };
    master('nsftDetailEnableAll', 'detailEnableAllLong', 'Activar todo');
    master('nsftDetailDisableAll', 'detailDisableAllLong', 'Desactivar todo');

    document.querySelectorAll('.nsft-panel[data-panel] .nsft-panel-title').forEach((title) => {
        if (title.querySelector('.nsft-panel-count')) return;
        const count = document.createElement('span');
        count.className = 'nsft-panel-count';
        const master = title.querySelector('.nsft-panel-master');
        if (master) title.insertBefore(count, master);
        else title.appendChild(count);
    });
    if (typeof updateTileCounts === 'function') updateTileCounts();

    const foot = document.querySelector('.nsft-app-foot');
    const detailScreen = document.querySelector('.nsft-screen[data-screen-el="detail"]');
    if (foot && detailScreen) detailScreen.insertBefore(foot, detailScreen.firstChild);

    const titleEl = document.getElementById('nsftDetailTitle');
    const setSettingsTitle = () => {
        if (titleEl) titleEl.textContent = chrome.i18n.getMessage('settingsScreenTitle') || 'Ajustes';
        if (catIcon) { catIcon.innerHTML = ''; catIcon.removeAttribute('style'); }
        const count = document.getElementById('nsftDetailCount');
        if (count) count.textContent = '';
    };
    if (gear) gear.addEventListener('click', setSettingsTitle);
}

function showCategoryInDetail(categoryKey) {
    const app = document.querySelector('.nsft-app');
    const panels = document.querySelectorAll('.nsft-panel');
    const isAll = categoryKey === 'all';

    panels.forEach((p) => {
        p.classList.toggle('nsft-panel-hidden', !isAll && p.getAttribute('data-panel') !== categoryKey);
    });

    if (app) {
        app.setAttribute('data-detail-mode', isAll ? 'all' : 'single');
        app.dataset.detailCat = categoryKey;
    }

    document.querySelectorAll('.nsft-tile').forEach((t) => {
        t.classList.toggle('is-current', t.dataset.category === categoryKey);
    });

    const cat = NSFT_CATEGORIES.find((c) => c.key === categoryKey);
    const titleEl = document.getElementById('nsftDetailTitle');
    const countEl = document.getElementById('nsftDetailCount');
    const iconEl = document.getElementById('nsftDetailIcon');

    if (titleEl && cat) {
        titleEl.textContent = chrome.i18n.getMessage(cat.i18n) || cat.key;
    }

    if (iconEl) {
        if (cat) {
            iconEl.setAttribute('data-category', cat.key);
            iconEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-linecap="round" stroke-linejoin="round">${cat.icon}</svg>`;
        } else {
            iconEl.removeAttribute('data-category');
            iconEl.innerHTML = '';
        }
    }

    if (countEl) {
        let scope;
        if (isAll) scope = document.getElementById('nsftDetailBody');
        else scope = document.querySelector(`.nsft-panel[data-panel="${categoryKey}"]`);
        if (scope) {
            const cbs = scope.querySelectorAll('.option-row label.switch > input[type="checkbox"]');
            const total = cbs.length;
            let on = 0;
            cbs.forEach((cb) => { if (cb.checked) on++; });
            countEl.textContent = `${on}/${total}`;
        }
    }

    const detail = document.querySelector('.nsft-screen[data-screen-el="detail"]');
    if (detail) detail.scrollTop = 0;
}

function initializeHome() {
    const grid = document.getElementById('nsftTileGrid');
    if (!grid) return;

    grid.innerHTML = '';
    NSFT_CATEGORIES.forEach((cat) => {
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'nsft-tile';
        tile.dataset.category = cat.key;
        const label = chrome.i18n.getMessage(cat.i18n) || cat.key;
        tile.innerHTML = `
          <span class="nsft-tile-icon-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-linecap="round" stroke-linejoin="round">${cat.icon}</svg>
          </span>
          <span class="nsft-tile-text">
            <span class="nsft-tile-name">${escapeTileText(label)}</span>
            <span class="nsft-tile-count">
              <span class="nsft-tile-on">0</span><span class="nsft-tile-total">/ 0</span>
            </span>
          </span>
          <span class="nsft-tile-meter"><span></span></span>`;
        tile.addEventListener('click', () => {
            if (document.documentElement.getAttribute('data-view') === 'tab') {
                const input = document.getElementById('nsftPopupSearch');
                if (input && input.value) {
                    input.value = '';
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
            NSFTRouter.go('detail', cat.key);
        });
        grid.appendChild(tile);
    });

    _nsftPaintInitialCounts();

    document.addEventListener('change', (e) => {
        if (e.target && e.target.matches('.option-row label.switch > input[type="checkbox"]')) {
            updateTileCounts();
            refreshDetailCount();
        }
    });
    ['nsftDetailEnableAll', 'nsftDetailDisableAll',
     'nsftSettingsEnableAll', 'nsftSettingsDisableAll'].forEach((id) => {
        const b = document.getElementById(id);
        if (b) b.addEventListener('click', () => setTimeout(() => {
            updateTileCounts();
            refreshDetailCount();
        }, 0));
    });
}

function escapeTileText(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function _nsftPaintTile(tile, on, total) {
    const onEl = tile.querySelector('.nsft-tile-on');
    const totalEl = tile.querySelector('.nsft-tile-total');
    if (onEl) onEl.textContent = String(on);
    if (totalEl) totalEl.textContent = '/ ' + total;
    tile.classList.toggle('has-active', on > 0);
    tile.dataset.enabled = on > 0 ? 'true' : 'false';
    const fill = tile.querySelector('.nsft-tile-meter > span');
    if (fill) fill.style.width = (total > 0 ? Math.round((on / total) * 100) : 0) + '%';
}

function updateTileCounts() {
    const cache = {};
    document.querySelectorAll('.nsft-tile').forEach((tile) => {
        const key = tile.dataset.category;
        let scope;
        if (key === 'all') {
            scope = document.getElementById('nsftDetailBody');
        } else {
            scope = document.querySelector(`.nsft-panel[data-panel="${key}"]`);
        }
        if (!scope) return;
        const checkboxes = scope.querySelectorAll('.option-row label.switch > input[type="checkbox"]');
        const total = checkboxes.length;
        let on = 0;
        checkboxes.forEach((cb) => { if (cb.checked) on++; });

        _nsftPaintTile(tile, on, total);
        cache[key] = { on, total };
    });
    if (cache.all) updateGlobalStats(cache.all.on, cache.all.total);

    document.querySelectorAll('.nsft-panel[data-panel]').forEach((panel) => {
        const slot = panel.querySelector('.nsft-panel-count');
        if (!slot) return;
        const c = cache[panel.dataset.panel];
        slot.textContent = c ? (c.on + '/' + c.total) : '';
    });
    try { localStorage.setItem('nsftTileCountsCache', JSON.stringify(cache)); } catch (e) { }
}

function updateGlobalStats(on, total) {
    const onEl = document.getElementById('nsftStatsOn');
    const restEl = document.getElementById('nsftStatsRest');
    const fillEl = document.getElementById('nsftStatsFill');
    const btn = document.getElementById('nsftStatsToggleAll');

    if (onEl) onEl.textContent = String(on);
    if (restEl) {
        restEl.textContent = chrome.i18n.getMessage('popupStatsRest', [String(total)])
            || ('de ' + total + ' funciones activas');
    }
    if (fillEl) fillEl.style.width = (total > 0 ? Math.round((on / total) * 100) : 0) + '%';

    if (btn) {
        const allOff = on === 0;
        btn.dataset.mode = allOff ? 'enable' : 'disable';
        const key = allOff ? 'statsEnableAll' : 'statsDisableAll';
        btn.textContent = chrome.i18n.getMessage(key) || (allOff ? 'Activar todo' : 'Desactivar todo');
    }
}

function initializeGlobalStats() {
    const btn = document.getElementById('nsftStatsToggleAll');
    if (!btn) return;
    btn.addEventListener('click', () => {
        if (btn.dataset.mode === 'enable') applySmartEnableAll({ mode: 'enableAll' });
        else applySmartDisableAll();
    });
}

function _nsftLoadTileCountsCache() {
    try {
        const raw = localStorage.getItem('nsftTileCountsCache');
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

function _nsftPaintInitialCounts() {
    const cache = _nsftLoadTileCountsCache();
    document.querySelectorAll('.nsft-tile').forEach((tile) => {
        const key = tile.dataset.category;
        const onEl = tile.querySelector('.nsft-tile-on');
        const totalEl = tile.querySelector('.nsft-tile-total');
        if (!onEl || !totalEl) return;
        const entry = cache && cache[key];
        if (entry) {
            _nsftPaintTile(tile, entry.on, entry.total);
            if (key === 'all') updateGlobalStats(entry.on, entry.total);
        } else {
            const sel = '.nsft-panel .option-row label.switch > input[type="checkbox"]';
            const count = key === 'all'
                ? document.querySelectorAll(sel).length
                : document.querySelectorAll(`.nsft-panel[data-panel="${key}"] .option-row label.switch > input[type="checkbox"]`).length;
            onEl.textContent = '—';
            totalEl.textContent = '/ ' + count;
        }
    });
}

function refreshDetailCount() {
    const app = document.querySelector('.nsft-app');
    if (!app || app.dataset.screen !== 'detail') return;
    const countEl = document.getElementById('nsftDetailCount');
    if (!countEl) return;
    const mode = app.getAttribute('data-detail-mode') || 'single';
    let scope;
    if (mode === 'all') scope = document.getElementById('nsftDetailBody');
    else {
        const title = document.getElementById('nsftDetailTitle');
        const name = title ? title.textContent.trim() : '';
        scope = Array.from(document.querySelectorAll('.nsft-panel'))
            .find((p) => !p.classList.contains('nsft-panel-hidden'));
    }
    if (!scope) return;
    const cbs = scope.querySelectorAll('.option-row label.switch > input[type="checkbox"]');
    let on = 0;
    cbs.forEach((cb) => { if (cb.checked) on++; });
    countEl.textContent = `${on}/${cbs.length}`;
}

function initializeSettingsScreen() {
    const seg = document.getElementById('nsftThemeSegmented');
    if (seg) {
        const tb = document.getElementById('nsftThemeToggle');
        const mode = tb ? (tb.getAttribute('data-mode') || 'light') : 'light';
        seg.querySelectorAll('.nsft-seg-btn').forEach((btn) => {
            btn.setAttribute('aria-pressed', btn.dataset.seg === mode ? 'true' : 'false');
            btn.addEventListener('click', () => {
                setUnifiedTheme(btn.dataset.seg === 'dark');
                seg.querySelectorAll('.nsft-seg-btn').forEach((b) => {
                    b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
                });
            });
        });
        if (tb) {
            const observer = new MutationObserver(() => {
                const m = tb.getAttribute('data-mode') || 'light';
                seg.querySelectorAll('.nsft-seg-btn').forEach((b) => {
                    b.setAttribute('aria-pressed', b.dataset.seg === m ? 'true' : 'false');
                });
            });
            observer.observe(tb, { attributes: true, attributeFilter: ['data-mode'] });
        }
    }

    const enableAll = document.getElementById('nsftSettingsEnableAll');
    const disableAll = document.getElementById('nsftSettingsDisableAll');
    if (disableAll) disableAll.addEventListener('click', () => applySmartDisableAll());
    if (enableAll) enableAll.addEventListener('click', () => applySmartEnableAll({ mode: 'restore' }));

    const wizard = document.getElementById('nsftSettingsWizard');
    if (wizard) {
        wizard.addEventListener('click', () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('welcome/welcome.html#wizard') });
        });
    }
}

const NSFT_DISABLE_SNAPSHOT_KEY = 'nsftDisableSnapshot';

let _nsftLastBulk = null;

function nsftToggleCheckboxes(scope) {
    return (scope || document).querySelectorAll('.option-row label.switch > input[type="checkbox"]');
}

function readDisableSnapshot(raw) {
    if (Array.isArray(raw)) return raw.length ? { ids: raw, at: 0 } : null;
    if (raw && Array.isArray(raw.ids) && raw.ids.length) return { ids: raw.ids, at: raw.at || 0 };
    return null;
}

function formatSnapshotDate(at, opts) {
    if (!at) return '';
    try {
        return new Date(at).toLocaleDateString(chrome.i18n.getUILanguage(),
            opts || { day: 'numeric', month: 'short' });
    } catch (e) {
        return '';
    }
}

function applyBulkUpdates(updates, opts) {
    const ids = Object.keys(updates || {});
    if (!ids.length) return;
    const o = opts || {};
    const touchesSnapshot = Object.prototype.hasOwnProperty.call(o, 'snapshotAfter');

    const previous = {};
    ids.forEach((id) => {
        previous[id] = !updates[id];
        const cb = document.getElementById(id);
        if (cb && cb.type === 'checkbox') cb.checked = updates[id];
    });

    chrome.storage.local.get({ [NSFT_DISABLE_SNAPSHOT_KEY]: null }, (cur) => {
        const snapshotBefore = cur[NSFT_DISABLE_SNAPSHOT_KEY];
        const payload = { ...updates };
        if (touchesSnapshot && o.snapshotAfter !== null) payload[NSFT_DISABLE_SNAPSHOT_KEY] = o.snapshotAfter;

        chrome.storage.local.set(payload, () => {
            chrome.storage.sync.set(updates);

            const finish = () => {
                refreshRestoreButtonState();
                if (typeof updateTileCounts === 'function') updateTileCounts();
                if (typeof refreshDetailCount === 'function') refreshDetailCount();
                if (o.silent) return;
                _nsftLastBulk = {
                    updates: previous,
                    snapshotAfter: touchesSnapshot ? snapshotBefore : undefined
                };
                showToast(o.toast, {
                    type: o.toastType || 'success',
                    duration: 6000,
                    action: {
                        label: chrome.i18n.getMessage('bulkUndo') || 'Deshacer',
                        onClick: undoLastBulk
                    }
                });
            };

            if (touchesSnapshot && o.snapshotAfter === null) {
                chrome.storage.local.remove(NSFT_DISABLE_SNAPSHOT_KEY, finish);
            } else {
                finish();
            }
        });
    });
}

function undoLastBulk() {
    const last = _nsftLastBulk;
    if (!last) return;
    _nsftLastBulk = null;
    const opts = { silent: true };
    if (last.snapshotAfter !== undefined) opts.snapshotAfter = last.snapshotAfter;
    applyBulkUpdates(last.updates, opts);
    showToast(chrome.i18n.getMessage('toastBulkUndone') || 'Cambio deshecho', { type: 'info' });
}

function refreshRestoreButtonState() {
    const btn = document.getElementById('nsftSettingsEnableAll');
    if (!btn) return;
    chrome.storage.local.get({ [NSFT_DISABLE_SNAPSHOT_KEY]: null }, (items) => {
        const snap = readDisableSnapshot(items[NSFT_DISABLE_SNAPSHOT_KEY]);
        btn.disabled = !snap;
        const desc = document.getElementById('nsftSettingsEnableAllDesc');
        if (!desc) return;
        if (!snap) {
            desc.textContent = chrome.i18n.getMessage('settingsEnableAllEmptyDesc') || '';
            return;
        }
        const when = formatSnapshotDate(snap.at);
        desc.textContent = when
            ? (chrome.i18n.getMessage('settingsEnableAllDatedDesc', [String(snap.ids.length), when]) || '')
            : (chrome.i18n.getMessage('settingsEnableAllDesc') || '');
    });
}

function applySmartDisableAll() {
    const snapshot = [];
    const updates = {};
    nsftToggleCheckboxes().forEach((cb) => {
        if (!cb.id || !cb.checked) return;
        snapshot.push(cb.id);
        updates[cb.id] = false;
    });
    if (!snapshot.length) {
        showToast(chrome.i18n.getMessage('toastDisabledCount', ['0']) || 'Nada que apagar',
            { type: 'info' });
        return;
    }
    showConfirmDialog({
        title: chrome.i18n.getMessage('bulkDisableConfirmTitle') || '¿Desactivar todas?',
        body: chrome.i18n.getMessage('bulkDisableConfirmBody', [String(snapshot.length)]) || '',
        confirmLabel: chrome.i18n.getMessage('bulkDisableConfirmBtn') || 'Desactivar',
        danger: true
    }).then((ok) => {
        if (!ok) return;
        applyBulkUpdates(updates, {
            snapshotAfter: { ids: snapshot, at: Date.now() },
            toast: chrome.i18n.getMessage('toastDisabledCount', [String(snapshot.length)])
                || (snapshot.length + ' preferencias desactivadas')
        });
    });
}

function applySmartEnableAll(opts) {
    const mode = (opts && opts.mode) || 'restore';
    chrome.storage.local.get({ [NSFT_DISABLE_SNAPSHOT_KEY]: null }, (items) => {
        const snapshot = readDisableSnapshot(items[NSFT_DISABLE_SNAPSHOT_KEY]);
        const hasSnapshot = !!snapshot;
        const updates = {};

        if (hasSnapshot) {
            snapshot.ids.forEach((id) => {
                const cb = document.getElementById(id);
                if (cb && cb.type === 'checkbox' && !cb.checked) updates[id] = true;
            });
        } else if (mode === 'enableAll') {
            nsftToggleCheckboxes().forEach((cb) => {
                if (!cb.id || cb.checked) return;
                updates[cb.id] = true;
            });
        } else {
            showToast(chrome.i18n.getMessage('toastRestoreNoSnapshot')
                || 'No hay ninguna copia guardada que restaurar', { type: 'info' });
            refreshRestoreButtonState();
            return;
        }

        const changed = Object.keys(updates).length;
        if (!changed) {
            showToast(chrome.i18n.getMessage('toastEnabledCount', ['0']) || 'Sin cambios',
                { type: 'info' });
            return;
        }

        const when = hasSnapshot ? formatSnapshotDate(snapshot.at, { day: 'numeric', month: 'long' }) : '';
        const restoreBody = when
            ? chrome.i18n.getMessage('bulkRestoreConfirmBodyDated', [String(changed), when])
            : chrome.i18n.getMessage('bulkRestoreConfirmBody', [String(changed)]);

        showConfirmDialog({
            title: hasSnapshot
                ? (chrome.i18n.getMessage('bulkRestoreConfirmTitle') || '¿Restaurar la copia?')
                : (chrome.i18n.getMessage('bulkEnableConfirmTitle') || '¿Activar todas?'),
            body: hasSnapshot
                ? (restoreBody || '')
                : (chrome.i18n.getMessage('bulkEnableConfirmBody', [String(changed)]) || ''),
            confirmLabel: hasSnapshot
                ? (chrome.i18n.getMessage('bulkRestoreConfirmBtn') || 'Restaurar')
                : (chrome.i18n.getMessage('bulkEnableConfirmBtn') || 'Activar')
        }).then((ok) => {
            if (!ok) return;
            applyBulkUpdates(updates, {
                snapshotAfter: hasSnapshot ? null : undefined,
                toast: chrome.i18n.getMessage('toastEnabledCount', [String(changed)])
                    || (changed + ' preferencias activadas')
            });
        });
    });
}

let _nsftToastTimeout = null;
let _nsftToastHideTimeout = null;

function showToast(msg, opts) {
    const toast = document.getElementById('nsftToast');
    if (!toast || !msg) return;
    const msgEl = toast.querySelector('.nsft-toast-msg');
    if (msgEl) msgEl.textContent = msg;
    toast.setAttribute('data-type', (opts && opts.type) || 'success');

    const actionEl = document.getElementById('nsftToastAction');
    if (actionEl) {
        const fresh = actionEl.cloneNode(false);
        actionEl.replaceWith(fresh);
        const action = opts && opts.action;
        if (action && typeof action.onClick === 'function') {
            fresh.textContent = action.label;
            fresh.hidden = false;
            fresh.addEventListener('click', () => {
                hideToast();
                action.onClick();
            });
        } else {
            fresh.textContent = '';
            fresh.hidden = true;
        }
    }

    toast.hidden = false;
    void toast.offsetWidth;
    toast.classList.add('is-visible');
    clearTimeout(_nsftToastTimeout);
    clearTimeout(_nsftToastHideTimeout);
    _nsftToastTimeout = setTimeout(hideToast, (opts && opts.duration) || 2600);
}

function hideToast() {
    const toast = document.getElementById('nsftToast');
    if (!toast) return;
    clearTimeout(_nsftToastTimeout);
    clearTimeout(_nsftToastHideTimeout);
    toast.classList.remove('is-visible');
    _nsftToastHideTimeout = setTimeout(() => { toast.hidden = true; }, 280);
}

function showAlertDialog(body, title) {
    return showConfirmDialog({
        title: title || chrome.i18n.getMessage('dlg_title_alert') || 'Aviso',
        body: body,
        confirmLabel: chrome.i18n.getMessage('dlg_ok') || 'Entendido',
        alertOnly: true
    });
}

function showConfirmDialog(opts) {
    const o = opts || {};
    return new Promise((resolve) => {
        const root = document.getElementById('nsftConfirm');
        const titleEl = document.getElementById('nsftConfirmTitle');
        const bodyEl = document.getElementById('nsftConfirmBody');
        const okBtn = document.getElementById('nsftConfirmOk');
        const cancelBtn = document.getElementById('nsftConfirmCancel');
        if (!root || !titleEl || !bodyEl || !okBtn || !cancelBtn) {
            resolve(window.confirm(o.body || ''));
            return;
        }

        titleEl.textContent = o.title || '';
        bodyEl.textContent = o.body || '';
        okBtn.textContent = o.confirmLabel || 'OK';
        cancelBtn.textContent = chrome.i18n.getMessage('bulkConfirmCancel') || 'Cancelar';
        okBtn.classList.toggle('is-danger', !!o.danger);
        cancelBtn.hidden = !!o.alertOnly;

        let done = false;
        const close = (result) => {
            if (done) return;
            done = true;
            root.hidden = true;
            root.classList.remove('is-visible');
            cancelBtn.hidden = false;
            document.removeEventListener('keydown', onKey, true);
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            root.removeEventListener('click', onBackdrop);
            resolve(result);
        };
        const onOk = () => close(true);
        const onCancel = () => close(false);
        const onBackdrop = (ev) => { if (ev.target === root) close(false); };
        const onKey = (ev) => {
            if (ev.key !== 'Escape') return;
            ev.preventDefault();
            ev.stopPropagation();
            close(false);
        };

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        root.addEventListener('click', onBackdrop);
        document.addEventListener('keydown', onKey, true);

        root.hidden = false;
        void root.offsetWidth;
        root.classList.add('is-visible');
        setTimeout(() => { try { cancelBtn.focus(); } catch (e) { } }, 20);
    });
}


function initializeMasterSwitches() {
    const onBtn = document.getElementById('nsftMasterOn');
    const offBtn = document.getElementById('nsftMasterOff');
    if (onBtn) onBtn.addEventListener('click', () => applyMasterSwitch(document, true));
    if (offBtn) offBtn.addEventListener('click', () => applyMasterSwitch(document, false));

    document.querySelectorAll('[data-panel-master]').forEach((btn) => {
        btn.addEventListener('click', (ev) => {
            const panel = ev.currentTarget.closest('.nsft-panel');
            if (!panel) return;
            const on = ev.currentTarget.getAttribute('data-panel-master') === 'on';
            applyMasterSwitch(panel, on);
        });
    });
}

function applyMasterSwitch(scope, enable) {
    const checkboxes = nsftToggleCheckboxes(scope);
    if (!checkboxes.length) return;
    const updates = {};
    checkboxes.forEach((cb) => {
        if (!cb.id || cb.checked === enable) return;
        updates[cb.id] = enable;
    });
    const changed = Object.keys(updates).length;
    if (!changed) return;
    applyBulkUpdates(updates, {
        toast: chrome.i18n.getMessage(enable ? 'toastEnabledCount' : 'toastDisabledCount', [String(changed)])
            || String(changed)
    });
}

function initializeSettingsExportImport() {
    const exportBtn = document.getElementById('nsftSettingsExport');
    const importBtn = document.getElementById('nsftSettingsImport');
    const resetBtn = document.getElementById('nsftSettingsReset');
    if (exportBtn) exportBtn.addEventListener('click', exportSettingsToFile);
    if (importBtn) importBtn.addEventListener('click', importSettingsFromFile);
    if (resetBtn) resetBtn.addEventListener('click', () => resetEverythingToFreshInstall());
}

function resetEverythingToFreshInstall() {
    showConfirmDialog({
        title: chrome.i18n.getMessage('settingsResetConfirmTitle') || '¿Borrar todo?',
        body: chrome.i18n.getMessage('settingsResetConfirmBody') || '',
        confirmLabel: chrome.i18n.getMessage('settingsResetConfirmBtn') || 'Borrar todo',
        danger: true
    }).then((ok) => {
        if (!ok) return;
        downloadSettingsSnapshot('nsft-settings-backup', () => {
            chrome.storage.local.clear(() => {
                chrome.storage.sync.clear(() => {
                    try { localStorage.clear(); } catch (e) { }
                    seedFreshInstallState();
                });
            });
        });
    });
}

function seedFreshInstallState() {
    const seed = { ...(globalThis.NSFT_DEFAULTS || {}) };
    seed.nsftInstalledAt = Date.now();
    try { seed.nsftUpdateSeenVersion = chrome.runtime.getManifest().version; } catch (e) { }

    chrome.storage.local.set(seed, () => {
        showToast(chrome.i18n.getMessage('toastSettingsReset') || 'Todo borrado · recargando',
            { type: 'success', duration: 1200 });
        setTimeout(() => window.location.reload(), 900);
    });
}

function downloadSettingsSnapshot(prefix, done) {
    const defaultsMap = globalThis.NSFT_DEFAULTS || {};
    const keys = Object.keys(defaultsMap);
    if (!keys.length) { if (done) done(false); return; }

    chrome.storage.local.get(keys, (items) => {
        const payload = {
            kind: 'nsft-settings',
            version: 1,
            exportedAt: new Date().toISOString(),
            settings: items
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${prefix}-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 100);
        if (done) done(true);
    });
}

function exportSettingsToFile() {
    downloadSettingsSnapshot('nsft-settings', (ok) => {
        if (!ok) return;
        showToast(chrome.i18n.getMessage('toastSettingsExported') || 'Configuración exportada',
            { type: 'info' });
    });
}

function importSettingsFromFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        input.remove();
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            let settings = null;
            try {
                const data = JSON.parse(reader.result);
                settings = data && typeof data === 'object'
                    ? (data.settings && typeof data.settings === 'object' ? data.settings : data)
                    : null;
            } catch (e) {
                settings = null;
            }
            if (!settings || typeof settings !== 'object') {
                showAlertDialog(chrome.i18n.getMessage('settingsImportFail') || 'Import failed: invalid JSON file.');
                return;
            }

            const defaultsMap = globalThis.NSFT_DEFAULTS || {};
            const knownKeys = new Set(Object.keys(defaultsMap));
            const toApply = {};
            let count = 0;
            Object.entries(settings).forEach(([k, v]) => {
                if (!knownKeys.has(k)) return;
                toApply[k] = v;
                count++;
            });

            if (!count) {
                showAlertDialog(chrome.i18n.getMessage('settingsImportEmpty') || 'No recognised settings in that file.');
                return;
            }

            const confirmBody = [
                chrome.i18n.getMessage('settingsImportConfirm', [String(count)])
                    || `Import ${count} settings? Your current values will be overwritten.`,
                chrome.i18n.getMessage('bulkImportBackupNote') || ''
            ].filter(Boolean).join(' ');

            showConfirmDialog({
                title: chrome.i18n.getMessage('bulkImportConfirmTitle') || '¿Importar ajustes?',
                body: confirmBody,
                confirmLabel: chrome.i18n.getMessage('bulkImportConfirmBtn') || 'Importar',
                danger: true
            }).then((ok) => {
                if (!ok) return;
                downloadSettingsSnapshot('nsft-settings-backup', () => {
                    chrome.storage.local.set(toApply, () => {
                        chrome.storage.sync.set(toApply);
                        showToast(
                            chrome.i18n.getMessage('toastSettingsImported') || 'Ajustes importados · recargando',
                            { type: 'success', duration: 1200 }
                        );
                        setTimeout(() => window.location.reload(), 900);
                    });
                });
            });
        };
        reader.readAsText(file);
    });
    input.click();
}

function initializeSearch() {
    const input = document.getElementById('nsftPopupSearch');
    const clearBtn = document.getElementById('nsftPopupSearchClear');
    if (!input) return;

    const wrap = input.closest('.nsft-search-wrap');

    const apply = () => {
        const q = input.value.trim();
        if (wrap) wrap.classList.toggle('has-value', q.length > 0);
        renderSearchResults(q);
    };

    input.addEventListener('input', apply);
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            input.value = '';
            apply();
            input.focus();
        });
    }

    const emptyClear = document.getElementById('nsftEmptyClearBtn');
    if (emptyClear) {
        emptyClear.addEventListener('click', () => {
            input.value = '';
            apply();
            input.focus();
        });
    }

    renderSearchResults('');
}

let _nsftMovedRows = [];

const _NSFT_HL_TARGETS = [
    'span[id^="label_"]',
    '.description',
    'label[for]',
    'span[id$="Val"]'
];

function _nsftEscapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

const _NSFT_TS = window.NSFT_TextSearch || null;

function _nsftFold(s) {
    if (_NSFT_TS) return _NSFT_TS.fold(s);
    let out = '';
    for (const ch of String(s)) {
        const folded = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        out += folded.length === ch.length ? folded : ch;
    }
    return out.toLowerCase();
}

function _nsftFoldRanges(text, needle) {
    if (_NSFT_TS) return _NSFT_TS.ranges(text, needle);
    const hay = _nsftFold(text);
    const out = [];
    let i = hay.indexOf(needle);
    while (i !== -1) {
        out.push({ start: i, end: i + needle.length });
        i = hay.indexOf(needle, i + needle.length);
    }
    return out;
}

function _nsftApplyHighlight(row, query) {
    if (!row || !query) return;
    const needle = _nsftFold(String(query).toLowerCase());
    if (!needle) return;
    const sel = _NSFT_HL_TARGETS.join(', ');
    row.querySelectorAll(sel).forEach((el) => {
        if (el.querySelector('input, select, textarea, button')) return;
        const original = el.textContent;
        const tramos = _nsftFoldRanges(original, needle);
        if (!tramos.length) return;
        if (!el.hasAttribute('data-nsft-orig')) {
            el.setAttribute('data-nsft-orig', original);
        }
        if (_NSFT_TS) {
            _NSFT_TS.mark(el, original, needle, 'nsft-search-hl');
            return;
        }
        let html = '';
        let last = 0;
        tramos.forEach((r) => {
            html += _nsftEscapeHtml(original.slice(last, r.start));
            html += `<mark class="nsft-search-hl">${_nsftEscapeHtml(original.slice(r.start, r.end))}</mark>`;
            last = r.end;
        });
        html += _nsftEscapeHtml(original.slice(last));
        el.innerHTML = html;
    });
}

function _nsftClearHighlight(row) {
    if (!row) return;
    row.querySelectorAll('[data-nsft-orig]').forEach((el) => {
        el.textContent = el.getAttribute('data-nsft-orig');
        el.removeAttribute('data-nsft-orig');
    });
}

function _nsftRestoreMovedRows() {
    _nsftMovedRows.forEach(({ row, placeholder }) => {
        _nsftClearHighlight(row);
        if (placeholder && placeholder.parentNode) {
            placeholder.parentNode.replaceChild(row, placeholder);
        }
    });
    _nsftMovedRows = [];
}

function _nsftAnimateHide(el) {
    if (!el || el.hidden) return;
    el.classList.remove('is-entering');
    el.classList.add('is-leaving');
    const cleanup = () => {
        el.classList.remove('is-leaving');
        el.hidden = true;
    };
    let done = false;
    const onEnd = () => {
        if (done) return;
        done = true;
        el.removeEventListener('animationend', onEnd);
        cleanup();
    };
    el.addEventListener('animationend', onEnd);
    setTimeout(onEnd, 360);
}

function _nsftAnimateShow(el) {
    if (!el) return;
    const wasHidden = el.hidden;
    el.classList.remove('is-leaving');
    el.hidden = false;
    if (wasHidden) {
        el.classList.remove('is-entering');
        void el.offsetWidth;
        el.classList.add('is-entering');
    }
}

function renderSearchResults(query) {
    const resultsEl = document.getElementById('nsftSearchResults');
    const countEl = document.getElementById('nsftPopupSearchCount');
    const grid = document.getElementById('nsftTileGrid');
    const empty = document.getElementById('nsftEmptyState');
    const stats = document.getElementById('nsftStats');
    if (!resultsEl) return;

    if (document.documentElement.getAttribute('data-view') === 'tab') {
        _nsftTabSearch((query || '').trim(), { resultsEl, countEl, empty });
        return;
    }

    _nsftRestoreMovedRows();
    resultsEl.innerHTML = '';

    const raw = (query || '').trim();
    const q = _nsftFold(raw.toLowerCase());

    if (!q) {
        _nsftAnimateHide(resultsEl);
        _nsftAnimateHide(empty);
        _nsftAnimateShow(grid);
        _nsftAnimateShow(stats);
        if (countEl) {
            countEl.textContent = '';
            countEl.classList.remove('visible', 'is-zero');
        }
        return;
    }

    if (document.documentElement.getAttribute('data-view') !== 'tab') {
        _nsftAnimateHide(grid);
        _nsftAnimateHide(stats);
    }

    let total = 0;
    const frag = document.createDocumentFragment();

    NSFT_CATEGORIES.forEach((cat) => {
        if (cat.virtual) return;
        const panel = document.querySelector(`.nsft-panel[data-panel="${cat.key}"]`);
        if (!panel) return;

        const matchedRows = [];
        panel.querySelectorAll('.option-row').forEach((row) => {
            const hay = _nsftFold((row.textContent || '').replace(/\s+/g, ' ').toLowerCase());
            if (hay.includes(q)) matchedRows.push(row);
        });

        if (!matchedRows.length) return;
        total += matchedRows.length;

        const group = document.createElement('section');
        group.className = 'nsft-search-group';
        group.dataset.panel = cat.key;

        const head = document.createElement('div');
        head.className = 'nsft-search-group-head';
        head.textContent = chrome.i18n.getMessage(cat.i18n) || cat.key;
        group.appendChild(head);

        const rowsContainer = document.createElement('div');
        rowsContainer.className = 'nsft-search-rows';

        matchedRows.forEach((row) => {
            const placeholder = document.createComment(' nsft-row-slot ');
            row.parentNode.insertBefore(placeholder, row);
            _nsftMovedRows.push({ row, placeholder });
            rowsContainer.appendChild(row);
            _nsftApplyHighlight(row, q);
        });

        group.appendChild(rowsContainer);
        frag.appendChild(group);
    });

    resultsEl.appendChild(frag);

    _nsftPaintSearchCount(countEl, total, raw);

    if (total === 0) {
        _nsftAnimateHide(resultsEl);
        _nsftAnimateShow(empty);
    } else {
        _nsftAnimateHide(empty);
        _nsftAnimateShow(resultsEl);
    }
}

function _nsftPaintSearchCount(countEl, total, query) {
    if (!countEl) return;
    const q = '"' + (query || '') + '"';
    if (total === 0) {
        countEl.textContent = '';
        countEl.classList.remove('visible', 'is-zero');
    } else if (total === 1) {
        countEl.textContent = chrome.i18n.getMessage('popupSearchCountOne', [q]) || ('1 coincidencia de ' + q);
        countEl.classList.add('visible');
        countEl.classList.remove('is-zero');
    } else {
        countEl.textContent = chrome.i18n.getMessage('popupSearchCountMany', [String(total), q]) ||
            (total + ' coincidencias de ' + q);
        countEl.classList.add('visible');
        countEl.classList.remove('is-zero');
    }
}

let _nsftTabSearchPrevCat = null;

function _nsftTabSearch(q, els) {
    const app = document.querySelector('.nsft-app');
    const { resultsEl, countEl, empty } = els;

    if (resultsEl) resultsEl.hidden = true;

    if (!q) {
        document.querySelectorAll('.nsft-detail-body .option-row.nsft-search-miss')
            .forEach((row) => row.classList.remove('nsft-search-miss'));
        document.querySelectorAll('.nsft-detail-body .option-row').forEach(_nsftClearHighlight);
        document.querySelectorAll('.nsft-panel.nsft-search-empty')
            .forEach((p) => p.classList.remove('nsft-search-empty'));
        if (empty) empty.hidden = true;
        const prev = _nsftTabSearchPrevCat;
        _nsftTabSearchPrevCat = null;
        if (prev) showCategoryInDetail(prev);
        _nsftPaintSearchCount(countEl, 0);
        return;
    }

    if (_nsftTabSearchPrevCat === null) {
        _nsftTabSearchPrevCat = (app && app.dataset.detailCat) || 'all';
        NSFTRouter.go('detail');
        showCategoryInDetail('all');
    }

    const needle = _nsftFold(q.toLowerCase());

    let total = 0;
    document.querySelectorAll('.nsft-panel[data-panel]').forEach((panel) => {
        let hits = 0;
        panel.querySelectorAll('.option-row').forEach((row) => {
            const hay = _nsftFold((row.textContent || '').replace(/\s+/g, ' ').toLowerCase());
            const match = hay.includes(needle);
            row.classList.toggle('nsft-search-miss', !match);
            _nsftClearHighlight(row);
            if (match) {
                hits++;
                _nsftApplyHighlight(row, needle);
            }
        });
        panel.classList.toggle('nsft-search-empty', hits === 0);
        total += hits;
    });

    _nsftPaintSearchCount(countEl, total, q);
    if (empty) empty.hidden = total !== 0;
}

async function getActiveNsTab() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || typeof tab.id !== 'number' || tab.id < 0) return null;
        const url = tab.url || tab.pendingUrl || '';
        if (!/^https?:\/\/[^/]*netsuite\.com\//i.test(url)) return null;
        return tab;
    } catch (e) {
        return null;
    }
}

async function safeSendMessageToActiveNsTab(message) {
    const tab = await getActiveNsTab();
    if (!tab) return;
    try {
        await chrome.tabs.sendMessage(tab.id, message);
    } catch (e) { }
}

function normalizeSubConfigs() {
    document.querySelectorAll('.nsft-detail-body .option-row > div:first-child').forEach((col) => {
        const row = col.parentElement;
        Array.from(col.children).forEach((child) => {
            if (child.tagName !== 'DIV') return;
            if (child.classList.contains('description')) return;
            if (!child.querySelector('input, select, button, textarea')) return;
            row.appendChild(child);
        });
        row.style.flexWrap = 'wrap';
    });
}

normalizeSubConfigs();
initializeRouter();
initializeHome();
initializeSearch();
initializeGlobalStats();
initializeMasterSwitches();
initializeSettingsExportImport();
initializeSettingsScreen();
refreshRestoreButtonState();

(() => {
    const searchInput = document.getElementById('nsftPopupSearch');
    if (searchInput) {
        setTimeout(() => {
            try { searchInput.focus({ preventScroll: true }); } catch (e) { }
        }, 50);
    }
})();

chrome.storage.local.get(null, (rawLocalItems) => {
    const syncPrimary = globalThis.NSFT_SYNC_PRIMARY_KEYS || [];
    const missingKeys = Object.keys(DEFAULTS).filter(k => rawLocalItems[k] === undefined);

    const localFirst = { ...DEFAULTS, ...rawLocalItems };
    applyStoredSettings(localFirst);

    if (missingKeys.length) {
        const seed = {};
        missingKeys.forEach(k => { seed[k] = DEFAULTS[k]; });
        chrome.storage.local.set(seed);
    }

    const syncKeysToFetch = Array.from(new Set([...missingKeys, ...syncPrimary]));
    if (!syncKeysToFetch.length) return;
    chrome.storage.sync.get(syncKeysToFetch, (syncItems) => {
        const patch = {};
        syncKeysToFetch.forEach(k => {
            if (syncItems[k] !== undefined && syncItems[k] !== localFirst[k]) patch[k] = syncItems[k];
        });
        const keys = Object.keys(patch);
        if (!keys.length) return;
        chrome.storage.local.set(patch);
        keys.forEach(k => {
            const el = document.getElementById(k);
            if (!el) return;
            if (el.type === 'checkbox') el.checked = patch[k];
            else el.value = patch[k];
            if (syncPrimary.includes(k)) el.dispatchEvent(new Event('input'));
        });
    });
});

function wireTabPreview(panel, caja, tituloEl, replayEl) {
    const pv = window.NSFT_PV;
    if (!pv || !pv.pintar || !caja) return;

    const rotulos = {};
    document.querySelectorAll('[id^="label_enable"]').forEach((el) => {
        rotulos[el.id.slice(6)] = (el.textContent || '').trim();
    });

    const datosDeFila = (row) => {
        const sw = row.querySelector('label.switch input[type="checkbox"][id^="enable"]')
            || row.querySelector('input[type="checkbox"][id^="enable"]');
        if (!sw) return null;
        const rot = row.querySelector('[id^="label_"]');
        const des = row.querySelector('.description');
        return {
            key: sw.id,
            label: (rot && rot.textContent.trim()) || sw.id,
            desc: (des && des.textContent.trim()) || ''
        };
    };

    const controlDe = (destino, row, moduloKey) => {
        let el = destino.closest('select, input');
        if (!el) {
            const lab = destino.closest('label');
            if (lab && !lab.classList.contains('switch')) {
                const id = lab.getAttribute('for');
                el = (id && row.querySelector('[id="' + id + '"]')) || lab.querySelector('select, input');
            }
        }
        if (!el || !el.id || el.id === moduloKey) return null;
        return el;
    };

    const datosDeSub = (el, row) => {
        if (!el.id || !pv.html[el.id]) return null;
        const rot = row.querySelector('label[for="' + el.id + '"]') || el.closest('label');
        return {
            key: el.id,
            label: (rot && rot.textContent.trim()) || el.id,
            desc: ''
        };
    };

    const dondeDe = (row, moduloKey) => {
        const cajas = Array.from(row.querySelectorAll('input[type="checkbox"]'))
            .filter((el) => el.id && el.id !== moduloKey);
        if (cajas.length < 2) return null;
        const cont = cajas[0].closest('div');
        const head = cont && cont.querySelector(':scope > span[data-i18n]');
        return {
            titulo: head ? (head.textContent || '').trim() : '',
            items: cajas.map((el) => {
                const lab = el.closest('label');
                return { texto: ((lab && lab.textContent) || el.id).trim(), on: el.checked };
            })
        };
    };

    const pintarDonde = (row, moduloKey) => {
        const datos = dondeDe(row, moduloKey);
        if (!datos) return;
        const bloque = document.createElement('div');
        bloque.className = 'nsft-tabpreview-where';
        if (datos.titulo) {
            const tit = document.createElement('span');
            tit.className = 'nsft-tabpreview-where-title';
            tit.textContent = datos.titulo;
            bloque.appendChild(tit);
        }
        const tira = document.createElement('div');
        tira.className = 'nsft-tabpreview-chips';
        datos.items.forEach((it) => {
            const chip = document.createElement('span');
            chip.className = 'nsft-tabpreview-chip' + (it.on ? ' is-on' : '');
            chip.textContent = it.texto;
            tira.appendChild(chip);
        });
        bloque.appendChild(tira);
        caja.appendChild(bloque);
    };

    let ultima = null;
    const pintarFila = (row) => {
        if (!row) return false;
        const modulo = datosDeFila(row);
        if (!modulo) return false;
        ultima = modulo.key;
        panel.classList.add('is-on');
        pv.pintar(caja, modulo, {
            respaldo: modulo.key, rotulos: rotulos, titulo: tituloEl, descAbajo: true
        });
        pintarDonde(row, modulo.key);
        return true;
    };

    const mirar = (destino) => {
        const row = destino && destino.closest && destino.closest('.option-row');
        if (!row) return;
        const modulo = datosDeFila(row);
        if (!modulo) return;
        const control = controlDe(destino, row, modulo.key);
        const sub = control ? datosDeSub(control, row) : null;
        const item = sub || modulo;
        if (ultima === item.key) return;
        ultima = item.key;
        panel.classList.add('is-on');
        pv.pintar(caja, item, {
            respaldo: modulo.key, rotulos: rotulos, titulo: tituloEl, descAbajo: true
        });
        pintarDonde(row, modulo.key);
    };

    if (replayEl) {
        replayEl.addEventListener('click', () => {
            const key = ultima;
            ultima = null;
            const row = document.querySelector('[id="label_' + key + '"]');
            const fila = row && row.closest('.option-row');
            if (fila) pintarFila(fila);
        });
    }

    document.addEventListener('mouseover', (e) => mirar(e.target));
    document.addEventListener('focusin', (e) => mirar(e.target));

    pintarFila(document.querySelector('.nsft-screens .option-row'));
}
