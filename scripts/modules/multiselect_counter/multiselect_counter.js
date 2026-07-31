(function () {
    'use strict';
    const STORAGE_KEY = 'enableMultiselectCounterBeta';
    const APPLIED_ATTR = 'data-nsft-msc-applied';
    const COUNTER_CLASS = 'nsft-msc-counter';

    let enabled = false;
    let _inited = false;
    let _unsub = null;
    const _observers = [];
    const _totalCache = new WeakMap();

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
        if (_inited) { runOnce(); return; }
        _inited = true;
        runOnce();
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            _unsub = window.NSFT_Observer.subscribe(runOnce, { throttle: 300 });
        } else {
            const mo = new MutationObserver(runOnce);
            mo.observe(document.body, { childList: true, subtree: true });
            _unsub = () => mo.disconnect();
        }
    }

    function teardown() {
        if (_unsub) { _unsub(); _unsub = null; }
        _inited = false;
        _observers.forEach(mo => mo.disconnect());
        _observers.length = 0;
        document.querySelectorAll(`.${COUNTER_CLASS}`).forEach(el => el.remove());
        document.querySelectorAll(`[${APPLIED_ATTR}]`).forEach(el => el.removeAttribute(APPLIED_ATTR));
    }

    function runOnce() {
        if (!enabled) return;
        document.querySelectorAll('span.uir-multiselect[data-fieldtype="multiselect"]').forEach(hookMultiselect);
    }

    function hookMultiselect(wrapper) {
        if (wrapper.getAttribute(APPLIED_ATTR) === 'true') {
            updateCounter(wrapper);
            return;
        }

        const labelSpan = findLabelSpan(wrapper);
        if (!labelSpan) return;

        if (labelSpan.querySelector(`.${COUNTER_CLASS}`)) {
            wrapper.setAttribute(APPLIED_ATTR, 'true');
            updateCounter(wrapper);
            return;
        }

        const counter = document.createElement('span');
        counter.className = COUNTER_CLASS;
        insertAfterLabelText(labelSpan, counter);

        wrapper.setAttribute(APPLIED_ATTR, 'true');
        updateCounter(wrapper);

        const listbox = wrapper.querySelector('.dropdownDiv');
        if (listbox) {
            const mo = new MutationObserver(() => updateCounter(wrapper));
            mo.observe(listbox, {
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'aria-selected']
            });
            _observers.push(mo);
        }
    }

    function updateCounter(wrapper) {
        const labelSpan = findLabelSpan(wrapper);
        const counter = labelSpan && labelSpan.querySelector(`.${COUNTER_CLASS}`);
        if (!counter) return;

        const total = getTotal(wrapper);
        const selected = getSelectedCount(wrapper);

        if (total === 0) {
            counter.textContent = '';
            counter.classList.remove('has-selection');
            return;
        }

        counter.textContent = `${selected} / ${total}`;
        counter.classList.toggle('has-selection', selected > 0);
    }

    function getTotal(wrapper) {
        const dropdown = wrapper.querySelector('.ns-multi-dropdown[data-options]');
        if (dropdown) {
            const raw = dropdown.getAttribute('data-options') || '[]';
            const cached = _totalCache.get(wrapper);
            if (cached && cached.raw === raw) return cached.total;
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    _totalCache.set(wrapper, { raw, total: parsed.length });
                    return parsed.length;
                }
            } catch (e) { }
        }
        return wrapper.querySelectorAll('.dropdownDiv td.dropdownSelected, .dropdownDiv td.dropdownNotSelected').length;
    }

    function getSelectedCount(wrapper) {
        return wrapper.querySelectorAll('.dropdownDiv td.dropdownSelected').length;
    }

    function findLabelSpan(wrapper) {
        const fieldWrapper = wrapper.closest('.uir-field-wrapper');
        if (!fieldWrapper) return null;
        return fieldWrapper.querySelector('.uir-label-span');
    }

    function insertAfterLabelText(labelSpan, counter) {
        const anchor = labelSpan.querySelector(':scope > a');
        if (anchor && anchor.parentNode === labelSpan) {
            anchor.insertAdjacentElement('afterend', counter);
            return;
        }
        labelSpan.insertBefore(counter, labelSpan.firstChild);
    }
})();
