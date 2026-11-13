(function () {
    'use strict';

    if (window.__nsftPagePerfFetcher) return;
    window.__nsftPagePerfFetcher = true;

    window.addEventListener('message', function (event) {
        if (event.source !== window) return;
        const d = event.data;
        if (!d || d.dest !== 'fetcher_pp') return;
        if (d.type === 'ns_timing') reply(d, nsTiming());
        else if (d.type === 'scripts') scripts(d);
    });

    function reply(d, payload) {
        window.postMessage({ dest: 'extension_pp', type: d.type, reqId: d.reqId, payload: payload }, '*');
    }

    function nsTiming() {
        try {
            const t = window.performanceResultsAsTable;
            if (!t) return { rows: [] };
            const rows = [];
            Object.keys(t).forEach(function (k) {
                const r = t[k];
                if (!r || typeof r.name !== 'string') return;
                const v = String(r.value == null ? '' : r.value).trim();
                const m = /^(\d+(?:\.\d+)?)(?:\s*\((\d+(?:\.\d+)?)%\))?$/.exec(v);
                if (!m) return;
                rows.push({ name: r.name, seconds: Number(m[1]), pct: m[2] != null ? Number(m[2]) : null });
            });
            return { rows: rows };
        } catch (e) {
            return { rows: [] };
        }
    }

    function sql(spec) {
        return new Promise(function (resolve) {
            const T = window.NSFT_SQL;
            if (!T) { resolve({ error: 'SuiteQL transport unavailable', rows: [] }); return; }
            T.run(spec, function (err, rows) {
                resolve(err ? { error: (err && (err.message || err.code)) || 'query', rows: [] } : { rows: rows || [] });
            });
        });
    }

    function scripts(d) {
        const p = d.payload || {};
        const T = window.NSFT_SQL;
        const tipo = String(p.recordType || '').trim().toUpperCase();
        const ids = (Array.isArray(p.fileIds) ? p.fileIds : []).filter(function (x) { return /^\d+$/.test(String(x)); }).slice(0, 40);
        const lit = T ? T.lit : function (v) { return "'" + String(v).replace(/'/g, "''") + "'"; };

        const cabeza = 'SELECT s.id, s.name, s.scripttype, BUILTIN.DF(s.scripttype) AS tipo, s.apiversion, '
            + 'd.status FROM scriptdeployment d JOIN script s ON s.id = d.script '
            + "WHERE d.isdeployed = 'T' AND s.isinactive = 'F' AND d.recordtype = ";
        const qDesp = tipo && /^[A-Z0-9_]+$/.test(tipo)
            ? sql({ rest: cabeza + lit(tipo) + ' ORDER BY s.scripttype, s.name', sql: cabeza + '? ORDER BY s.scripttype, s.name', params: [tipo], limit: 200 })
            : Promise.resolve({ rows: [] });

        const qWf = sql({
            rest: 'SELECT w.internalid AS id, w.name, BUILTIN.DF(w.recordtype) AS base, BUILTIN.DF(w.recordtypes) AS tipos, '
                + "w.releasestatus, w.initoncreate, w.initonvieworupdate FROM workflow w WHERE w.isinactive = 'F' ORDER BY w.name",
            sql: 'SELECT w.internalid AS id, w.name, BUILTIN.DF(w.recordtype) AS base, BUILTIN.DF(w.recordtypes) AS tipos, '
                + "w.releasestatus, w.initoncreate, w.initonvieworupdate FROM workflow w WHERE w.isinactive = 'F' ORDER BY w.name",
            params: [],
            limit: 500
        });

        const qFiles = ids.length
            ? sql({
                rest: 'SELECT f.id, f.name FROM file f WHERE f.id IN (' + ids.join(',') + ')',
                sql: 'SELECT f.id, f.name FROM file f WHERE f.id IN (' + ids.map(function () { return '?'; }).join(',') + ')',
                params: ids.map(Number),
                limit: 50
            })
            : Promise.resolve({ rows: [] });

        Promise.all([qDesp, qWf, qFiles]).then(function (r) {
            reply(d, { deployments: r[0], workflows: r[1], files: r[2] });
        });
    }
})();
