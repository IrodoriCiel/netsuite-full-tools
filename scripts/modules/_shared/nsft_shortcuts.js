(function () {
    'use strict';

    if (window.NSFT_Shortcuts) return;

    const IS_MAC = window.NSFT_MacKeys
        ? window.NSFT_MacKeys.isMac
        : /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || '');

    const entries = new Map();
    let counter = 0;

    const listeners = new Set();

    function emit() {
        listeners.forEach(cb => {
            try { cb(); } catch (e) { }
        });
    }

    function register(moduleId, label, combo, options) {
        if (!moduleId || !label || !combo) return null;
        const token = moduleId + '::' + label + '::' + (++counter);
        entries.set(token, {
            moduleId: String(moduleId),
            label: String(label),
            combo,
            group: (options && options.group) || prettyModule(moduleId),
            context: (options && options.context) || 'global',
            configurable: !!(options && options.configurable),
            storageKey: (options && options.storageKey) || null,
            action: (options && options.action) || null,
            order: (options && typeof options.order === 'number') ? options.order : counter
        });
        emit();
        return token;
    }

    function unregister(token) {
        if (entries.delete(token)) emit();
    }

    function unregisterModule(moduleId) {
        let removed = false;
        for (const [token, entry] of entries) {
            if (entry.moduleId === moduleId) { entries.delete(token); removed = true; }
        }
        if (removed) emit();
    }

    function list(opts) {
        const isMac = (opts && typeof opts.isMac === 'boolean') ? opts.isMac : IS_MAC;
        const groups = new Map();
        const sorted = Array.from(entries.values()).sort((a, b) => a.order - b.order);
        for (const e of sorted) {
            if (!groups.has(e.group)) groups.set(e.group, []);
            groups.get(e.group).push({
                moduleId: e.moduleId,
                label: e.label,
                combo: formatCombo(e.combo, { isMac }),
                rawCombo: e.combo,
                context: e.context,
                configurable: e.configurable,
                storageKey: e.storageKey,
                action: e.action
            });
        }
        return Array.from(groups, ([group, items]) => ({ group, items }));
    }

    function keyNames(isMac) {
        const mk = window.NSFT_MacKeys;
        if (mk && mk.isMac === isMac) return { mod: mk.mod, alt: mk.alt, shift: mk.shift };
        return isMac ? { mod: '⌘', alt: '⌥', shift: '⇧' } : { mod: 'Ctrl', alt: 'Alt', shift: 'Shift' };
    }

    function formatCombo(combo, opts) {
        const isMac = (opts && typeof opts.isMac === 'boolean') ? opts.isMac : IS_MAC;
        const K = keyNames(isMac);
        if (typeof combo === 'string') {
            return combo
                .replace(/\bMod\b/g, K.mod)
                .replace(/\bCmd\/Ctrl\b/gi, K.mod)
                .replace(/\bCtrl\/Cmd\b/gi, K.mod)
                .replace(/\bOption\/Alt\b/gi, K.alt)
                .replace(/\bAlt\/Option\b/gi, K.alt)
                .replace(/\bCtrl\b/g, K.mod)
                .replace(/\bAlt\b/g, K.alt)
                .replace(/\bShift\b/g, K.shift);
        }
        if (combo && typeof combo === 'object') {
            const parts = [];
            if (combo.ctrlKey || combo.metaKey) parts.push(K.mod);
            if (combo.shiftKey) parts.push(K.shift);
            if (combo.altKey) parts.push(K.alt);
            const code = String(combo.code || combo.key || '');
            const keyDisplay = code
                .replace(/^Key([A-Z])$/, '$1')
                .replace(/^Digit(\d)$/, '$1')
                .replace(/^Arrow/, '')
                .replace(/^Space$/, 'Space');
            if (keyDisplay) parts.push(keyDisplay);
            return parts.join('+');
        }
        return '';
    }

    function onChange(cb) {
        if (typeof cb !== 'function') return () => {};
        listeners.add(cb);
        return () => listeners.delete(cb);
    }

    function matches(event, combo) {
        if (!event || !combo) return false;
        let c = combo;
        if (typeof c === 'string') {
            c = parseStringCombo(c);
            if (!c) return false;
        }
        const wantCtrl = !!(c.ctrlKey || c.metaKey);
        const evtCtrl = !!(event.ctrlKey || event.metaKey);
        if (wantCtrl !== evtCtrl) return false;
        if (!!c.shiftKey !== !!event.shiftKey) return false;
        if (!!c.altKey !== !!event.altKey) return false;
        const wantCode = String(c.code || '').toLowerCase();
        const evtCode = String(event.code || '').toLowerCase();
        return wantCode && wantCode === evtCode;
    }

    function parseStringCombo(str) {
        const out = { ctrlKey: false, shiftKey: false, altKey: false, code: '' };
        String(str).split('+').map(s => s.trim()).filter(Boolean).forEach(tok => {
            const t = tok.toLowerCase();
            if (t === 'ctrl' || t === 'cmd' || t === 'mod' || t === 'control' || t === 'meta') { out.ctrlKey = true; return; }
            if (t === 'shift') { out.shiftKey = true; return; }
            if (t === 'alt' || t === 'option') { out.altKey = true; return; }
            out.code = humanKeyToCode(tok);
        });
        return out.code ? out : null;
    }

    function humanKeyToCode(token) {
        const t = token.trim();
        if (!t) return '';
        if (/^[A-Za-z]$/.test(t)) return 'Key' + t.toUpperCase();
        if (/^\d$/.test(t)) return 'Digit' + t;
        if (t.length === 1 && t === '?') return 'Slash';
        if (t.length === 1 && t === '/') return 'Slash';
        const map = {
            'enter': 'Enter', 'return': 'Enter',
            'space': 'Space', 'spacebar': 'Space',
            'esc': 'Escape', 'escape': 'Escape',
            'tab': 'Tab', 'backspace': 'Backspace', 'delete': 'Delete',
            'up': 'ArrowUp', 'down': 'ArrowDown', 'left': 'ArrowLeft', 'right': 'ArrowRight',
            'arrowup': 'ArrowUp', 'arrowdown': 'ArrowDown', 'arrowleft': 'ArrowLeft', 'arrowright': 'ArrowRight'
        };
        return map[t.toLowerCase()] || t;
    }

    function prettyModule(moduleId) {
        return String(moduleId)
            .split(/[_-]/)
            .filter(Boolean)
            .map(s => s.charAt(0).toUpperCase() + s.slice(1))
            .join(' ');
    }

    function insideModal(eventOrNode) {
        const MS = window.NSFT_ModalStack;
        if (!MS || typeof MS.contains !== 'function') return false;
        const node = (eventOrNode && eventOrNode.target) || eventOrNode || document.activeElement;
        return MS.contains(node);
    }

    function modalActive() {
        const MS = window.NSFT_ModalStack;
        return !!(MS && typeof MS.anyActive === 'function' && MS.anyActive());
    }

    function pageShortcutBlocked(event) {
        return modalActive() || insideModal(event);
    }

    function bind(moduleId, opts) {
        const o = opts || {};
        if (!moduleId || !o.label || !o.defaultCombo) return;
        let combo = o.defaultCombo;

        const publish = () => {
            unregisterModule(moduleId);
            register(moduleId, o.label, combo, {
                group: o.group,
                configurable: true,
                storageKey: o.storageKey || null,
                action: o.event || null,
                order: o.order
            });
        };

        const fire = () => {
            if (typeof o.onFire === 'function') { o.onFire(); return; }
            if (o.event) window.dispatchEvent(new CustomEvent(o.event));
        };

        document.addEventListener('keydown', (e) => {
            if (typeof o.isEnabled === 'function' && !o.isEnabled()) return;
            if (o.skipWhenModalOpen && pageShortcutBlocked(e)) return;
            if (!matches(e, combo)) return;
            e.preventDefault();
            e.stopPropagation();
            if (window.NSFT_ShortcutCoach) window.NSFT_ShortcutCoach.noteUsed(moduleId);
            fire();
        }, true);

        if (o.storageKey) {
            try {
                chrome.storage.local.get({ [o.storageKey]: null }, (items) => {
                    const saved = items && items[o.storageKey];
                    if (saved && typeof saved === 'object') combo = saved;
                    publish();
                });
                chrome.storage.onChanged.addListener((changes, area) => {
                    if (area !== 'local' || !changes[o.storageKey]) return;
                    const v = changes[o.storageKey].newValue;
                    combo = (v && typeof v === 'object') ? v : o.defaultCombo;
                    publish();
                });
            } catch (e) { publish(); }
        } else {
            publish();
        }
    }

    window.NSFT_Shortcuts = Object.freeze({
        register,
        unregister,
        unregisterModule,
        bind,
        list,
        formatCombo,
        matches,
        insideModal,
        modalActive,
        pageShortcutBlocked,
        parseStringCombo,
        onChange,
        get isMac() { return IS_MAC; }
    });
})();
