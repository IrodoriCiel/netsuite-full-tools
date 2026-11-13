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

    const reinstall = document.getElementById('nsftDevReinstall');
    if (reinstall) {
        reinstall.addEventListener('click', () => {
            showConfirmDialog({
                title: chrome.i18n.getMessage('devReinstallConfirmTitle') || '¿Reinstalar desde cero?',
                body: chrome.i18n.getMessage('devReinstallConfirmBody') || '',
                confirmLabel: chrome.i18n.getMessage('devReinstallConfirmBtn') || 'Reinstalar',
                danger: true
            }).then((ok) => {
                if (!ok) return;
                try { localStorage.clear(); } catch (e) { }
                try { sessionStorage.clear(); } catch (e) { }
                chrome.runtime.sendMessage({ nsftDev: 'reinstalar' }, () => {
                    void chrome.runtime.lastError;
                    window.location.reload();
                });
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

    const resetToolsChooser = document.getElementById('nsftDevResetToolsChooser');
    if (resetToolsChooser) {
        resetToolsChooser.addEventListener('click', () => {
            chrome.storage.local.remove('nsftToolsMenuModeChosen', () => {
                showToast(
                    chrome.i18n.getMessage('devResetToolsChooserDone') ||
                    'Listo: al abrir Herramientas en NetSuite vuelve a salir la pregunta.',
                    { duration: 4000 }
                );
            });
        });
    }

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
    const modeKeys = ['saveAndEditButtonMode', 'editAndSaveButtonMode', 'deleteRecordButtonMode', 'scriptExecuteMode'];
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
        },
        setFieldValuesLineMode: (it) => (it.setFieldValuesLineMode === 'menu' ? 'menu' : 'direct')
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

function applyStoredSettings(items) {
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
                if (key === 'enableFileCabinetFavorites') {
                    const container = document.getElementById('fcfav-layout-container');
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
                if (key === 'enableScriptExecute') {
                    const container = document.getElementById('script-execute-container');
                    if (container) container.style.display = element.checked ? 'flex' : 'none';
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
                    const raiz = document.getElementById('treeroot-container-adv');
                    if (raiz) raiz.style.display = element.checked ? 'block' : 'none';
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
                    if (container) container.style.display = element.checked ? 'block' : 'none';
                    const secs = document.getElementById('set-field-values-sections');
                    if (secs) secs.style.display = element.checked ? 'block' : 'none';
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
                if (key === 'enableRecordOptionsMenu') {
                    const kids = document.getElementById('record-options-children');
                    if (kids) kids.style.display = element.checked ? 'block' : 'none';
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
    if (window.NSFTRecordOptionsDeps) window.NSFTRecordOptionsDeps.revisar();
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
    { key: 'all',          i18n: 'tabAll',          icon: '<rect class="g g1" x="3" y="3" width="7" height="7" rx="1.5"></rect><rect class="g g2" x="14" y="3" width="7" height="7" rx="1.5"></rect><rect class="g g3" x="3" y="14" width="7" height="7" rx="1.5"></rect><rect class="g g4" x="14" y="14" width="7" height="7" rx="1.5"></rect>', virtual: true },
    { key: 'essentials',   i18n: 'tabEssentials',   icon: '<polygon class="g g1" points="12 2.5 15 8.6 21.5 9.5 16.8 14.1 17.9 20.6 12 17.5 6.1 20.6 7.2 14.1 2.5 9.5 9 8.6 12 2.5"></polygon><path class="g spark" d="M20 2v3M18.5 3.5h3"></path>' },
    { key: 'records',      i18n: 'tabRecords',      icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><line class="ln" x1="8" y1="13" x2="16" y2="13"></line><line class="ln" x1="8" y1="17" x2="13" y2="17"></line>' },
    { key: 'dev',          i18n: 'tabDev',          icon: '<polyline class="g g1" points="7 8 3 12 7 16"></polyline><polyline class="g g2" points="17 8 21 12 17 16"></polyline><line class="g g3" x1="14" y1="5" x2="10" y2="19"></line>' },
    { key: 'search',       i18n: 'tabSearch',       icon: '<g class="g g1"><circle cx="11" cy="11" r="7"></circle><line x1="20.5" y1="20.5" x2="16" y2="16"></line></g><path class="g spark" d="M11 8v2M10 9h2"></path>' },
    { key: 'layout',       i18n: 'tabLayout',       icon: '<path d="M12 2.5a9.5 9.5 0 1 0 0 19c1.1 0 1.9-.8 1.9-1.9 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.3 0-1.1.8-1.9 1.9-1.9h2.2a5 5 0 0 0 5-5c0-4.2-4.3-7.6-10-7.6z"></path><circle class="dot" cx="7.5" cy="11" r="1.2"></circle><circle class="dot" cx="10" cy="7" r="1.2"></circle><circle class="dot" cx="14.5" cy="7" r="1.2"></circle>' },
    { key: 'productivity', i18n: 'tabProductivity', icon: '<polygon class="g g1" points="13 2 4 14 12 14 11 22 20 10 12 10 13 2"></polygon>' },
    { key: 'fileCabinet',  i18n: 'tabFileCabinet',  icon: '<path d="M3 7V5a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v1"></path><path class="g flap" d="M3 20h15.5a2 2 0 0 0 1.9-1.4L22 11H6.4a2 2 0 0 0-1.9 1.4L3 18z"></path><line x1="3" y1="7" x2="3" y2="20"></line>' },
    { key: 'pdf',          i18n: 'tabPdf',          icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><g class="g g1"><line x1="12" y1="11" x2="12" y2="17"></line><polyline points="9 14.5 12 17.5 15 14.5"></polyline></g>' },
    { key: 'workflow',     i18n: 'tabWorkflow',     icon: '<rect class="g g1" x="3" y="3" width="8" height="8" rx="2"></rect><path class="wire" d="M7 11v4a2 2 0 0 0 2 2h4"></path><rect class="g g2" x="13" y="13" width="8" height="8" rx="2"></rect>' }
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

    function syncActivePreset(h) {
        if (!presetWrap) return;
        presetWrap.querySelectorAll('.nsft-nav-preset').forEach((btn) => {
            btn.classList.toggle('active', Number(btn.dataset.h) === h);
        });
    }

    function refresh() {
        const h = Number(input.value) || 30;
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

    const barMenus = [
        ['nsftFeedbackBtn', 'nsftFeedbackMenu'],
        ['nsftSupportBtn', 'nsftSupportMenu']
    ].map(([b, m]) => ({ btn: document.getElementById(b), menu: document.getElementById(m) }))
        .filter((x) => x.btn && x.menu);
    const closeBarMenu = (x) => {
        x.menu.hidden = true;
        x.btn.setAttribute('aria-expanded', 'false');
    };
    barMenus.forEach((x) => {
        x.btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const willOpen = x.menu.hidden;
            barMenus.forEach((o) => { if (o !== x) closeBarMenu(o); });
            x.menu.hidden = !willOpen;
            x.btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        });
        x.menu.addEventListener('click', () => closeBarMenu(x));
    });
    document.addEventListener('click', (e) => {
        barMenus.forEach((x) => {
            if (!x.menu.hidden && !x.menu.contains(e.target)) closeBarMenu(x);
        });
    });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        barMenus.forEach((x) => { if (!x.menu.hidden) closeBarMenu(x); });
    });

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
        const panel = row.closest('.nsft-panel[data-panel]');
        if (panel) NSFTRouter.go('detail', panel.getAttribute('data-panel'));
        else NSFTRouter.go('settings');
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
    const meetingBtn = document.getElementById('nsftMeetingToggle');
    if (brand) head.appendChild(brand);
    if (meetingBtn) head.appendChild(meetingBtn);
    if (themeBtn) head.appendChild(themeBtn);
    side.appendChild(head);

    const home = document.querySelector('.nsft-screen[data-screen-el="home"]');
    if (home) side.appendChild(home);

    const acts = document.createElement('div');
    acts.className = 'nsft-tabside-actions';
    document.querySelectorAll('#nsftFeedbackMenu .nsft-overflow-item').forEach((item) => {
        const label = item.querySelector('[data-i18n]');
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
    label(document.getElementById('nsftSupportBtn'), 'supportShort', 'Apoyar');

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
            iconEl.innerHTML = `<svg class="nsft-cat-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"
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
            <svg class="nsft-cat-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor"
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

    _nsftCountFx.intro = !_nsftCountFx.reduce();
    _nsftPaintInitialCounts();
    if (_nsftCountFx.intro) _nsftRunCountIntro();

    grid.addEventListener('pointermove', (e) => {
        const t = e.target.closest('.nsft-tile');
        if (!t) return;
        const r = t.getBoundingClientRect();
        t.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        t.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });

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
    if (totalEl) totalEl.textContent = '/ ' + total;
    tile.classList.toggle('has-active', on > 0);
    tile.dataset.enabled = on > 0 ? 'true' : 'false';
    tile._nsftTarget = { on, total };
    if (_nsftCountFx.intro) return;
    _nsftCountTo(onEl, on, 400, true);
    const fill = tile.querySelector('.nsft-tile-meter > span');
    if (fill) fill.style.width = _nsftPct(on, total);
}

const _nsftCountFx = {
    intro: false,
    global: null,
    reduce: () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
};

function _nsftPct(on, total) {
    return (total > 0 ? Math.round((on / total) * 100) : 0) + '%';
}

function _nsftCountTo(el, to, ms, bump) {
    if (!el) return;
    if (el._nsftRaf) cancelAnimationFrame(el._nsftRaf);
    const prev = el._nsftTo;
    el._nsftTo = to;
    const parsed = parseInt(el.textContent, 10);
    const from = isNaN(parsed) ? 0 : parsed;
    if (_nsftCountFx.reduce() || from === to) {
        el.textContent = String(to);
        el._nsftRaf = 0;
    } else {
        const t0 = performance.now();
        const step = (now) => {
            const k = Math.min(1, (now - t0) / ms);
            const e = 1 - Math.pow(1 - k, 3);
            el.textContent = String(Math.round(from + (to - from) * e));
            el._nsftRaf = k < 1 ? requestAnimationFrame(step) : 0;
        };
        el._nsftRaf = requestAnimationFrame(step);
    }
    if (bump && prev !== undefined && prev !== to && !_nsftCountFx.reduce()) {
        el.classList.remove('nsft-fx-bump');
        void el.offsetWidth;
        el.classList.add('nsft-fx-bump');
    }
}

function _nsftRunCountIntro() {
    requestAnimationFrame(() => requestAnimationFrame(() => {
        _nsftCountFx.intro = false;
        document.querySelectorAll('.nsft-tile').forEach((tile, i) => {
            const t = tile._nsftTarget;
            if (!t) return;
            const fill = tile.querySelector('.nsft-tile-meter > span');
            if (fill) fill.style.width = _nsftPct(t.on, t.total);
            const onEl = tile.querySelector('.nsft-tile-on');
            setTimeout(() => _nsftCountTo(onEl, tile._nsftTarget.on, 700, false), 120 + i * 30);
        });
        const g = _nsftCountFx.global;
        if (g) {
            const fillEl = document.getElementById('nsftStatsFill');
            if (fillEl) fillEl.style.width = _nsftPct(g.on, g.total);
            _nsftCountTo(document.getElementById('nsftStatsOn'), g.on, 900, false);
        }
    }));
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

    _nsftCountFx.global = { on, total };
    const live = !_nsftCountFx.intro;
    if (live) _nsftCountTo(onEl, on, 400, true);
    if (restEl) {
        restEl.textContent = chrome.i18n.getMessage('popupStatsRest', [String(total)])
            || ('de ' + total + ' funciones activas');
    }
    if (fillEl && live) fillEl.style.width = _nsftPct(on, total);

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

function initToolsMenuSeg() {
    const seg = document.getElementById('nsftToolsMenuSeg');
    if (!seg) return;
    const btns = Array.from(seg.querySelectorAll('.nsft-seg-btn'));
    const pinta = (ventana) => btns.forEach((b) => {
        const on = (b.dataset.seg === 'ventana') === !!ventana;
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    btns.forEach((b) => {
        if (b.title) b.setAttribute('aria-label', b.title);
        b.addEventListener('click', () => {
            const ventana = b.dataset.seg === 'ventana';
            pinta(ventana);
            chrome.storage.local.set({ enableToolsMenuModal: ventana, nsftToolsMenuModeChosen: true }, () => {
                chrome.storage.sync.set({ enableToolsMenuModal: ventana });
            });
        });
    });
    chrome.storage.local.get({ enableToolsMenuModal: false }, (it) => pinta(it.enableToolsMenuModal));
    chrome.storage.onChanged.addListener((ch, area) => {
        if (area === 'local' && ch.enableToolsMenuModal) pinta(ch.enableToolsMenuModal.newValue);
    });
}

function initializeSettingsScreen() {
    initToolsMenuSeg();
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

const NSFT_MEETING_KEY = 'nsftMeetingMode';

function readMeetingState(raw) {
    return raw && raw.on === true && Array.isArray(raw.ids) ? raw : null;
}

function paintMeetingToggle(state) {
    const btn = document.getElementById('nsftMeetingToggle');
    if (!btn) return;
    const on = !!state;
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    const label = on
        ? chrome.i18n.getMessage('meetingModeTurnOff', [String(state.ids.length)])
        : chrome.i18n.getMessage('meetingModeTurnOn');
    btn.title = label || '';
    btn.setAttribute('aria-label', label || '');
}

function writeMeetingMode(updates, state, toast) {
    Object.keys(updates).forEach((id) => {
        const cb = document.getElementById(id);
        if (cb && cb.type === 'checkbox') cb.checked = updates[id];
    });
    chrome.storage.local.set({ ...updates, [NSFT_MEETING_KEY]: state }, () => {
        if (typeof updateTileCounts === 'function') updateTileCounts();
        if (typeof refreshDetailCount === 'function') refreshDetailCount();
        paintMeetingToggle(readMeetingState(state));
        if (toast) showToast(toast, { type: state ? 'info' : 'success' });
    });
}

const NSFT_MEETING_DISCREET_KEY = 'enableDiscreetMode';

function toggleMeetingMode() {
    const ids = Array.from(nsftToggleCheckboxes()).map((cb) => cb.id).filter(Boolean);
    const query = {
        [NSFT_MEETING_KEY]: null,
        [NSFT_MEETING_DISCREET_KEY]: DEFAULTS[NSFT_MEETING_DISCREET_KEY] === true,
        meetingModeHideAccounts: DEFAULTS.meetingModeHideAccounts !== false
    };
    ids.forEach((id) => { query[id] = DEFAULTS[id] === true; });

    chrome.storage.local.get(query, (items) => {
        const state = readMeetingState(items[NSFT_MEETING_KEY]);
        const updates = {};

        if (state) {
            state.ids.forEach((id) => {
                if (ids.includes(id) && items[id] !== true) updates[id] = true;
            });
            const restored = Object.keys(updates).length;
            if (state.discreet && items[NSFT_MEETING_DISCREET_KEY] === true) {
                updates[NSFT_MEETING_DISCREET_KEY] = false;
            }
            writeMeetingMode(updates, null,
                chrome.i18n.getMessage('meetingModeOffToast', [String(restored)]));
            return;
        }

        const on = ids.filter((id) => items[id] === true);
        const hideAccounts = items.meetingModeHideAccounts === true
            && items[NSFT_MEETING_DISCREET_KEY] !== true;
        if (!on.length && !hideAccounts) {
            showToast(chrome.i18n.getMessage('meetingModeNothing'), { type: 'info' });
            return;
        }
        on.forEach((id) => { updates[id] = false; });
        if (hideAccounts) updates[NSFT_MEETING_DISCREET_KEY] = true;
        writeMeetingMode(updates, { on: true, ids: on, at: Date.now(), discreet: hideAccounts },
            chrome.i18n.getMessage(hideAccounts ? 'meetingModeOnToastHidden' : 'meetingModeOnToast',
                [String(on.length)]));
    });
}

function initializeMeetingMode() {
    const btn = document.getElementById('nsftMeetingToggle');
    if (!btn) return;
    btn.addEventListener('click', toggleMeetingMode);
    chrome.storage.local.get({ [NSFT_MEETING_KEY]: null }, (items) => {
        paintMeetingToggle(readMeetingState(items[NSFT_MEETING_KEY]));
    });
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[NSFT_MEETING_KEY]) return;
        paintMeetingToggle(readMeetingState(changes[NSFT_MEETING_KEY].newValue));
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
        const closeBtn = document.getElementById('nsftConfirmClose');
        if (!root || !titleEl || !bodyEl || !okBtn || !cancelBtn) {
            resolve(window.confirm(o.body || ''));
            return;
        }

        titleEl.textContent = o.title || '';
        bodyEl.textContent = o.body || '';
        okBtn.textContent = o.confirmLabel || 'OK';
        cancelBtn.textContent = chrome.i18n.getMessage('bulkConfirmCancel') || 'Cancelar';
        titleEl.classList.toggle('is-danger', !!o.danger);
        titleEl.classList.toggle('is-aviso', !o.danger && !!o.alertOnly);
        titleEl.classList.toggle('is-pregunta', !o.danger && !o.alertOnly);
        okBtn.classList.toggle('nsft-dlg-btn-danger', !!o.danger);
        const box = root.querySelector('.nsft-w');
        if (box) {
            box.setAttribute('data-theme',
                document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
        }
        if (closeBtn) closeBtn.setAttribute('aria-label', chrome.i18n.getMessage('closeModal') || 'Close');
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
            if (closeBtn) closeBtn.removeEventListener('click', onCancel);
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
        if (closeBtn) closeBtn.addEventListener('click', onCancel);
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
initializeMeetingMode();
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

function pideDibujos() {
    if (window.NSFT_PV) return Promise.resolve(window.NSFT_PV);
    if (window.__nsftPvPromesa) return window.__nsftPvPromesa;
    window.__nsftPvPromesa = new Promise((resolve) => {
        let pedido = false;
        const carga = () => {
            if (pedido) return;
            pedido = true;
            const s = document.createElement('script');
            s.src = '../welcome/welcome_previews.js';
            s.onload = () => resolve(window.NSFT_PV || null);
            s.onerror = () => resolve(null);
            document.head.appendChild(s);
        };
        try { requestAnimationFrame(() => setTimeout(carga, 0)); } catch (e) { }
        setTimeout(carga, 600);
    });
    return window.__nsftPvPromesa;
}

function wireTabPreview(panel, caja, tituloEl, replayEl) {
    const pv = window.NSFT_PV;
    if (!pv) {
        pideDibujos().then((p) => { if (p) wireTabPreview(panel, caja, tituloEl, replayEl); });
        return;
    }
    if (!pv.pintar || !caja) return;

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


    const estadoDe = (row) => {
        const st = {};
        row.querySelectorAll('input[type="checkbox"][id]').forEach((el) => { st[el.id] = el.checked; });
        row.querySelectorAll('input[type="radio"]:checked').forEach((el) => { if (el.name) st[el.name] = el.value; });
        return st;
    };

    let ultima = null;
    let filaActual = null;
    const pintarFila = (row) => {
        if (!row) return false;
        const modulo = datosDeFila(row);
        if (!modulo) return false;
        ultima = modulo.key;
        filaActual = row;
        panel.classList.add('is-on');
        pv.pintar(caja, modulo, {
            respaldo: modulo.key, rotulos: rotulos, titulo: tituloEl, descAbajo: true,
            estado: estadoDe(row)
        });
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
        filaActual = row;
        panel.classList.add('is-on');
        pv.pintar(caja, item, {
            respaldo: modulo.key, rotulos: rotulos, titulo: tituloEl, descAbajo: true,
            estado: estadoDe(row)
        });
    };

    if (pv.aplicarEstado) {
        document.addEventListener('change', (e) => {
            const row = e.target && e.target.closest && e.target.closest('.option-row');
            if (!row || row !== filaActual) return;
            pv.aplicarEstado(caja, estadoDe(row));
        });
    }

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

(function () {
    'use strict';

    const ACCIONES = [
        { chk: 'enableDeleteRecordButton', modo: 'deleteRecordButtonMode' },
        { chk: 'enableEditAndSaveButton', modo: 'editAndSaveButtonMode' },
        { chk: 'enableSaveAndEditButton', modo: 'saveAndEditButtonMode' },
        { chk: 'enableScriptExecute', modo: 'scriptExecuteMode' }
    ];

    function marcar() {
        const padre = document.getElementById('enableRecordOptionsMenu');
        if (!padre) return;
        const apagado = !padre.checked;

        const item = (id) => {
            const el = document.getElementById(id);
            return el ? el.closest('.nsft-subopt-item') : null;
        };

        const trail = item('enableRecordTrail');
        if (trail) trail.classList.toggle('is-sin-camino', apagado);

        ACCIONES.forEach((a) => {
            const caja = item(a.chk);
            if (!caja) return;
            const enMenu = !!document.querySelector(
                'input[type="radio"][name="' + a.modo + '"][value="menu"]:checked');
            caja.classList.toggle('is-sin-camino', apagado && enMenu);
        });
    }

    let _atado = false;
    function arrancar() {
        marcar();
        if (_atado) return;
        _atado = true;
        const padre = document.getElementById('enableRecordOptionsMenu');
        if (padre) padre.addEventListener('change', marcar);
        ACCIONES.forEach((a) => {
            document.querySelectorAll('input[type="radio"][name="' + a.modo + '"]')
                .forEach((r) => r.addEventListener('change', marcar));
        });
    }

    window.NSFTRecordOptionsDeps = { revisar: arrancar };
})();

(function iconoYVistaDeModulo() {
    'use strict';
    const ANCHO_DIBUJO = 720;
    const MARGEN = 8;
    const ESPERA_HOVER = 500;
    const QUIETO_TRAS_SCROLL = 400;
    const SVG = (cuerpo, cls) => '<svg class="' + cls + '" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" '
        + 'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + cuerpo + '</svg>';
    const OJO = '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>';
    const txt = (k, fb) => (chrome.i18n && chrome.i18n.getMessage(k)) || fb;
    const modoPestana = () => document.documentElement.getAttribute('data-view') === 'tab';

    const MIN_LADO = 15;
    let medidor = null;
    const encuadres = {};

    const CLAVE_ENCUADRES = 'nsftIconosEncuadre';
    const huella = (txt) => {
        let h = 5381;
        for (let i = 0; i < txt.length; i++) h = ((h * 33) ^ txt.charCodeAt(i)) >>> 0;
        return h.toString(36) + '.' + txt.length.toString(36);
    };
    const deCaja = (b) => {
        if (!b || !(b.width > 0) || !(b.height > 0)) return '0 0 24 24';
        const lado = Math.max(b.width, b.height, MIN_LADO) + 2;
        const cx = b.x + b.width / 2;
        const cy = b.y + b.height / 2;
        return [cx - lado / 2, cy - lado / 2, lado, lado].map((n) => Math.round(n * 100) / 100).join(' ');
    };
    function precalculaEncuadres(cuerpos) {
        let guardados = {};
        try { guardados = JSON.parse(localStorage.getItem(CLAVE_ENCUADRES) || '{}') || {}; } catch (e) { guardados = {}; }
        const vigentes = {};
        const faltan = [];
        cuerpos.forEach((c) => {
            const k = huella(c);
            if (guardados[k]) { encuadres[c] = guardados[k]; vigentes[k] = guardados[k]; }
            else if (faltan.indexOf(c) < 0) faltan.push(c);
        });
        if (faltan.length) {
            try {
                const m = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                m.setAttribute('width', '24');
                m.setAttribute('height', '24');
                m.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none';
                m.innerHTML = faltan.map((c) => '<g>' + c + '</g>').join('');
                document.body.appendChild(m);
                const grupos = m.children;
                faltan.forEach((c, i) => {
                    let vb = '0 0 24 24';
                    try { vb = deCaja(grupos[i].getBBox()); } catch (e) { }
                    encuadres[c] = vb;
                    vigentes[huella(c)] = vb;
                });
                m.remove();
            } catch (e) { }
        }
        if (faltan.length || Object.keys(vigentes).length !== Object.keys(guardados).length) {
            try { localStorage.setItem(CLAVE_ENCUADRES, JSON.stringify(vigentes)); } catch (e) { }
        }
    }

    function encuadre(cuerpo) {
        if (encuadres[cuerpo]) return encuadres[cuerpo];
        let vb = '0 0 24 24';
        try {
            if (!medidor) {
                medidor = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                medidor.setAttribute('width', '24');
                medidor.setAttribute('height', '24');
                medidor.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none';
                document.body.appendChild(medidor);
            }
            medidor.innerHTML = '<g>' + cuerpo + '</g>';
            vb = deCaja(medidor.firstChild.getBBox());
        } catch (e) { }
        encuadres[cuerpo] = vb;
        return vb;
    }

    const iconoDeCategoria = (row) => {
        const panel = row.closest('.nsft-panel');
        const clave = panel && panel.getAttribute('data-panel');
        const cats = (typeof NSFT_CATEGORIES !== 'undefined') ? NSFT_CATEGORIES : [];
        const cat = cats.find((c) => c.key === clave);
        return cat ? cat.icon : '';
    };

    let flotante = null;
    let actual = null;

    function cierra() {
        if (flotante) flotante.remove();
        flotante = null;
        if (actual) actual.classList.remove('is-on');
        actual = null;
    }

    const AIRE_DIBUJO = 10;
    function recorte(lienzo) {
        const base = lienzo.getBoundingClientRect();
        let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
        lienzo.querySelectorAll('*').forEach((el) => {
            const r = el.getBoundingClientRect();
            if (r.width < 1 || r.height < 1) return;
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') return;
            const fondo = cs.backgroundColor && !/rgba?\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor);
            const borde = ['Top', 'Right', 'Bottom', 'Left'].some((l) => parseFloat(cs['border' + l + 'Width']) > 0);
            const hoja = !el.firstElementChild && (el.textContent || '').trim();
            const grafico = /^(svg|img|canvas)$/i.test(el.tagName) || cs.backgroundImage !== 'none';
            if (!(fondo || borde || hoja || grafico)) return;
            x1 = Math.min(x1, r.left); y1 = Math.min(y1, r.top);
            x2 = Math.max(x2, r.right); y2 = Math.max(y2, r.bottom);
        });
        if (!isFinite(x1)) return { x: 0, y: 0, w: ANCHO_DIBUJO, h: lienzo.offsetHeight };
        const x = Math.max(0, x1 - base.left - AIRE_DIBUJO);
        const y = Math.max(0, y1 - base.top - AIRE_DIBUJO);
        return {
            x: x, y: y,
            w: Math.min(base.width, x2 - base.left + AIRE_DIBUJO) - x,
            h: Math.min(base.height, y2 - base.top + AIRE_DIBUJO) - y
        };
    }

    function abre(boton, key, nombre) {
        const pv = window.NSFT_PV;
        if (!pv || !pv.pintar || modoPestana()) return;
        if (actual === boton) return;
        cierra();
        flotante = document.createElement('div');
        flotante.className = 'nsft-mod-pv';
        flotante.setAttribute('role', 'tooltip');
        const lienzo = document.createElement('div');
        lienzo.className = 'nsft-mod-pv-lienzo';
        lienzo.style.width = ANCHO_DIBUJO + 'px';
        flotante.appendChild(lienzo);
        const titulo = document.createElement('span');
        pv.pintar(lienzo, { key: key, label: nombre, desc: '' },
            { respaldo: key, rotulos: { [key]: nombre }, titulo: titulo });

        flotante.style.left = '-9999px';
        flotante.style.top = '0';
        flotante.style.visibility = 'hidden';
        document.body.appendChild(flotante);
        const caja = recorte(lienzo);
        const disponible = Math.max(220, document.documentElement.clientWidth - MARGEN * 2);
        const z = Math.min(1, (disponible - 2) / caja.w);
        lienzo.style.zoom = String(z);
        lienzo.style.marginLeft = (-caja.x) + 'px';
        lienzo.style.marginTop = (-caja.y) + 'px';
        flotante.style.width = Math.round(caja.w * z + 2) + 'px';
        flotante.style.height = Math.round(caja.h * z + 2) + 'px';
        flotante.style.visibility = '';
        const r = boton.getBoundingClientRect();
        const alto = flotante.offsetHeight;
        const vh = document.documentElement.clientHeight;
        const AIRE = 12;
        let top = r.bottom + AIRE;
        if (top + alto > vh - MARGEN && r.top - AIRE - alto >= MARGEN) top = r.top - AIRE - alto;
        flotante.style.top = Math.max(MARGEN, Math.min(top, vh - alto - MARGEN)) + 'px';
        const ancho = flotante.offsetWidth;
        const vw = document.documentElement.clientWidth;
        const izq = r.left + r.width / 2 - ancho / 2;
        flotante.style.left = Math.max(MARGEN, Math.min(izq, vw - ancho - MARGEN)) + 'px';

        actual = boton;
        boton.classList.add('is-on');
    }

    const etiquetas = Array.prototype.filter.call(
        document.querySelectorAll('.option-row span[id^="label_enable"]'),
        (span) => span.closest('.option-row') && !span.parentElement.classList.contains('nsft-mod-head'));
    const cuerpoDe = (span) => (window.NSFT_MODULE_ICONS && window.NSFT_MODULE_ICONS[span.id.slice(6)])
        || iconoDeCategoria(span.closest('.option-row'));
    precalculaEncuadres(etiquetas.map(cuerpoDe).filter(Boolean));
    const cabeceras = [];

    etiquetas.forEach((span) => {
        const key = span.id.slice(6);
        const row = span.closest('.option-row');

        const cab = document.createElement('span');
        cab.className = 'nsft-mod-head';
        span.before(cab);

        const cuerpo = cuerpoDe(span);
        if (cuerpo) {
            const ico = document.createElement('span');
            ico.className = 'nsft-mod-ico';
            ico.innerHTML = '<svg class="nsft-mod-ico-svg" viewBox="' + encuadre(cuerpo) + '" fill="none" stroke="currentColor" '
                + 'stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + cuerpo + '</svg>';
            cab.appendChild(ico);
        }
        const obsoleto = span.nextElementSibling && span.nextElementSibling.classList.contains('nsft-deprecated') ? span.nextElementSibling : null;
        cab.appendChild(span);
        if (obsoleto) cab.appendChild(obsoleto);
        cabeceras.push([span, key, cab]);
    });

    if (!modoPestana()) {
        pideDibujos().then((pv) => {
            if (!pv || !pv.html) return;
            cabeceras.forEach(([span, key, cab]) => { if (pv.html[key]) ponOjo(span, key, cab); });
        });
    }

    function ponOjo(span, key, cab) {
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'nsft-mod-pvbtn';
        boton.title = txt('previewPanelTitle', 'Preview');
        boton.innerHTML = SVG(OJO, 'nsft-mod-pvbtn-svg');
        cab.appendChild(boton);
        const nombre = () => (span.textContent || '').trim() || key;

        let espera = null;
        const programa = () => {
            clearTimeout(espera);
            espera = setTimeout(() => {
                if (Date.now() - ultimoScroll < QUIETO_TRAS_SCROLL || !boton.matches(':hover')) return;
                boton.setAttribute('aria-label', boton.title + ': ' + nombre());
                abre(boton, key, nombre());
            }, ESPERA_HOVER);
        };
        boton.addEventListener('mouseenter', programa);
        boton.addEventListener('mousemove', () => { if (actual !== boton) programa(); });
        boton.addEventListener('mouseleave', () => { clearTimeout(espera); if (actual === boton) cierra(); });
        boton.addEventListener('focus', () => { if (boton.matches(':focus-visible')) abre(boton, key, nombre()); });
        boton.addEventListener('blur', () => { if (actual === boton) cierra(); });
        boton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            clearTimeout(espera);
            if (actual === boton) cierra();
            else abre(boton, key, nombre());
        });
    }

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cierra(); });
    let ultimoScroll = 0;
    document.addEventListener('scroll', () => { ultimoScroll = Date.now(); cierra(); }, true);
    document.addEventListener('wheel', () => { ultimoScroll = Date.now(); }, { passive: true, capture: true });
})();
