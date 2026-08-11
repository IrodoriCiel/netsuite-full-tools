(function () {
    'use strict';

    const KEY = 'nsftSuiteQLRestOff';
    const TTL = 24 * 60 * 60 * 1000;

    let cached = null;
    let probing = null;

    function readMap() {
        return new Promise((resolve) => {
            try {
                chrome.storage.local.get([KEY], (it) => resolve((it && it[KEY]) || {}));
            } catch (e) { resolve({}); }
        });
    }

    window.NSFT_SuiteQLRest = {
        isKnownOff: function () {
            if (cached) return cached;
            cached = readMap().then((map) => {
                const at = map[location.hostname];
                return !!at && (Date.now() - at) < TTL;
            });
            return cached;
        },

        markOff: function () {
            cached = Promise.resolve(true);
            readMap().then((map) => {
                map[location.hostname] = Date.now();
                const payload = {}; payload[KEY] = map;
                try { chrome.storage.local.set(payload); } catch (e) { }
            });
        },

        markOn: function () {
            cached = Promise.resolve(false);
            readMap().then((map) => {
                if (!(location.hostname in map)) return;
                delete map[location.hostname];
                const payload = {}; payload[KEY] = map;
                try { chrome.storage.local.set(payload); } catch (e) { }
            });
        },

        probe: function () {
            if (probing) return probing;
            const self = this;
            probing = fetch('/services/rest/query/v1/suiteql?limit=1', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', 'Prefer': 'transient' },
                body: JSON.stringify({ q: 'SELECT 1 AS uno FROM dual' })
            }).then((r) => {
                if (r.ok) { self.markOn(); return true; }
                if (r.status === 403 || r.status === 404) { self.markOff(); return false; }
                return false;
            }).catch(() => false);
            return probing;
        }
    };
})();
