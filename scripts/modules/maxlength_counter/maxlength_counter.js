(function () {
    'use strict';
    const STORAGE_KEY = 'enableMaxlengthCounterBeta';
    const COUNTER_CLASS = 'nsft-mlc';
    const WARN_RATIO = 0.9;
    const ERR_RATIO = 1.0;

    const FIELD_SELECTOR = [
        'input[maxlength]', 'textarea[maxlength]',
        'input[data-maxlength]', 'textarea[data-maxlength]',
        'input[onchange*="onchange_field_maxlen"]', 'textarea[onchange*="onchange_field_maxlen"]'
    ].join(',');

    let enabled = false;
    let _inited = false;
    let _unsub = null;
    let _ac = null;
    let _applied = new WeakSet();
    let _lastLen = new WeakMap();

    chrome.storage.local.get({ [STORAGE_KEY]: true }, (items) => {
        enabled = !!items[STORAGE_KEY];
        if (enabled) init();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        enabled = !!changes[STORAGE_KEY].newValue;
        if (enabled) init();
        else teardown();
    });

    function init() {
        if (_inited) { scheduleRunOnce(); return; }
        _inited = true;
        _ac = new AbortController();
        runOnce();
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            _unsub = window.NSFT_Observer.subscribe(scheduleRunOnce, { throttle: 300 });
        } else {
            const mo = new MutationObserver(scheduleRunOnce);
            mo.observe(document.body, { childList: true, subtree: true });
            _unsub = () => mo.disconnect();
        }
    }

    function teardown() {
        if (_unsub) { _unsub(); _unsub = null; }
        _inited = false;
        if (_ac) { _ac.abort(); _ac = null; }
        document.querySelectorAll(`.${COUNTER_CLASS}`).forEach(c => {
            const field = c.previousElementSibling;
            if (field && field.dataset && field.dataset.nsftMlcOrigTitle != null) restoreTitle(field);
            c.remove();
        });
        _applied = new WeakSet();
        _lastLen = new WeakMap();
    }

    function scheduleRunOnce() {
        if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(runOnce, { timeout: 500 });
        else runOnce();
    }

    function runOnce() {
        if (!enabled) return;
        document.querySelectorAll(FIELD_SELECTOR).forEach(hookField);
    }

    function hookField(field) {
        if (_applied.has(field)) return;
        const max = getMaxLength(field);
        if (!max || max <= 0) return;
        _applied.add(field);

        const maxInfo = `${chrome.i18n.getMessage('mlc_tooltip') || 'Max'}: ${max.toLocaleString()}`;
        const prevTitle = field.getAttribute('title');
        field.dataset.nsftMlcOrigTitle = prevTitle == null ? '' : prevTitle;
        field.title = prevTitle ? `${prevTitle}\n${maxInfo}` : maxInfo;

        const counter = document.createElement('span');
        counter.className = COUNTER_CLASS;
        counter.title = chrome.i18n.getMessage('mlc_counter_tooltip') || 'Characters typed / maximum';
        field.insertAdjacentElement('afterend', counter);

        let scheduled = false;
        const update = () => {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => { scheduled = false; updateCounter(field, counter); });
        };
        const opts = { signal: _ac.signal };
        field.addEventListener('input', update, opts);
        field.addEventListener('focus', update, opts);
        field.addEventListener('change', update, opts);
        updateCounter(field, counter);
    }

    function updateCounter(field, counter) {
        const typed = (field.value || '').length;
        if (_lastLen.get(field) === typed && counter.textContent) return;
        _lastLen.set(field, typed);

        const max = getMaxLength(field) || 0;
        if (max <= 0) { counter.textContent = ''; return; }

        counter.textContent = `${typed.toLocaleString()} / ${max.toLocaleString()}`;
        const ratio = typed / max;
        counter.classList.toggle('warn', ratio >= WARN_RATIO && ratio < ERR_RATIO);
        counter.classList.toggle('err', ratio >= ERR_RATIO);
    }

    function restoreTitle(field) {
        const orig = field.dataset.nsftMlcOrigTitle;
        if (orig) field.title = orig; else field.removeAttribute('title');
        delete field.dataset.nsftMlcOrigTitle;
    }

    function getMaxLength(field) {
        const native = field.maxLength;
        if (typeof native === 'number' && native > 0 && native !== -1) return native;

        const onchange = field.getAttribute('onchange') || '';
        const m = /onchange_field_maxlen\s*\(\s*this\s*,\s*(\d+)/i.exec(onchange);
        if (m) return parseInt(m[1], 10);

        const data = field.getAttribute('data-maxlength');
        if (data) {
            const n = parseInt(data, 10);
            if (n > 0) return n;
        }

        return 0;
    }
})();
