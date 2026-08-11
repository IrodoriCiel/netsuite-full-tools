(function () {
    'use strict';

    if (window.NSFT_PanelClient) return;

    function stamp(theme) {
        document.documentElement.setAttribute('data-nsft-theme', theme === 'dark' ? 'dark' : 'light');
    }
    chrome.storage.local.get({ nsftTheme: 'light' }, (items) => stamp(items.nsftTheme));
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes.nsftTheme) return;
        stamp(changes.nsftTheme.newValue);
    });

    chrome.runtime.onMessage.addListener((m) => {
        if (!m || m.nsftBridge !== 'envelope' || !m.data) return;
        window.postMessage(m.data, '*');
    });

    function activeTab() {
        return new Promise((resolve) => {
            chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
                const tab = tabs && tabs[0];
                const esNs = tab && tab.url && /^https:\/\/[^/]*\.app\.netsuite\.com\//.test(tab.url);
                resolve(esNs && tab.id != null ? tab : null);
            });
        });
    }

    function toBridge(payload) {
        return activeTab().then((tab) => new Promise((resolve, reject) => {
            if (!tab) { reject(new Error('no_netsuite_tab')); return; }
            chrome.tabs.sendMessage(tab.id, payload, (resp) => {
                if (chrome.runtime.lastError) { reject(new Error('no_netsuite_tab')); return; }
                resolve(resp);
            });
        }));
    }

    window.NSFT_PanelClient = {
        pageInfo() {
            return toBridge({ nsftBridge: 'pageInfo' }).then((r) => (r && r.ok) ? r : null).catch(() => null);
        },

        post(msg, opts) {
            const o = opts || {};
            return toBridge({ nsftBridge: 'post', msg: msg || null, inject: o.inject || null, relay: o.relay || [] })
                .then(() => true)
                .catch(() => false);
        },

        dispatch(eventName) {
            return toBridge({ nsftBridge: 'dispatch', event: String(eventName || '') })
                .then((r) => !!(r && r.ok))
                .catch(() => false);
        },

        fetch(url, init) {
            const i = init || {};
            return toBridge({
                nsftBridge: 'fetch',
                url: String(url),
                init: { method: i.method || 'GET', headers: i.headers || null, body: i.body != null ? i.body : null }
            }).then((r) => {
                if (!r) throw new Error('no_netsuite_tab');
                return {
                    ok: !!r.ok,
                    status: r.status || 0,
                    statusText: '',
                    text: () => Promise.resolve(r.text || ''),
                    json: () => Promise.resolve().then(() => JSON.parse(r.text || 'null'))
                };
            });
        }
    };
})();
