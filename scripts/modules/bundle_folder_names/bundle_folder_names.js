(function () {
    'use strict';
    const STORAGE_KEY = 'enableBundleFolderNamesBeta';
    const CACHE_KEY = 'nsftBundleNameCache';
    const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
    const APPLIED_ATTR = 'data-nsft-bfn-applied';
    const BUNDLE_RE = /^(?:Bundle|Paquete|Pacote|Lote|Pakete|Paquet)\s+(\d+)(?:[\s\-(]|$)/i;
    const PURE_NUM_RE = /^(\d{3,})$/;
    const BRIDGE_URL = '/app/common/scripting/PlatformClientScriptHandler.nl';

    const SUFFIX_CLASS = 'nsft-bfn-suffix';

    let enabled = false;
    let bundleMap = null;
    let fetchAttempted = false;
    let _unsub = null;
    let _applied = new WeakSet();

    function isApplicablePage() {
        try {
            if (window.NSFT_RecordButtons && NSFT_RecordButtons.isExcludedPage && NSFT_RecordButtons.isExcludedPage()) return false;
        } catch (e) { }
        return /mediaitemfolders|media|filecabinet/i.test(location.pathname);
    }

    chrome.storage.local.get({ [STORAGE_KEY]: false }, (items) => {
        enabled = !!items[STORAGE_KEY];
        if (enabled && isApplicablePage()) init();
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes[STORAGE_KEY]) return;
        enabled = !!changes[STORAGE_KEY].newValue;
        if (enabled) {
            if (isApplicablePage()) init();
        } else {
            teardown();
        }
    });

    function teardown() {
        if (_unsub) { _unsub(); _unsub = null; }
        _applied = new WeakSet();
        document.querySelectorAll('.' + SUFFIX_CLASS).forEach(s => s.remove());
        document.querySelectorAll(`[${APPLIED_ATTR}]`).forEach(el => el.removeAttribute(APPLIED_ATTR));
    }

    async function init() {
        await loadBundleCache();
        if (!bundleMap.size && !fetchAttempted) {
            fetchAttempted = true;
            const fresh = await fetchBundlesFromBridge();
            if (Object.keys(fresh).length) {
                saveCache(fresh);
                Object.keys(fresh).forEach(id => bundleMap.set(id, fresh[id]));
            }
        }
        runOnce();
        if (window.NSFT_Observer && typeof window.NSFT_Observer.subscribe === 'function') {
            _unsub = window.NSFT_Observer.subscribe(runOnce, { throttle: 300 });
        } else {
            const mo = new MutationObserver(runOnce);
            mo.observe(document.body, { childList: true, subtree: true });
            _unsub = () => mo.disconnect();
        }
    }

    function loadBundleCache() {
        return new Promise(resolve => {
            chrome.storage.local.get({ [CACHE_KEY]: {} }, (items) => {
                bundleMap = new Map();
                const cache = items[CACHE_KEY] || {};
                const now = Date.now();
                Object.keys(cache).forEach(id => {
                    const entry = cache[id];
                    if (entry && entry.name && entry.at && (now - entry.at) < CACHE_TTL_MS) {
                        bundleMap.set(id, entry.name);
                    }
                });
                resolve();
            });
        });
    }

    function saveCache(fresh) {
        chrome.storage.local.get({ [CACHE_KEY]: {} }, (items) => {
            const cache = items[CACHE_KEY] || {};
            const now = Date.now();
            Object.keys(fresh).forEach(id => {
                cache[id] = { name: fresh[id], at: now };
            });
            chrome.storage.local.set({ [CACHE_KEY]: cache });
        });
    }

    async function fetchBundlesFromBridge() {
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
            const list = Array.isArray(data) ? data
                        : Array.isArray(data && data.result) ? data.result
                        : Array.isArray(data && data.result && data.result.result) ? data.result.result
                        : null;
            if (!Array.isArray(list)) return {};
            const map = {};
            list.forEach(b => {
                if (!b) return;
                const id = String(b.id != null ? b.id : (b.bundleId != null ? b.bundleId : '')).trim();
                const name = String(b.name || b.bundleName || b.displayName || '').trim();
                if (id && name && /^\d+$/.test(id)) map[id] = name;
            });
            return map;
        } catch (e) { return {}; }
    }

    function runOnce() {
        if (!enabled || !bundleMap || bundleMap.size === 0) return;

        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            { acceptNode: (n) => {
                const t = (n.nodeValue || '').trim();
                if (!t) return NodeFilter.FILTER_REJECT;
                if (BUNDLE_RE.test(t)) return NodeFilter.FILTER_ACCEPT;
                if (PURE_NUM_RE.test(t)) {
                    const id = t;
                    if (bundleMap.has(id)) return NodeFilter.FILTER_ACCEPT;
                }
                return NodeFilter.FILTER_REJECT;
            } }
        );

        const pending = [];
        let node;
        while ((node = walker.nextNode())) {
            if (_applied.has(node)) continue;
            const parent = node.parentElement;
            if (!parent) continue;

            const text = (node.nodeValue || '').trim();
            let id = null;
            const m = BUNDLE_RE.exec(text);
            if (m) {
                id = m[1];
            } else if (PURE_NUM_RE.test(text)) {
                id = text;
            }
            if (!id) continue;

            const name = bundleMap.get(id);
            if (!name) continue;
            pending.push({ node, parent, text, name });
        }

        pending.forEach(({ node, parent, text, name }) => {
            _applied.add(node);
            parent.setAttribute(APPLIED_ATTR, 'true');
            const suffix = document.createElement('span');
            suffix.className = SUFFIX_CLASS;
            suffix.textContent = ' (' + name + ')';
            if (node.nextSibling) {
                parent.insertBefore(suffix, node.nextSibling);
            } else {
                parent.appendChild(suffix);
            }
            if (!parent.title) parent.title = text + ' — ' + name;
        });
    }
})();
