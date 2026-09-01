(function () {
    'use strict';

    const STORAGE_KEY = 'enableProductionBanner';
    const COLOR_KEY = 'envBadgeColorPrd';
    const POSITION_KEY = 'productionBannerPosition';
    const BANNER_ID = 'nsft-prod-banner';
    const CHIP_ID = 'nsft-prod-chip';
    const DISMISS_FLAG = 'nsftProdBannerDismissed';
    const ACTIVE_CLASS = 'nsft-prod-banner-active';
    const TOP_CLASS = 'nsft-prod-banner-top';

    let _color = '#dc2626';
    let _position = 'bottom';
    let _unsub = null;

    chrome.storage.local.get({
        [STORAGE_KEY]: false,
        [COLOR_KEY]: '#dc2626',
        [POSITION_KEY]: 'bottom'
    }, (items) => {
        _color = items[COLOR_KEY] || '#dc2626';
        _position = items[POSITION_KEY] || 'bottom';
        if (!items[STORAGE_KEY]) return;
        init();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[COLOR_KEY]) {
            _color = changes[COLOR_KEY].newValue || '#dc2626';
            const bar = document.getElementById(BANNER_ID);
            if (bar) bar.style.background = _color;
            const chip = document.getElementById(CHIP_ID);
            if (chip) chip.style.background = _color;
        }
        if (changes[POSITION_KEY]) {
            _position = changes[POSITION_KEY].newValue || 'bottom';
            try { sessionStorage.removeItem(DISMISS_FLAG); } catch (e) { }
            remove();
            chrome.storage.local.get({ [STORAGE_KEY]: false }, (it) => {
                if (it[STORAGE_KEY]) init();
            });
        }
        if (changes[STORAGE_KEY]) {
            if (changes[STORAGE_KEY].newValue) init();
            else remove();
        }
    });

    function isProduction() {
        const E = window.NSFT_ENV;
        if (E && typeof E.envFromUrl === 'function') {
            const info = E.envFromUrl(location.href);
            if (info && info.code) return info.code === 'PRD';
        }
        const m = location.hostname.match(/^([a-z0-9\-]+)\.app\.netsuite\.com$/i);
        if (!m) return false;
        return m[1].indexOf('-') === -1 && !/^tstdrv\d+$/i.test(m[1]);
    }

    function init() {
        const RB = window.NSFT_RecordButtons;
        if (RB && RB.isHeaderlessPage && RB.isHeaderlessPage()) return;
        if (!isProduction()) return;
        if (_position !== 'header') {
            try { if (sessionStorage.getItem(DISMISS_FLAG) === '1') return; } catch (e) { }
        }
        render();
    }

    function renderHeaderChip() {
        if (document.getElementById(CHIP_ID)) return true;

        const container = document.querySelector('[data-header-section="logos"]');
        if (!container) return false;

        const chip = document.createElement('span');
        chip.id = CHIP_ID;
        chip.className = 'nsft-prod-chip';
        chip.style.background = _color;
        chip.setAttribute('role', 'status');
        chip.textContent = chrome.i18n.getMessage('productionBannerChip') || 'PRODUCTION';
        chip.title = chrome.i18n.getMessage('productionBannerText') || 'PRODUCTION ENVIRONMENT';
        container.appendChild(chip);
        return true;
    }

    function mountHeaderChip() {
        if (renderHeaderChip()) return;

        const OB = window.NSFT_Observer;
        if (!OB || typeof OB.subscribe !== 'function') { renderBar(); return; }
        if (_unsub) return;

        let tries = 0;
        _unsub = OB.subscribe(() => {
            if (renderHeaderChip()) {
                if (_unsub) { _unsub(); _unsub = null; }
                return;
            }
            if (++tries > 40) {
                if (_unsub) { _unsub(); _unsub = null; }
                renderBar();
            }
        }, { throttle: 400 });
    }

    function render() {
        if (_position === 'header') { mountHeaderChip(); return; }
        renderBar();
    }

    function renderBar() {
        if (document.getElementById(CHIP_ID)) return;
        if (document.getElementById(BANNER_ID)) return;

        const bar = document.createElement('div');
        bar.id = BANNER_ID;
        bar.className = 'nsft-prod-banner';
        bar.style.background = _color;
        bar.setAttribute('role', 'alert');

        const label = document.createElement('span');
        label.className = 'nsft-prod-banner-text';
        const msg = chrome.i18n.getMessage('productionBannerText') || 'PRODUCTION ENVIRONMENT';
        label.textContent = '⚠ ' + msg;

        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'nsft-prod-banner-close';
        close.textContent = '×';
        close.setAttribute('aria-label', chrome.i18n.getMessage('productionBannerDismiss') || 'Hide until next reload');
        close.title = close.getAttribute('aria-label');
        close.addEventListener('click', () => {
            try { sessionStorage.setItem(DISMISS_FLAG, '1'); } catch (e) { }
            remove();
        });

        bar.appendChild(label);
        bar.appendChild(close);

        if (_position === 'top') bar.classList.add(TOP_CLASS);

        const mount = () => {
            if (document.getElementById(BANNER_ID)) return;
            (document.body || document.documentElement).appendChild(bar);
            document.documentElement.classList.add(ACTIVE_CLASS);
            document.documentElement.classList.toggle(TOP_CLASS, _position === 'top');
        };
        if (document.body) mount();
        else document.addEventListener('DOMContentLoaded', mount, { once: true });
    }

    function remove() {
        if (_unsub) { try { _unsub(); } catch (e) { } _unsub = null; }
        const bar = document.getElementById(BANNER_ID);
        if (bar) bar.remove();
        const chip = document.getElementById(CHIP_ID);
        if (chip) chip.remove();
        document.documentElement.classList.remove(ACTIVE_CLASS);
        document.documentElement.classList.remove(TOP_CLASS);
    }
})();
