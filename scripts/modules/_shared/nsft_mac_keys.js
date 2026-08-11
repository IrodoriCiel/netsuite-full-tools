(function () {
    'use strict';

    if (window.NSFT_MacKeys) return;

    const OVERRIDE_KEY = 'shortcutKeyStyle';

    function readOverride() {
        try {
            const v = localStorage.getItem(OVERRIDE_KEY);
            return (v === 'mac' || v === 'win') ? v : '';
        } catch (e) {
            return '';
        }
    }

    function writeOverride(value) {
        try {
            if (value === 'mac' || value === 'win') localStorage.setItem(OVERRIDE_KEY, value);
            else localStorage.removeItem(OVERRIDE_KEY);
        } catch (e) { }
    }

    const OVERRIDE = readOverride();

    const IS_MAC = OVERRIDE
        ? OVERRIDE === 'mac'
        : /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');

    const KEYS = IS_MAC
        ? { mod: '⌘', alt: '⌥', shift: '⇧', ctrl: '⌃' }
        : { mod: 'Ctrl', alt: 'Alt', shift: 'Shift', ctrl: 'Ctrl' };

    function humanize(text) {
        if (!IS_MAC || typeof text !== 'string' || !text) return text;
        return text
            .replace(/\bCtrl\s*\/\s*(?:Cmd\b|⌘)/gi, KEYS.mod)
            .replace(/(?:\bCmd|⌘)\s*\/\s*Ctrl\b/gi, KEYS.mod)
            .replace(/\bAlt\s*\/\s*(?:Option\b|⌥)/gi, KEYS.alt)
            .replace(/(?:\bOption|⌥)\s*\/\s*Alt\b/gi, KEYS.alt)
            .replace(/\bCtrl\b/g, KEYS.mod)
            .replace(/\bCmd\b/g, KEYS.mod)
            .replace(/\bAlt\b/g, KEYS.alt)
            .replace(/\bOption\b/g, KEYS.alt)
            .replace(/\bShift\b/g, KEYS.shift);
    }

    const RAW_KEYS = new Set([
        'shortcutKeyStyleWin',
        'shortcutKeyStyleMac',
        'shortcutKeyStyleDesc'
    ]);

    function patchI18n() {
        if (!IS_MAC) return;
        try {
            if (typeof chrome === 'undefined' || !chrome.i18n || !chrome.i18n.getMessage) return;
            if (chrome.i18n.getMessage.__nsftMacKeys) return;
            const original = chrome.i18n.getMessage.bind(chrome.i18n);
            const wrapped = function (key, substitutions) {
                const raw = original(key, substitutions);
                return RAW_KEYS.has(key) ? raw : humanize(raw);
            };
            wrapped.__nsftMacKeys = true;
            chrome.i18n.getMessage = wrapped;
        } catch (e) {
            console.warn('NSFT: no se pudo adaptar i18n a Mac', e);
        }
    }

    patchI18n();

    function syncOverrideMirror() {
        try {
            if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
            chrome.storage.local.get({ [OVERRIDE_KEY]: 'auto' }, (items) => {
                const raw = items && items[OVERRIDE_KEY];
                const v = (raw === 'mac' || raw === 'win') ? raw : '';
                if (v !== OVERRIDE) writeOverride(v);
            });
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area !== 'local' || !changes[OVERRIDE_KEY]) return;
                writeOverride(changes[OVERRIDE_KEY].newValue);
            });
        } catch (e) { }
    }

    syncOverrideMirror();

    window.NSFT_MacKeys = Object.freeze({
        get isMac() { return IS_MAC; },
        get forced() { return OVERRIDE; },
        get mod() { return KEYS.mod; },
        get alt() { return KEYS.alt; },
        get shift() { return KEYS.shift; },
        get ctrl() { return KEYS.ctrl; },
        humanize
    });
})();
