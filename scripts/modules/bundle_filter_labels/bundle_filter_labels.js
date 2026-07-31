(function () {
    'use strict';
    const STORAGE_KEY = 'enableBundleFilterLabelsBeta';
    const CACHE_KEY = 'nsftBundleNameCache_' + ((location.hostname.split('.')[0]) || 'default');
    const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
    const INJECTED_ATTR = 'data-nsft-bfl-applied';
    const BRIDGE_URL = '/app/common/scripting/PlatformClientScriptHandler.nl';

    let enabled = false;
    let _diag = false;

    chrome.storage.local.get({ [STORAGE_KEY]: true, nsftSelectorDiagnostics: false }, (items) => {
        enabled = !!items[STORAGE_KEY];
        _diag = !!items.nsftSelectorDiagnostics;
        if (enabled) init();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.nsftSelectorDiagnostics) _diag = !!changes.nsftSelectorDiagnostics.newValue;
        if (!changes[STORAGE_KEY]) return;
        enabled = !!changes[STORAGE_KEY].newValue;
        if (enabled) {
            init();
        } else {
            document.querySelectorAll(`[${INJECTED_ATTR}]`).forEach(el => el.removeAttribute(INJECTED_ATTR));
        }
    });

    function logDiag(where, e) { if (_diag) console.warn('NSFT bundle filter labels (' + where + '):', e); }

    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', tryApply, { once: true });
        } else {
            tryApply();
        }
    }

    async function tryApply() {
        if (!enabled) return;
        const input = (window.NSFT_DOM && NSFT_DOM.q)
            ? NSFT_DOM.q(['input[name="inpt_bundlefilter"]'], { module: 'bundle_filter_labels', purpose: 'bundle filter input' })
            : document.querySelector('input[name="inpt_bundlefilter"]');
        if (!input) return;
        if (input.getAttribute(INJECTED_ATTR) === 'true') return;
        input.setAttribute(INJECTED_ATTR, 'true');

        try {
            const pageIds = readPageBundleIds();
            if (!pageIds.length) return;

            let bundles = await readCache(pageIds);
            const missing = pageIds.filter(id => !bundles[id]);

            if (missing.length) {
                const fetched = await fetchInstalledBundles();
                Object.assign(bundles, pickIds(fetched, pageIds));
                writeCache(bundles);
            }

            if (!Object.keys(bundles).length) return;
            injectEnrichment(bundles);
        } catch (e) { logDiag('apply', e); }
    }

    function readPageBundleIds() {
        const ndd = document.querySelector('.ns-dropdown[data-name="bundlefilter"]');
        if (!ndd) return [];
        try {
            const opts = JSON.parse(ndd.getAttribute('data-options') || '[]');
            return opts
                .filter(o => String(o.value || '').startsWith('BUNDLE_'))
                .map(o => String(o.text || '').trim())
                .filter(id => /^\d+$/.test(id));
        } catch (e) { return []; }
    }

    async function readCache(ids) {
        return new Promise(resolve => {
            chrome.storage.local.get({ [CACHE_KEY]: {} }, (items) => {
                const cache = items[CACHE_KEY] || {};
                const now = Date.now();
                const valid = {};
                ids.forEach(id => {
                    const entry = cache[id];
                    if (entry && entry.name && entry.at && (now - entry.at) < CACHE_TTL_MS) {
                        valid[id] = entry.name;
                    }
                });
                resolve(valid);
            });
        });
    }

    function writeCache(bundles) {
        chrome.storage.local.get({ [CACHE_KEY]: {} }, (items) => {
            const cache = items[CACHE_KEY] || {};
            const now = Date.now();
            Object.keys(bundles).forEach(id => {
                cache[id] = { name: bundles[id], at: now };
            });
            chrome.storage.local.set({ [CACHE_KEY]: cache });
        });
    }

    function pickIds(map, ids) {
        const out = {};
        ids.forEach(id => { if (map[id]) out[id] = map[id]; });
        return out;
    }

    async function fetchInstalledBundles() {
        try {
            const body = {
                method: 'remoteObject.bridgeCall',
                params: ['suiteAppInfoBridge', 'listInstalledBundles', '[null]']
            };
            const res = await fetch(BRIDGE_URL, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'accept': '*/*',
                    'content-type': 'application/json',
                    'nsxmlhttprequest': 'NSXMLHttpRequest',
                    'cache-control': 'no-cache',
                    'pragma': 'no-cache'
                },
                body: JSON.stringify(body)
            });
            if (!res.ok) return {};

            const data = await res.json();
            if (data && data.result === 'error') return {};

            const list = extractList(data);
            if (!Array.isArray(list)) return {};

            const map = {};
            list.forEach(b => {
                if (!b) return;
                const id = String(b.id ?? b.bundleId ?? '').trim();
                const name = String(b.name ?? b.bundleName ?? b.displayName ?? '').trim();
                if (id && name && /^\d+$/.test(id)) map[id] = name;
            });
            return map;
        } catch (e) { logDiag('fetch', e); return {}; }
    }

    function extractList(data) {
        if (!data) return null;
        if (Array.isArray(data)) return data;
        if (Array.isArray(data.result)) return data.result;
        if (data.result && Array.isArray(data.result.result)) return data.result.result;
        if (data.result && data.result.result && Array.isArray(data.result.result.result)) return data.result.result.result;
        return null;
    }

    function injectEnrichment(bundles) {
        const s = document.createElement('script');
        s.src = chrome.runtime.getURL('scripts/modules/bundle_filter_labels/bundle_filter_labels_fetcher.js');
        s.dataset.bundles = JSON.stringify(bundles);
        s.onload = function () { this.remove(); };
        (document.head || document.documentElement).appendChild(s);
    }
})();
