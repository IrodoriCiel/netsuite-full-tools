(function () {
    'use strict';

    if (window.NSFT_ShortcutCoach) return;

    if (window.top !== window) return;

    const NS = 'nsft-coach';
    const MASTER_KEY = 'enableShortcutHints';
    const STATE_KEY = 'nsftShortcutHints';
    const MAX_SHOWS = 5;
    const AUTO_HIDE_MS = 9000;
    const DEFAULT_DELAY_MS = 600;
    const USED_SUPPRESS_MS = 3000;

    let _enabled = true;
    let _state = {};
    let _loaded = false;
    let _loading = false;
    let _pending = [];
    let _current = null;
    let _timers = new Map();
    let _usedAt = new Map();

    function ensureLoaded(cb) {
        if (_loaded) { cb(); return; }
        _pending.push(cb);
        if (_loading) return;
        _loading = true;
        chrome.storage.local.get({ [MASTER_KEY]: true, [STATE_KEY]: {} }, (items) => {
            if (!chrome.runtime.lastError) {
                _enabled = items[MASTER_KEY] !== false;
                _state = (items[STATE_KEY] && typeof items[STATE_KEY] === 'object') ? items[STATE_KEY] : {};
            }
            _loaded = true;
            _loading = false;
            const queued = _pending;
            _pending = [];
            queued.forEach((fn) => { try { fn(); } catch (e) { } });
        });
    }

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[MASTER_KEY]) {
            _enabled = changes[MASTER_KEY].newValue !== false;
            if (!_enabled) closeCurrent();
        }
        if (changes[STATE_KEY]) {
            const v = changes[STATE_KEY].newValue;
            _state = (v && typeof v === 'object') ? v : {};
        }
    });


    function patchState(moduleId, patch) {
        chrome.storage.local.get({ [STATE_KEY]: {} }, (items) => {
            if (chrome.runtime.lastError) return;
            const fresh = (items[STATE_KEY] && typeof items[STATE_KEY] === 'object') ? items[STATE_KEY] : {};
            const before = Object.assign({ seen: 0, off: false }, fresh[moduleId]);
            const after = Object.assign({}, before, typeof patch === 'function' ? patch(before) : patch);
            _state = fresh;
            if (before.seen === after.seen && before.off === after.off) return;
            fresh[moduleId] = after;
            chrome.storage.local.set({ [STATE_KEY]: fresh });
        });
    }

    function entryFor(moduleId) {
        return _state[moduleId] || { seen: 0, off: false };
    }


    function lookup(moduleId) {
        if (!window.NSFT_Shortcuts) return null;
        const groups = window.NSFT_Shortcuts.list();
        for (const g of groups) {
            for (const item of g.items) {
                if (item.moduleId === moduleId && item.combo) {
                    return { label: item.label, combo: item.combo };
                }
            }
        }
        return null;
    }


    function hint(moduleId, options) {
        if (!moduleId) return;
        ensureLoaded(() => doHint(moduleId, options));
    }

    function doHint(moduleId, options) {
        if (!_enabled) return;

        if (Date.now() - (_usedAt.get(moduleId) || 0) < USED_SUPPRESS_MS) return;

        const entry = entryFor(moduleId);
        if (entry.off) return;
        if ((entry.seen || 0) >= MAX_SHOWS) return;

        const info = lookup(moduleId);
        if (!info) return;

        const delay = (options && typeof options.delay === 'number') ? options.delay : DEFAULT_DELAY_MS;
        const label = (options && options.label) || info.label;

        clearTimer(moduleId);
        _timers.set(moduleId, setTimeout(() => {
            _timers.delete(moduleId);
            if (!_enabled || entryFor(moduleId).off) return;
            show(moduleId, label, info.combo);
            patchState(moduleId, (before) => ({ seen: (before.seen || 0) + 1 }));
        }, delay));
    }

    function noteUsed(moduleId) {
        if (!moduleId) return;
        _usedAt.set(moduleId, Date.now());
        clearTimer(moduleId);
        if (_current && _current.moduleId === moduleId) closeCurrent();
    }

    function dismiss(moduleId) {
        if (!moduleId) return;
        clearTimer(moduleId);
        if (_current && _current.moduleId === moduleId) closeCurrent();
        patchState(moduleId, { off: true });
        showDismissedNote();
    }

    function showDismissedNote() {
        const wrap = document.createElement('div');
        wrap.className = NS + ' ' + NS + '-note';
        wrap.setAttribute('data-nsft-ui', '');
        wrap.setAttribute('role', 'status');

        const body = document.createElement('div');
        body.className = NS + '-body';

        const text = document.createElement('div');
        text.className = NS + '-text';
        text.textContent = t('coach_dismissed_note', 'Esa sugerencia no volverá a salir. Puedes apagarlas todas desde la configuración de la extensión.');

        const actions = document.createElement('div');
        actions.className = NS + '-actions';
        const openCfg = document.createElement('button');
        openCfg.type = 'button';
        openCfg.className = NS + '-never';
        openCfg.textContent = t('coach_open_settings', 'Abrir configuración');
        openCfg.addEventListener('click', () => {
            try {
                chrome.runtime.sendMessage({
                    action: 'nsftOpenSettings',
                    highlight: 'enableShortcutHints'
                });
            } catch (e) { }
            wrap.remove();
        });
        actions.appendChild(openCfg);

        body.appendChild(text);
        body.appendChild(actions);

        const close = document.createElement('button');
        close.type = 'button';
        close.className = NS + '-close';
        close.setAttribute('aria-label', t('coach_close', 'Cerrar'));
        close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"></path></svg>';
        close.addEventListener('click', () => wrap.remove());

        wrap.appendChild(body);
        wrap.appendChild(close);
        document.body.appendChild(wrap);
        setTimeout(() => { if (wrap.isConnected) wrap.remove(); }, AUTO_HIDE_MS);
    }

    function reset(moduleId) {
        if (moduleId) {
            patchState(moduleId, { seen: 0, off: false });
        } else {
            _state = {};
            chrome.storage.local.set({ [STATE_KEY]: {} });
        }
    }

    function clearTimer(moduleId) {
        const t = _timers.get(moduleId);
        if (t) { clearTimeout(t); _timers.delete(moduleId); }
    }


    function t(key, fallback, subs) {
        try {
            const msg = chrome.i18n.getMessage(key, subs);
            if (msg) return msg;
        } catch (e) { }
        return fallback;
    }

    function closeCurrent() {
        if (!_current) return;
        const { el, timer } = _current;
        _current = null;
        if (timer) clearTimeout(timer);
        if (!el || !el.isConnected) return;
        el.classList.add(NS + '-out');
        setTimeout(() => { if (el.isConnected) el.remove(); }, 200);
    }

    function show(moduleId, label, combo) {
        closeCurrent();

        const wrap = document.createElement('div');
        wrap.className = NS;
        wrap.setAttribute('data-nsft-ui', '');
        wrap.setAttribute('role', 'status');
        wrap.setAttribute('aria-live', 'polite');

        const icon = document.createElement('div');
        icon.className = NS + '-icon';
        icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"></rect><path d="M6 10h.01"></path><path d="M10 10h.01"></path><path d="M14 10h.01"></path><path d="M18 10h.01"></path><path d="M7 14h10"></path></svg>';

        const body = document.createElement('div');
        body.className = NS + '-body';

        const title = document.createElement('div');
        title.className = NS + '-title';
        title.textContent = t('coach_title', 'Atajo disponible');

        const text = document.createElement('div');
        text.className = NS + '-text';
        text.textContent = t('coach_body', 'La próxima vez abre «' + label + '» con:', [label]);

        const keys = document.createElement('div');
        keys.className = NS + '-keys';
        String(combo).split('+').map(s => s.trim()).filter(Boolean).forEach((part, i) => {
            if (i > 0) {
                const plus = document.createElement('span');
                plus.className = NS + '-plus';
                plus.textContent = '+';
                keys.appendChild(plus);
            }
            const kbd = document.createElement('kbd');
            kbd.textContent = part;
            keys.appendChild(kbd);
        });

        const actions = document.createElement('div');
        actions.className = NS + '-actions';
        const never = document.createElement('button');
        never.type = 'button';
        never.className = NS + '-never';
        never.textContent = t('coach_dismiss', 'No volver a mostrar');
        never.addEventListener('click', () => dismiss(moduleId));
        actions.appendChild(never);

        body.appendChild(title);
        body.appendChild(text);
        body.appendChild(keys);
        body.appendChild(actions);

        const close = document.createElement('button');
        close.type = 'button';
        close.className = NS + '-close';
        close.setAttribute('aria-label', t('coach_close', 'Cerrar'));
        close.title = t('coach_close', 'Cerrar');
        close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"></path></svg>';
        close.addEventListener('click', () => closeCurrent());

        wrap.appendChild(icon);
        wrap.appendChild(body);
        wrap.appendChild(close);

        document.body.appendChild(wrap);
        _current = {
            moduleId,
            el: wrap,
            timer: setTimeout(() => closeCurrent(), AUTO_HIDE_MS)
        };
    }

    window.NSFT_ShortcutCoach = Object.freeze({
        hint,
        noteUsed,
        markLearned: noteUsed,
        dismiss,
        reset,
        get maxShows() { return MAX_SHOWS; }
    });
})();
