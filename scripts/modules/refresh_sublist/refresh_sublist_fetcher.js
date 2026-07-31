(function () {
    'use strict';

    const PAGE_DEST = 'fetcher_refreshsublist';
    const REPLY_DEST = 'extension_refreshsublist';
    const STUB_TTL = 5000;

    window.addEventListener('message', function (event) {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.dest !== PAGE_DEST) return;
        const reqId = data.reqId;
        const machine = String((data.payload && data.payload.machine) || '').replace(/[^A-Za-z0-9_]/g, '');
        doRefresh(machine, reqId);
    });

    function doRefresh(machine, reqId) {
        if (!machine) {
            reply('error', reqId, 'Empty machine');
            return;
        }
        if (typeof refreshmachine !== 'function') {
            reply('error', reqId, "'refreshmachine' is not defined — open NSFT on a NetSuite record page.");
            return;
        }

        const key = machine + '_machine';
        let stubMachine = null;
        let stubShowTab = null;
        if (window[key] == null) {
            stubMachine = { updateContent() {} };
            window[key] = stubMachine;
        }
        if (window.ShowTab == null) {
            stubShowTab = function () {};
            window.ShowTab = stubShowTab;
        }

        try {
            refreshmachine(machine);
            reply('done', reqId);
        } catch (err) {
            reply('error', reqId, (err && err.message) || String(err));
        } finally {
            setTimeout(function () {
                if (stubMachine && window[key] === stubMachine) window[key] = undefined;
                if (stubShowTab && window.ShowTab === stubShowTab) window.ShowTab = undefined;
            }, STUB_TTL);
        }
    }

    function reply(type, reqId, error) {
        window.postMessage({ dest: REPLY_DEST, type, reqId, error }, '*');
    }
})();
