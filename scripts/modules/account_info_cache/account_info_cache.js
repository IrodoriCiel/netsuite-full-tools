(function () {
    'use strict';
    const STORAGE_KEY = 'enableLoginCompanyBrandingBeta';
    const CACHE_KEY = 'nsftAccountInfoCache';

    chrome.storage.local.get({ [STORAGE_KEY]: false }, (items) => {
        if (!items[STORAGE_KEY]) return;
        if (document.readyState === 'complete') {
            capture();
        } else {
            window.addEventListener('load', capture, { once: true });
        }
        if (window.NSFT_Observer && window.NSFT_Observer.subscribe) {
            window.NSFT_Observer.subscribe(harvestSwitcher, { throttle: 600 });
        }
        sanearCache();
    });

    function capture() {
        try {
            const info = extractAccountInfo();
            if (!info || !info.companyId) return;
            writeCache(info);
        } catch (e) { }
        harvestSwitcher();
    }

    const harvested = new Set();

    function sinId(nombre, companyId) {
        if (!nombre || !companyId) return nombre || '';
        const esc = companyId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[-_]/g, '[-_]');
        const re = new RegExp(esc + '(?:[-_](?:sb\\d*|rp|td))?', 'gi');
        return nombre.replace(re, ' ').replace(/\s+/g, ' ').trim();
    }

    function harvestSwitcher() {
        let nuevos = [];
        try {
            document.querySelectorAll('a[href*="changeaccount.nl"]').forEach((a) => {
                const m = /[?&]company=([A-Za-z0-9_-]+)/.exec(a.getAttribute('href') || '');
                if (!m) return;
                const companyId = m[1];
                const t = a.querySelector('[data-widget="Text"]');
                const crudo = String((t || a).textContent || '').replace(/\s+/g, ' ').trim();
                const companyName = sinId(crudo, companyId);
                const sig = companyId + '|' + companyName;
                if (harvested.has(sig)) return;
                harvested.add(sig);
                nuevos.push({ companyId: companyId, companyName: companyName });
            });
        } catch (e) { nuevos = []; }
        if (nuevos.length) writeCacheMany(nuevos);
    }

    function sanearCache() {
        chrome.storage.local.get({ [CACHE_KEY]: {} }, (items) => {
            const cache = items[CACHE_KEY] || {};
            let cambio = false;
            Object.keys(cache).forEach((companyId) => {
                const e = cache[companyId];
                if (!e || !e.companyName) return;
                const limpio = sinId(e.companyName, companyId);
                if (limpio !== e.companyName) {
                    e.companyName = limpio;
                    cambio = true;
                }
            });
            if (cambio) chrome.storage.local.set({ [CACHE_KEY]: cache });
        });
    }

    function extractAccountInfo() {
        const sessScript = document.querySelector('script[src*="session_status_init.jsp"]');
        if (!sessScript) return null;
        const src = sessScript.getAttribute('src') || '';
        let companyId = '';
        let companyName = '';
        try {
            const u = new URL(src, location.origin);
            companyId = u.searchParams.get('companyId') || u.searchParams.get('companyid') || '';
            companyName = u.searchParams.get('companyName') || u.searchParams.get('companyname') || '';
        } catch (e) { }

        if (!companyId) return null;

        const logoUrl = findLogoUrl();

        return {
            companyId: companyId,
            companyName: decodeName(companyName),
            logoUrl: logoUrl || null
        };
    }

    function findLogoUrl() {
        const candidates = [
            '[data-header-section="logos"] img[src*="/core/media/media.nl"]',
            '[data-header-section="logos"] img[src^="/core/"]',
            '#header img[src*="/core/media/media.nl"]',
            'img[src*="/core/media/media.nl"][id*="logo" i]',
            'img[src*="/core/media/media.nl"]'
        ];
        for (const sel of candidates) {
            const img = document.querySelector(sel);
            if (img && img.getAttribute('src')) {
                return img.getAttribute('src');
            }
        }
        return null;
    }

    function decodeName(s) {
        try { return decodeURIComponent(String(s || '').replace(/\+/g, ' ')).trim(); }
        catch (e) { return String(s || '').trim(); }
    }

    function writeCache(info) {
        chrome.storage.local.get({ [CACHE_KEY]: {} }, (items) => {
            const cache = items[CACHE_KEY] || {};
            const prev = cache[info.companyId] || {};
            const next = {
                companyId: info.companyId,
                companyName: info.companyName || prev.companyName || '',
                logoUrl: info.logoUrl || prev.logoUrl || '',
                at: Date.now()
            };
            if (!next.companyName && !next.logoUrl) return;
            cache[info.companyId] = next;
            chrome.storage.local.set({ [CACHE_KEY]: cache });
        });
    }

    function writeCacheMany(lista) {
        chrome.storage.local.get({ [CACHE_KEY]: {} }, (items) => {
            const cache = items[CACHE_KEY] || {};
            let cambio = false;
            lista.forEach((info) => {
                const prev = cache[info.companyId] || {};
                const nombre = info.companyName || prev.companyName || '';
                if (!nombre) return;
                if (prev.companyName === nombre) return;
                cache[info.companyId] = {
                    companyId: info.companyId,
                    companyName: nombre,
                    logoUrl: prev.logoUrl || '',
                    at: Date.now()
                };
                cambio = true;
            });
            if (cambio) chrome.storage.local.set({ [CACHE_KEY]: cache });
        });
    }
})();
