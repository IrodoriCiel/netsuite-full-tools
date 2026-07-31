(function () {
    'use strict';
    const STORAGE_KEY = 'enableDropdownSizeBeta';
    const DEFAULT_PX = 400;

    try {
        if (window.NSFT_RecordButtons && NSFT_RecordButtons.isExcludedPage && NSFT_RecordButtons.isExcludedPage()) return;
    } catch (e) { }

    let bridgeInjected = false;

    chrome.storage.local.get({ [STORAGE_KEY]: true, dropdownSizeBetaPx: DEFAULT_PX }, (items) => {
        if (!items[STORAGE_KEY]) return;
        applySize(items.dropdownSizeBetaPx || DEFAULT_PX);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (!changes[STORAGE_KEY] && !changes.dropdownSizeBetaPx) return;
        chrome.storage.local.get({ [STORAGE_KEY]: true, dropdownSizeBetaPx: DEFAULT_PX }, (it) => {
            if (it[STORAGE_KEY]) applySize(it.dropdownSizeBetaPx || DEFAULT_PX);
            else resetSize();
        });
    });

    function ensureBridge(cb) {
        if (bridgeInjected) { cb(); return; }
        const s = document.createElement('script');
        s.src = chrome.runtime.getURL('scripts/modules/dropdown_size/dropdown_size_fetcher.js');
        s.onload = function () {
            this.remove();
            bridgeInjected = true;
            cb();
        };
        (document.head || document.documentElement).appendChild(s);
    }

    function applySize(px) {
        ensureBridge(() => {
            window.postMessage({ dest: 'fetcher_ds', type: 'set', px: px }, '*');
        });
    }

    function resetSize() {
        if (!bridgeInjected) return;
        window.postMessage({ dest: 'fetcher_ds', type: 'reset' }, '*');
    }
})();
