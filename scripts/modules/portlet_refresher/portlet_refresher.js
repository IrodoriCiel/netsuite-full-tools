(function () {
    'use strict';

    const STORAGE_KEY = 'enablePortletRefresher';
    const INTERVAL_KEY = 'portletRefresherInterval';
    const DEFAULT_INTERVAL_SECONDS = 600;
    const STAGGER_MS = 150;

    let _timer = null;

    function isApplicablePage() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isExcludedPage && NSFT_RecordButtons.isExcludedPage()) return false;
        } catch (e) { }
        return true;
    }

    chrome.storage.local.get(
        { [STORAGE_KEY]: true, enableDiscreetMode: false, [INTERVAL_KEY]: DEFAULT_INTERVAL_SECONDS },
        (settings) => {
            if (!settings[STORAGE_KEY] || settings.enableDiscreetMode || !isApplicablePage()) return;
            start(toMs(settings[INTERVAL_KEY]));
        }
    );

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[STORAGE_KEY]) {
            if (changes[STORAGE_KEY].newValue && isApplicablePage()) {
                chrome.storage.local.get({ [INTERVAL_KEY]: DEFAULT_INTERVAL_SECONDS }, (s) => start(toMs(s[INTERVAL_KEY])));
            } else {
                stop();
            }
        } else if (changes[INTERVAL_KEY] && _timer) {
            start(toMs(changes[INTERVAL_KEY].newValue));
        }
    });

    window.addEventListener('pagehide', stop);

    function toMs(seconds) {
        const ms = Number(seconds) * 1000;
        return ms > 0 ? ms : DEFAULT_INTERVAL_SECONDS * 1000;
    }

    function start(intervalMs) {
        stop();
        refreshPortlets();
        _timer = setInterval(refreshPortlets, intervalMs);
    }

    function stop() {
        if (_timer) { clearInterval(_timer); _timer = null; }
    }

    function refreshPortlets() {
        let refreshEls = document.querySelectorAll('a[title="Refresh"]');
        if (!refreshEls.length) refreshEls = document.querySelectorAll('[title="Refresh"]');
        refreshEls.forEach((el, i) => {
            setTimeout(() => { try { el.click(); } catch (e) { } }, i * STAGGER_MS);
        });
    }
})();
