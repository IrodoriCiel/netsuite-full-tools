(function () {
    'use strict';

    const STORAGE_KEY = 'enableHideGuidedLearning';
    const STYLE_ID = 'nsft-hide-ogl-style';
    const HIDE_CSS = '.ogl-rw-convergence-launcher { display: none !important; visibility: hidden !important; }';

    chrome.storage.local.get({ [STORAGE_KEY]: true }, (settings) => {
        apply(!!settings[STORAGE_KEY]);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        apply(!!changes[STORAGE_KEY].newValue);
    });

    function apply(enabled) {
        if (enabled) injectHideStyle();
        else removeHideStyle();
    }

    function injectHideStyle() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = HIDE_CSS;
        (document.head || document.documentElement).appendChild(style);
    }

    function removeHideStyle() {
        const el = document.getElementById(STYLE_ID);
        if (el) el.remove();
    }
})();
