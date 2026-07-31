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
    });

    function capture() {
        try {
            const info = extractAccountInfo();
            if (!info || !info.companyId) return;
            writeCache(info);
        } catch (e) { }
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
})();
