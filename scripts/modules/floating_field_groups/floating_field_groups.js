(function () {
    'use strict';
    const STORAGE_KEY = 'enableFloatingFieldGroupsBeta';
    const HTML_CLASS = 'nsft-ffg-on';

    const SUPPORTS_HAS = (() => {
        try { return !!(window.CSS && CSS.supports && CSS.supports('selector(:has(*))')); }
        catch (e) { return false; }
    })();

    function isApplicablePage() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isExcludedPage && NSFT_RecordButtons.isExcludedPage()) return false;
        } catch (e) { }
        return /\.nl$/.test(window.location.pathname);
    }

    if (!SUPPORTS_HAS || !isApplicablePage()) return;

    chrome.storage.local.get({ [STORAGE_KEY]: true }, (items) => {
        apply(items[STORAGE_KEY]);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[STORAGE_KEY]) { apply(changes[STORAGE_KEY].newValue); return; }
        const repintan = changes.nsftTheme || changes.enableColorThemes ||
            changes.colorThemeHue || changes.colorThemeSat || changes.colorThemeLig;
        if (repintan && document.documentElement.classList.contains(HTML_CLASS)) publishBackdrop();
    });

    const BG_VAR = '--nsft-ffg-bg';

    function firstOpaqueBackground(el) {
        if (window.NSFT_DOM && NSFT_DOM.firstOpaqueBackground) return NSFT_DOM.firstOpaqueBackground(el);
        for (let node = el; node; node = node.parentElement) {
            const bg = getComputedStyle(node).backgroundColor;
            if (bg && bg !== 'transparent' && !/^rgba\(\s*\d+,\s*\d+,\s*\d+,\s*(?:0|0?\.0+)\s*\)$/.test(bg)) return bg;
        }
        return '';
    }

    const REDWOOD_SURFACE = 'rgb(251, 249, 248)';

    function isRedwoodPage() {
        return !!document.querySelector('.ns-child-component');
    }

    let _bgUnsub = null;

    function publishBackdrop() {
        const title = document.querySelector('.fgroup_title, [data-nsps-type="fieldgroup"], .uir-field-arrangement--title-bar');
        if (!title) return false;
        const bg = isRedwoodPage() ? REDWOOD_SURFACE : firstOpaqueBackground(title.parentElement || title);
        if (!bg) return false;
        document.documentElement.style.setProperty(BG_VAR, bg);
        return true;
    }

    function ensureBackdrop() {
        if (publishBackdrop()) return;
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', ensureBackdrop, { once: true });
            return;
        }
        if (window.NSFT_Observer && !_bgUnsub) {
            let intentos = 0;
            _bgUnsub = NSFT_Observer.subscribe(() => {
                if (publishBackdrop() || ++intentos > 40) releaseBackdropWatch();
            }, { throttle: 300 });
        }
    }

    function releaseBackdropWatch() {
        if (_bgUnsub) { _bgUnsub(); _bgUnsub = null; }
    }

    function apply(enabled) {
        document.documentElement.classList.toggle(HTML_CLASS, !!enabled);
        if (enabled) {
            ensureBackdrop();
        } else {
            releaseBackdropWatch();
            document.documentElement.style.removeProperty(BG_VAR);
        }
    }
})();
