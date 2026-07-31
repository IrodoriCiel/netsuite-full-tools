(function () {
    'use strict';

    const STORAGE_KEY = 'enableNetSuiteVersionBadgeBeta';
    const LAST_SEEN_KEY = 'nsftLastSeenNsVersion';
    const APPLIED_ATTR = 'data-nsft-nvb-applied';
    const BADGE_CLASS = 'nsft-nvb-badge';
    const HAS_NEW_CLASS = 'nsft-nvb-has-new';
    const DOT_CLASS = 'nsft-nvb-dot';
    const SHORT_VERSION_RE = /(\d+\.\d+)/;

    const RB = window.NSFT_RecordButtons;
    if (RB && RB.isHeaderlessPage && RB.isHeaderlessPage()) return;

    let enabled = false;
    let receivedVersion = '';
    let lastSeenVersion = null;
    let unsubscribeObserver = null;

    chrome.storage.local.get({ [STORAGE_KEY]: false, [LAST_SEEN_KEY]: '' }, (items) => {
        enabled = !!items[STORAGE_KEY];
        lastSeenVersion = items[LAST_SEEN_KEY] || '';
        if (enabled) init();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        enabled = !!changes[STORAGE_KEY].newValue;
        if (enabled) init();
        else teardown();
    });

    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        const d = event.data;
        if (!d || d.dest !== 'extension_nvb' || d.type !== 'version') return;
        receivedVersion = String(d.payload || '').trim();
        if (enabled && receivedVersion) render(receivedVersion);
    });

    function init() {
        injectFetcher();
        if (receivedVersion) render(receivedVersion);
    }

    function teardown() {
        if (unsubscribeObserver) {
            try { unsubscribeObserver(); } catch (e) { }
            unsubscribeObserver = null;
        }
        document.querySelectorAll('.' + BADGE_CLASS).forEach(el => el.remove());
        document.querySelectorAll(`[${APPLIED_ATTR}]`).forEach(el => el.removeAttribute(APPLIED_ATTR));
        const legacyMeta = document.querySelector('meta[name="nsft-ns-version"]');
        if (legacyMeta) legacyMeta.remove();
    }

    function injectFetcher() {
        const s = document.createElement('script');
        s.src = chrome.runtime.getURL('scripts/modules/netsuite_version_badge/netsuite_version_badge_fetcher.js');
        s.dataset.nsftNvbFetcher = 'true';
        s.onload = function () { this.remove(); };
        (document.head || document.documentElement).appendChild(s);
    }

    function render(version) {
        if (!enabled) return;
        const existing = document.querySelector('.' + BADGE_CLASS);
        if (existing) {
            updateBadge(existing, version);
            return;
        }

        if (tryInsertBadge(version)) return;

        if (unsubscribeObserver) return;
        const Observer = window.NSFT_Observer;
        if (!Observer || !Observer.subscribe) return;
        unsubscribeObserver = Observer.subscribe(() => {
            if (!enabled) {
                if (unsubscribeObserver) { unsubscribeObserver(); unsubscribeObserver = null; }
                return;
            }
            if (tryInsertBadge(version)) {
                if (unsubscribeObserver) { unsubscribeObserver(); unsubscribeObserver = null; }
            }
        }, { throttle: 100 });
    }

    function tryInsertBadge(version) {
        if (document.querySelector('.' + BADGE_CLASS)) return true;

        const container = document.querySelector('[data-header-section="logos"]');
        if (!container) return false;

        const DOM = window.NSFT_DOM;
        const opts = { root: container, module: 'netsuite_version_badge', purpose: 'netsuite-logo' };
        const netsuiteLogo = DOM && DOM.q
            ? DOM.q([
                'svg[data-icon="/images/logos/netsuite-oracle.svg"]',
                'svg[data-performance-id="devpgloadtime"]',
                'svg'
            ], opts)
            : (container.querySelector('svg[data-icon="/images/logos/netsuite-oracle.svg"]')
                || container.querySelector('svg[data-performance-id="devpgloadtime"]')
                || container.querySelector('svg'));
        if (!netsuiteLogo || netsuiteLogo.parentNode !== container) return false;

        const badge = document.createElement('span');
        badge.className = BADGE_CLASS;
        badge.setAttribute('role', 'button');
        badge.setAttribute('tabindex', '0');
        badge.addEventListener('click', onBadgeClick);
        container.insertBefore(badge, netsuiteLogo.nextSibling);
        container.setAttribute(APPLIED_ATTR, 'true');
        updateBadge(badge, version);
        return true;
    }

    function updateBadge(badgeEl, version) {
        const short = shortenVersion(version);
        if (badgeEl.firstChild &&
            badgeEl.firstChild.nodeType === Node.TEXT_NODE &&
            badgeEl.firstChild.textContent === short) {
        } else {
            badgeEl.textContent = short;
        }

        const tooltipBase = chrome.i18n.getMessage('nvb_tooltip') || 'NetSuite Version';
        const tooltipHints = chrome.i18n.getMessage('nvb_tooltip_hints')
            || 'Click: copy · Ctrl/Cmd+Click: release notes';
        badgeEl.title = `${tooltipBase}: ${version}\n${tooltipHints}`;
        badgeEl.setAttribute('data-nsft-ns-version', version);

        const hasNew = lastSeenVersion !== null
            && lastSeenVersion !== ''
            && lastSeenVersion !== version;

        const existingDot = badgeEl.querySelector('.' + DOT_CLASS);
        if (hasNew) {
            badgeEl.classList.add(HAS_NEW_CLASS);
            if (!existingDot) {
                const dot = document.createElement('span');
                dot.className = DOT_CLASS;
                dot.setAttribute('aria-label', chrome.i18n.getMessage('nvb_new_version_badge') || 'New version');
                badgeEl.appendChild(dot);
            }
        } else {
            badgeEl.classList.remove(HAS_NEW_CLASS);
            if (existingDot) existingDot.remove();
        }
    }

    function onBadgeClick(event) {
        event.preventDefault();
        event.stopPropagation();
        const target = event.currentTarget;
        const version = target.getAttribute('data-nsft-ns-version') || '';
        if (!version) return;

        if (event.ctrlKey || event.metaKey) {
            const short = shortenVersion(version) || version;
            const q = encodeURIComponent('NetSuite ' + short + ' release notes');
            try {
                window.open('https://www.google.com/search?q=' + q, '_blank', 'noopener,noreferrer');
            } catch (e) { }
        } else {
            const Clipboard = window.NSFT_Clipboard;
            const toastMsg = chrome.i18n.getMessage('nvb_copied', [version])
                || ('Version copied: ' + version);
            if (Clipboard && Clipboard.copy) {
                Clipboard.copy(version, { toast: toastMsg });
            } else {
                try { navigator.clipboard.writeText(version); } catch (e) { }
            }
        }

        dismissNewVersionHighlight(version);
    }

    function dismissNewVersionHighlight(version) {
        if (lastSeenVersion === version) return;
        lastSeenVersion = version;
        try { chrome.storage.local.set({ [LAST_SEEN_KEY]: version }); } catch (e) { }
        document.querySelectorAll('.' + BADGE_CLASS).forEach((el) => {
            el.classList.remove(HAS_NEW_CLASS);
            const dot = el.querySelector('.' + DOT_CLASS);
            if (dot) dot.remove();
        });
    }

    function shortenVersion(v) {
        if (!v) return '';
        const m = v.match(SHORT_VERSION_RE);
        if (m) return m[1];
        return v.length > 12 ? v.slice(0, 8) : v;
    }
})();
