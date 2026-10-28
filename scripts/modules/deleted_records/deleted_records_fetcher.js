'use strict';

(function () {
    if (window.__nsftDelRec) return;
    window.__nsftDelRec = true;

    var FETCHER_DEST = 'fetcher_delrec';
    var EXTENSION_DEST = 'extension_delrec';
    var TOPE = 500;

    var PERIODOS = {
        today: 'deleteddate >= TRUNC(SYSDATE)',
        d7: 'deleteddate >= SYSDATE - 7',
        d30: 'deleteddate >= SYSDATE - 30',
        d90: 'deleteddate >= SYSDATE - 90',
        y1: 'deleteddate >= ADD_MONTHS(SYSDATE, -12)'
    };

    var COLS = [
        'recordid',
        'recordtypeid',
        'name',
        "TO_CHAR(deleteddateusertz, 'YYYY-MM-DD HH24:MI') AS cuando",
        'deletedby',
        'BUILTIN.DF(deletedby) AS quien',
        'context',
        'BUILTIN.DF(context) AS desde'
    ].join(', ');

    function runSql(spec, cb) {
        if (!window.NSFT_SQL) { cb({ code: 'stale' }, null); return; }
        window.NSFT_SQL.run(spec, cb);
    }

    function lit(v) {
        return window.NSFT_SQL ? window.NSFT_SQL.lit(v) : "'" + String(v).replace(/'/g, "''") + "'";
    }

    function escapaComodin(s) {
        var TS = window.NSFT_TextSearch;
        if (TS && typeof TS.sqlLike === 'function') return TS.sqlLike(s);
        return String(s == null ? '' : s).replace(/([%_\\])/g, '\\$1');
    }

    window.addEventListener('message', function (event) {
        if (event.source !== window) return;
        var d = event.data;
        if (!d || typeof d !== 'object' || d.dest !== FETCHER_DEST || d.type !== 'find') return;
        buscar(d.payload || {});
    });

    function buscar(p) {
        var token = p.token;
        var t = String(p.term || '').trim();
        var condRest = [];
        var condSql = [];
        var params = [];

        if (t) {
            var TS = window.NSFT_TextSearch;
            var colNombre = TS ? TS.sqlFold('name') : 'UPPER(name)';
            var termino = TS ? TS.sqlTerm(t) : t.toUpperCase();
            var like = '%' + escapaComodin(termino) + '%';
            var likeTipo = '%' + escapaComodin(t.toUpperCase()) + '%';
            var r = [colNombre + ' LIKE ' + lit(like) + " ESCAPE '\\'",
                'UPPER(recordtypeid) LIKE ' + lit(likeTipo) + " ESCAPE '\\'"];
            var s = [colNombre + " LIKE ? ESCAPE '\\'", "UPPER(recordtypeid) LIKE ? ESCAPE '\\'"];
            params.push(like, likeTipo);
            if (/^\d{1,12}$/.test(t)) {
                r.push('recordid = ' + Number(t));
                s.push('recordid = ?');
                params.push(Number(t));
            }
            condRest.push('(' + r.join(' OR ') + ')');
            condSql.push('(' + s.join(' OR ') + ')');
        }

        if (p.period && PERIODOS[p.period]) {
            condRest.push(PERIODOS[p.period]);
            condSql.push(PERIODOS[p.period]);
        }

        var user = String(p.user == null ? '' : p.user);
        if (/^-?\d{1,12}$/.test(user)) {
            condRest.push('deletedby = ' + Number(user));
            condSql.push('deletedby = ?');
            params.push(Number(user));
        }

        var whereRest = condRest.length ? ' WHERE ' + condRest.join(' AND ') : '';
        var whereSql = condSql.length ? ' WHERE ' + condSql.join(' AND ') : '';
        var orden = ' ORDER BY deleteddate DESC';

        runSql({
            rest: 'SELECT ' + COLS + ' FROM deletedrecord' + whereRest + orden,
            sql: 'SELECT ' + COLS + ' FROM deletedrecord' + whereSql + orden + ' FETCH FIRST ' + TOPE + ' ROWS ONLY',
            params: params,
            limit: TOPE
        }, function (err, rows) {
            if (err) { responde(token, err, null, false); return; }
            var items = (rows || []).map(function (raw) {
                var o = {};
                for (var k in raw) { if (Object.prototype.hasOwnProperty.call(raw, k)) o[String(k).toLowerCase()] = raw[k]; }
                return {
                    id: String(o.recordid == null ? '' : o.recordid),
                    type: String(o.recordtypeid || ''),
                    name: String(o.name == null ? '' : o.name),
                    when: String(o.cuando || ''),
                    userId: String(o.deletedby == null ? '' : o.deletedby),
                    user: String(o.quien || ''),
                    from: String(o.desde || o.context || '')
                };
            });
            responde(token, null, items, items.length >= TOPE);
        });
    }

    function responde(token, err, items, capped) {
        window.postMessage({
            dest: EXTENSION_DEST,
            type: 'results',
            payload: { token: token, error: err || null, items: items || [], capped: !!capped, cap: TOPE }
        }, '*');
    }
})();
