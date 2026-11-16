(function () {
    'use strict';

    function runSql(spec, cb) {
        if (!window.NSFT_SQL) { cb({ code: 'stale' }, null); return; }
        window.NSFT_SQL.run(spec, cb);
    }

    function responde(payload) {
        window.postMessage({ dest: 'extension_rolef', type: 'entityNames', payload: payload }, '*');
    }

    window.addEventListener('message', function (event) {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.dest !== 'fetcher_rolef' || data.type !== 'entityNames') return;

        const p = data.payload || {};
        const ids = (Array.isArray(p.ids) ? p.ids : [])
            .map(String)
            .filter(function (s) { return /^\d+$/.test(s); })
            .slice(0, 200);
        if (!ids.length) { responde({ token: p.token, names: {} }); return; }

        const sql = 'SELECT id, entityid, firstname, lastname FROM employee WHERE id IN (' + ids.join(',') + ')';
        runSql({ rest: sql, sql: sql, params: [], limit: 1000 }, function (err, rows) {
            if (err) { responde({ token: p.token, error: err.code || 'QUERY_ERROR' }); return; }
            const names = {};
            (rows || []).forEach(function (r) {
                if (!r) return;
                const g = function (k) { const v = r[k] != null ? r[k] : r[k.toUpperCase()]; return v == null ? '' : String(v).trim(); };
                const nombre = [g('firstname'), g('lastname')].filter(Boolean).join(' ') || g('entityid');
                if (g('id') && nombre) names[g('id')] = nombre;
            });
            responde({ token: p.token, names: names });
        });
    });

    window.postMessage({ dest: 'extension_rolef', type: 'ready' }, '*');
})();
