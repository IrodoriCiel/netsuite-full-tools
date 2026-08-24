(function () {
    'use strict';

    if (window.__nsftGithubBackupFetcher) return;
    window.__nsftGithubBackupFetcher = true;

    var QUERIES = {
        files: 'SELECT f.id AS fileid, f.name AS filename, f.url AS fileurl, f.folder AS folderid, ' +
               'BUILTIN.DF(s.scripttype) AS scripttype ' +
               'FROM file f LEFT JOIN script s ON s.scriptfile = f.id ' +
               "WHERE f.url IS NOT NULL AND LOWER(f.name) LIKE '%.js' ORDER BY f.name",
        folders: 'SELECT id, name, parent FROM mediaitemfolder'
    };

    window.addEventListener('message', function (event) {
        if (event.source !== window) return;
        var data = event.data;
        if (!data || data.dest !== 'fetcher_ghb' || data.type !== 'query') return;
        var payload = data.payload || {};
        var reqId = payload.reqId;
        var sql = QUERIES[payload.which];
        if (!sql) { reply('error', { reqId: reqId, message: 'Unknown query' }); return; }
        var T = window.NSFT_SQL;
        if (!T) { reply('error', { reqId: reqId, message: 'SuiteQL transport unavailable' }); return; }
        T.run({ rest: sql, sql: sql, limit: 1000 }, function (err, rows) {
            if (err) { reply('error', { reqId: reqId, message: err.message || err.code || 'query' }); return; }
            reply('rows', { reqId: reqId, rows: rows || [] });
        });
    });

    function reply(type, payload) {
        window.postMessage({ dest: 'extension_ghb', type: type, payload: payload }, '*');
    }
})();
