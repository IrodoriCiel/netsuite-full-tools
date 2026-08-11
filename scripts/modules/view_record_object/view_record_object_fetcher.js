'use strict';

(function () {
    if (window.__nsftRoFetcher) return;
    window.__nsftRoFetcher = true;

    var handled = {};

    function reply(payload) {
        window.postMessage({ dest: 'extension_ro', type: 'sqlrow', payload: payload }, '*');
    }

    window.addEventListener('message', function (event) {
        if (event.source !== window) return;
        var d = event.data;
        if (!d || d.dest !== 'fetcher_ro' || d.type !== 'sqlrow') return;
        var p = d.payload || {};
        if (!p.reqId || handled[p.reqId]) return;
        handled[p.reqId] = true;

        var table = String(p.table || '').toLowerCase();
        var id = parseInt(p.id, 10);
        if (!/^[a-z][a-z0-9_]*$/.test(table) || !id || id <= 0) {
            reply({ reqId: p.reqId, row: null });
            return;
        }
        if (typeof require !== 'function') {
            reply({ reqId: p.reqId, row: null });
            return;
        }

        var done = function (rows) {
            reply({ reqId: p.reqId, row: (rows && rows.length) ? rows[0] : null });
        };
        var fail = function () { reply({ reqId: p.reqId, row: null }); };

        require(['N/query'], function (query) {
            var cfg = { query: 'SELECT * FROM ' + table + ' WHERE id = ?', params: [id] };
            try {
                if (query.runSuiteQL && typeof query.runSuiteQL.promise === 'function') {
                    query.runSuiteQL.promise(cfg).then(function (rs) {
                        if (rs.asMappedResults && typeof rs.asMappedResults.promise === 'function') {
                            return rs.asMappedResults.promise();
                        }
                        return rs.asMappedResults();
                    }).then(done).catch(fail);
                } else {
                    done(query.runSuiteQL(cfg).asMappedResults());
                }
            } catch (e) { fail(); }
        }, fail);
    });
})();
