(function () {
    'use strict';

    const STORAGE_KEY = 'enableLogoutBlocker';
    const STYLE_ID = 'nsft-logout-blocker-style';
    const RW_STYLE_ID = 'nsft-logout-blocker-rw-style';

    let _unsub = null;
    let _isRedwood = false;
    let _inited = false;

    function isApplicablePage() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isHeaderlessPage && NSFT_RecordButtons.isHeaderlessPage()) return false;
        } catch (e) { }
        return true;
    }

    chrome.storage.local.get({ [STORAGE_KEY]: true, enableDiscreetMode: false }, (settings) => {
        if (!settings[STORAGE_KEY] || settings.enableDiscreetMode || !isApplicablePage()) return;
        init();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        if (changes[STORAGE_KEY].newValue) init();
        else teardown();
    });

    function init() {
        if (_inited) return;
        _inited = true;
        _isRedwood = !!(document.body && document.body.dataset.pageTheme === 'redwood');

        ensureBaseStyle();

        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            _unsub = window.NSFT_Observer.subscribe(neutralizeOldUiPopup, { throttle: 500, immediate: true });
        } else {
            const interval = setInterval(neutralizeOldUiPopup, 1000);
            _unsub = () => clearInterval(interval);
        }
    }

    function teardown() {
        _inited = false;
        if (_unsub) { _unsub(); _unsub = null; }
        const base = document.getElementById(STYLE_ID);
        if (base) base.remove();
        const rw = document.getElementById(RW_STYLE_ID);
        if (rw) rw.remove();
    }

    function ensureBaseStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            .n-session-popup__inactive-html-body > :not(.n-session-popup) { filter: blur(0px) !important; }
            .n-session-popup__inactive-html-body > .n-w-window.style-popup { top: 1px !important; }
            .n-session-popup__inactive-html-body > .n-w-window-modal-mask { display: none !important; }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function ensureRedwoodStyle() {
        if (document.getElementById(RW_STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = RW_STYLE_ID;
        style.textContent = `
            #timeoutpopup { transform: translate(-50%, 0) !important; }
            .uir-session-login-content { padding: 10px !important; }
            .uir-session-login-title { margin: 0 !important; }
        `;
        (document.head || document.documentElement).appendChild(style);
    }

    function neutralizeOldUiPopup() {
        const popup = document.getElementById('timeoutpopup');
        if (!popup || popup.style.visibility === 'hidden') return;

        const timeoutblocker = document.getElementById('timeoutblocker');
        const pageContainer = document.getElementById('pageContainer');

        if (timeoutblocker) timeoutblocker.style.display = 'none';
        if (pageContainer) pageContainer.style.filter = 'blur(0px)';
        popup.style.top = '0px';

        if (_isRedwood) ensureRedwoodStyle();
    }
})();
