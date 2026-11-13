(function () {
    'use strict';
    if (window.__nsftRecordHistoryFetcher) return;
    window.__nsftRecordHistoryFetcher = true;

    var MAX = 1000;

    window.addEventListener('message', function (event) {
        if (event.source !== window) return;
        var d = event.data;
        if (!d || d.dest !== 'fetcher_rhist') return;
        if (d.type === 'notes') notas(d);
        else if (d.type === 'ctx') ctx(d);
    });

    function reply(d, payload) {
        window.postMessage({ dest: 'extension_rhist', type: d.type, reqId: d.reqId, payload: payload }, '*');
    }

    function ctx(d) {
        var t = '';
        try { if (typeof window.nlapiGetRecordType === 'function') t = String(window.nlapiGetRecordType() || ''); } catch (e) { t = ''; }
        reply(d, { recordType: t.toLowerCase() });
    }

    function conTransporte(fn) {
        var n = 0;
        (function mira() {
            if (window.NSFT_SQL || n >= 30) { fn(window.NSFT_SQL || null); return; }
            n++;
            setTimeout(mira, 100);
        })();
    }

    function notas(d) {
        var p = d.payload || {};
        var recId = parseInt(p.recId, 10);
        var tipo = (p.tipoId === null || p.tipoId === undefined) ? null : parseInt(p.tipoId, 10);
        if (!recId || recId <= 0 || (tipo !== null && isNaN(tipo))) { reply(d, { error: 'bad' }); return; }

        var cols = 'SELECT TO_CHAR(sn.date, \'YYYY-MM-DD HH24:MI:SS\') AS cuando,'
            + ' BUILTIN.DF(sn.name) AS usuario, BUILTIN.DF(sn.role) AS rol, sn.context, sn.type, sn.field,'
            + ' BUILTIN.DF(sn.field) AS campo, sn.oldvalue, sn.newvalue, sn.lineid, sn.recordtypeid'
            + ' FROM systemnote sn WHERE sn.recordid = ';
        var orden = ' ORDER BY sn.date DESC, sn.id DESC';

        conTransporte(function (T) {
            if (!T) { reply(d, { error: 'notransport' }); return; }
            var params = [recId];
            var sql = cols + '?';
            var rest = cols + recId;
            if (tipo !== null) {
                sql += ' AND sn.recordtypeid = ?';
                rest += ' AND sn.recordtypeid = ' + tipo;
                params.push(tipo);
            }
            try {
                T.run({
                    rest: rest + orden,
                    sql: 'SELECT * FROM (' + sql + orden + ') WHERE ROWNUM <= ' + MAX,
                    params: params,
                    limit: MAX
                }, function (err, rows) {
                    if (err) { reply(d, { error: String((err && (err.message || err.code)) || 'query') }); return; }
                    reply(d, { rows: rows || [] });
                });
            } catch (e) {
                reply(d, { error: String(e && e.message || e) });
            }
        });
    }
})();
