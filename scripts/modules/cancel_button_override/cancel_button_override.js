(function () {
    'use strict';

    const STORAGE_KEY = 'enableCancelOverride';

    const RB = window.NSFT_RecordButtons;
    if (!RB || RB.isExcludedPage() || !RB.isEditMode()) return;

    const CANCEL_SELECTOR = '#_cancel, [name="_cancel"], #secondary_cancel, [name="secondary_cancel"]';

    let active = false;

    chrome.storage.local.get({ [STORAGE_KEY]: true }, (setting) => {
        if (setting[STORAGE_KEY]) enable();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        if (changes[STORAGE_KEY].newValue === false) disable();
        else if (changes[STORAGE_KEY].newValue === true) enable();
    });

    function enable() {
        if (active) return;
        document.addEventListener('click', onCancelCapture, true);
        active = true;
    }

    function disable() {
        if (!active) return;
        document.removeEventListener('click', onCancelCapture, true);
        active = false;
    }

    function onCancelCapture(e) {
        const target = e.target;
        if (!target || typeof target.closest !== 'function') return;

        const btn = target.closest('input, button, a');
        if (!btn || !btn.matches(CANCEL_SELECTOR)) return;
        if (!RB.isEditMode()) return;

        e.preventDefault();
        e.stopImmediatePropagation();

        const url = new URL(window.location.href);
        url.searchParams.delete('e');
        url.searchParams.delete('whence');
        window.location.href = url.toString();
    }
})();
