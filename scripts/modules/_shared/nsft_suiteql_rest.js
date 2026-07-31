(function () {
    'use strict';

    const KEY = 'nsftSuiteQLRestOff';
    const TTL = 7 * 24 * 60 * 60 * 1000;

    let cached = null;

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
        }
    };
})();
