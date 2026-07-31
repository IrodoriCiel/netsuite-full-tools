(function () {
    'use strict';
    const STORAGE_KEY = 'enableLoginSandboxIndicatorBeta';
    const HTML_CLASS = 'nsft-lsi-on';
    const SANDBOX_CLASS = 'nsft-lsi-sandbox';
    const RP_CLASS = 'nsft-lsi-rp';
    const HAS_ENV_CLASS = 'nsft-lsi-has-env';
    const BADGE_ID = 'nsft-lsi-badge';
    const OBSERVE_MAX_MS = 10000;

    let envType = '';
    let sbNum = '';
    let mo = null;
    let moTimer = 0;
    let rafPending = false;
    let _diag = false;
    const _colors = {};

    chrome.storage.local.get({
        [STORAGE_KEY]: true,
        nsftSelectorDiagnostics: false,
        envBadgeColorSb: '#16a34a',
        envBadgeColorRp: '#2563eb'
    }, (items) => {
        _diag = !!items.nsftSelectorDiagnostics;
        _colors.sandbox = items.envBadgeColorSb;
        _colors.rp = items.envBadgeColorRp;
        if (items[STORAGE_KEY]) apply();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.nsftSelectorDiagnostics) _diag = !!changes.nsftSelectorDiagnostics.newValue;
        if (changes[STORAGE_KEY]) {
            if (changes[STORAGE_KEY].newValue) apply();
            else teardown();
        }
    });

    function apply() {
        const root = document.documentElement;
        root.classList.add(HTML_CLASS);

        if (!/^\/app\/login\//.test(location.pathname)) return;

        const host = location.hostname.toLowerCase();
        const sb = host.match(/-sb(\d+)\./i);
        const rp = host.match(/-rp(\d*)\./i);
        if (sb) {
            envType = 'sandbox';
            sbNum = sb[1];
            root.classList.add(SANDBOX_CLASS);
            root.style.setProperty('--nsft-lsi-num', '"' + sbNum + '"');
        } else if (rp) {
            envType = 'rp';
            root.classList.add(RP_CLASS);
        } else {
            return;
        }

        const accent = _colors[envType];
        if (accent) root.style.setProperty('--nsft-lsi-accent', accent);

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', checkAndRender, { once: true });
        } else {
            checkAndRender();
        }

        if (!mo) {
            mo = new MutationObserver(scheduleCheck);
            mo.observe(document.documentElement, { childList: true, subtree: true });
            moTimer = setTimeout(stopObserver, OBSERVE_MAX_MS);
        }
    }

    function scheduleCheck() {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => { rafPending = false; checkAndRender(); });
    }

    function stopObserver() {
        if (mo) { mo.disconnect(); mo = null; }
        if (moTimer) { clearTimeout(moTimer); moTimer = 0; }
    }

    function checkAndRender() {
        const root = document.documentElement;
        const env = document.getElementById('environment');
        if (env) {
            root.classList.add(HAS_ENV_CLASS);
            removeBadge();
            stopObserver();
        } else {
            root.classList.remove(HAS_ENV_CLASS);
            injectBadge();
        }
    }

    function badgeText() {
        if (envType === 'rp') return chrome.i18n.getMessage('lsi_badge_rp') || 'RELEASE PREVIEW';
        return (chrome.i18n.getMessage('lsi_badge_sandbox') || 'SANDBOX') + ' ' + sbNum;
    }

    function injectBadge() {
        if (document.getElementById(BADGE_ID)) return;
        if (!document.body) return;

        const badge = document.createElement('div');
        badge.id = BADGE_ID;
        badge.textContent = badgeText();
        badge.setAttribute('role', 'alert');

        const logos = document.querySelector('.login-page-box .login-page-box-logos');
        const title = document.querySelector('.login-page-box .login-page-box-title');
        const box = document.querySelector('.login-page-box');

        if (box && logos && title && logos.parentNode === box && title.parentNode === box) {
            box.insertBefore(badge, title);
        } else if (box && logos && logos.parentNode === box) {
            if (logos.nextSibling) {
                box.insertBefore(badge, logos.nextSibling);
            } else {
                box.appendChild(badge);
            }
        } else if (box && title) {
            box.insertBefore(badge, title);
        } else {
            if (_diag) console.warn('NSFT login sandbox indicator: sin .login-page-box; badge en fallback fixed.');
            document.body.insertBefore(badge, document.body.firstChild);
        }
    }

    function removeBadge() {
        const b = document.getElementById(BADGE_ID);
        if (b) b.remove();
    }

    function teardown() {
        const root = document.documentElement;
        root.classList.remove(HTML_CLASS, SANDBOX_CLASS, RP_CLASS, HAS_ENV_CLASS);
        root.style.removeProperty('--nsft-lsi-num');
        root.style.removeProperty('--nsft-lsi-accent');
        removeBadge();
        stopObserver();
    }
})();
