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

function applyCodeThemesForNsftTheme(resolvedTheme) {
    const isDark = resolvedTheme === 'dark';
    chrome.storage.local.get({
        viewRecordObjectThemeOverridden: false,
        suiteqlThemeOverridden: false,
        viewRecordObjectTheme: null,
        suiteqlTheme: null
    }, (items) => {
        const updates = {};
        if (!items.viewRecordObjectThemeOverridden) {
            const target = isDark ? 'atom-one-dark' : 'atom-one-light';
            if (items.viewRecordObjectTheme !== target) {
                updates.viewRecordObjectTheme = target;
            }
        }
        if (!items.suiteqlThemeOverridden) {
            const target = isDark ? 'dracula' : 'eclipse';
            if (items.suiteqlTheme !== target) {
                updates.suiteqlTheme = target;
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
                    'Aviso reiniciado. Refresca una pestaña de NetSuite para verlo.',
                    { duration: 4000 }
                );
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

function wireBooleanRadioGroups(items) {
    const keys = ['copyIdsNoButton', 'setFieldValuesNoIcon'];
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

function applyStoredSettings(items) {
    populateEditorFontSelect();
    Object.keys(DEFAULTS).forEach(key => {
        const element = document.getElementById(key);
        if (element) {
            const val = items[key];

            if (element.type === 'checkbox') {
                element.checked = val;
            } else {
                element.value = val;
            }

            const toggleVisibility = () => {
                if (key === 'enableAiAssistant') {
                    const container = document.getElementById('aiAssistantScope');
                    if (container) container.style.display = element.checked ? 'flex' : 'none';
                }
                if (key === 'enableLogPrettier') {
                    const container = document.getElementById('theme-container-log');
                    if (container) container.style.display = element.checked ? 'block' : 'none';
                }
                if (key === 'enableViewRecordObject') {
                    const container = document.getElementById('theme-container-record');
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
            };

            if (element.type === 'checkbox') {
                toggleVisibility();
            }

            element.addEventListener('change', () => {
                const newValue = element.type === 'checkbox' ? element.checked : element.value;

                if (key === 'editorTheme') updateEditorThemePreview(newValue);
                if (key === 'editorFontFamily') applyEditorFontToPreview(newValue);
                if (key === 'editorFontSize') applyEditorFontSizeToPreview(newValue);
                if (key.indexOf('editorCustom') === 0) updateEditorThemePreview('custom');

                const codeThemeOverrideMap = {
                    viewRecordObjectTheme: 'viewRecordObjectThemeOverridden',
                    suiteqlTheme: 'suiteqlThemeOverridden'
                };
                const overrideKey = codeThemeOverrideMap[key];
                const extraPayload = overrideKey ? { [overrideKey]: true } : {};

                chrome.storage.local.set({ [key]: newValue, ...extraPayload }, () => {
                    chrome.storage.sync.set({ [key]: newValue });
                });

                if (element.type === 'checkbox') {
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
                    chrome.storage.local.set({ [key]: element.value });
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
            document.getElementById('colorThemeHue').value = 216;
            document.getElementById('colorThemeSat').value = 23;
            document.getElementById('colorThemeLig').value = 49;
            document.getElementById('colorThemeHue').dispatchEvent(new Event('input'));
            document.getElementById('colorThemeSat').dispatchEvent(new Event('input'));
            document.getElementById('colorThemeLig').dispatchEvent(new Event('input'));
            const defaults = { colorThemeHue: 216, colorThemeSat: 23, colorThemeLig: 49 };
            chrome.storage.local.set(defaults);
            chrome.storage.sync.set(defaults);
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
                    alert(chrome.i18n.getMessage('editorThemeImportInvalid') || 'Invalid theme file');
                    return;
                }
                applyImportedTheme(parsed);
            } catch (e) {
                alert(chrome.i18n.getMessage('editorThemeImportInvalid') || 'Invalid theme file');
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
const IS_MAC_POPUP = /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');

function formatShortcut(combo) {
    if (!combo || typeof combo !== 'object') return '';
    const parts = [];
    if (combo.ctrlKey) parts.push(IS_MAC_POPUP ? 'Cmd' : 'Ctrl');
    if (combo.shiftKey) parts.push('Shift');
    if (combo.altKey) parts.push(IS_MAC_POPUP ? 'Option' : 'Alt');
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

function showCategoryInDetail(categoryKey) {
    const app = document.querySelector('.nsft-app');
    const panels = document.querySelectorAll('.nsft-panel');
    const isAll = categoryKey === 'all';

    panels.forEach((p) => {
        p.classList.toggle('nsft-panel-hidden', !isAll && p.getAttribute('data-panel') !== categoryKey);
    });

    if (app) app.setAttribute('data-detail-mode', isAll ? 'all' : 'single');

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
        tile.addEventListener('click', () => NSFTRouter.go('detail', cat.key));
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

function initializeFooterRefresh() {
    const btn = document.getElementById('nsftFootRefresh');
    if (!btn) return;
    btn.addEventListener('click', async () => {
        const done = await safeReloadActiveNsTab();
        if (!done) {
            showToast(chrome.i18n.getMessage('toastNoNsTab') || 'No hay una pestaña de NetSuite activa',
                { type: 'info' });
            return;
        }
        window.close();
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

        let done = false;
        const close = (result) => {
            if (done) return;
            done = true;
            root.hidden = true;
            root.classList.remove('is-visible');
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
                alert(chrome.i18n.getMessage('settingsImportFail') || 'Import failed: invalid JSON file.');
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
                alert(chrome.i18n.getMessage('settingsImportEmpty') || 'No recognised settings in that file.');
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

function _nsftEscapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function _nsftApplyHighlight(row, query) {
    if (!row || !query) return;
    const rx = new RegExp(_nsftEscapeRegExp(query), 'gi');
    const sel = _NSFT_HL_TARGETS.join(', ');
    row.querySelectorAll(sel).forEach((el) => {
        if (el.querySelector('input, select, textarea, button')) return;
        const original = el.textContent;
        if (!rx.test(original)) return;
        if (!el.hasAttribute('data-nsft-orig')) {
            el.setAttribute('data-nsft-orig', original);
        }
        el.innerHTML = _nsftEscapeHtml(original).replace(
            new RegExp(_nsftEscapeRegExp(query), 'gi'),
            (m) => `<mark class="nsft-search-hl">${_nsftEscapeHtml(m)}</mark>`
        );
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

    _nsftRestoreMovedRows();
    resultsEl.innerHTML = '';

    const q = (query || '').trim().toLowerCase();

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

    _nsftAnimateHide(grid);
    _nsftAnimateHide(stats);

    let total = 0;
    const frag = document.createDocumentFragment();

    NSFT_CATEGORIES.forEach((cat) => {
        if (cat.virtual) return;
        const panel = document.querySelector(`.nsft-panel[data-panel="${cat.key}"]`);
        if (!panel) return;

        const matchedRows = [];
        panel.querySelectorAll('.option-row').forEach((row) => {
            const hay = (row.textContent || '').replace(/\s+/g, ' ').toLowerCase();
            if (hay.includes(q)) matchedRows.push(row);
        });

        if (!matchedRows.length) return;
        total += matchedRows.length;

        const group = document.createElement('section');
        group.className = 'nsft-search-group';

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

    if (countEl) {
        if (total === 0) {
            countEl.textContent = '';
            countEl.classList.remove('visible', 'is-zero');
        } else if (total === 1) {
            countEl.textContent = chrome.i18n.getMessage('popupSearchCountOne', ['1']) || '1 resultado';
            countEl.classList.add('visible');
            countEl.classList.remove('is-zero');
        } else {
            const t = (chrome.i18n.getMessage('popupSearchCountMany') || '$1 resultados').replace('$1', total);
            countEl.textContent = t;
            countEl.classList.add('visible');
            countEl.classList.remove('is-zero');
        }
    }

    if (total === 0) {
        _nsftAnimateHide(resultsEl);
        _nsftAnimateShow(empty);
    } else {
        _nsftAnimateHide(empty);
        _nsftAnimateShow(resultsEl);
    }
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

async function safeReloadActiveNsTab() {
    const tab = await getActiveNsTab();
    if (!tab) return false;
    try {
        await chrome.tabs.reload(tab.id);
        return true;
    } catch (e) { }
    return false;
}

async function safeSendMessageToActiveNsTab(message) {
    const tab = await getActiveNsTab();
    if (!tab) return;
    try {
        await chrome.tabs.sendMessage(tab.id, message);
    } catch (e) { }
}

initializeRouter();
initializeHome();
initializeSearch();
initializeGlobalStats();
initializeFooterRefresh();
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
