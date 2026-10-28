(function () {
    'use strict';
    const STORAGE_KEY = 'enableLoginCompanyBrandingBeta';
    const CACHE_KEY = 'nsftAccountInfoCache';
    const HTML_CLASS = 'nsft-lcb-on';
    const LOGO_ID = 'companyLogo';
    const NAME_ID = 'companyName';
    const LAST_VISIT_ID = 'nsft-lcb-lastvisit';
    const FILTER_ID = 'nsft-lcb-logo-white';
    const TTL_MS = 30 * 24 * 60 * 60 * 1000;

    let _cache = {};

    chrome.storage.local.get({ [STORAGE_KEY]: true, [CACHE_KEY]: {} }, (items) => {
        _cache = items[CACHE_KEY] || {};
        apply(items[STORAGE_KEY]);
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[CACHE_KEY]) _cache = changes[CACHE_KEY].newValue || {};
        if (changes[STORAGE_KEY]) apply(changes[STORAGE_KEY].newValue);
    });

    function apply(enabled) {
        document.documentElement.classList.toggle(HTML_CLASS, !!enabled);
        if (!enabled) { removeAll(); return; }
        if (!/^\/app\/login\//.test(location.pathname) && !/^\/pages\/customerlogin\.jsp/.test(location.pathname)) return;

        const companyId = getCompanyIdFromUrl();
        if (!companyId) return;

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => injectFromCache(companyId), { once: true });
        } else {
            injectFromCache(companyId);
        }
    }

    function removeAll() {
        [LOGO_ID, NAME_ID, LAST_VISIT_ID].forEach((id) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (window.NSFT_LoginIdentity) window.NSFT_LoginIdentity.remove(el);
            else el.remove();
        });
    }

    function getCompanyIdFromUrl() {
        try {
            const host = location.hostname.toLowerCase();
            const m = host.match(/^([a-z0-9-]+)\.(?:app|system|extforms)\.netsuite\.com$/);
            if (m && m[1] && /\d/.test(m[1])) {
                let sub = m[1];
                const dash = sub.lastIndexOf('-');
                if (dash !== -1) {
                    sub = sub.substring(0, dash) + '_' + sub.substring(dash + 1).toUpperCase();
                }
                return sub;
            }
        } catch (e) { }

        try {
            const q = new URLSearchParams(location.search);
            const c = q.get('c') || q.get('companyid') || q.get('company') || q.get('account');
            return c ? String(c).trim() : '';
        } catch (e) { return ''; }
    }

    function injectFromCache(companyId) {
        const info = _cache[companyId];
        if (!info) return;
        if (info.at && (Date.now() - info.at) > TTL_MS) return;
        inject(info);
    }

    function inject(info) {
        const logos = document.querySelector('.login-page-box-logos');
        if (!logos) return;

        if (info.logoUrl && !document.getElementById(LOGO_ID)) {
            const test = new Image();
            test.onload = () => {
                if (document.getElementById(LOGO_ID)) return;
                if (!document.documentElement.classList.contains(HTML_CLASS)) return;
                const img = document.createElement('img');
                img.id = LOGO_ID;
                img.src = info.logoUrl;
                img.alt = info.companyName || 'Company logo';
                img.className = 'uir-logo';
                img.loading = 'lazy';
                ensureWhiteFilter();
                place('logo', img, logos);
            };
            test.onerror = () => { };
            test.src = info.logoUrl;
        }

        if (info.companyName && !document.getElementById(NAME_ID)) {
            const name = document.createElement('div');
            name.id = NAME_ID;
            name.textContent = info.companyName;
            place('name', name, logos);
        }

        injectLastVisit(logos, info);

    }

    function place(slot, el, logos) {
        if (window.NSFT_LoginIdentity && window.NSFT_LoginIdentity.put(slot, el)) return;
        if (slot === 'logo') {
            const link = logos.querySelector('.login-page-box-logo-link');
            if (link) link.insertAdjacentElement('afterend', el);
            else logos.insertBefore(el, logos.firstChild);
        } else {
            logos.appendChild(el);
        }
    }

    function ensureWhiteFilter() {
        if (document.getElementById(FILTER_ID)) return;
        const NS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('width', '0');
        svg.setAttribute('height', '0');
        svg.setAttribute('aria-hidden', 'true');
        svg.style.position = 'absolute';
        const filter = document.createElementNS(NS, 'filter');
        filter.id = FILTER_ID;
        filter.setAttribute('x', '0');
        filter.setAttribute('y', '0');
        filter.setAttribute('width', '1');
        filter.setAttribute('height', '1');
        filter.setAttribute('color-interpolation-filters', 'sRGB');
        const matrix = document.createElementNS(NS, 'feColorMatrix');
        matrix.setAttribute('type', 'matrix');
        matrix.setAttribute('values', '0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -1.2 -1.2 -1.2 3.3 0');
        filter.appendChild(matrix);
        svg.appendChild(filter);
        document.body.appendChild(svg);
    }

    function injectLastVisit(logos, info) {
        if (!info.at || document.getElementById(LAST_VISIT_ID)) return;
        const days = Math.floor((Date.now() - info.at) / 86400000);
        let rel;
        try {
            const rtf = new Intl.RelativeTimeFormat(chrome.i18n.getUILanguage(), { numeric: 'auto' });
            rel = rtf.format(days >= 1 ? -days : 0, 'day');
        } catch (e) { rel = days >= 1 ? `${days}d` : ''; }
        const label = chrome.i18n.getMessage('lcb_last_visit_label') || 'Last connection:';
        const el = document.createElement('div');
        el.id = LAST_VISIT_ID;
        el.className = 'nsft-lcb-lastvisit';
        const dot = document.createElement('span');
        dot.className = 'nsft-lcb-dot';
        dot.setAttribute('aria-hidden', 'true');
        const text = document.createElement('span');
        text.textContent = `${label} ${rel}`.trim();
        el.appendChild(dot);
        el.appendChild(text);
        place('last', el, logos);
    }
})();
