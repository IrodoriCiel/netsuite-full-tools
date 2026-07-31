(function () {
    'use strict';
    const STORAGE_KEY = 'enableMultiselectHierarchyBeta';
    const APPLIED_ATTR = 'data-nsft-msh-applied';
    const OPT_APPLIED_ATTR = 'data-nsft-msh-leaf';
    const SEPARATOR = ' : ';
    const INDENT_UNIT = '      ';

    let enabled = false;
    let _inited = false;
    let _unsub = null;
    const _processed = new WeakSet();

    function isApplicablePage() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isExcludedPage && NSFT_RecordButtons.isExcludedPage()) return false;
        } catch (e) { }
        return true;
    }

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
        if (!isApplicablePage()) return;
        if (_inited) { schedule(); return; }
        _inited = true;
        runOnce();
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            _unsub = window.NSFT_Observer.subscribe(schedule, { throttle: 300 });
        } else {
            const mo = new MutationObserver(schedule);
            mo.observe(document.body, { childList: true, subtree: true });
            _unsub = () => mo.disconnect();
        }
    }

    function teardown() {
        if (_unsub) { _unsub(); _unsub = null; }
        _inited = false;
        document.querySelectorAll(`[${OPT_APPLIED_ATTR}]`).forEach(restoreOption);
        document.querySelectorAll(`[${APPLIED_ATTR}]`).forEach(el => el.removeAttribute(APPLIED_ATTR));
    }

    function schedule() {
        if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(runOnce, { timeout: 500 });
        else runOnce();
    }

    function runOnce() {
        if (!enabled) return;
        document.querySelectorAll('span.uir-multiselect[data-fieldtype="multiselect"]').forEach(hookMultiselect);
    }

    function hookMultiselect(wrapper) {
        const options = wrapper.querySelectorAll('.dropdownDiv .uir-multiselect-option');
        if (!options.length) return;
        const hasHierarchy = Array.prototype.some.call(options, o => o.textContent.includes(SEPARATOR));
        if (!hasHierarchy) return;
        wrapper.setAttribute(APPLIED_ATTR, 'true');
        options.forEach(applyOption);
    }

    function applyOption(opt) {
        if (_processed.has(opt) || opt.getAttribute(OPT_APPLIED_ATTR)) return;

        const original = opt.textContent;
        const parts = original.split(SEPARATOR);
        if (parts.length <= 1) { _processed.add(opt); return; }

        if (opt.children.length === 0) {
            opt.dataset.nsftMshOriginal = original;
            opt.textContent = INDENT_UNIT.repeat(parts.length - 1) + parts[parts.length - 1];
        }

        const prevTitle = opt.getAttribute('title');
        opt.dataset.nsftMshOrigTitle = prevTitle == null ? '' : prevTitle;
        opt.title = prevTitle ? `${original}\n${prevTitle}` : original;

        opt.setAttribute(OPT_APPLIED_ATTR, 'true');
        _processed.add(opt);
    }

    function restoreOption(opt) {
        if (opt.dataset.nsftMshOriginal != null) opt.textContent = opt.dataset.nsftMshOriginal;
        const prevTitle = opt.dataset.nsftMshOrigTitle;
        if (prevTitle) opt.title = prevTitle;
        else opt.removeAttribute('title');
        opt.removeAttribute(OPT_APPLIED_ATTR);
        delete opt.dataset.nsftMshOriginal;
        delete opt.dataset.nsftMshOrigTitle;
        _processed.delete(opt);
    }
})();
